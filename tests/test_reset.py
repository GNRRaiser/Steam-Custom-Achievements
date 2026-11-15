"""Execute backend/main.lua with the real game packs to check "Reset to locked" on Fallout 3.
Optional developer dependency: pip install lupa. Only synthetic saves in a temporary folder are used.

Fallout 3 writes a new file for every save (Save 12, Autosave, Quicksave), so the achievements a
reset holds back belong to the character, not to the one file that was newest at the reset: the
next autosave of the same character keeps them locked, a different character releases them.
The karma achievements are judged with what the plugin remembers of the character, so a reset
does not hold one back that the save has not earned (it unlocks at the next level-up).
"""
import json
import os
from pathlib import Path
import tempfile
from lupa.luajit21 import LuaRuntime, lua_type
from fo3_fixture import save

ROOT = Path(__file__).resolve().parent.parent
GAME = json.loads((ROOT / 'source/games/fallout3/game.json').read_text())
NAMES = [a['name'] for a in GAME['achievements']]
ESCAPE = [('Fallout3.esm', 0x14E86, 0x26)]


def from_lua(value):
    if lua_type(value) != 'table':
        return value
    pairs = dict(value.items())
    if pairs and set(pairs) == set(range(1, len(pairs) + 1)):
        return [from_lua(pairs[i]) for i in range(1, len(pairs) + 1)]
    return {str(k): from_lua(v) for k, v in pairs.items()}


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    steam = base / 'Steam'
    (steam / 'steamapps').mkdir(parents=True)
    saves = base / 'home' / 'Documents' / 'My Games' / 'Fallout3' / 'Saves'
    saves.mkdir(parents=True)
    config = {}

    def join(*parts):
        return str(Path(parts[0]).joinpath(*(p.replace('\\', '/') for p in parts[1:])))

    def list_dir(path):
        directory = Path(path)
        return lua.table_from([lua.table_from({'path': str(item), 'name': item.name, 'is_file': item.is_file(),
            'is_directory': item.is_dir(), 'is_symlink': item.is_symlink(), 'size': item.stat().st_size})
            for item in (sorted(directory.iterdir()) if directory.is_dir() else [])])

    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.execute('package.path = ... .. ";" .. package.path', str(ROOT / 'backend/?.lua'))
    modules = {
        'millennium': lua.table_from({'ready': lambda: True, 'steam_path': lambda: str(steam),
            'config': lua.table_from({'get': lambda k: None, 'set': lambda k, v: config.__setitem__(k, from_lua(v)) or True})}),
        'fs': lua.table_from({'list': list_dir, 'join': join, 'filename': lambda p: Path(p).name,
            'is_file': lambda p: Path(p).is_file(), 'is_directory': lambda p: Path(p).is_dir(),
            'parent_path': lambda p: str(Path(p).parent), 'last_write_time': lambda p: int(Path(p).stat().st_mtime)}),
        'json': lua.table_from({'encode': lambda v: json.dumps(from_lua(v)), 'decode': lambda v: lua.table_from(json.loads(v))}),
    }
    for name, module in modules.items():
        lua.globals().package.loaded[name] = module
    lua.globals().HOME = str(base / 'home')
    lua.execute('''clock = 1000; os.time = function() return clock end
        os.getenv = function(name) if name == 'USERPROFILE' then return HOME end return nil end''')
    backend = lua.execute((ROOT / 'backend/main.lua').read_text())
    backend['on_load']()

    def tick(seconds=1):
        lua.globals().clock += seconds
        return json.loads(lua.globals().GetTrackerState(json.dumps({'appId': 22370})))

    def settle(name):
        state = None
        for _ in range(8):
            state = tick(5)
        assert state['saveFileName'] == name and state['status'] == 'watching', state
        return {NAMES[int(i)] for i in state['progress']}

    stamp = [1_700_000_000]

    def write(name, data):
        # Each save is newer than the last, as the game writes them.
        stamp[0] += 60
        path = saves / name
        path.write_bytes(data)
        os.utime(path, (stamp[0], stamp[0]))

    # A level 14 good character seen for the first time: its karma achievements count now.
    write('Save 1.fos', save(level=14, karma=1000.0, quests=ESCAPE))
    assert settle('Save 1.fos') == {'Escape!', 'Protector', 'Ambassador of Peace'}

    state = json.loads(lua.globals().ResetProgress(json.dumps({'appId': 22370})))
    held = {NAMES[int(i)] for i, on in config['autoProgress_22370_v1_held'].items() if on}
    assert held == {'Escape!'}, held
    assert config['autoProgress_22370_v1_heldPath'] == 'fallout3 character: Lone Wanderer', config
    assert settle('Save 1.fos') == set()
    print('PASS Reset to locked holds back what the save earns; karma ones wait for the next level-up instead')

    # The next autosave is a new file of the same character, with a little more played:
    # nothing comes back.
    write('Autosave.fos', save(level=14, karma=1000.0, quests=ESCAPE, stats={'Locks Picked': 3}))
    assert settle('Autosave.fos') == set()
    print('PASS a new save file of the same character (Autosave, Quicksave) keeps reset achievements locked')

    # A level-up unlocks the karma achievements again, with the karma held at that point.
    write('Quicksave.fos', save(level=15, karma=1000.0, quests=ESCAPE, stats={'Locks Picked': 4}))
    assert settle('Quicksave.fos') == {'Protector', 'Ambassador of Peace'}
    print('PASS after a reset, the karma achievements unlock again at the next level-up')

    # Another character (a new game) releases everything held, and earns it again normally.
    write('Save 2.fos', save(level=2, karma=0.0, quests=ESCAPE, name='Someone Else'))
    assert settle('Save 2.fos') == {'Escape!', 'Protector', 'Ambassador of Peace'}
    assert config['autoProgress_22370_v1_held'] == {}, config['autoProgress_22370_v1_held']
    print('PASS a different character releases the held achievements')

print('All Reset to locked tests passed.')
