"""Synthetic Fable III hero saves in the layout of real PC saves (shared by the tests).
64 KiB chunks of one sync-flushed zlib stream, each with a [compressed][uncompressed]
big-endian header, then an 8-byte trailer; NonLeaderboardStats pairs keyed by FNV-1.
"""
import random
import struct
import zlib


def fnv1(name):
    value = 0x811c9dc5
    for byte in name.encode():
        value = (value * 0x01000193) % 2 ** 32 ^ byte
    return value


def herosave(stats, padding=150000):
    """A hero save whose stats list starts with an unrelated stat, as real saves do."""
    items = [(0x58600701, 0)] + [(fnv1(name), value) for name, value in stats.items()]
    body = bytearray(b'\x00\x01\x00\x00\x00\x0cHeroSaveData\x00')
    body += random.Random(7).randbytes(padding // 2).hex().encode()[:padding]        # filler so the stream spans chunks
    body += b'\x00\x01r\x00\x00\x00\x14NonLeaderboardStats\x00'
    first, rest = items[0], items[1:]
    body += b'\x00\x01s\x00\x00\x00\x0dStatNameHash\x00\x02\x02' + struct.pack('>I', first[0])
    body += b'\x01\x00\x01t\x00\x00\x00\x0aStatValue\x00\x02\x03' + struct.pack('>i', first[1])
    for hash_, value in rest:
        body += b'\x01\x01\x00\x01r\x00\x01s\x02\x02' + struct.pack('>I', hash_)
        body += b'\x01\x00\x01t\x02\x03' + struct.pack('>i', value)
    body += b'\x01\x01\x00\x00'
    compressor, out = zlib.compressobj(), bytearray()
    for start in range(0, len(body), 65536):
        piece = body[start:start + 65536]
        data = compressor.compress(piece) + compressor.flush(zlib.Z_SYNC_FLUSH)
        out += struct.pack('>II', len(data), len(piece)) + data
    assert len(body) % 65536
    return bytes(out + b'\x00' * 8)


MAXED = {'STAT_NUM_COLLECTED_GNOMES': 50, 'STAT_NUM_COLLECTED_FLOWERS': 30, 'STAT_NUM_COLLECTED_KEYS': 54,
         'STAT_NUM_COLLECTED_BOOKS': 14, 'STAT_DIGGING_SPOTS_FOUND': 268, 'STAT_KILLS_MELEE': 1890,
         'STAT_KILLS_RANGED': 1692, 'STAT_KILLS_SPELLS': 1434, 'STAT_NUMBER_OF_FRIENDS': 29}
