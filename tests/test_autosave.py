"""Execute the actual Lua parser/watcher with synthetic AC2 records and local files.
Optional developer dependency: pip install lupa. No game saves are modified.
"""
import hashlib
import json
from pathlib import Path
import struct
import tempfile
import argparse
from lupa.luajit21 import LuaRuntime, lua_type

arguments=argparse.ArgumentParser()
arguments.add_argument('--save',type=Path,help='Optional external real AC2 save; never included in the plugin package')
arguments.add_argument('--placeholder',type=Path,help='Optional external slot -1 file for selection regression')
arguments.add_argument('--expect-unlocks',type=int)
options=arguments.parse_args()

ROOT = Path(__file__).resolve().parent.parent
RULES = json.loads((ROOT / 'source/games/ac2/auto_rules.json').read_text())
lua = LuaRuntime(unpack_returned_tuples=True)
lua.execute('package.path = ... .. ";" .. package.path', str(ROOT / 'backend/?.lua'))
detector = lua.eval('require("detector_ac2")')
if isinstance(detector, tuple):
    detector = detector[0]


def save_with(ids=(), completion=100, kind=0x5FDACBA05FDACBA0, padding=0):
    header = struct.pack('<II', 548, 0) + bytes(32) + 'ACII 0'.encode('utf-16le') + bytes(500)
    assert len(header) == 552
    records = []
    for value in ids:
        record = bytearray(0x60)
        struct.pack_into('<IIIQ', record, 0, 0x58, 0x50, 0x11, kind)
        record[0x18] = record[0x2D] = 0x0B
        struct.pack_into('<I', record, 0x19, value)
        struct.pack_into('<I', record, 0x2E, completion)
        records.append(record)
    return header + b''.join(records) + bytes(padding)


def parse(data):
    result = detector.parse(data)
    if isinstance(result, tuple):
        return result[0]
    return result


def earned(data):
    parsed = parse(data)
    result = detector.evaluate(parsed)
    return set(result.values())


for rule in RULES:
    value = int(rule['missionIds'][0], 16)
    assert rule['index'] in earned(save_with([value])), rule['name']
    for incomplete in (0, 1, 50, 99):
        assert not earned(save_with([value], incomplete)), (rule['name'], incomplete)
    assert not earned(save_with([value], kind=0x00000000DA47DC47))
print('PASS all 26 rules require a completed mission record of the correct type')

COLLECT = json.loads((ROOT / 'source/games/ac2/collectible_rules.json').read_text())
for rule in COLLECT:
    ids = [int(v, 16) for v in rule['ids']]
    raw = b''.join(struct.pack('<I', v) for v in ids)
    almost = save_with(padding=0) + raw[:-4]
    full = save_with(padding=0) + raw + raw
    assert rule['index'] not in earned(almost), rule['name']
    assert parse(almost)['collectibles'][str(rule['index'])]['have'] == rule['need'] - 1
    assert rule['index'] in earned(full), rule['name']
    assert parse(full)['collectibles'][str(rule['index'])]['have'] == rule['need']
    slot = bytearray(full); slot[50:54] = '-1'.encode('utf-16le')
    assert not earned(bytes(slot))
print('PASS statuette/feather rules need every distinct ID; duplicates and slot -1 never count')

TASKS = json.loads((ROOT / 'source/games/ac2/tracker_rules.json').read_text())
def task(object_id, done, count):
    return (bytes.fromhex('11000000416f6a5b0000000000000700') + b'\x0b' + struct.pack('<I', object_id)
        + bytes.fromhex('0e000000b66ca5720000000000000000') + b'\x0b\x00'
        + bytes.fromhex('0e000000cdde09b80000000000000000') + b'\x0b' + bytes([done])
        + bytes.fromhex('11000000e3a9bfce000000000000') + b'\x07\x00\x0b' + struct.pack('<i', count))
for rule in TASKS:
    oid, need, key = int(rule['objectId'], 16), rule['need'], str(rule['index'])
    assert rule['index'] in earned(save_with() + task(oid, 1, need)), rule['name']
    if rule.get('countOnly'):
        assert rule['index'] in earned(save_with() + task(oid, 0, need)), rule['name']
    else:
        assert rule['index'] not in earned(save_with() + task(oid, 0, need)), rule['name']
    if need > 1 or not rule.get('countOnly'):
        assert rule['index'] not in earned(save_with() + task(oid, 1, need - 1)), rule['name']
    else:
        assert rule['index'] not in earned(save_with() + task(oid, 1, 0)), rule['name']
    assert parse(save_with() + task(oid, 0, 7))['tasks'][key]['have'] == 7
    assert rule['index'] not in earned(save_with() + task(oid ^ 1, 1, need))
    broken = bytearray(save_with() + task(oid, 1, need)); broken[-12] ^= 0xFF
    assert rule['index'] not in earned(bytes(broken))
