"""Synthetic Fallout 3 .fos saves for the tests (no game data). The layout follows
detector_fallout3.lua: header, screenshot, plugin list, file location table, global data
(type 0 = misc stats, type 3 = globals), change forms (type 9 quests, the player reference
0x14) and the form ID array."""
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = json.loads((ROOT / 'source/games/fallout3/game.json').read_text())
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


def save(level=1, karma=0.0, stats=None, quests=(), plugins=PLUGINS, cut=False, globals_=None, qvars=None, name='Lone Wanderer'):
    """quests: (plugin, form id without load-order byte, quest flags byte); globals_: {(plugin, id): value};
    qvars: {(plugin, quest id): {variable index: value}} stored as script-only quest change forms."""
    w, h = 4, 2
    head = struct.pack('<I', 0x30) + b'|' + struct.pack('<I', w) + b'|' + struct.pack('<I', h) + b'|'
    head += struct.pack('<I', 7) + b'|' + field(name) + field('Wanderer') + struct.pack('<I', level) + b'|'
    head += field('Megaton') + field('001.02.03')
    out = b'FO3SAVEGAME' + struct.pack('<I', len(head)) + head + bytes(w * h * 3)
    plist = bytes([len(plugins)]) + b'|' + b''.join(field(p) for p in plugins)
    out += bytes([21]) + struct.pack('<I', len(plist)) + plist
    values = [0] * 26
    for stat, value in (stats or {}).items():
        values[STATS[stat]] = value
    misc = struct.pack('<I', 26) + b'|' + b''.join(struct.pack('<I', v) + b'|' for v in values)
    form_ids, forms = [], b''
    gv = b''
    for (plugin, low), value in (globals_ or {}).items():
        form_ids.append((plugins.index(plugin) << 24) | low)
        gv += len(form_ids).to_bytes(3, 'big') + b'|' + struct.pack('<f', value) + b'|'
    gv = struct.pack('<H', (len(globals_ or {}) << 2) | 1) + b'|' + gv
    global1 = struct.pack('<II', 0, len(misc)) + misc + struct.pack('<II', 3, len(gv)) + gv
    for (plugin, low), values in (qvars or {}).items():
        form_ids.append((plugins.index(plugin) << 24) | low)
        body = bytes([len(values) << 2]) + b'|' + b''.join(struct.pack('<I', i) + b'|' + struct.pack('<d', v) + b'|' for i, v in values.items()) + b'\x00|\x00|'
        forms += change_form(len(form_ids), 0x40000000, 9, body)
    for plugin, low, qflags in quests:
        form_ids.append((plugins.index(plugin) << 24) | low)
        forms += change_form(len(form_ids), 0xE0000002, 9, bytes([qflags]) + b'|' + b'\x00|')
    # The player reference: ref ID 0x400014 (a Fallout3.esm form), with a u16 length (type | 0x40).
    data = player(karma)
    forms += (0x400014).to_bytes(3, 'big') + struct.pack('<I', 0xB0400832) + bytes([1 | 0x40, 21]) + struct.pack('<H', len(data)) + data
    count = len(quests) + len(qvars or {}) + 1
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
