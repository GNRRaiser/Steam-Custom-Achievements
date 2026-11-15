"""Execute the Fallout 3 detector with synthetic .fos saves (no game data).
Optional developer dependency: pip install lupa. The layout follows detector_fallout3.lua:
header, screenshot, plugin list, file location table, global data (type 0 = misc stats),
change forms (type 9 quests, the player reference 0x14) and the form ID array."""
import json
from pathlib import Path
from lupa.luajit21 import LuaRuntime
from fo3_fixture import PLUGINS, save

ROOT = Path(__file__).resolve().parent.parent
GAME = json.loads((ROOT / 'source/games/fallout3/game.json').read_text())
NAMES = [a['name'] for a in GAME['achievements']]
lua = LuaRuntime(encoding=None, unpack_returned_tuples=True)
lua.execute(b'package.path = ... .. ";" .. package.path', str(ROOT / 'backend/?.lua').encode())
D = lua.eval(b'require("detector_fallout3")')
games = lua.eval(b'require("games")')
game = next(g for g in games.values() if g[b'appId'] == 22370)


def earned(data):
    parsed = D[b'parse'](D[b'summarize'](data))
    assert parsed is not None and not isinstance(parsed, tuple), parsed
    return {NAMES[i] for i in D[b'evaluate'](parsed, game).values()}


assert earned(save()) == set()
print('PASS a new character (level 1, nothing finished) unlocks nothing')

assert earned(save(quests=[('Fallout3.esm', 0x14E86, 0x26), ('Fallout3.esm', 0x14E87, 0x11)])) == {'Escape!'}
assert earned(save(quests=[('Fallout3.esm', 0x14E84, 0x01)])) == {'Vault 101 Citizenship Award'}
print('PASS a quest counts when its completed flag (0x02) is set; Growing Up Fast counts once started')

dlc = [('Anchorage.esm', 0x14F6, 0x22), ('BrokenSteel.esm', 0x802, 0x22), ('Zeta.esm', 0x804, 0x26), ('PointLookout.esm', 0x584B, 0x22)]
assert earned(save(quests=dlc)) == {'Operation: Anchorage', 'Death From Above', "This Galaxy Ain't Big Enough...", 'A Meeting of the Minds'}
reordered = ['Fallout3.esm', 'Zeta.esm', 'BrokenSteel.esm', 'Anchorage.esm', 'PointLookout.esm', 'ThePitt.esm']
assert earned(save(quests=[('Zeta.esm', 0x802, 0x22)], plugins=reordered)) == {'Not of This World'}
assert earned(save(quests=[('BrokenSteel.esm', 0x802, 0x22)], plugins=reordered)) == {'Death From Above'}
print('PASS DLC quests are matched by plugin name, whatever the load order (Broken Steel and Zeta share 0x802)')

assert earned(save(stats={'People Killed': 299, 'Bobbleheads Found': 9})) == set()
got = earned(save(stats={'People Killed': 300, 'Creatures Killed': 300, 'Locks Picked': 50, 'Computers Hacked': 50,
                         'Speech Successes': 50, 'Locations Discovered': 100, 'Pants Exploded': 1, 'Bobbleheads Found': 20}))
assert got == {"Doesn't Play Well with Others", 'Slayer of Beasts', 'Keys are for Cowards', 'Data Miner', 'Silver-Tongued Devil',
               'One-Man Scouting Party', 'Psychotic Prankster', 'Yes, I Play with Dolls', 'Vault-Tec C.E.O.'}, got
print('PASS Pip-Boy statistics unlock at their targets (300 kills, 50 locks/terminals/speech, 100 locations, 10/20 bobbleheads)')

assert earned(save(level=14, karma=1000.0)) == {'Protector', 'Ambassador of Peace'}
assert earned(save(level=20, karma=0.0)) == {'Mercenary', 'Pinnacle of Survival', 'Paradigm of Humanity'}
assert earned(save(level=30, karma=-250.0)) == {'Reaver', 'Harbinger of War', 'Scourge of Humanity', 'Devil'}
assert earned(save(level=7, karma=-1000.0)) == set()
assert earned(save(level=8, karma=249.0)) == {'Mercenary'}
print('PASS level achievements follow the karma the save holds (good >= 250, bad <= -250)')

def earned_after(data, memory):
    parsed = D[b'parse'](D[b'summarize'](data))
    return {NAMES[i] for i in D[b'evaluate'](parsed, game, lua.table_from(memory)).values()}

def remember(data):
    return dict(D[b'remember'](D[b'parse'](D[b'summarize'](data))).items())

seen = remember(save(level=10, karma=1000.0))
assert seen == {b'level': 10, b'player': b'Lone Wanderer'}, seen
seen = {b'level': 10, b'player': b'Lone Wanderer'}
assert earned_after(save(level=10, karma=-1000.0), seen) == set()
assert earned_after(save(level=11, karma=-1000.0), seen) == {'Reaver'}
assert earned_after(save(level=9, karma=0.0), seen) == set()
assert earned_after(save(level=10, karma=0.0), {b'level': 30, b'player': b'Someone Else'}) == {'Mercenary'}
print('PASS karma achievements need a level-up after the plugin has seen the character; changing karma alone unlocks nothing')

for broken in (b'not a save', save(cut=True), save()[:1000]):
    parsed = D[b'parse'](D[b'summarize'](broken))
    assert isinstance(parsed, tuple) and parsed[0] is None, broken[:20]
F, PITT, ZETA, PL = 'Fallout3.esm', 'ThePitt.esm', 'Zeta.esm', 'PointLookout.esm'
weapons = {(F, low): 1.0 for low in range(0xBAFEC, 0xBAFF3)}
assert earned(save(globals_={**weapons, (F, 0xBAFF2): 0.0, (F, 0xA3031): 4.0})) == set()
assert earned(save(globals_={**weapons, (F, 0xA3031): 5.0})) == {'Weaponsmith', 'The Bigger They Are...'}
assert earned(save(globals_={(F, 0xA6AD3): 1.0})) == {'Weaponsmith'}
print('PASS Weaponsmith needs all 7 custom weapon counters (or the game\'s own done flag); 5 Behemoths killed')

assert earned(save(qvars={(PITT, 0xA686): {1: 99.0}, (ZETA, 0x3419): {1: 24.0}, (PL, 0x103A1): {1: 28.0}})) == set()
assert earned(save(qvars={(PITT, 0xA686): {1: 100.0}, (ZETA, 0x3419): {1: 25.0}, (PL, 0x103A1): {1: 29.0}})) == {'Mill Worker', 'Alien Archivist', 'Bog Walker'}
assert earned(save(qvars={(PITT, 0xA686): {28: 2.0, 45: 1.0}, (ZETA, 0x3419): {1: -1.0}})) == {'Mill Worker', 'Alien Archivist'}
print('PASS DLC quest script counters: 100 ingots (or the achievement flag), 25 recordings (-1 once awarded), 29 Point Lookout markers')

print('PASS files that are not Fallout 3 saves, or are cut short, are not read')
print('All Fallout 3 detector tests passed.')