glyphs = earned(save_with() + task(0x5BC08542, 0, 1))
assert {41, 42} <= glyphs and 19 not in glyphs
assert {41, 42, 19} <= earned(save_with() + task(0x5BC08542, 0, 20))
print('PASS game task rules need the completed flag (or count-only glyphs), the threshold and an exact layout')

# Accomplishment checklists (named in the game's Game Bootstrap Settings): every listed task completed.
CHECKLISTS = json.loads((ROOT / 'source/games/ac2/checklist_rules.json').read_text())
for rule in CHECKLISTS:
    if rule['kind'] != 'tasks':
        continue
    ids, key = [int(v, 16) for v in rule['tasks']], str(rule['index'])
    all_done = save_with() + b''.join(task(oid, 1, 1) for oid in ids)
    assert rule['index'] in earned(all_done), rule['name']
    assert dict(parse(all_done)['checklists'][key].items()) == {'have': len(ids), 'need': len(ids), 'label': rule['label']}
    one_short = save_with() + b''.join(task(oid, 1 if k else 0, 1) for k, oid in enumerate(ids))
    assert rule['index'] not in earned(one_short), rule['name']
    assert parse(one_short)['checklists'][key]['have'] == len(ids) - 1
    assert rule['index'] not in earned(save_with() + b''.join(task(oid, 1, 1) for oid in ids[1:]))
roma = save_with() + b''.join(task(0xC962822F + k, 1, 1) for k in range(7) if k != 2)
assert 36 in earned(roma), 'Roma is not one of the Show Your Colors regions'
print('PASS Art Connoisseur, Perfect Harmony and Show Your Colors need every accomplishment in the game\'s checklist')


def villa(levels, value=None):
    head = bytes.fromhex('37010000') + bytes.fromhex('85aba99f') * 2 + bytes(40)
    if value is not None:
        head = head[:-21] + bytes.fromhex('110000002853942100000000000007000b') + value.to_bytes(4, 'little')
    return head + bytes.fromhex('1d000000b2d6e8080000000000009d010b010b000000') + bytes(levels) + bytes(20)
handy = next(r for r in CHECKLISTS if r['kind'] == 'villa')
start = villa(handy['base'])
assert handy['index'] not in earned(save_with() + start)
assert dict(parse(save_with() + start)['checklists']['37'].items()) == {'have': 0, 'need': 1, 'label': 'Stronghold buildings upgraded'}
assert handy['index'] in earned(save_with() + villa([1, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0]))
assert handy['index'] in earned(save_with() + villa([0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1]))
full = parse(save_with() + villa([3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1]))['checklists']['37']
assert full['have'] == 1 and full['need'] == 1, full
assert handy['index'] not in earned(save_with() + villa([9, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0]))
assert '37' not in dict(parse(save_with())['checklists'].items())
print('PASS Handy Man unlocks when a stronghold building is above its new-game level; odd levels are not trusted')

podesta = next(r for r in CHECKLISTS if r['kind'] == 'villaValue')
assert podesta['index'] == 44 and podesta['need'] == 120000 and podesta['max'] == 150000
full_levels = [3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1]
assert dict(parse(save_with() + villa(full_levels, 1280))['checklists']['44'].items()) == {'have': 1280, 'need': 120000, 'label': 'Stronghold value (80% of 150,000)'}
assert 44 not in earned(save_with() + villa(full_levels, 119999)), '117755 (the pack save before Sequence 7) is not enough'
assert 44 in earned(save_with() + villa(full_levels, 120000))
assert parse(save_with() + villa(full_levels, 145355))['checklists']['44']['have'] == 120000, 'the count stops at the target'
assert '44' not in dict(parse(save_with() + villa(full_levels))['checklists'].items()), 'no value, no count'
assert 44 not in earned(save_with() + villa(full_levels, 0xFFFFFFF0)), 'an impossible value is not trusted'
print('PASS Podesta of Monteriggioni unlocks at 120000, 80% of the 150000 in the game\'s villa manager; the count shows the value')

known = int(RULES[3]['missionIds'][0], 16)
assert parse(save_with([known, known]))['recordCount'] == 1
assert not earned(save_with([known])[:-40])
assert parse(b'encrypted or unrelated data') is None
bad = bytearray(save_with([known])); bad[51] = 1
assert parse(bytes(bad)) is None
bad = bytearray(save_with([known])); bad[552 + 0x2D] = 0
assert not earned(bytes(bad))
print('PASS duplicates, truncation, corrupt header, unknown format and wrong flag layout')

