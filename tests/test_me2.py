"""Execute the Lua backend with synthetic Mass Effect 2 profiles.
Optional developer dependency: pip install lupa. Game files are only read.
The synthetic profile copies the layout of a real PC Player1.prf: LZO1X-compressed Unreal
Engine 3 profile settings, where settings 0x32 and 0x33 hold one bit per PC AchievementID.
"""
import json
from pathlib import Path
import tempfile
from lupa.luajit21 import LuaRuntime, lua_type
from me2_fixture import profile

ROOT = Path(__file__).resolve().parent.parent
ME2 = json.loads((ROOT / 'source/games/me2/game.json').read_text())


def from_lua(value):
    if lua_type(value) != 'table':
        return value
    pairs = dict(value.items())
    if pairs and set(pairs) == set(range(1, len(pairs) + 1)):
        return [from_lua(pairs[i]) for i in range(1, len(pairs) + 1)]
    return {str(k): from_lua(v) for k, v in pairs.items()}


def index_of(name):
    return next(i for i, a in enumerate(ME2['achievements']) if a['name'] == name)


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    steam = base / 'Steam'
    (steam / 'steamapps').mkdir(parents=True)
    save = base / 'User/Documents/BioWare/Mass Effect 2/BIOGame/Profile'
    save.mkdir(parents=True)
    file = save / 'Player1.prf'
    file.write_bytes(profile())
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
        payload = json.dumps({'appId': 24980, **extra})
        return json.loads(lua.globals()[method](lua.table_from({'payload': payload})))

    def settle():
        tick()
        return tick()

    state = settle()
    assert state['status'] == 'watching', state
    assert state['saveFileName'] == 'Player1.prf'
    assert not state['progress'], state['progress']
    assert len(state['supportedIndices']) == 61
    assert index_of('Highly Trained') not in state['supportedIndices']
    assert str(base) not in json.dumps(state)
    print('PASS a new profile under Documents\\BioWare\\Mass Effect 2\\BIOGame\\Profile is found; nothing unlocked')

    # Missing in Action (PC ID 1) and Fashionista (48), the two a tester's real profile recorded.
    file.write_bytes(profile({1, 48}, {0x38: 8, 0x3a: 1}))
    assert tick()['status'] == 'stabilizing'
    got = set(map(int, tick()['progress']))
    assert got == {index_of('Missing in Action'), index_of('Fashionista')}, got
    print('PASS bit 1 of setting 0x32 and bit 16 of 0x33 unlock Missing in Action and Fashionista')

    # The PC IDs that are not in Xbox order, the top bit of each word and the DLC packs.
    file.write_bytes(profile({1, 48, 20, 10, 31, 0, 56, 50, 61}))
    tick()
    got = set(map(int, tick()['progress']))
    want = {'Friend or Foe', 'Colony Defense', 'Brawler', 'Heart of Darkness', 'Revenge!', 'Covert Action'}
    assert {index_of(n) for n in want} <= got, got
    assert len(got) == 8, got  # ID 0 is the PC-only Cerberus Network achievement
    print('PASS geth, Horizon, top-bit, Shadow Broker, Zaeed and Arrival IDs map to their Xbox achievements')

    # A damaged file is not trusted, and earned unlocks stay.
    file.write_bytes(profile({1})[:40])
    first, second = tick(), tick()
    assert second['status'] != 'watching', second
    assert index_of('Fashionista') in set(map(int, second['progress']))
    try:
        tick('SetSavePath', path=str(base / 'nothing.prf'))
        raise AssertionError('A missing file must be rejected')
    except Exception as error:
        assert 'not found' in str(error).lower() or 'path-not-found' in str(error), error
    print('PASS a cut-off profile is not trusted (earned unlocks stay); missing files are refused')

    # Settings can point at the Mass Effect 2 folder; the profile inside is used.
    file.write_bytes(profile({1, 48}))
    state = tick('SetSavePath', path=str(base / 'User/Documents/BioWare/Mass Effect 2'))
    assert state['pathConfigured'] and state['saveFileName'] == 'Player1.prf', state
    assert state['selectionNote'] == 'Selected Player1.prf.', state
    print('PASS the Mass Effect 2 folder can be pasted in Settings; Player1.prf inside it is used')

print('All Mass Effect 2 detector tests passed.')
