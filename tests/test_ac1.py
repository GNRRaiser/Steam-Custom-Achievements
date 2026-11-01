"""Execute the Lua backend with synthetic Assassin's Creed saves.
Optional developer dependency: pip install lupa. Game files are only read.
The synthetic save copies the layout of a real PC .sav: story objective records whose state
byte (3 = finished) sits three bytes before the objective's big-endian ID.
"""
import json
from pathlib import Path
import tempfile
from lupa.luajit21 import LuaRuntime, lua_type
from ac1_fixture import save, record, save_with_progress

ROOT = Path(__file__).resolve().parent.parent
AC1 = json.loads((ROOT / 'source/games/ac1/game.json').read_text())
TUTORIAL, MASYAF, TRAITOR = 0x13103edd, 0x419e0ac6, 0x8ce6633c
TAMIR = 0xda2dc25a  # FinishEllipse after Tamir's death (a tester's capture, 2026-10-28)
# The other targets' white-room objectives, placed by a 48-save community playthrough (one save
# per step): each finished in the save after that target's city district opened.
TARGETS = {'The Blood of a Doctor': 0xd6a0b2b4, 'The Blood of a Slave Trader': 0xda2ddb42,
           'The Blood of the Merchant King': 0xda2dc265, 'The Blood of a Liege-Lord': 0xd6a0b2bf,
           'The Blood of a Regent': 0xda2ddb4c, 'The Blood of a Teutonic Leader': 0xd78d7e0b,
           'The Blood of a Scribe': 0xda2ddb2a, 'The Blood of a Nemesis': 0xae77fc78}
OTHERS = [(0x3dfdffc7, 3, 'mission'), (0xa6bdb6c0, 3, 'mission-long'), (0x1836a4a2, 1)]


def from_lua(value):
    if lua_type(value) != 'table':
        return value
    pairs = dict(value.items())
    if pairs and set(pairs) == set(range(1, len(pairs) + 1)):
        return [from_lua(pairs[i]) for i in range(1, len(pairs) + 1)]
    return {str(k): from_lua(v) for k, v in pairs.items()}