# A new game: escaping Abstergo (P01_M01-03) and entering the Animus (P01_M04) come first.
assert {0, 1} <= earned(save_with([0x6697F883])) and 2 not in earned(save_with([0x6697F883]))
assert {0, 1, 2} <= earned(save_with([0x6697F883, 0x9C1E07D6]))
print('PASS new-game intro: Abstergo escape and entering the Animus unlock the first three')

# v0.33.0: sequence ends. Every memory before a sequence's last one leaves its achievement locked.
SEQUENCE_ENDS = {
    4: ([0x397E179C, 0x397E179F, 0x39E0A28D, 0x39E0A28A, 0x39E0A287], 0x39E0A284),  # Vengeance; 287 = Laying Low
    8: ([0x44F3E3CF, 0x900AFDA9, 0x44F3E3D2, 0x44F3E3D8, 0x44F3E3DE, 0x44F3E3DB, 0x44F3E3D5], 0x44F3E3E1),  # The Conspirators
    13: ([0x635BC901, 0x635BC904, 0x635BC907, 0x635BC910, 0x635BC90A, 0x635BC913, 0x635BC90D], 0x635BC916),  # Masquerade
}
for index, (before, last) in SEQUENCE_ENDS.items():
    assert index not in earned(save_with(before)), index
    assert index in earned(save_with(before + [last])), index
