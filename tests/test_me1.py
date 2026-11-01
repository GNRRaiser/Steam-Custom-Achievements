"""Execute the Lua backend with synthetic Mass Effect profiles.
Optional developer dependency: pip install lupa. Game files are only read.
The synthetic profile copies the layout of a real PC Profile.MassEffectProfile: an Unreal
Engine 3 package whose BioGamerProfile object holds anAchievementStates (50 slots, one per
achievement ID) and RewardStats counters (Value, UnlockedAt, AchievementId).
"""
import json
from pathlib import Path
import tempfile
from lupa.luajit21 import LuaRuntime, lua_type
from me1_fixture import profile

ROOT = Path(__file__).resolve().parent.parent
ME1 = json.loads((ROOT / 'source/games/me1/game.json').read_text())


def from_lua(value):
    if lua_type(value) != 'table':
        return value
    pairs = dict(value.items())
    if pairs and set(pairs) == set(range(1, len(pairs) + 1)):
        return [from_lua(pairs[i]) for i in range(1, len(pairs) + 1)]
    return {str(k): from_lua(v) for k, v in pairs.items()}


def index_of(name):
    return next(i for i, a in enumerate(ME1['achievements']) if a['name'] == name)


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    steam = base / 'Steam'
    (steam / 'steamapps').mkdir(parents=True)
    save = base / 'User/Documents/BioWare/Mass Effect/Save'
    save.mkdir(parents=True)
    file = save / 'Profile.MassEffectProfile'
    file.write_bytes(profile(values={'Money': 50, 'Level50': 1, 'Level60': 1}))
    settings, writes = {}, []

    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.execute('package.path = ... .. ";" .. package.path', str(ROOT / 'backend/?.lua'))

    def set_config(key, value):
        settings[key] = from_lua(value)
        writes.append(key)
        return True

    def join(*parts):
        return str(Path(parts[0]).joinpath(*(p.replace('\\', '/') for p in parts[1:])))

    def list_dir(path):
        directory = Path(path)
        entries = []
        for item in sorted(directory.iterdir()) if directory.is_dir() else []:
            entries.append(lua.table_from({'path': str(item), 'name': item.name,
                'is_file': item.is_file(), 'is_directory': item.is_dir(),
                'is_symlink': item.is_symlink(), 'size': item.stat().st_size}))
        return lua.table_from(entries)

    modules = {
        'millennium': lua.table_from({'ready': lambda: True, 'steam_path': lambda: str(steam),
            'config': lua.table_from({'get': lambda k: None, 'set': set_config})}),
        'fs': lua.table_from({'list': list_dir, 'join': join, 'filename': lambda p: Path(p).name,
            'is_file': lambda p: Path(p).is_file(), 'is_directory': lambda p: Path(p).is_dir(),
            'parent_path': lambda p: str(Path(p).parent), 'last_write_time': lambda p: Path(p).stat().st_mtime_ns}),
        'json': lua.table_from({'encode': lambda v: json.dumps(from_lua(v)), 'decode': lambda v: lua.table_from(json.loads(v))}),
    }
    for name, module in modules.items():
        lua.globals().package.loaded[name] = module
    lua.execute('clock=100; os.time=function() return clock end')
    lua.globals().os.getenv = lambda name: str(base / 'User') if name == 'USERPROFILE' else None
    backend = lua.execute((ROOT / 'backend/main.lua').read_text())
    backend['on_load']()

    def tick(method='GetTrackerState', **extra):
        lua.globals().clock += 2
        payload = json.dumps({'appId': 17460, **extra})
        return json.loads(lua.globals()[method](lua.table_from({'payload': payload})))

    def settle():
        tick()
        return tick()

    state = settle()
    assert state['status'] == 'watching', state
    assert state['saveFileName'] == 'Profile.MassEffectProfile'
    assert not state['progress'], state['progress']
    assert len(state['supportedIndices']) == 45
    assert state['counts'][str(index_of('Pistol Expert'))] == {'have': 0, 'need': 150, 'label': 'Pistol kills'}
    assert state['counts'][str(index_of('Rich'))] == {'have': 50, 'need': 1000000, 'label': 'Credits'}
    assert str(base) not in json.dumps(state)
    print('PASS a new profile under Documents\\BioWare\\Mass Effect\\Save is found; nothing unlocked; counters show progress')

    # Eden Prime (achievement 3), the Alliance soldier (33) and 151 pistol kills the game flagged.
    file.write_bytes(profile({3, 33, 9}, {'PistolKills': 151, 'ShotgunKills': 40}, {'PistolKills'}))
    assert tick()['status'] == 'stabilizing'
    got = set(map(int, tick()['progress']))
    assert got == {index_of('Distinguished Service Medal'), index_of('Soldier Ally'), index_of('Pistol Expert')}, got
    print('PASS achievement slots unlock their Xbox achievement; a counter at its target unlocks too')

    # Counters past their target unlock even before the game sets the slot.
    file.write_bytes(profile({3, 33, 9}, {'PistolKills': 151, 'OrganicKills': 150, 'Level50': 50}, {'PistolKills'}))
    tick()
    got = set(map(int, tick()['progress']))
    assert {index_of('Dog of War'), index_of('Power Gamer')} <= got and index_of('Extreme Power Gamer') not in got, got
    print('PASS 150 organic kills and level 50 unlock Dog of War and Power Gamer, not Extreme Power Gamer')

    # A profile whose array starts one slot later is recognised from the counters the game flagged.
    shifted = profile({9, 10, 47}, {'PistolKills': 150, 'ShotgunKills': 150}, {'PistolKills', 'ShotgunKills'}, slot_base=1)
    D = lua.eval('require("detector_me1")')
    parsed = D.parse(shifted)
    assert parsed.base == 1
    pack = lua.eval('(function() for _, g in ipairs(require("games")) do if g.appId == 17460 then return g end end end)()')
    earned = set(from_lua(D.evaluate(parsed, pack)) or [])
    assert index_of('Colonial Savior') in earned and index_of('Undisputed') not in earned, earned
    print('PASS the slot layout is checked against counters the game already marked unlocked')

    # Manual entries stay manual, and a damaged file is not trusted.
    for name in ('Scholar', 'Completionist', 'Tactician', 'Medal of Exploration'):
        assert index_of(name) not in state['supportedIndices']
    file.write_bytes(profile({3})[:900])
    first, second = tick(), tick()
    assert second['status'] != 'watching', second
    assert index_of('Distinguished Service Medal') in set(map(int, second['progress']))
    try:
        tick('SetSavePath', path=str(base / 'nothing.MassEffectProfile'))
        raise AssertionError('A missing file must be rejected')
    except Exception as error:
        assert 'not found' in str(error).lower() or 'path-not-found' in str(error), error
    print('PASS a cut-off profile is not trusted (earned unlocks stay); missing files are refused')

print('All Mass Effect detector tests passed.')
