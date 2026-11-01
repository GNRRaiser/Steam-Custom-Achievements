"""Builds a synthetic Assassin's Creed .sav (no game data): the big-endian file size, 12 34 FE DC,
then story objective records (class 44 B5 74 18) laid out like the real PC save. The fields
before an objective's state vary in length, as in the real file, so records come in three
shapes; each ends with state, flag, 00, the big-endian ID and a reference list."""
import struct

CLASS = bytes.fromhex('44b57418')
# Bytes between the 2-byte kind and the state, by record shape (kind 6, and two kind 10 shapes).
SHAPES = {'step': (6, 3), 'mission': (10, 4), 'mission-long': (10, 5)}


def record(object_id, state=0, flag=0, shape='step', refs=(0x34979a81, 0x523ad0c1)):
    kind, gap = SHAPES[shape]
    body = CLASS + bytes(18) + struct.pack('>H', kind) + bytes(gap) + bytes([state, flag, 0])
    body += struct.pack('>II', object_id, len(refs))
    for ref in refs:
        body += bytes(4) + b'\x01' + struct.pack('>I', ref) + b'\xff\xff'
    return b'\x00\x00\x00\x19\x00\x00' + body


def save(objectives):
    """objectives: list of (id, state) or (id, state, shape)."""
    body = bytes(0x3c4)
    for entry in objectives:
        object_id, state = entry[:2]
        body += record(object_id, state, 1 if state == 3 else 0, entry[2] if len(entry) > 2 else 'step')
    body += bytes(64)
    return struct.pack('>I', len(body) + 8) + bytes.fromhex('1234fedc') + body


# The progress block's lists, in layout order: (key, position of the u32 count from the 04 FD bytes).
LISTS = [('templars', 212), ('kingdomFlags', 221), ('masyafFlags', 230), ('jerusalemFlags', 239),
         ('damascusFlags', 248), ('viewpoints', 307), ('list326', 326), ('list335', 335), ('list344', 344),
         ('acreTeutonicFlags', 515), ('acreTemplarFlags', 524), ('acreHospitalierFlags', 533), ('list644', 644)] + \
        [('district%d' % at, at) for at in range(658, 731, 9)] + [('kingdomViewpoints', 739)]


# The game's achievement record: each achievement's u32 state (1 locked, 2 unlocked), by index,
# at its place in the layout; the list achievements' states are their lists' states.
RECORD = [198, 203, 208, 217, 226, 235, 244, 253] + [258 + 5 * k for k in range(9)] + \
         [303, 312, 322, 331, 340, 349, 359, 373, 384, 395, 405, 410, 422, 432, 442, 452, 462, 471, 481, 491,
          501, 511, 520, 529, 538, 543, 548]


def progress(entries=None, unlocked=None, counters=None):
    """The progress block (863 fixed bytes plus list entries); entries: key -> list of indices.
    Each list is u32 state (1 started, 2 complete in the real saves), u32 count, entries.
    unlocked: achievement indices whose record says 2 (None leaves the record out, as zeros);
    counters: index -> running count, 5 bytes after that achievement's state."""
    entries = entries or {}
    body = bytearray(b'\x04\xfd' + bytes(861))
    if unlocked is not None:
        for index, at in enumerate(RECORD):
            body[at:at + 4] = struct.pack('>I', 2 if index in unlocked else 1)
        for index, value in (counters or {}).items():
            body[RECORD[index] + 5:RECORD[index] + 9] = struct.pack('>I', value)
    for key, at in reversed(LISTS):
        items = bytes(entries.get(key, ()))
        if unlocked is None:
            body[at - 4:at] = struct.pack('>I', 1)
        body[at:at + 4] = struct.pack('>I', len(items))
        body[at + 4:at + 4] = items
    return b'\x00\x00' + bytes(body)


def save_with_progress(objectives, entries=None, unlocked=None, counters=None):
    """A save whose progress block sits just before the objective records, as in the real file."""
    plain = save(objectives)
    block = progress(entries, unlocked, counters)
    body = plain[8:8 + 0x3c4] + block + plain[8 + 0x3c4:]
    return struct.pack('>I', len(body) + 8) + plain[4:8] + body
