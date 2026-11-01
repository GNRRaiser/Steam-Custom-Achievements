"""Builds a synthetic Mass Effect Profile.MassEffectProfile (no game data): an Unreal Engine 3
package with one BioGamerProfile export, laid out like the real PC profile (version 491)."""
import struct

STATS = [('PistolKills', 9, 150), ('ShotgunKills', 10, 150), ('AssaultRifleKills', 11, 150), ('SniperRifleKills', 12, 150),
         ('LiftUses', 13, 75), ('ThrowUses', 14, 75), ('WarpUses', 15, 75), ('SpacialUses', 16, 75), ('ShieldUses', 17, 75),
         ('StasisUses', 18, 75), ('ElectronicsUses', 19, 75), ('DecryptionUses', 20, 75), ('EMPUses', 21, 75),
         ('SabotageUses', 22, 75), ('HealingUses', 23, 150), ('NeuralShockUses', 24, 75), ('Money', 30, 1000000),
         ('OrganicKills', 31, 150), ('MachineKills', 32, 250), ('Level50', 39, 50), ('Level60', 40, 60)]
NAMES = ['None', 'ArrayProperty', 'IntProperty', 'StrProperty', 'BoolProperty', 'anAchievementStates', 'RewardStats',
         'sName', 'Value', 'UnlockedAt', 'AchievementId', 'IsAchievementUnlocked', 'TalenTreeID', 'm_nLastUsedPlaythroughID',
         'BioGamerProfile', 'Profile', 'Class', 'Core']


def profile(unlocked_ids=(), values=None, flagged=(), slot_base=0):
    """unlocked_ids: achievement IDs (1-50) set in anAchievementStates. values: stat -> Value.
    flagged: stat names with IsAchievementUnlocked set. slot_base 1 shifts the array by one."""
    values = values or {}
    n = {name: i for i, name in enumerate(NAMES)}
    name = lambda s: struct.pack('<ii', n[s], 0)

    def prop(pname, ptype, body):
        return name(pname) + name(ptype) + struct.pack('<ii', len(body), 0) + body

    def fstring(s):
        raw = s.encode() + b'\0'
        return struct.pack('<i', len(raw)) + raw

    states = [0] * 50
    for i in unlocked_ids:
        states[i - 1 + slot_base] = 1
    body = prop('m_nLastUsedPlaythroughID', 'IntProperty', struct.pack('<i', 1))
    body += prop('anAchievementStates', 'ArrayProperty', struct.pack('<i', 50) + struct.pack('<50i', *states))
    items = b''
    for sname, aid, need in STATS:
        items += (prop('sName', 'StrProperty', fstring(sname)) + prop('Value', 'IntProperty', struct.pack('<i', values.get(sname, 0)))
                  + prop('UnlockedAt', 'IntProperty', struct.pack('<i', need)) + prop('AchievementId', 'IntProperty', struct.pack('<i', aid))
                  + name('IsAchievementUnlocked') + name('BoolProperty') + struct.pack('<ii', 0, 0) + struct.pack('<i', 1 if sname in flagged else 0)
                  + prop('TalenTreeID', 'IntProperty', struct.pack('<i', 0)) + name('None'))
    body += prop('RewardStats', 'ArrayProperty', struct.pack('<i', len(STATS)) + items)
    obj = struct.pack('<i', 0) + body + name('None')
    table = b''.join(fstring(s) + struct.pack('<Q', 0) for s in NAMES)
    folder = fstring('None')
    head_len = 4 + 4 + 4 + len(folder) + 4 + 24
    name_off = head_len
    export_off = name_off + len(table)
    export = struct.pack('<iiiii', -1, 0, 0, n['Profile'], 0) + struct.pack('<iQ', 0, 0)
    obj_off = export_off + len(export) + 8 + 32
    export += struct.pack('<ii', len(obj), obj_off) + bytes(32)
    header = struct.pack('<IHHI', 0x9E2A83C1, 491, 1008, obj_off) + folder + struct.pack('<I', 0x40000001)
    header += struct.pack('<6i', len(NAMES), name_off, 1, export_off, 0, 0)
    data = header + table + export
    data += bytes(obj_off - len(data))
    # The export's object name must be BioGamerProfile for the detector.
    data = bytearray(data + obj)
    struct.pack_into('<i', data, export_off + 12, n['BioGamerProfile'])
    return bytes(data)
