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


def save(chapter=0, ints=None, floats=None, passed=(), passes=None, money=None, respect=None, errands=None, tops=None):
    data = bytearray(22260)
    struct.pack_into('<III', data, 4, 21, 22260, 3)
    data[0x75] = chapter
    struct.pack_into('<III', data, 0x52C, 1, 3204, 510)
    for n in passed:
        struct.pack_into('<HHH', data, 0x53C + 6 * n, 1, 1, 16)
    for n, count in (passes or {}).items():
        struct.pack_into('<HHH', data, 0x53C + 6 * n, count, count, 16)
    if money is not None or respect is not None:
        # Player block: money in cents at 0x38, respect for the five cliques from 0xA4.
        struct.pack_into('<I', data, 0x10, 364)
        struct.pack_into('<I', data, 0x38, money or 0)
        for k, value in enumerate(respect or [50, 50, 0, 50, 50]):
            struct.pack_into('<I', data, 0xA4 + 4 * k, value)
    if errands is not None:
        struct.pack_into('<III', data, 0x4D0C, 1, 412, 50)
        for n in errands:
            struct.pack_into('<HH', data, 0x4D18 + 4 * n, 1, 1)
    if tops is not None:
        # Arcade tables with their built-in scores; tops = {table: score at the top}.
        struct.pack_into('<5I', data, 0x4578, 1, 1004, 10, 5, 3)
        for table in range(10):
            struct.pack_into('<5I', data, 0x471C + 20 * table, 1010, 875, 723, 641, 320)
        for table, score in tops.items():
            struct.pack_into('<I', data, 0x471C + 20 * table, score)
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
assert earned(save(ints={129: 25, 132: 19, 38: 50, 66: 250, 154: 160000})) == {
    'Casanova', 'Green Thumbs Up', 'Sharp Dressed Man', 'Problem Child'}
assert earned(save(ints={132: 20, 129: 24, 39: 500, 154: 159999})) == {'Over the Rainbow'}, 'flowers obtained are not flowers picked'
print('PASS kisses, flowers picked, clothes bought and trouble points unlock at their totals')
assert earned(save(ints={156: 299999})) == set() and earned(save(ints={156: 300000})) == {'After Hours'}
print('PASS After Hours: time out after curfew is saved in ms, 1000 per in-game minute, so 5 hours is 300000')
assert earned(save(ints={55: 3})) == set()
assert earned(save(ints={55: 2, 57: 2})) == {'Speed Freak'}
assert earned(save(ints={55: 5, 57: 2})) == {'Speed Freak'}
assert earned(save(ints={55: 5, 57: 3})) == {'Speed Freak', 'Pole Position'}
assert earned(save(ints={54: 9, 56: 9})) == set(), 'races raced are not races won'
print('PASS Speed Freak and Pole Position add carnival and street go-kart wins (4 and 8 of the 8 races)')

assert earned(save(errands=range(9))) == set()
assert earned(save(errands=range(10))) == {'Helping Hand'}
assert earned(save(errands=range(20, 50))) == {'Helping Hand', 'Little Angel', "Momma's Boy"}
attempted = bytearray(save(errands=()))
for n in range(50):
    struct.pack_into('<HH', attempted, 0x4D18 + 4 * n, 3, 0)
assert earned(bytes(attempted)) == set(), 'errands attempted but not passed do not count'
broken = bytearray(save(errands=range(50)))
struct.pack_into('<I', broken, 0x4D14, 49)
assert earned(bytes(broken)) == set(), 'an errand list of another size is ignored'
print('PASS Helping Hand, Little Angel and Momma\'s Boy count passed errands in the save\'s 50-entry errand list')
assert earned(save(money=99999)) == set() and earned(save(money=100000)) == {'Rich Kid Blues'}
assert earned(save(respect=[100, 99, 0, 50, 100])) == {'Popularity Contest'}
assert earned(save(respect=[100, 99, 0, 50, 50])) == set()
nohead = bytearray(save(money=500000, respect=[100] * 5))
struct.pack_into('<I', nohead, 0x10, 360)
assert earned(bytes(nohead)) == set(), 'a player block of another size is ignored'
print('PASS Rich Kid Blues at $1,000 in pocket, Popularity Contest with two cliques at 100% respect')
assert earned(save(ints={218: 1043, 221: 340, 224: 75500}, tops={5: 1043, 1: 340, 2: 75500})) == {'Dual Nebula'}
assert earned(save(ints={218: 1043, 221: 340, 224: 52450}, tops={5: 1043, 1: 340, 2: 69900})) == set(), 'second place on Nut Shots'
assert earned(save(ints={218: 0, 221: 0, 224: 0}, tops={5: 0, 1: 0, 2: 0})) == set(), 'no games played'
print('PASS Dual Nebula once the player holds the top score on ConSumo, Monkey Fling and Nut Shots')
assert earned(save(passes={40: 1, 41: 3})) == set()
assert earned(save(passes={40: 1, 41: 4})) == {'Black & White & Read All Over'}
assert earned(save(passes={41: 9})) == set(), 'the first paper route is part of it'
print('PASS Black & White & Read All Over after the first paper route and all four 2_R03_X difficulties')
print('PASS stats screen counters (distances as metres, eggs, wedgies, sodas bought, knockouts, ...) unlock at their totals')

parsed = D[b'parse'](save(ints={32: 12}, floats={5: 21265.75}))
counts = {NAMES[int(k)]: (v[b'have'], v[b'need']) for k, v in D[b'counts'](parsed, game).items()}
assert counts['Skidmark'] == (12, 50) and counts['Marathon'] == (21265, 100000), counts
parsed = D[b'parse'](save(ints={156: 252263, 55: 1, 57: 1}))
counts = {NAMES[int(k)]: (v[b'have'], v[b'need']) for k, v in D[b'counts'](parsed, game).items()}
assert counts['After Hours'] == (252, 300) and counts['Pole Position'] == (2, 8), counts
parsed = D[b'parse'](save(money=16650, respect=[85, 45, 0, 50, 100], errands=[9, 18, 19, 29, 34, 42], passes={40: 1, 41: 1}))
counts = {NAMES[int(k)]: (v[b'have'], v[b'need']) for k, v in D[b'counts'](parsed, game).items()}
assert counts['Helping Hand'] == (6, 10) and counts['Rich Kid Blues'] == (166, 1000), counts
assert counts['Popularity Contest'] == (1, 2) and counts['Black & White & Read All Over'] == (2, 5), counts
assert 'Dual Nebula' not in counts, 'no high score tables, no counter'
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
