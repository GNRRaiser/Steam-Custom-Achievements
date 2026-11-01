"""Execute the Thrillville detector with synthetic park saves (no game data).
Optional developer dependency: pip install lupa. A save is RGMH, then mission records:
0xFC, the name with its last character's top bit set, then the status bytes."""
import json
from pathlib import Path
from lupa.luajit21 import LuaRuntime

ROOT = Path(__file__).resolve().parent.parent
GAME = json.loads((ROOT / 'source/games/thrillville-otr/game.json').read_text())
NAMES = [a['name'] for a in GAME['achievements']]
LOCKED, OPEN, GOLD = bytes.fromhex('0001000000'), bytes.fromhex('0300000000'), bytes.fromhex('0403000003')


def record(name, status):
    raw = name.encode()
    return b'\xfc' + raw[:-1] + bytes([raw[-1] | 0x80]) + status


def save(missions):
    body = b'RGMH' + bytes(60) + b''.join(record(n, s) for n, s in missions) + b'\xfc\x01' + bytes(32)
    return body + bytes(358800 - len(body))


lua = LuaRuntime(encoding=None, unpack_returned_tuples=True)
lua.execute(b'package.path = ... .. ";" .. package.path', str(ROOT / 'backend/?.lua').encode())
D = lua.eval(b'require("detector_thrillville")')
games = lua.eval(b'require("games")')
game = next(g for g in games.values() if g[b'appId'] == 6080)


def earned(data):
    parsed = D[b'parse'](data)
    return {NAMES[i] for i in D[b'evaluate'](parsed, game).values()}


park1 = [('P1_B_PlaceArcade', GOLD), ('P1_G_WinPrizes', OPEN), ('P1_G_TalkToCritic', LOCKED), ('P1MOLLY', OPEN)]
assert earned(save(park1)) == set()
assert earned(save(park1[:1] + [('P1_G_WinPrizes', bytes.fromhex('0401000001'))])) == {'Critics'}
assert D[b'parse'](save(park1))[b'finished'] == 1
print('PASS Bribery 101! (P1_G_WinPrizes) unlocks Critics only once finished, with any medal')

story = {'P2_G_SaucerSoccer': 'Sabotage', 'P3_G_GuestsInTrance': 'Hypnosis', 'P4_M_RobotReductionII': 'Robots', 'P5_G_RobotKO': 'Traitor'}
parks = {'P2_P_Pool': 'Thrillville Explorer', 'P3_P_RCWars': 'Thrillville Giant', 'P5_P_Rodeo': 'Thrillville Holiday',
         'P4_P_Tank': 'Thrillville Otherworlds'}
for mission, name in story.items():
    assert name not in earned(save([(mission, OPEN)])), mission
    assert name in earned(save([(mission, GOLD)])), mission
for mission, name in parks.items():
    assert earned(save([(mission, LOCKED)])) == set(), mission
    assert earned(save([(mission, OPEN)])) == {name}, mission
assert earned(save([('P4_M_RobotReductionI', GOLD)])) == {'Thrillville Otherworlds'}
print('PASS Alien Antics, Trance-Cendtal, Clearance Sale and Traitor\'s Arena unlock their achievements; an open mission unlocks its park')

assert D[b'parse'](b'not a save')[0] is None
assert D[b'parse'](b'RGMH' + bytes(400))[0] is None
print('PASS files that are not park saves, or have no missions, are not read')
SILVER_DONE = bytes.fromhex('0403000002')
assert earned(save([('P3_U_FindHypnodiscs', OPEN)])) == {'Thrillville Giant'}, 'an open hunt is not all 6 Hypnodiscs'
assert 'Disc Jockey' in earned(save([('P3_U_FindHypnodiscs', SILVER_DONE)])), 'Disc Collection has one goal: finished is all 6'
assert {'Propaganda', 'The Rainbow', 'Thrillville Explorer'} == earned(save([('P1_U_FindBoards', GOLD), ('P2_U_CollectSprayers', GOLD), ('P1_U_SuckUpPamphlets', GOLD)]))
assert earned(save([('P1_B_DesignCoaster', OPEN), ('P1_B_FinishCoaster', GOLD), ('P1_B_PreBuilt', GOLD)])) == set(), 'finishing or placing a prebuilt coaster is not designing one'
assert earned(save([('P1_B_DesignCoaster', GOLD)])) == {'Coaster Boaster'}
assert earned(save([('P5_B_DesignCoaster', GOLD)])) == {'Coaster Boaster', 'Whoa', 'Thrillville Holiday'}
assert earned(save([('P4_B_StuntDropI', GOLD)])) == {'Whoa', 'Thrillville Otherworlds'}
assert earned(save([('P5_B_DesignMinigolfCourse', GOLD), ('P2_B_BuildGolfCourse', GOLD)])) == {'Putt putt power', 'Thrillville Holiday', 'Thrillville Explorer'}
print('PASS the collect-all-6 hunts, the brand-new coaster and mini golf design missions and the whoa coaster missions unlock when finished')
def with_stats(data, finished, level):
    data = bytearray(data)
    data[0x576C0:0x576C4] = finished.to_bytes(4, 'little')
    data[0x576F0:0x576F4] = level.to_bytes(4, 'little')
    return bytes(data)
done = [('P1_B_PlaceArcade', GOLD), ('P1_G_GiveRidePass', GOLD), ('P1_G_TalkToCritic', OPEN)]
LEVELS = {'Thrillville Talent', 'Thrillville Sensation', 'Thrillville Phenomenon'}
assert earned(with_stats(save(done), 2, 1)) & LEVELS == set(), 'owner level 1 is a new owner'
assert earned(with_stats(save(done), 2, 2)) & LEVELS == {'Thrillville Talent'}
assert earned(with_stats(save(done), 2, 5)) & LEVELS == {'Thrillville Talent', 'Thrillville Sensation'}
assert earned(with_stats(save(done), 2, 12)) & LEVELS == LEVELS
assert earned(with_stats(save(done), 3, 10)) & LEVELS == set(), 'a statistics block that does not match the missions is not trusted'
assert earned(with_stats(save(done), 2, 999)) & LEVELS == set(), 'an impossible level is not trusted'
parsed = D[b'parse'](with_stats(save(done), 2, 4))
parsed = parsed[0] if isinstance(parsed, tuple) else parsed
counts = {k.decode(): dict((a.decode(), b.decode() if isinstance(b, bytes) else b) for a, b in v.items()) for k, v in D[b'counts'](parsed, game).items()}
assert counts[str(NAMES.index('Thrillville Sensation'))] == {'have': 4, 'need': 5, 'label': 'Park owner level'}
assert counts[str(NAMES.index('Thrillville Talent'))]['have'] == 2, 'the count stops at the target'
print('PASS owner levels 2, 5 and 10 unlock Talent, Sensation and Phenomenon; the level is read only when the statistics match the missions')
print('All Thrillville detector tests passed.')
