"""Execute the Lua backend with synthetic Fable III hero saves.
Optional developer dependency: pip install lupa. Game files are only read.
The synthetic save copies the layout of real PC saves: 64 KiB chunks of one sync-flushed zlib
stream, each with a [compressed][uncompressed] big-endian header, then an 8-byte trailer. The
decompressed tree holds NonLeaderboardStats as StatNameHash / StatValue pairs keyed by FNV-1.
"""
import json
import os
from pathlib import Path
import tempfile
from lupa.luajit21 import LuaRuntime, lua_type
from fable_fixture import MAXED, herosave

ROOT = Path(__file__).resolve().parent.parent
FABLE = json.loads((ROOT / 'source/games/fable3/game.json').read_text())


def from_lua(value):
    if lua_type(value) != 'table':
        return value
    pairs = dict(value.items())
    if pairs and set(pairs) == set(range(1, len(pairs) + 1)):
        return [from_lua(pairs[i]) for i in range(1, len(pairs) + 1)]
    return {str(k): from_lua(v) for k, v in pairs.items()}


def index_of(name):
    return next(i for i, a in enumerate(FABLE['achievements']) if a['name'] == name)


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    steam = base / 'Steam'
    (steam / 'steamapps').mkdir(parents=True)
    profile = base / 'User/Saved Games/Lionhead Studios/Fable 3/1122334400000000'
    profile.mkdir(parents=True)
    old = profile / 'hero1save1_herosave.bin'
    old.write_bytes(herosave({name: 0 for name in MAXED}))
    os.utime(old, (1000, 1000))
    (profile / 'hero1autosave_failquestherosave.bin').write_bytes(herosave(MAXED))
    current = profile / 'hero1autosave_herosave.bin'
    current.write_bytes(herosave({'STAT_NUM_COLLECTED_GNOMES': 49, 'STAT_KILLS_MELEE': 500, 'STAT_DIGGING_SPOTS_FOUND': 3}))
    os.utime(current, (2000, 2000))
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
            'parent_path': lambda p: str(Path(p).parent), 'last_write_time': lambda p: int(Path(p).stat().st_mtime)}),
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
        payload = json.dumps({'appId': 105400, **extra})
        return json.loads(lua.globals()[method](lua.table_from({'payload': payload})))

    def settle():
        tick()
        return tick()

    state = settle()
    assert state['status'] == 'watching', state
    assert state['saveFileName'] == 'hero1autosave_herosave.bin', state['saveFileName']
    got = set(map(int, state['progress']))
    assert got == {index_of('If It Bleeds, We Can Kill It')}, got
    assert state['counts'][str(index_of('Gnome Invasion'))] == {'have': 49, 'need': 50, 'label': 'Gnomes destroyed'}
    assert str(base) not in json.dumps(state)
    assert 'autoProgress_105400_v1' in writes
    print('PASS newest hero save found under Saved Games; fail-quest copies are ignored; 49 of 50 gnomes shows progress')

    current.write_bytes(herosave(MAXED))
    assert tick()['status'] == 'stabilizing'
    got = set(map(int, tick()['progress']))
    expected = {'Gunning For Glory', 'If It Bleeds, We Can Kill It', "Wizard's Revenge", 'I Am The Keymaster',
                'Flower Power', 'Gnome Invasion', 'Digger', 'Popularity Contest'}
    assert got == {index_of(name) for name in expected}, got
    assert index_of('Brightwall Book Club') not in got
    print('PASS a 100% hero (values from a real save) unlocks all 8 statistic achievements and nothing else')

    try:
        tick('SetSavePath', path=str(profile.parent / 'missing.bin'))
        raise AssertionError('A missing file must be rejected')
    except Exception as error:
        assert 'path-not-found' in str(error) or 'not found' in str(error).lower(), error
    junk = base / 'junk_herosave.bin'
    junk.write_bytes(b'\x00\x00\x00\x10' * 64)
    try:
        tick('SetSavePath', path=str(junk))
        raise AssertionError('A file that is not a Fable III save must be rejected')
    except Exception as error:
        assert 'Fable III' in str(error), error
    state = tick('SetSavePath', path=str(profile))
    assert settings['savePath_105400_v1'] == str(current), settings
    print('PASS a profile folder resolves to its newest hero save; other files are refused')

    # A save cut off mid-write never awards anything.
    current.write_bytes(herosave(MAXED)[:40000])
    first, second = tick(), tick()
    assert second['status'] != 'watching', second
    assert set(map(int, second['progress'])) == {index_of(n) for n in expected}
    print('PASS a half-written save is not trusted; earned unlocks stay')

    # XLiveEmu in the game folder keeps the game's own record: one achievement ID per line. The
    # game folder is found through Steam's library list, here on a second drive.
    current.write_bytes(herosave(MAXED))
    library = base / 'Games'
    (library / 'steamapps').mkdir(parents=True)
    (steam / 'steamapps' / 'libraryfolders.vdf').write_text('"libraryfolders"\n{\n "1"\n {\n  "path"  "%s"\n }\n}\n'
                                                           % str(library).replace('\\', '\\\\'))
    (library / 'steamapps' / 'appmanifest_105400.acf').write_text('"AppState"\n{\n "installdir"  "Fable 3"\n}\n')
    record = library / 'steamapps/common/Fable 3/XLiveEmu/Player1/Achievements/Achievements.txt'
    record.parent.mkdir(parents=True)
    record.write_bytes(b'69\r\n105\r\n')
    tick()
    state = tick()
    got = set(map(int, state['progress']))
    assert got == {index_of(n) for n in expected} | {index_of('The Guild Seal'), index_of('Hand in Hand')}, got
    assert "2 in the game's own achievement record (XLiveEmu)" in state['details'], state['details']
    assert len(state['supportedIndices']) == 60, state['supportedIndices']
    assert index_of('Who Are You?') in state['supportedIndices']
    print("PASS XLiveEmu's Achievements.txt in the game folder (found through the Steam library list) unlocks "
          "The Guild Seal (69) and Hand in Hand (105)")

    record.write_bytes(b'69\r\n105\r\n75\r\n129\r\n130\r\n139\r\n')
    tick()
    got = set(map(int, tick()['progress']))
    assert {index_of('For Albion!'), index_of('Adopt Or Die'), index_of('A Slow Day At The Office'), index_of('Set Them Free!')} <= got, got
    assert index_of('Who Are You?') not in got
    record.write_bytes(b'<xml>not a list</xml>')
    tick()
    state = tick()
    assert "achievement record" not in state['details'], state['details']
    assert {index_of('For Albion!'), index_of('Adopt Or Die')} <= set(map(int, state['progress']))
    print('PASS IDs added later unlock too (75 For Albion!, 129 Adopt Or Die, Traitor\'s Keep 130 and 139); a file that is not a list of IDs is ignored and earned unlocks stay')

print('All Fable III detector tests passed.')