def index_of(name):
    return next(i for i, a in enumerate(AC1['achievements']) if a['name'] == name)


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    steam = base / 'Steam'
    (steam / 'steamapps').mkdir(parents=True)
    folder = base / "Roaming/Ubisoft/Assassin's Creed/Saved Games"
    folder.mkdir(parents=True)
    file = folder / '1793038632.sav'
    file.write_bytes(save([(TUTORIAL, 0), (MASYAF, 0), (TRAITOR, 0)] + OTHERS))
    (folder / '1793038632.opt').write_bytes(b'options')
    settings = {}

    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.execute('package.path = ... .. ";" .. package.path', str(ROOT / 'backend/?.lua'))

    def set_config(key, value):
        settings[key] = from_lua(value)
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
    env = {'APPDATA': str(base / 'Roaming'), 'USERPROFILE': str(base / 'User')}
    lua.globals().os.getenv = lambda name: env.get(name)
    backend = lua.execute((ROOT / 'backend/main.lua').read_text())
    backend['on_load']()
    backend_detector = lua.eval("require('detector_ac1')")

    def tick(method='GetTrackerState', **extra):
        lua.globals().clock += 2
        payload = json.dumps({'appId': 15100, **extra})
        return json.loads(lua.globals()[method](lua.table_from({'payload': payload})))

    def settle():
        tick()
        return tick()

    state = settle()
    assert state['status'] == 'watching', state
    assert state['saveFileName'] == '1793038632.sav', state
    assert not state['progress'], state['progress']
    want = sorted(index_of(n) for n in ('Welcome to the Animus', 'Hero of Masyaf', 'The Punishment for Treason',
                                        'The Blood of a Corrupt Merchant',
                                        'Keeper of the Lions Passant', 'Keeper of the Crescent', 'Fearless',
                                        'Keeper of the Creed', 'Keeper of the Four Gospels', 'Keeper of the Order',
                                        'Personal Vendetta', 'Keeper of the Black Cross', 'Keeper of the 8 Virtues', *TARGETS))
    targets = {index_of(n) for n in TARGETS}
    acre = {index_of('Keeper of the Black Cross'), index_of('Keeper of the 8 Virtues')}
    story = sorted(index_of(n) for n in ('Welcome to the Animus', 'Hero of Masyaf', 'The Punishment for Treason',
                                         'The Blood of a Corrupt Merchant'))
    tamir = index_of('The Blood of a Corrupt Merchant')
    assert state['supportedIndices'] == list(range(44)), state['supportedIndices']
    assert '6 story objectives' in state['details'], state
    assert str(base) not in json.dumps(state)
    print("PASS a new save in %APPDATA%\\Ubisoft\\Assassin's Creed\\Saved Games is found; nothing unlocked")

    # The Animus tutorial finishes before the first autosave in Solomon's Temple.
    file.write_bytes(save([(TUTORIAL, 3), (MASYAF, 2), (TRAITOR, 0)] + OTHERS))
    assert tick()['status'] == 'stabilizing'
    got = set(map(int, tick()['progress']))
    assert got == {index_of('Welcome to the Animus')}, got
    print('PASS objective M03_S20_Animus_Tutorial_Complete finished unlocks Welcome to the Animus')

    # An ID that only appears in another objective's reference list (01 [id] FF FF) is not a
    # finished objective, and neither is an objective that is open (1) or active (2).
    decoy = record(0x22fa522f, 3, 1, 'mission', refs=(TRAITOR, MASYAF))
    body = save([(TUTORIAL, 3), (MASYAF, 2), (TRAITOR, 1)] + OTHERS)
    body = (len(body) + len(decoy)).to_bytes(4, 'big') + body[4:] + decoy
    file.write_bytes(body)
    tick()
    got = set(map(int, tick()['progress']))
    assert got == {index_of('Welcome to the Animus')}, got
    print('PASS references to an objective and objectives still open do not count')

    # The end of the Masyaf siege, then the traitor brought before Al Mualim.
    file.write_bytes(save([(TUTORIAL, 3), (MASYAF, 3), (TRAITOR, 1)] + OTHERS))
    tick()
    assert set(map(int, tick()['progress'])) == {index_of('Welcome to the Animus'), index_of('Hero of Masyaf')}
    file.write_bytes(save([(TUTORIAL, 3), (MASYAF, 3), (TRAITOR, 3)] + OTHERS))
    tick()
    got = set(map(int, tick()['progress']))
    assert got == set(story) - {tamir}, got
    print("PASS 'Memory Block 1 - Masyaf' and FreeMission_FM11 unlock Hero of Masyaf and The Punishment for Treason")

    # Tamir's memory ends in the white room (FinishEllipse); the mission objectives around it
    # are not used, because their names do not match what they track.
    file.write_bytes(save([(TUTORIAL, 3), (MASYAF, 3), (TRAITOR, 3), (TAMIR, 2)] + OTHERS))
    tick()
    assert tamir not in set(map(int, tick()['progress']))
    file.write_bytes(save([(TUTORIAL, 3), (MASYAF, 3), (TRAITOR, 3), (TAMIR, 3)] + OTHERS))
    tick()
    got = set(map(int, tick()['progress']))
    assert got == set(story), got
    print('PASS the FinishEllipse after Tamir (DA2DC25A) unlocks The Blood of a Corrupt Merchant')

    # A cut-off save is not trusted, and earned unlocks stay.
    file.write_bytes(save([(TUTORIAL, 3)])[:200])
    first, second = tick(), tick()
    assert second['status'] != 'watching', second
    assert set(map(int, second['progress'])) == set(story)
    try:
        tick('SetSavePath', path=str(base / 'nothing.sav'))
        raise AssertionError('A missing file must be rejected')
    except Exception as error:
        assert 'not found' in str(error).lower() or 'path-not-found' in str(error), error
    print('PASS a cut-off save is not trusted (earned unlocks stay); missing files are refused')

    # Settings can point at the Assassin's Creed folder; the newest save in Saved Games is used.
    file.write_bytes(save([(TUTORIAL, 3), (MASYAF, 3), (TRAITOR, 3), (TAMIR, 3)] + OTHERS))
    state = tick('SetSavePath', path=str(base / "Roaming/Ubisoft/Assassin's Creed"))
    assert state['pathConfigured'] and state['saveFileName'] == '1793038632.sav', state
    assert state['selectionNote'] == 'Selected 1793038632.sav from the save folder.', state
    print("PASS the Assassin's Creed folder can be pasted in Settings; the .sav in Saved Games is used")

    # Flags: the progress block before the objectives has a list per region; the game counts
    # each out of 100. Other lists (viewpoints, Damascus map) come before and after them.
    finished = [(TUTORIAL, 3), (MASYAF, 3), (TRAITOR, 3), (TAMIR, 3)] + OTHERS
    lions, crescent = str(index_of('Keeper of the Lions Passant')), str(index_of('Keeper of the Crescent'))
    seen = {'kingdomFlags': [0x5b, 0x5e], 'damascusFlags': [0x4e], 'viewpoints': [0x1f, 0x29, 0x2a, 0x3a, 0x35],
            'list326': [0], 'list644': [0x0f], 'district658': [0, 1, 0x10, 0x0a, 0x15, 0x09], 'kingdomViewpoints': [0x0b, 1, 2]}
    file.write_bytes(save_with_progress(finished, seen))
    tick()
    state = tick()
    assert set(map(int, state['progress'])) == set(story), state['progress']
    assert state['counts'][lions] == {'have': 2, 'need': 100, 'label': 'Flags in the Kingdom'}, state['counts']
    assert state['counts'][crescent] == {'have': 1, 'need': 100, 'label': 'Flags in Damascus'}, state['counts']
    assert '5 viewpoints synchronized' in state['details'], state['details']
    fearless = str(index_of('Fearless'))
    assert state['counts'][fearless] == {'have': 5, 'need': 91, 'label': 'Viewpoints synchronized'}, state['counts']
    print('PASS flag lists in the progress block are counted (Kingdom 2/100, Damascus 1/100); nothing unlocks early')

    file.write_bytes(save_with_progress(finished, {**seen, 'kingdomFlags': list(range(100)), 'damascusFlags': list(range(99))}))
    tick()
    state = tick()
    assert set(map(int, state['progress'])) == set(story) | {int(lions)}, state['progress']
    assert state['counts'][crescent]['have'] == 99, state['counts']
    full = {**seen, 'kingdomFlags': list(range(100)), 'damascusFlags': list(range(100))}
    file.write_bytes(save_with_progress(finished, {**full, 'viewpoints': list(range(90))}))
    tick()
    four = {index_of(n) for n in ('Fearless', 'Keeper of the Creed', 'Keeper of the Four Gospels', 'Keeper of the Order', 'Personal Vendetta')}
    assert set(map(int, tick()['progress'])) == set(want) - four - targets - acre
    print('PASS 100 Kingdom flags unlock Keeper of the Lions Passant; 100 Damascus flags unlock Keeper of the Crescent')

    file.write_bytes(save_with_progress(finished, {**full, 'viewpoints': list(range(91))}))
    tick()
    assert set(map(int, tick()['progress'])) == set(want) - four - targets - acre | {index_of('Fearless')}
    print('PASS 90 viewpoints are not enough; all 91 unlock Fearless')

    # A complete game, as in the 100% saves: every list before and after the flags is full.
    done = {**full, 'viewpoints': list(range(91)), 'templars': list(range(60)), 'masyafFlags': list(range(20)),
            'jerusalemFlags': list(range(100)), 'acreTeutonicFlags': list(range(33)), 'acreTemplarFlags': list(range(34)),
            'acreHospitalierFlags': list(range(33)), 'kingdomViewpoints': list(range(12))}
    file.write_bytes(save_with_progress(finished, {**done, 'templars': list(range(59)), 'acreTemplarFlags': list(range(33)),
                                                   'acreTeutonicFlags': list(range(32))}))
    tick()
    state = tick()
    held_back = {index_of('Personal Vendetta'), index_of('Keeper of the Order'), index_of('Keeper of the Black Cross')}
    assert set(map(int, state['progress'])) == set(want) - held_back - targets, state['progress']
    assert state['counts'][str(index_of('Personal Vendetta'))]['have'] == 59, state['counts']
    assert state['counts'][str(index_of('Keeper of the Black Cross'))] == {'have': 32, 'need': 33, 'label': 'Teutonic flags in Acre'}
    assert state['counts'][str(index_of('Keeper of the 8 Virtues'))] == {'have': 33, 'need': 33, 'label': 'Hospitalier flags in Acre'}
    file.write_bytes(save_with_progress(finished, done))
    tick()
    assert set(map(int, tick()['progress'])) == set(want) - targets
    print('PASS 60 Templars, 20 Masyaf flags, 100 Jerusalem flags and the 33 Teutonic, 34 Templar and 33 Hospitalier '
          'flags in Acre unlock their achievements')

    # Every target's white room finished, as at the end of the game.
    file.write_bytes(save_with_progress(finished + [(i, 3) for i in TARGETS.values()], done))
    tick()
    assert set(map(int, tick()['progress'])) == set(want)
    print('PASS the white-room objectives of Garnier, Talal, Abul Nuqoud, William, Majd Addin, Sibrand and Jubair, '
          'and Memory Block 7 after Robert, unlock the other eight Blood achievements')

    # The game's own achievement record: a state of 2 unlocks any achievement, the ones no
    # objective or list tracks included; the objective and list rules still count beside it.
    blade, symbiosis = index_of('Blade in the Crowd'), index_of('Absolute Symbiosis')
    talon, prey = index_of("Eagle's Talon"), index_of("Eagle's Prey")
    # (Earned unlocks stay, so the 21 from the rules above are already there.)
    file.write_bytes(save_with_progress(finished, seen, unlocked=set(), counters={talon: 13, prey: 140}))
    tick()
    state = tick()
    assert set(map(int, state['progress'])) == set(want), state['progress']
    assert state['counts'][str(talon)] == {'have': 13, 'need': 50, 'label': 'Stealth kills'}, state['counts']
    assert state['counts'][str(prey)] == {'have': 100, 'need': 100, 'label': 'City guards killed'}, state['counts']
    assert "0 of 44 achievements in the game's own record" in state['details'], state['details']
    file.write_bytes(save_with_progress(finished, seen, unlocked={blade, symbiosis}))
    tick()
    state = tick()
    assert set(map(int, state['progress'])) == set(want) | {blade, symbiosis}, state['progress']
    file.write_bytes(save_with_progress(finished, seen, unlocked=set(range(44))))
    tick()
    state = tick()
    assert set(map(int, state['progress'])) == set(range(44)), state['progress']
    assert "44 of 44 achievements in the game's own record" in state['details'], state['details']
    print("PASS the game's own record unlocks what it says (Blade in the Crowd, Absolute Symbiosis, then all 44); "
          "Eagle's Talon shows 13/50 and counts past the target stop at it")

    # A record word that is not 1 or 2 means the layout is not the one expected: the record is ignored.
    odd = bytearray(save_with_progress(finished, {}, unlocked=set(range(44))))
    start = odd.find(b'\x00\x00\x04\xfd') + 2
    odd[start + 198:start + 202] = (7).to_bytes(4, 'big')
    parsed = backend_detector.parse(bytes(odd), lua.table_from({'rules': lua.table_from([])}))
    assert parsed['record'] is None
    print('PASS a record state other than 1 or 2 makes the detector ignore the record')

    # A list entry repeated means the layout is not what the walk expects: nothing after it counts.
    held = save_with_progress(finished, {'templars': [1, 1], 'kingdomFlags': list(range(100))})
    parsed = backend_detector.parse(held, lua.table_from({'rules': lua.table_from([])}))
    assert dict(parsed['lists'].items()) == {}, dict(parsed['lists'].items())
    print('PASS a list that does not fit the layout stops the walk, so nothing after it is counted')

print("All Assassin's Creed detector tests passed.")
