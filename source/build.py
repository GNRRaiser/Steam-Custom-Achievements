#!/usr/bin/env python3
"""Build the frontend bundle and Lua game packs from source/games/*/game.json."""
import base64
import json
import os
import re
from pathlib import Path

VERSION = '0.34.8'
BASE = Path(__file__).resolve().parent
ROOT = BASE.parent
PLUGIN = ROOT
GAMES_DIR = BASE / 'games'
ORDER = ['ac1', 'ac2', 'acb', 'cod4', 'codwaw', 'fable3', 'fallout3', 'me1', 'me2', 'thrillville-otr']
DETECTORS = {'ac1', 'ac2', 'cod', 'fable3', 'me1', 'me2', 'acb', 'thrillville', 'fallout3', None}
DECODERS = {'acb', 'thrillville'}


def lua(value, indent=''):
    """Serialize JSON-like data as a Lua table literal."""
    if value is None:
        return 'nil'
    if value is True or value is False:
        return 'true' if value else 'false'
    if isinstance(value, (int, float)):
        return repr(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return '{ ' + ', '.join(lua(v, indent) for v in value) + ' }'
    inner = indent + '  '
    def key_text(key):
        if isinstance(key, int):
            return f'[{key}]'
        return key if key.isidentifier() else f'[{json.dumps(key)}]'
    items = [f'{inner}{key_text(key)} = {lua(item, inner)},' for key, item in value.items() if item is not None]
    return '{\n' + '\n'.join(items) + f'\n{indent}}}'


def fnv1(name):
    """32-bit FNV-1 (multiply, then xor), the hash Fable III uses for stat names."""
    value = 0x811c9dc5
    for byte in name.upper().encode('ascii'):
        value = (value * 0x01000193) % 2 ** 32 ^ byte
    return value


def fable3_rules(game):
    rules = []
    for index, achievement in enumerate(game['achievements']):
        rule = achievement.get('rule')
        if rule:
            assert rule['stat'].startswith('STAT_') and rule['need'] > 0, achievement['name']
            rules.append({'index': index, 'stat': rule['stat'], 'hash': fnv1(rule['stat']),
                          'need': rule['need'], 'label': rule['label']})
    return rules


def cod_rules(game):
    """Resolve level names to 1-based mis_difficulty positions."""
    positions = {level[0]: i + 1 for i, level in enumerate(game['levels'])}
    rules = []
    for index, achievement in enumerate(game['achievements']):
        rule = achievement.get('rule')
        if not rule:
            continue
        out = {'index': index, 'label': rule.get('label', achievement['name'])}
        if 'dvar' in rule:
            out.update(dvar=rule['dvar'], need=rule['need'])
        else:
            if 'allExcept' in rule:
                names = [name for name in positions if name not in rule['allExcept']]
            else:
                names = rule['levels']
            assert names and all(name in positions for name in names), achievement['name']
            out.update(levels=[positions[name] for name in names], skill=rule['skill'])
            assert 1 <= rule['skill'] <= 4
        rules.append(out)
    return rules


def load_ac2(game, folder):
    achievements = json.loads((folder / game.pop('achievementsFile')).read_text(encoding='utf-8'))
    assert len(achievements) == 50
    rules = json.loads((folder / 'auto_rules.json').read_text(encoding='utf-8'))
    collect = json.loads((folder / 'collectible_rules.json').read_text(encoding='utf-8'))
    tasks = json.loads((folder / 'tracker_rules.json').read_text(encoding='utf-8'))
    checklists = json.loads((folder / 'checklist_rules.json').read_text(encoding='utf-8'))
    assert len(rules) == 26
    indices = [r['index'] for r in rules] + [r['index'] for r in collect] + [r['index'] for r in tasks] + [r['index'] for r in checklists]
    assert len(indices) == len(set(indices)) == 41
    for rule in checklists:
        assert rule['kind'] in ('tasks', 'villa', 'villaValue') and achievements[rule['index']]['name'] == rule['name']
    for rule in tasks + collect + checklists:
        assert achievements[rule['index']]['automatic'] and achievements[rule['index']]['name'] == rule['name']
    for rule in collect:
        assert len(rule['ids']) >= rule['need'] and len(set(rule['ids'])) == len(rule['ids'])
    assert {i for i, a in enumerate(achievements) if a.get('automatic')} == set(indices)
    game['achievements'] = achievements
    game['art'] = ['data:image/webp;base64,' + base64.b64encode((folder / 'art' / f'{i}.webp').read_bytes()).decode()
                   for i in range(50)]
    lines = ['-- Generated from source/games/ac2/auto_rules.json. See third_party/AC2AP-LICENSE.txt.', 'return {']
    for rule in rules:
        ids = ', '.join('0x' + value for value in rule['missionIds'])
        lines.append('  { index = %d, missionIds = { %s } },' % (rule['index'], ids))
    lines.append('}')
    (PLUGIN / 'backend/auto_rules.lua').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    lines = ['-- Generated from source/games/ac2/collectible_rules.json. IDs from AC2AP (MIT); see third_party/AC2AP-LICENSE.txt.', 'return {']
    for rule in collect:
        ids = ', '.join('0x' + value for value in rule['ids'])
        lines.append('  { index = %d, need = %d, label = %s, ids = { %s } },' % (rule['index'], rule['need'], json.dumps(rule['label']), ids))
    lines.append('}')
    (PLUGIN / 'backend/collectible_rules.lua').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    lines = ['-- Generated from source/games/ac2/tracker_rules.json: the game\'s own task counters.', 'return {']
    for rule in tasks:
        lines.append('  { index = %d, objectId = 0x%s, need = %d, label = %s%s },' % (rule['index'], rule['objectId'], rule['need'], json.dumps(rule['label']), ', countOnly = true' if rule.get('countOnly') else ''))
    lines.append('}')
    (PLUGIN / 'backend/tracker_rules.lua').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    lines = ['-- Generated from source/games/ac2/checklist_rules.json: the game\'s accomplishment checklists and villa levels.', 'return {']
    for rule in checklists:
        if rule['kind'] == 'tasks':
            ids = ', '.join('0x' + value for value in rule['tasks'])
            lines.append('  { index = %d, label = %s, tasks = { %s } },' % (rule['index'], json.dumps(rule['label']), ids))
        elif rule['kind'] == 'villaValue':
            assert rule['need'] * 5 == rule['max'] * 4
            lines.append('  { index = %d, label = %s, need = %d, villaValue = true },' % (rule['index'], json.dumps(rule['label']), rule['need']))
        else:
            base = ', '.join(str(level) for level in rule['base'])
            lines.append('  { index = %d, label = %s, need = %d, villaBase = { %s } },' % (rule['index'], json.dumps(rule['label']), rule['need'], base))
    lines.append('}')
    (PLUGIN / 'backend/checklist_rules.lua').write_text('\n'.join(lines) + '\n', encoding='utf-8')


games, packs = [], []
seen = set()
for slug in ORDER:
    folder = GAMES_DIR / slug
    game = json.loads((folder / 'game.json').read_text(encoding='utf-8'))
    assert game['appId'] not in seen and game['detector'] in DETECTORS, slug
    seen.add(game['appId'])
    backend = {'appId': game['appId'], 'slug': slug, 'title': game['title'], 'detector': game['detector']}
    if game['detector'] == 'ac2':
        load_ac2(game, folder)
    elif game['detector'] == 'cod':
        rules = cod_rules(game)
        for rule in rules:
            game['achievements'][rule['index']]['automatic'] = True
        backend.update(levels=[level[0] for level in game['levels']], rules=rules,
                       counterDvar=game.get('counterDvar'), appDataFolders=game.get('appDataFolders', []))
    elif game['detector'] == 'fable3':
        rules = fable3_rules(game)
        assert fnv1('STAT_NUM_COLLECTED_GNOMES') == 0xa3d3553e
        for rule in rules:
            game['achievements'][rule['index']]['automatic'] = True
        names = {fnv1(name): name for name in game.get('statNames', [])}
        names.update({rule['hash']: rule['stat'] for rule in rules})
        # The game's own achievement IDs (from Fable3.exe), as XLiveEmu records them when awarded.
        xlive = {index: a['xlive'] for index, a in enumerate(game['achievements']) if 'xlive' in a}
        assert len(set(xlive.values())) == len(xlive), slug
        for index in xlive:
            game['achievements'][index]['automatic'] = True
        supported = sorted(i for i, a in enumerate(game['achievements']) if a.get('automatic'))
        backend.update(rules=rules, statNames=dict(sorted(names.items())), xlive=xlive, supported=supported)
    elif game['detector'] == 'me1':
        # Mass Effect profile: achievement ID (1-50) and, for counters, the RewardStats name.
        rules = []
        for index, achievement in enumerate(game['achievements']):
            rule = achievement.get('rule')
            if rule:
                assert 1 <= rule['id'] <= 50, slug
                rules.append({'index': index, 'id': rule['id'], 'stat': rule.get('stat'), 'label': rule.get('label')})
                achievement['automatic'] = True
        assert len({r['id'] for r in rules}) == len(rules), slug
        backend['rules'] = rules
    elif game['detector'] == 'thrillville':
        # Thrillville: rules name park missions (from the game's park files); "finished" needs one
        # of them finished, "opened" any of them open or finished (the park is unlocked),
        # "ownerLevel" the park owner level from the save's statistics block.
        rules = []
        for index, achievement in enumerate(game['achievements']):
            rule = achievement.get('rule')
            if rule:
                assert set(rule) <= {'finished', 'opened', 'ownerLevel', 'label'} and rule, slug
                assert ('ownerLevel' in rule) == ('label' in rule) and rule.get('ownerLevel', 2) in range(2, 11), slug
                assert all(re.fullmatch(r'P[1-5]_[BGMPU]_[A-Za-z0-9_]+', name) for key in ('finished', 'opened') for name in rule.get(key, [])), slug
                rules.append({'index': index, **rule})
                achievement['automatic'] = True
        backend['rules'] = rules
    elif game['detector'] == 'fallout3':
        # Fallout 3 save: quests (plugin + form ID without the load-order byte) finished, or
        # running with "started"; a Pip-Boy misc statistic (by name, from statNames) reaching
        # `need`; or a level reached with the karma the save holds now.
        stats = {name: i for i, name in enumerate(game['statNames'])}
        plugins = {'Fallout3.esm', 'Anchorage.esm', 'ThePitt.esm', 'BrokenSteel.esm', 'PointLookout.esm', 'Zeta.esm'}
        rules = []
        for index, achievement in enumerate(game['achievements']):
            rule = achievement.get('rule')
            if not rule:
                continue
            out = {'index': index}
            if 'quests' in rule:
                assert set(rule) <= {'quests', 'started'} and rule['quests'], slug
                assert all(q['plugin'] in plugins and re.fullmatch(r'[0-9A-F]{1,6}', q['id']) for q in rule['quests']), slug
                out['quests'] = [{'plugin': q['plugin'].lower(), 'id': q['id']} for q in rule['quests']]
                if rule.get('started'):
                    out['started'] = True
            elif 'stat' in rule:
                assert set(rule) == {'stat', 'need', 'label'} and rule['need'] > 0, slug
                out.update(stat=stats[rule['stat']], need=rule['need'], label=rule['label'])
            elif {'global', 'globals', 'questVar'} & set(rule):
                # A counter the game's own achievement scripts keep: a global variable, a quest
                # script variable (its index in the script), or a list of globals each at least 1.
                assert set(rule) <= {'global', 'globals', 'questVar', 'need', 'label', 'done', 'doneValue'} and rule['need'] > 0, slug
                def key(ref):
                    assert ref['plugin'] in plugins and re.fullmatch(r'[0-9A-F]{1,6}', ref['id']), slug
                    return ref['plugin'].lower() + ':' + ref['id'] + ('#%d' % ref['var'] if 'var' in ref else '')
                if 'global' in rule:
                    out['global'] = key(rule['global'])
                elif 'globals' in rule:
                    out['globals'] = [key(ref) for ref in rule['globals']]
                    assert len(out['globals']) == rule['need'], slug
                else:
                    assert 'var' in rule['questVar'], slug
                    out['questVar'] = key(rule['questVar'])
                out.update(need=rule['need'], label=rule['label'])
                if rule.get('done'):
                    out['doneKeys'] = [key(ref) for ref in rule['done']]
                if 'doneValue' in rule:
                    out['doneKeys'] = out.get('doneKeys', []) + [out['questVar']]
                    out['doneValue'] = rule['doneValue']
            else:
                assert set(rule) == {'level', 'karma'} and rule['karma'] in ('good', 'neutral', 'bad'), slug
                out.update(level=rule['level'], karma=rule['karma'])
            rules.append(out)
            achievement['automatic'] = True
        backend['rules'] = rules
    elif game['detector'] == 'me2':
        # Mass Effect 2 profile: the PC AchievementID (0-63), one bit of profile settings 0x32/0x33.
        rules = []
        for index, achievement in enumerate(game['achievements']):
            rule = achievement.get('rule')
            if rule:
                assert 0 <= rule['id'] <= 63, slug
                rules.append({'index': index, 'id': rule['id']})
                achievement['automatic'] = True
        assert len({r['id'] for r in rules}) == len(rules), slug
        backend['rules'] = rules
    elif game['detector'] == 'ac1':
        # Assassin's Creed: rules name objective IDs from the game's objective list (objectives.json).
        names = {int(key, 16): name for key, name in json.loads((folder / 'objectives.json').read_text(encoding='utf-8')).items()}
        rules = []
        for index, achievement in enumerate(game['achievements']):
            rule = achievement.get('rule')
            if rule and 'list' in rule:
                # Collectibles: a list in the save's progress block (see detector_ac1.lua) reaching `need`.
                assert set(rule) == {'list', 'need', 'label'}, slug
                rules.append({'index': index, 'list': rule['list'], 'need': rule['need'], 'label': rule['label']})
                achievement['automatic'] = True
            elif rule:
                assert set(rule) == {'done'} and all(int(value, 16) in names for value in rule['done']), slug
                rules.append({'index': index, 'done': [int(value, 16) for value in rule['done']]})
                achievement['automatic'] = True
        backend.update(rules=rules, objectiveNames=dict(sorted(names.items())))
        if game.get('achievementRecord'):
            # The game's own achievement record in the save: one state per achievement, 2 = unlocked.
            for achievement in game['achievements']:
                achievement['automatic'] = True
            backend.update(achievementRecord=True, supported=list(range(len(game['achievements']))),
                           recordNames=[a['name'] for a in game['achievements']])
    elif game['detector'] == 'acb':
        # Brotherhood: rules name missions from the game's Rome mission list (game.json "missions").
        ids = {name: int(value, 16) for name, value in game['missions'].items()}
        assert len(set(ids.values())) == len(ids), slug
        rules = []
        for index, achievement in enumerate(game['achievements']):
            rule = achievement.get('rule')
            if rule:
                assert set(rule) <= {'done', 'all', 'seen', 'label', 'objects', 'objectsLabel'}, slug
                rules.append({'index': index, 'label': rule.get('label'),
                              **{key: [ids[name] for name in rule[key]] for key in ('done', 'all', 'seen') if rule.get(key)}})
                if rule.get('objects'):
                    # Per-item progress: world objects (a game.json list) the save lists as taken.
                    objects = [int(value, 16) for value in game[rule['objects']]]
                    assert len(set(objects)) == len(objects) and rule.get('objectsLabel'), slug
                    rules[-1].update(objects=objects, objectsLabel=rule['objectsLabel'])
                achievement['automatic'] = True
        backend.update(rules=rules, missionNames={value: name for name, value in sorted(ids.items(), key=lambda item: item[1])})
        bits = game.get('profileBits')
        if bits:
            # The game's own record in OPTIONS: bit N is achievement N of the list.
            indices = {bit: bit for bit in range(len(game['achievements'])) if bit not in bits.get('skip', [])}
            backend['profileBits'] = {'property': int(bits['property'], 16), 'indices': indices}
            for index in indices:
                game['achievements'][index]['automatic'] = True
            backend['supported'] = sorted(set(indices) | {rule['index'] for rule in rules})
    for parts in game.get('saveFolders', []):
        # Known save folders for capture and record mode: an environment variable, then folder names.
        assert parts[0] in ('USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramFiles(x86)', 'ProgramFiles') and len(parts) > 1, slug
    if game.get('saveFolders'):
        backend['saveFolders'] = game['saveFolders']
    if game.get('decoder'):
        # A save reader for capture and record mode, for games without automatic tracking.
        assert game['decoder'] in DECODERS, slug
        backend['decoder'] = game['decoder']
    achievements = game['achievements']
    art = folder / 'art'
    if 'art' not in game and art.is_dir():
        # Optional pictures named by list position: art/0.webp (or .png/.jpg) is the first achievement.
        kinds = {'.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg'}
        pictures = []
        for i in range(len(achievements)):
            found = next((art / f'{i}{ext}' for ext in kinds if (art / f'{i}{ext}').is_file()), None)
            pictures.append(f'data:{kinds[found.suffix]};base64,' + base64.b64encode(found.read_bytes()).decode() if found else None)
        game['art'] = pictures if any(pictures) else None
    completion = game.get('completion')
    if completion:
        # The PS3 platinum: unlocks by itself once every other achievement is unlocked.
        # It goes last so the indices of the Xbox 360 list (and saved progress) stay the same.
        achievements.append({'name': completion['name'], 'detail': completion['detail'],
                             'group': 'Platinum', 'icon': 'crown', 'completion': True})
        picture = folder / 'art' / completion['picture']
        data = 'data:image/webp;base64,' + base64.b64encode(picture.read_bytes()).decode() if picture.is_file() else None
        game['art'] = (game.get('art') or [None] * (len(achievements) - 1)) + [data]
    assert achievements and all({'name', 'detail', 'group'} <= a.keys() for a in achievements), slug
    # Spoiler (hidden) achievements, as Steam calls them: name and description stay hidden in
    # the list until unlocked or revealed. The story group is hidden by default; a game can
    # name other groups in "spoilerGroups", and one achievement can say "hidden": true or false.
    spoilers = set(game.get('spoilerGroups', ['Story']))
    for achievement in achievements:
        if 'hidden' not in achievement:
            achievement['hidden'] = achievement['group'] in spoilers and not achievement.get('completion')
        rarity = achievement.get('rarity')
        # Optional unlock rate (percent of players), shown like Steam's global percentage.
        assert rarity is None or (isinstance(rarity, (int, float)) and 0 <= rarity <= 100), achievement['name']
    assert len({a['name'] for a in achievements}) == len(achievements), slug
    if game['detector']:
        backend.update(progressKey=game.get('progressKey', f'autoProgress_{game["appId"]}_v1'),
                       pathKey=game.get('pathKey', f'savePath_{game["appId"]}_v1'),
                       setupHint=game.get('setupHint'), total=len(achievements))
    packs.append(backend)
    keep = ('name', 'detail', 'group', 'automatic', 'icon', 'numeral', 'completion', 'hidden', 'rarity')
    games.append({
        'appId': game['appId'], 'slug': slug, 'title': game['title'], 'platform': game.get('platform', 'Xbox 360'),
        'automatic': bool(game['detector']), 'trackingNote': game.get('trackingNote', ''),
        'pathPlaceholder': game.get('pathPlaceholder', ''), 'autoTag': game.get('autoTag', 'Unlocks automatically'),
        'provisional': game.get('provisional'),
        'saveFolderHint': game.get('saveFolderHint'),
        'levels': [level[1] for level in game.get('levels', [])],
        'achievements': [{key: a[key] for key in keep if a.get(key) not in (None, False)} for a in achievements],
        'art': game.get('art'),
    })

template = (BASE / 'runtime.js').read_text(encoding='utf-8')
tracker = (BASE / 'tracker.js').read_text(encoding='utf-8')
backup = (BASE / 'backup.js').read_text(encoding='utf-8')
icons = (BASE / 'icons.js').read_text(encoding='utf-8')
assert tracker.count('__BACKUP_SOURCE__') == 1
tracker = tracker.replace('__BACKUP_SOURCE__', backup)
for marker, name in (('__RECORD_SOURCE__', 'recordmode.js'), ('__PAGEIMPORT_SOURCE__', 'pageimport.js')):
    assert tracker.count(marker) == 1, marker
    tracker = tracker.replace(marker, (BASE / name).read_text(encoding='utf-8'))
for marker in ('__TRACKER_SOURCE__', '__ICONS_SOURCE__', '__GAMES_DATA__'):
    assert template.count(marker) == 1, marker
bundle = (template.replace('__ICONS_SOURCE__', icons).replace('__TRACKER_SOURCE__', tracker)
          .replace('__BUILD_VERSION__', VERSION)
          .replace('__SHARE_BUILD__', 'true' if os.environ.get('SCA_SHARE_BUILD') == '1' else 'false')
          .replace('__GAMES_DATA__', json.dumps(games, ensure_ascii=False, separators=(',', ':'))))
output = PLUGIN / '.millennium' / 'Dist' / 'index.js'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(bundle, encoding='utf-8')

(PLUGIN / 'backend/games.lua').write_text(
    '-- Generated by source/build.py from source/games/*/game.json. Do not edit.\nreturn {\n'
    + ''.join('  ' + lua(pack, '  ') + ',\n' for pack in packs) + '}\n', encoding='utf-8')

automatic = sum(sum(1 for a in g['achievements'] if a.get('automatic')) for g in games)
manifest = {
    'name': 'steam-custom-achievements',
    'common_name': 'Steam Custom Achievements (Local)',
    'description': 'Xbox 360 achievement lists for Steam games that have none: '
                   + ', '.join(g['title'] for g in games) + '.',
    'version': VERSION,
    'useBackend': True,
    'backendType': 'lua',
}
(PLUGIN / 'plugin.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
for g in games:
    print(f"{g['title']}: {len(g['achievements'])} achievements, "
          f"{sum(1 for a in g['achievements'] if a.get('automatic'))} automatic")
print(f'Built v{VERSION}: {len(games)} games, {automatic} automatic achievements.')
