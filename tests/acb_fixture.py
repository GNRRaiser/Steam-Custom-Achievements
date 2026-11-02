"""Builds a synthetic Assassin's Creed Brotherhood save (no game data): AC2-style header,
Anvil compressed blocks (LZO2A chunks) and the data XORed with a short repeating key."""
import struct

MAGIC = bytes.fromhex('33aafb5799fa0410')
MISSION = bytes([17, 0, 0, 0, 160, 203, 218, 95, 160, 203, 218, 95])


def lzo2a(data):
    """Valid LZO2A stream: runs of zeros as back references, everything else as literals."""
    out, nbits = bytearray(), 0
    flag_at = None

    def bit(value):
        nonlocal nbits, flag_at
        if nbits == 0:
            flag_at = len(out); out.append(0)
        out[flag_at] |= value << nbits
        nbits = (nbits + 1) % 8

    i = 0
    while i < len(data):
        run = 0
        while i > 0 and i + run < len(data) and data[i + run] == 0 and data[i - 1] == 0 and run < 7 + 2:
            run += 1
        if run >= 3:
            bit(1); bit(1)                       # long match, length 3..9, distance 1
            out += bytes([((run - 2) << 5) | 1, 0])
            i += run
        else:
            bit(0); out.append(data[i]); i += 1
    return bytes(out)


def block(data, maxchunk=0x8000):
    body = MAGIC + struct.pack('<HBI', 1, 2, maxchunk)
    for at in range(0, len(data) + 1, maxchunk):
        chunk = data[at:at + maxchunk]
        if not chunk and at:
            break
        packed = lzo2a(chunk)
        body += struct.pack('<BIII', 1, len(packed), len(chunk), 0) + packed
        if len(chunk) < maxchunk:
            break
    return body


def mission(mission_id, done):
    record = bytearray(0x3A)
    struct.pack_into('<II', record, 0, 0x32, 0x2A)
    record[8:20] = MISSION
    record[0x18] = 0x0B
    struct.pack_into('<I', record, 0x19, mission_id)
    record[0x2D] = 0x0B
    struct.pack_into('<I', record, 0x2E, 100 if done else 40)
    return bytes(record)


def save(missions, key=b'testkey', slot=1):
    header = bytearray(548)
    struct.pack_into('<I', header, 0, 548)
    header[8:40] = b'0' * 32
    header[40:] = (f'AC2[{slot}]-tm_2026_10_26'.encode('utf-16-le') + bytes(508))[:508]
    first = struct.pack('<II', 0x16, 0x00FEDBAC) + bytes(8)
    plain = bytearray(bytes(4) + first + block(b'\x00' * 40 + b'Desmond \x00' + bytes(20)))
    plain += bytes(16) + block(b''.join(mission(i, d) for i, d in missions.items()) + bytes(300))
    for i in range(4, len(plain)):
        plain[i] ^= key[(i - 4) % len(key)]
    return bytes(header) + bytes(plain)


def steam_save(missions):
    """The Steam version's plain ACBROTHERHOODSAVEGAME<n>.SAV: the same blocks, no wrapper or key."""
    first = struct.pack('<II', 0x16, 0x00FEDBAC) + struct.pack('<II', 0xCF, 0x11B)
    plain = first + block(b'\x00' * 40 + b'Desmond \x00' + bytes(20))
    return plain + block(b''.join(mission(i, d) for i, d in missions.items()) + bytes(300))


def options(bits, prop=0x496F8780):
    """OPTIONS with the game's achievement record: a u64 property, bit N = achievement N."""
    value = sum(1 << b for b in bits)
    record = struct.pack('<II', 21, prop) + bytes(4) + bytes([0, 0, 9, 0, 0x0B]) + struct.pack('<Q', value)
    first = struct.pack('<II', 0x16, 0x00FEDBAC) + struct.pack('<II', 0xC4, 0x11B)
    return first + block(b'\x00' * 40 + b'Options\x00' + bytes(20)) + block(bytes(60) + record + bytes(40))
