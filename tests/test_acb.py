"""Execute the Lua backend with synthetic Assassin's Creed Brotherhood saves.
Optional developer dependency: pip install lupa. Game files are only read.
The synthetic save copies the layout of a real Steam ACBROTHERHOODSAVEGAME0.SAV: a 16-byte
header, then Anvil blocks (LZO2A) holding mission records whose progress reaches 100.
Mission IDs come from the game's Rome mission list (source/games/acb/game.json "missions").
"""
import json
from pathlib import Path
import tempfile
from lupa.luajit21 import LuaRuntime, lua_type
import acb_fixture

ROOT = Path(__file__).resolve().parent.parent
ACB = json.loads((ROOT / 'source/games/acb/game.json').read_text())
M = {name: int(value, 16) for name, value in ACB['missions'].items()}


def from_lua(value):
    if lua_type(value) != 'table':
        return value
    pairs = dict(value.items())
    if pairs and set(pairs) == set(range(1, len(pairs) + 1)):
        return [from_lua(pairs[i]) for i in range(1, len(pairs) + 1)]
    return {str(k): from_lua(v) for k, v in pairs.items()}


def index_of(name):
    return next(i for i, a in enumerate(ACB['achievements']) if a['name'] == name)


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    steam = base / 'Steam'
    (steam / 'steamapps').mkdir(parents=True)
    save = base / "User/Saved Games/Assassin's Creed Brotherhood/SAVES"
    save.mkdir(parents=True)
    file = save / 'ACBROTHERHOODSAVEGAME0.SAV'
    (save / 'OPTIONS').write_bytes(acb_fixture.steam_save({}))
    # a tester's real first save: the opening memory done, Rome activities started.
    opening = {M['E01M01']: True, M['SQ01M01']: False, M['Feathers_Downtown']: False, M['BorgiaFlags_Rome_Downtown']: False}
    file.write_bytes(acb_fixture.steam_save(opening))
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
        payload = json.dumps({'appId': 48190, **extra})
        return json.loads(lua.globals()[method](lua.table_from({'payload': payload})))

    def settle():
        tick()
        return tick()

    def write(done, started=()):
        missions = dict(opening)
        missions.update({M[name]: True for name in done})
        missions.update({M[name]: False for name in started})
        file.write_bytes(acb_fixture.steam_save(missions))

    def unlocked():
        tick()
        return set(map(int, tick()['progress']))

    state = settle()
    assert state['status'] == 'watching', state
    assert state['saveFileName'] == 'ACBROTHERHOODSAVEGAME0.SAV'
    assert not state['progress'], state['progress']
    assert len(state['supportedIndices']) == 50, state['supportedIndices']
    assert state['counts'][str(index_of('Capture the Flag'))] == {'have': 0, 'need': 4, 'label': 'Districts cleared of Borgia flags'}
    assert str(base) not in json.dumps(state)
    print('PASS the Steam save in Saved Games is found; the opening memory alone unlocks nothing')

    write(['SQ01M01', 'SQ01M02', 'SQ01M03', 'SQ01M04', 'SQ01M05'])
    assert index_of('Battle Wounds') not in unlocked()
    write(['SQ01M05', 'SQ01M99_Outro'])
    assert unlocked() == {index_of('Battle Wounds')}
    print('PASS Sequence 1 unlocks Battle Wounds at its outro, not before')

    # A later story mission proves the earlier sequences even if an outro was never recorded.
    write(['SQ01M99_Outro', 'P01M03', 'SQ02M02', 'SQ02M04C', 'SQ03M01'])
    got = unlocked()
    for name in ('Battle Wounds', 'Sanctuary! Sanctuary!', 'Rome in Ruins', 'Fixer-Upper', 'Golden Boy'):
        assert index_of(name) in got, name
    assert index_of('Principessa in Another Castello') not in got and index_of('Undertaker 2.0') not in got, got
    print('PASS reaching Sequence 4 unlocks Sequences 1-3, Sanctuary and the Terme di Traiano lair (Halls of Nero)')

    # Sequence 9: reaching it is Technical Difficulties; finishing it is Requiescat In Pace.
    write(['SQ07M99_Outro'], started=['E04M01'])
    got = unlocked()
    assert {index_of('Technical Difficulties'), index_of('Vittoria Agli Assassini')} <= got
    assert index_of('Requiescat In Pace') not in got and index_of('A Knife to the Heart') not in got
    write(['E04M01', 'E04M02', 'P02M02B'])
    assert {index_of('Requiescat In Pace'), index_of('A Knife to the Heart')} <= unlocked()
    print('PASS Sequence 9 started unlocks Technical Difficulties; the ending unlocks the last two story achievements')

    # Collections need every district; side activities name their own mission.
    flags = ['BorgiaFlags_Rome_Downtown', 'BorgiaFlags_Rome_Countryside', 'BorgiaFlags_Rome_Antique']
    write(flags + ['LGS302_Catacombs', 'EXO_04_Tank', 'Harlequin_achieve_complete', 'DLC_04_M08'])
    state = tick()
    got = set(map(int, tick()['progress']))
    assert index_of('Capture the Flag') not in got
    assert {index_of('Undertaker 2.0'), index_of('Kaboom!'), index_of('Clowning Around'), index_of('GPS')} <= got
    assert tick()['counts'][str(index_of('Capture the Flag'))]['have'] == 3
    write(flags + ['BorgiaFlags_Rome_Vatican', 'Feathers_All'])
    assert {index_of('Capture the Flag'), index_of('In Memoriam')} <= unlocked()
    print('PASS all four Rome flag districts unlock Capture the Flag; lairs, machines, feathers and the DLC unlock')

    # Manual entries stay manual, and a damaged file is not trusted.
    for name in ('Synchronization Established', 'Download Complete', 'Ahead of the Curve'):
        assert index_of(name) not in state['supportedIndices']
    file.write_bytes(acb_fixture.steam_save(opening)[:200])
    first, second = tick(), tick()
    assert second['status'] != 'watching', second
    assert index_of('GPS') in set(map(int, second['progress']))
    print('PASS a cut-off save is not trusted (earned unlocks stay)')

    # Reset to locked: nothing comes back from the same save; an older save releases the hold,
    # and earning the achievement again unlocks it.
    write(['SQ01M99_Outro', 'LGS302_Catacombs'])
    assert index_of('Battle Wounds') in unlocked()
    state = tick('ResetProgress')
    assert state['progress'] == {}, state['progress']
    assert not unlocked()
    assert not settings['autoProgress_48190_v1'], settings['autoProgress_48190_v1']
    held = settings['autoProgress_48190_v1_held']
    assert held[str(index_of('Battle Wounds'))] is True and held[str(index_of('Undertaker 2.0'))] is True, held
    write([])
    assert not unlocked()
    write(['SQ01M99_Outro'])
    assert unlocked() == {index_of('Battle Wounds')}
    print('PASS Reset to locked holds what the save already has until an older save; earning it again unlocks it')

    # The game's own record in OPTIONS: bit N is achievement N; multiplayer stays manual.
    (save / 'OPTIONS').write_bytes(acb_fixture.options({0, 1, 13, 35, 45, 52}))
    got = unlocked()
    assert {index_of('Technical Difficulties'), index_of('Déjà Vu'), index_of('Spring Cleaning'), index_of('il Principe')} <= got, got
    assert index_of('Download Complete') not in got and 45 not in tick()['supportedIndices']
    assert 'achievements recorded by the game' in tick()['details']
    print('PASS the achievement record in OPTIONS unlocks single-player and DLC achievements; multiplayer stays manual')

    # The Ubisoft Connect layout (scrambled with an account key) still decodes.
    D = lua.eval('require("detector_acb")')
    parsed = D.parse(acb_fixture.save({M['SQ01M99_Outro']: True}, key=b'somekey'))
    assert parsed.completedCount == 1
    print('PASS Ubisoft Connect saves (scrambled) decode to the same missions')

print('All Brotherhood detector tests passed.')
