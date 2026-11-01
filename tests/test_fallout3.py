"""Execute the Fallout 3 detector with synthetic .fos saves (no game data).
Optional developer dependency: pip install lupa. The layout follows detector_fallout3.lua:
header, screenshot, plugin list, file location table, global data (type 0 = misc stats),
change forms (type 9 quests, the player reference 0x14) and the form ID array."""
import json
import struct
from pathlib import Path
from lupa.luajit21 import LuaRuntime

ROOT = Path(__file__).resolve().parent.parent
GAME = json.loads((ROOT / 'source/games/fallout3/game.json').read_text())
NAMES = [a['name'] for a in GAME['achievements']]
STATS = {name: i for i, name in enumerate(GAME['statNames'])}
PLUGINS = ['Fallout3.esm', 'Anchorage.esm', 'ThePitt.esm', 'PointLookout.esm', 'Zeta.esm', 'BrokenSteel.esm']


def field(text):
    raw = text.encode('latin-1')
    return struct.pack('<H', len(raw)) + b'|' + raw + b'|'


def change_form(ref, flags, kind, data):
    return ref.to_bytes(3, 'big') + struct.pack('<I', flags) + bytes([kind, 21, len(data)]) + data


def player(karma):
    floats = [0.0] * 220
    floats[96] = karma
    return b'\x00\x01\x02' + bytes(24) + b'|' + b''.join(struct.pack('<f', v) + b'|' for v in floats)


def save(level=1, karma=0.0, stats=None, quests=(), plugins=PLUGINS, cut=False):
    """quests: (plugin, form id without load-order byte, quest flags byte)."""
    w, h = 4, 2
    head = struct.pack('<I', 0x30) + b'|' + struct.pack('<I', w) + b'|' + struct.pack('<I', h) + b'|'
    head += struct.pack('<I', 7) + b'|' + field('Lone Wanderer') + field('Wanderer') + struct.pack('<I', level) + b'|'
    head += field('Megaton') + field('001.02.03')
    out = b'FO3SAVEGAME' + struct.pack('<I', len(head)) + head + bytes(w * h * 3)
    plist = bytes([len(plugins)]) + b'|' + b''.join(field(p) for p in plugins)
    out += bytes([21]) + struct.pack('<I', len(plist)) + plist
    values = [0] * 26
    for name, value in (stats or {}).items():
        values[STATS[name]] = value
    misc = struct.pack('<I', 26) + b'|' + b''.join(struct.pack('<I', v) + b'|' for v in values)
    global1 = struct.pack('<II', 0, len(misc)) + misc + struct.pack('<II', 1, 3) + b'ab|'
    form_ids, forms = [], b''
    for plugin, low, qflags in quests:
        form_ids.append((plugins.index(plugin) << 24) | low)
        forms += change_form(len(form_ids), 0xE0000002, 9, bytes([qflags]) + b'|' + b'\x00|')
    # The player reference: ref ID 0x400014 (a Fallout3.esm form), with a u16 length (type | 0x40).
    data = player(karma)
    forms += (0x400014).to_bytes(3, 'big') + struct.pack('<I', 0xB0400832) + bytes([1 | 0x40, 21]) + struct.pack('<H', len(data)) + data
    count = len(quests) + 1
    global2 = struct.pack('<II', 1000, 0)
    table_at = len(out)
    g1 = table_at + 4 * 8
    cf = g1 + len(global1)
    g2 = cf + len(forms)
    fid = g2 + len(global2)
    unk3 = fid + 4 + 4 * len(form_ids)
    out += struct.pack('<8I', fid, unk3, g1, cf, g2, 2, 1, count)
    out += global1 + forms + global2 + struct.pack('<I', len(form_ids)) + struct.pack('<%dI' % len(form_ids), *form_ids)
    return out[:-40] if cut else out


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

for broken in (b'not a save', save(cut=True), save()[:1000]):
    parsed = D[b'parse'](D[b'summarize'](broken))
    assert isinstance(parsed, tuple) and parsed[0] is None, broken[:20]
print('PASS files that are not Fallout 3 saves, or are cut short, are not read')
print('All Fallout 3 detector tests passed.')
