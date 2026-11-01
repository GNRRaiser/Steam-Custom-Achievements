"""Builds a synthetic Mass Effect 2 Player1.prf (no game data): a 20-byte hash, the big-endian
uncompressed size and LZO1X data holding Unreal Engine 3 profile settings, laid out like the
real PC profile. The small LZO1X compressor below writes literal runs and M3 matches only."""
import hashlib
import struct


def lzo1x(data):
    out, i, start, first = bytearray(), 0, 0, True
    last_match = None  # position in out of the match's 16-bit distance, for 1-3 trailing literals

    def literals(run):
        nonlocal first, last_match
        if not run:
            return
        if first and len(run) <= 238:
            out.append(17 + len(run))
        elif len(run) <= 3:
            out[last_match] |= len(run)
        elif len(run) <= 18:
            out.append(len(run) - 3)
        else:
            extra = len(run) - 18
            out.append(0)
            while extra > 255:
                out.append(0)
                extra -= 255
            out.append(extra)
        out.extend(run)
        first, last_match = False, None

    while i < len(data):
        best, where = 0, 0
        for j in range(max(0, i - 16384), i):
            k = 0
            while i + k < len(data) and data[j + k] == data[i + k] and k < 264:
                k += 1
            if k > best:
                best, where = k, j
        if best >= 3 and i > 0 and not (first and i - start > 238):
            literals(data[start:i])
            length, dist = best, i - where
            if length - 2 <= 31:
                out.append(32 | (length - 2))
            else:
                out.append(32)
                extra = length - 2 - 31
                while extra > 255:
                    out.append(0)
                    extra -= 255
                out.append(extra)
            last_match = len(out)
            out.extend(struct.pack('<H', (dist - 1) << 2))
            first = False
            i += length
            start = i
        else:
            i += 1
    literals(data[start:])
    out.extend(b'\x11\x00\x00')
    return bytes(out)


def int_setting(sid, value):
    return struct.pack('>BIBi', 2, sid, 1, value) + b'\x00'


def profile(unlocked_ids=(), extra=None):
    """unlocked_ids: PC AchievementIDs (0-63) set in settings 0x32/0x33. extra: id -> int setting."""
    masks = [0, 0]
    for achievement in unlocked_ids:
        masks[achievement // 32] |= 1 << (achievement % 32)
    signed = [m - (1 << 32) if m >= 1 << 31 else m for m in masks]
    ints = {0x01: 3, 0x02: 0, 0x1a: 17, 0x24: 100, 0x25: 100, 0x26: 100, 0x29: -1, 0x2f: 1,
            0x32: signed[0], 0x33: signed[1], 0x38: 0, 0x47: 1, 0x48: 1}
    ints.update(extra or {})
    entries = [int_setting(sid, value) for sid, value in sorted(ints.items())]
    name = 'shepard_31_Soldier_261026'.encode('utf-16le')
    entries.append(struct.pack('>BIBi', 2, 0x2a, 4, len(name) // 2) + name + b'\x00')
    entries.append(struct.pack('>BIBi', 2, 0x36, 6, 6) + b'\x01\x02\x03\x01\x02\x03' + b'\x00')
    entries.append(struct.pack('>BIBf', 2, 0x37, 5, 2.2) + b'\x00')
    data = struct.pack('>I', len(entries)) + b''.join(entries)
    return hashlib.sha1(data).digest() + struct.pack('>I', len(data)) + lzo1x(data)
