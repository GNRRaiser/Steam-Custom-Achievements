"""Execute the Bully: Scholarship Edition detector with synthetic saves (no game data).
Optional developer dependency: pip install lupa. A save is 22260 bytes: version 21 at 0x04, the
size at 0x08, the chapter byte at 0x75, the mission table at 0x52C (510 entries of attempts, passes,
flags from 0x53C) and the statistics block at 0x2F3C (stat n at 0x2F4C + 4n).
FileTableBully has one 56-byte entry per slot: valid, completion %, chapter, ..."""
import json
import struct
from pathlib import Path
from lupa.luajit21 import LuaRuntime

ROOT = Path(__file__).resolve().parent.parent
GAME = json.loads((ROOT / 'source/games/bully/game.json').read_text())
NAMES = [a['name'] for a in GAME['achievements']]


def save(chapter=0, ints=None, floats=None, passed=()):
    data = bytearray(22260)
    struct.pack_into('<III', data, 4, 21, 22260, 3)
    data[0x75] = chapter
    struct.pack_into('<III', data, 0x52C, 1, 3204, 510)
    for n in passed:
        struct.pack_into('<HHH', data, 0x53C + 6 * n, 1, 1, 16)
    struct.pack_into('<IIII', data, 0x2F3C, 1, 1468, 260, 38)
    for n, value in (ints or {}).items():
        struct.pack_into('<i', data, 0x2F4C + 4 * n, value)
    for n, value in (floats or {}).items():
        struct.pack_into('<f', data, 0x2F4C + 4 * n, value)
    return bytes(data)


def entry(completion, chapter, valid=1):
    return struct.pack('<IfI', valid, completion, chapter) + bytes(44)


def wrapped(data, slot_entry):
    return b'SCAB' + b'%08x' % len(data) + data + slot_entry


lua = LuaRuntime(encoding=None, unpack_returned_tuples=True)
lua.execute(b'package.path = ... .. ";" .. package.path', str(ROOT / 'backend/?.lua').encode())
D = lua.eval(b'require("detector_bully")')
games = lua.eval(b'require("games")')
game = next(g for g in games.values() if g[b'appId'] == 12200)


def earned(data):
    parsed = D[b'parse'](data)
    assert not isinstance(parsed, tuple), parsed
    return {NAMES[i] for i in D[b'evaluate'](parsed, game).values()}


assert earned(save()) == set()
assert earned(save(chapter=1)) == {'Freshman'}
assert earned(save(chapter=5)) == {'Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'}
print('PASS the chapter byte unlocks Freshman to Graduate, one per finished chapter')

assert earned(save(floats={5: 99999.5, 6: 50000.0, 7: 100000.25})) == {'Skate Pro', 'Tour de Bullworth'}
assert earned(save(ints={22: 25, 32: 49, 43: 100, 49: 200, 75: 50, 78: 24})) == {'Eggsellent!', "Kickin' the Balls", 'The Wheel Deal', 'Smell Ya Later'}
assert earned(save(ints={194: 100, 197: 100, 198: 200, 238: 300, 1: 40, 46: 20})) == {
    'Soda-licious', 'Smart Mouth', 'Down for the Count', 'Glass Dismissed', 'Kleptomania', 'The (Expert) Bicycle Thief'}
assert earned(save(ints={40: 5000})) == set(), 'sodas drunk are not sodas bought'
print('PASS stats screen counters (distances as metres, eggs, wedgies, sodas bought, knockouts, ...) unlock at their totals')

parsed = D[b'parse'](save(ints={32: 12}, floats={5: 21265.75}))
counts = {NAMES[int(k)]: (v[b'have'], v[b'need']) for k, v in D[b'counts'](parsed, game).items()}
assert counts['Skidmark'] == (12, 50) and counts['Marathon'] == (21265, 100000), counts
print('PASS counters show n / total')

CHEM, ART, GYM, PHOTO, ENGLISH = [122, 123, 124, 125, 126], [128, 129, 130, 131, 132], [134, 135, 136, 137, 138], 148, 153
assert earned(save(passed=CHEM[:4] + ART[:4] + GYM[:4])) == set(), 'a class counts once its fifth level is passed'
assert earned(save(passed=[126, 132, 138])) == {'Keener'}
assert earned(save(passed=[126, 132, 143, 148, 153, 159])) == {'Keener', "Teacher's Pet"}, 'Gym counts from either level 5 entry'
assert earned(save(passed=[126, 132, 138, 143, 148, 153, 159, 170, 176])) == {'Keener', "Teacher's Pet"}, 'two Gym entries are one class'
assert earned(save(passed=[126, 132, 138, 148, 153, 159, 170, 176, 182])) == {'Keener', "Teacher's Pet", 'Boy Genius'}
parsed = D[b'parse'](save(passed=[126, 132, 138, 143]))
counts = {NAMES[int(k)]: (v[b'have'], v[b'need']) for k, v in D[b'counts'](parsed, game).items()}
assert counts['Keener'] == (3, 3) and counts['Boy Genius'] == (3, 9), counts
print('PASS classes count once all five levels are passed (Keener, Teacher\'s Pet, Boy Genius)')

assert 'The Champion' not in earned(save(passed=range(49, 62)))
assert 'The Champion' in earned(save(passed=range(49, 63)))
assert earned(save(passed=[120])) == {'Mission Accomplished'}
assert earned(save(passed=range(0, 120))) == {'The Champion'}, 'the other missions alone are not every mission'
unpassed = bytearray(save())
struct.pack_into('<HHH', unpassed, 0x53C + 6 * 120, 3, 0, 16)
assert earned(bytes(unpassed)) == set(), 'attempts without a pass do not count'
print('PASS The Champion needs all 14 bike races, Mission Accomplished the game\'s all-missions-passed entry')

full = save(chapter=5)
assert 'Perfectionist' in earned(wrapped(full, entry(100.0, 5)))
assert 'Perfectionist' not in earned(wrapped(full, entry(99.9, 5)))
assert 'Perfectionist' not in earned(wrapped(full, entry(100.0, 4))), 'an entry for another save is not trusted'
assert 'Perfectionist' not in earned(wrapped(full, entry(100.0, 5, valid=0)))
assert 'Perfectionist' not in earned(full), 'no FileTableBully, no completion'
print('PASS Perfectionist needs 100% in the slot\'s FileTableBully entry, which must agree with the save')

for bad in (b'', b'not a save', save()[:-1], save()[:4] + struct.pack('<I', 20) + save()[8:]):
    assert isinstance(D[b'parse'](bad), tuple), bad[:12]
broken = bytearray(save(chapter=5))
struct.pack_into('<I', broken, 0x2F40, 1000)
assert isinstance(D[b'parse'](bytes(broken)), tuple)
broken = bytearray(save(chapter=5))
struct.pack_into('<I', broken, 0x534, 400)
assert isinstance(D[b'parse'](bytes(broken)), tuple), 'another mission table size'
assert isinstance(D[b'parse'](b'SCAB' + b'%08x' % 22260 + save()[:100]), tuple)
print('PASS files that are not Bully saves, cut off or with another layout unlock nothing')

assert len(GAME['achievements']) == 43 and {a['group'] for a in GAME['achievements']} >= {'PS4'}
assert not any(a['group'] == 'Anniversary Edition' for a in GAME['achievements'])
print('PASS 38 Xbox 360 + 5 PS4 achievements, plus the Valedictorian platinum (no mobile multiplayer ones)')
print('All Bully detector tests passed.')