print('PASS Sequences 2, 5 and 9 unlock at their last memory, not the one before')


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
    (steam / 'steamapps/appmanifest_33230.acf').write_text('"installdir" "ac2"')
    folder = steam / 'steamapps/common/ac2/savegames/test-profile/4'
    folder.mkdir(parents=True)
    active = folder / '1.save'
    active.write_bytes(save_with([known], 0, padding=15000))
    initial_hash = hashlib.sha256(active.read_bytes()).hexdigest()
    config = {'ac2SavePathV1': str(active)}
    writes = []

    def set_config(key, value):
        config[key] = value
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
            'config': lua.table_from({'get': config.get, 'set': set_config})}),
        'fs': lua.table_from({'list': list_dir, 'join': join, 'filename': lambda p: Path(p).name,
            'is_file': lambda p: Path(p).is_file(), 'is_directory': lambda p: Path(p).is_dir(),
            'parent_path': lambda p: str(Path(p).parent), 'last_write_time': lambda p: int(Path(p).stat().st_mtime)}),
        'json': lua.table_from({'encode': lambda v: json.dumps(from_lua(v)), 'decode': lambda v: lua.table_from(json.loads(v))}),
    }
    for name, module in modules.items():
        lua.globals().package.loaded[name] = module
    lua.execute('clock=100; os.time=function() return clock end; os.getenv=function() return nil end')
    backend = lua.execute((ROOT / 'backend/main.lua').read_text())
    backend['on_load']()

    def tick():
        lua.globals().clock += 2
        return json.loads(lua.globals().GetTrackerState())

    assert tick()['status'] == 'stabilizing'
    assert tick()['progress'] == {}
    assert hashlib.sha256(active.read_bytes()).hexdigest() == initial_hash
    active.write_bytes(save_with([known], 100, padding=15000))
    changed_hash = hashlib.sha256(active.read_bytes()).hexdigest()
    assert tick()['progress'] == {}  # New bytes have not stabilized yet.
    state = tick()
    assert state['status'] == 'watching'
    assert '3' in state['progress']

    # A detector error on an odd save is reported like an unsupported save; tracking goes on.
    ac2 = lua.globals().package.loaded['detector_ac2']
    real_parse = ac2.rawParse
    lua.execute('parseCalls = 0')
    ac2.rawParse = lua.eval('function() parseCalls = parseCalls + 1; error("boom") end')
    active.write_bytes(save_with([known], 100, padding=15001))
    tick()
    broken = tick()
    assert broken['status'] == 'unsupported-save' and 'boom' in broken['message'], broken
    assert '3' in broken['progress']
    # The same broken bytes are not parsed again on every poll; the message stays.
    calls = lua.globals().parseCalls
    for _ in range(3): again = tick()
    assert lua.globals().parseCalls == calls, (calls, lua.globals().parseCalls)
    assert again['status'] == 'unsupported-save' and 'boom' in again['message'], again
    ac2.rawParse = real_parse
    active.write_bytes(save_with([known], 100, padding=15000))
    tick()
    assert tick()['status'] == 'watching'
    print('PASS a detector error on a strange save is reported once (not re-read until it changes), earned unlocks stay, and tracking recovers')
    assert set(state['progress']) == {'0', '1', '2', '3'}
    assert 'ac2AutomaticProgressV1' in writes
    assert hashlib.sha256(active.read_bytes()).hexdigest() == changed_hash
    before = len(writes)
    tick(); tick()
    assert len(writes) == before  # No repeated achievement writes for unchanged save.
    print('PASS watcher waits for stable snapshots, grants only after completion and persists once')

    reset = json.loads(lua.globals().SetSavePath(''))
    assert reset['saveFound']
    assert tick()['status'] == 'watching'
    assert '3' in tick()['progress']
    assert state['saveFileName'] == '1.save'
    assert 'test-profile' not in json.dumps(state)
    assert str(base) not in json.dumps(state)
    print('PASS Steam-library save discovery, automatic-state retention and privacy-limited status')

    unknown = folder / 'bad.save'; unknown.write_bytes(b'not an AC2 save')
    previous_path = config['ac2SavePathV1']
    try:
        lua.globals().SetSavePath(str(unknown))
        raise AssertionError('Unknown save must be rejected')
    except Exception as error:
        assert 'Save is incomplete' in str(error)
    assert config['ac2SavePathV1'] == previous_path
    assert hashlib.sha256(active.read_bytes()).hexdigest() == changed_hash
    print('PASS invalid save selection does not replace the selected path or modify the game save')

    # A new game writes a new slot file while Steam runs; the watcher moves to it.
    lua.globals().SetSavePath('')
    newer = folder / '3.save'
    newer.write_bytes(save_with([0x6697F883], padding=15000))
    import os; stamp = active.stat().st_mtime + 60; os.utime(newer, (stamp, stamp))
    for _ in range(8): state = tick()
    assert state['saveFileName'] == '3.save', state['saveFileName']
    newer.unlink()
    lua.globals().SetSavePath(previous_path)
    print('PASS a newer save slot is picked up without restarting Steam')

    # A real case: a slot file chosen in Settings, Reset to locked, then a new game in
    # another slot. The new slot is followed and its intro unlocks despite the held keys.
    for _ in range(6): state = tick()
    assert state['saveFileName'] == '1.save' and {'0', '1', '2', '3'} <= set(state['progress'])
    state = json.loads(lua.globals().ResetProgress(json.dumps({'appId': 33230})))
    for _ in range(3): state = tick()
    assert state['progress'] == {}, state['progress']
    assert config['ac2SavePathV1'] == previous_path
    newer.write_bytes(save_with([0x6697F883, 0x9C1E07D6], padding=15000))
    stamp = active.stat().st_mtime + 120; os.utime(newer, (stamp, stamp))
    for _ in range(8): state = tick()
    assert state['saveFileName'] == '3.save', state['saveFileName']
    assert set(state['progress']) == {'0', '1', '2'}, state['progress']
    newer.unlink()
    for _ in range(8): state = tick()
    assert state['saveFileName'] == '1.save'
    print('PASS a chosen slot file still follows a new game in another slot, and Reset to locked does not block it')

    if options.save:
        real_bytes=options.save.read_bytes()
        real_hash=hashlib.sha256(real_bytes).hexdigest()
        real_parsed=parse(real_bytes)
        assert real_parsed and real_parsed['slot']>=0
        real_expected=earned(real_bytes)
        if options.expect_unlocks is not None: assert len(real_expected)==options.expect_unlocks
        (folder/'2.save').write_bytes(real_bytes)
        if options.placeholder:
            placeholder_bytes=options.placeholder.read_bytes()
            parsed_placeholder=parse(placeholder_bytes)
            assert parsed_placeholder and parsed_placeholder['slot']==-1
            assert not earned(placeholder_bytes)
            active.write_bytes(placeholder_bytes)
        config.pop('ac2AutomaticProgressV1',None)
        config['ac2SavePathV1']=str(active.with_suffix('')) if options.placeholder else str(folder/'2.save')
        backend=lua.execute((ROOT/'backend/main.lua').read_text())
        backend['on_load']()
        assert tick()['status']=='stabilizing'
        real_state=tick()
        assert real_state['saveFileName']=='2.save'
        assert real_state['status']=='watching'
        assert set(map(int,real_state['progress']))==real_expected
        assert hashlib.sha256(options.save.read_bytes()).hexdigest()==real_hash
        if options.placeholder: assert options.placeholder.read_bytes()==placeholder_bytes
        print('PASS real-save LuaJIT watcher:',real_state['missionRecords'],'mission records,',len(real_expected),'supported achievements')
        print('     collectible counts:',{v['label']:f"{v['have']}/{v['need']}" for v in real_state['counts'].values()})
        if options.placeholder:
            assert 'selected 2.save' in real_state['selectionNote']
            print('PASS extensionless placeholder path selects the gameplay save from the same folder')
        # Direct folder selection is also accepted.
        reply=json.loads(lua.globals().SetSavePath(str(folder)))
        assert reply['saveFileName']=='2.save'
        assert tick()['status']=='watching'
        print('PASS direct save-folder selection chooses the gameplay file')

print('All LuaJIT 2.1 detector/watcher tests passed. Windows Steam integration remains a client-side check.')
