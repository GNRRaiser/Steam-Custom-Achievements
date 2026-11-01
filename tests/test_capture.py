"""Capture while I play: changed saves are copied with a timestamp and logged, without any
button presses. Runs main.lua from a copy of the plugin folder, the way Millennium loads it.
Optional developer dependency: pip install lupa.
"""
import hashlib
import json
from pathlib import Path
import random
import shutil
import struct
import tempfile
from lupa.luajit21 import LuaRuntime, lua_type
from fable_fixture import herosave
import acb_fixture
import me1_fixture
import me2_fixture
import ac1_fixture

ROOT = Path(__file__).resolve().parent.parent


def from_lua(value):
    if lua_type(value) != 'table':
        return value
    pairs = dict(value.items())
    if pairs and set(pairs) == set(range(1, len(pairs) + 1)):
        return [from_lua(pairs[i]) for i in range(1, len(pairs) + 1)]
    return {str(k): from_lua(v) for k, v in pairs.items()}


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    plugin = base / 'plugins/steam-custom-achievements'
    shutil.copytree(ROOT / 'backend', plugin / 'backend')
    recordings = plugin / 'recordings'
    (recordings / 'fable3').mkdir(parents=True)
    steam = base / 'Steam'
    (steam / 'steamapps').mkdir(parents=True)
    fable = base / 'User/Saved Games/Lionhead Studios/Fable 3/1122334400000000'
    fable.mkdir(parents=True)
    hero = fable / 'hero1autosave_herosave.bin'
    hero.write_bytes(herosave({'STAT_NUM_COLLECTED_GNOMES': 49, 'STAT_KILLS_MELEE': 120}))
    (fable / 'chaptersave.bin').write_text('<chapter>3</chapter>')
    thrill = base / 'Documents/Thrillville'
    thrill.mkdir(parents=True)
    park = bytearray(random.Random(3).randbytes(512))
    (thrill / 'park1.sav').write_bytes(park)
    settings = {}
    env = {'USERPROFILE': str(base / 'User'), 'TEMP': str(base)}

    def start_backend():
        lua = LuaRuntime(unpack_returned_tuples=True)
        lua.execute('package.path = ... .. ";" .. package.path', str(plugin / 'backend/?.lua'))

        def join(*parts):
            return str(Path(parts[0]).joinpath(*(p.replace('\\', '/') for p in parts[1:])))

        def list_dir(path):
            directory = Path(path)
            entries = []
            for item in sorted(directory.iterdir()) if directory.is_dir() else []:
                entries.append(lua.table_from({'path': str(item), 'name': item.name,
                    'is_file': item.is_file(), 'is_directory': item.is_dir(),
                    'is_symlink': item.is_symlink(), 'size': item.stat().st_size}))
            return lua.table_from(entries)

        def get_config(key):
            value = settings.get(key)
            return lua.table_from(value) if isinstance(value, dict) else value

        def set_config(key, value):
            settings[key] = from_lua(value)
            return True

        modules = {
            'millennium': lua.table_from({'ready': lambda: True, 'steam_path': lambda: str(steam),
                'config': lua.table_from({'get': get_config, 'set': set_config})}),
            'fs': lua.table_from({'list': list_dir, 'join': join, 'filename': lambda p: Path(p).name,
                'is_file': lambda p: Path(p).is_file(), 'is_directory': lambda p: Path(p).is_dir(),
                'parent_path': lambda p: str(Path(p).parent), 'last_write_time': lambda p: Path(p).stat().st_mtime_ns}),
            'json': lua.table_from({'encode': lambda v: json.dumps(from_lua(v)), 'decode': lambda v: lua.table_from(json.loads(v))}),
        }
        for name, module in modules.items():
            lua.globals().package.loaded[name] = module
        lua.execute('clock=1000; os.time=function() return clock end')
        lua.globals().os.getenv = lambda name: env.get(name)
        # Every pack now has a detector; Thrillville is turned back into a manual game here so the
        # manual-game paths (pasted folders, the pack's save reader) stay covered.
        lua.execute("local games = require('games'); for _, g in ipairs(games) do if g.appId == 6080 then g.detector, g.rules = nil, nil end end")
        lua.eval('dofile')(str(plugin / 'backend/main.lua'))['on_load']()
        return lua

    lua = start_backend()

    def call(method, app_id, **extra):
        return json.loads(lua.globals()[method](lua.table_from({'payload': json.dumps({'appId': app_id, **extra})})))

    def tick(app_id):
        lua.globals().clock += 6
        return call('GetTrackerState', app_id)

    def captured(folder):
        return sorted(p.name for p in folder.iterdir() if p.name != 'README.txt')

    game_hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in fable.iterdir()}
    state = call('SetCapture', 105400, enabled=True)
    assert state['capture']['enabled'] and state['capture']['folderName'] == '1122334400000000', state['capture']
    assert settings['capture_105400_v1'] == {'enabled': True, 'folder': ''}
    tick(105400)                                   # starting point, nothing copied
    assert captured(recordings / 'fable3') == []
    hero.write_bytes(herosave({'STAT_NUM_COLLECTED_GNOMES': 50, 'STAT_KILLS_MELEE': 121}))
    tick(105400)                                   # change seen once: wait until it is stable
    assert captured(recordings / 'fable3') == []
    state = tick(105400)
    files = captured(recordings / 'fable3')
    assert len(files) == 3 and files[2] == 'capture log.txt', files
    assert files[0].endswith(' before hero1autosave_herosave.bin') and files[1].endswith(' hero1autosave_herosave.bin'), files
    log = (recordings / 'fable3/capture log.txt').read_text()
    assert 'STAT_NUM_COLLECTED_GNOMES 49 -> 50' in log and 'STAT_KILLS_MELEE 120 -> 121' in log, log
    assert '[0 automatic unlocks' in log or 'automatic unlocks' in log
    assert state['capture']['events'] == 1 and any('GNOMES 49 -> 50' in line for line in state['capture']['recent'])
    print('PASS a hero save written during play is copied (before and after) and its stat changes are logged')

    hero.write_bytes(herosave({'STAT_NUM_COLLECTED_GNOMES': 50, 'STAT_KILLS_MELEE': 125}))
    tick(105400)
    hero.write_bytes(herosave({'STAT_NUM_COLLECTED_GNOMES': 50, 'STAT_KILLS_MELEE': 130}))
    tick(105400)                                   # still being written: nothing yet
    assert len(captured(recordings / 'fable3')) == 3
    tick(105400)
    files = captured(recordings / 'fable3')
    assert len(files) == 4 and not any('before' in f for f in files[2:]), files
    assert 'STAT_KILLS_MELEE 121 -> 130' in (recordings / 'fable3/capture log.txt').read_text()
    assert {p.name for p in fable.iterdir()} == set(game_hashes)
    print('PASS later saves add one copy each, only after the file stops changing; game folder untouched')

    # A game without automatic tracking needs its folder; copies go to recordings\\ with a prefix.
    try:
        call('SetCapture', 6080, enabled=True)
        raise AssertionError('Manual games need a folder')
    except Exception as error:
        assert 'Paste the folder' in str(error), error
    state = call('SetCapture', 6080, enabled=True, folder=str(thrill))
    assert state['status'] == 'manual' and state['capture']['enabled']
    tick(6080)
    struct.pack_into('<I', park, 0x40, 20)
    (thrill / 'park1.sav').write_bytes(park)
    tick(6080)
    tick(6080)
    names = sorted(p.name for p in recordings.iterdir() if p.is_file())
    assert any(n.startswith('thrillville-otr capture ') and n.endswith(' park1.sav') for n in names), names
    assert 'thrillville-otr capture capture log.txt' in names
    print('PASS Thrillville capture works from a pasted folder and falls back to prefixed files')

    # Mass Effect 2's profile (BIOGame\\Profile\\Player1.prf) is logged as its numbered settings.
    me2 = base / 'User/Documents/BioWare/Mass Effect 2/BIOGame/Profile'
    me2.mkdir(parents=True)
    (me2 / 'Player1.prf').write_bytes(me2_fixture.profile({1}))
    (recordings / 'me2').mkdir()
    state = call('SetCapture', 24980, enabled=True)
    assert state['capture']['folderName'] == 'Profile', state
    tick(24980)
    (me2 / 'Player1.prf').write_bytes(me2_fixture.profile({1, 48}, {0x38: 8}))
    tick(24980)
    tick(24980)
    log = (recordings / 'me2/capture log.txt').read_text()
    assert 'setting 0x33 0 -> 65536' in log and 'setting 0x38 0 -> 8' in log and 'automatic unlocks' in log, log
    call('SetCapture', 24980, enabled=False)
    print('PASS Mass Effect 2 profile changes are logged as numbered settings')

    # Assassin's Creed's save (%APPDATA%\\Ubisoft\\Assassin's Creed\\Saved Games) is logged as
    # story objectives named from the game's objective list.
    env['APPDATA'] = str(base / 'Roaming')
    ac1 = base / "Roaming/Ubisoft/Assassin's Creed/Saved Games"
    ac1.mkdir(parents=True)
    (ac1 / '1793038632.sav').write_bytes(ac1_fixture.save([(0x13103edd, 3), (0x8ce6633c, 1)]))
    (recordings / 'ac1').mkdir(exist_ok=True)
    state = call('SetCapture', 15100, enabled=True)
    assert state['capture']['folderName'] == 'Saved Games', state['capture']
    tick(15100)
    (ac1 / '1793038632.sav').write_bytes(ac1_fixture.save([(0x13103edd, 3), (0x8ce6633c, 3)]))
    tick(15100)
    tick(15100)
    log = (recordings / 'ac1/capture log.txt').read_text()
    assert 'objective FreeMission_FM11 (8CE6633C) 1 -> 3' in log and 'automatic unlocks' in log, log
    assert 'M03_S20' not in log
    call('SetCapture', 15100, enabled=False)
    print("PASS Assassin's Creed save changes are logged as named story objectives")

    # Mass Effect's profile is logged as named achievement slots and counters.
    me1 = base / 'User/Documents/BioWare/Mass Effect/Save'
    me1.mkdir(parents=True)
    (me1 / 'Profile.MassEffectProfile').write_bytes(me1_fixture.profile(values={'PistolKills': 3}))
    (recordings / 'me1').mkdir()
    state = call('SetCapture', 17460, enabled=True)
    assert state['capture']['folderName'] == 'Save', state
    tick(17460)
    (me1 / 'Profile.MassEffectProfile').write_bytes(me1_fixture.profile({3}, {'PistolKills': 20}))
    tick(17460)
    tick(17460)
    log = (recordings / 'me1/capture log.txt').read_text()
    assert 'PistolKills 3 -> 20' in log and 'achievement slot 3 0 -> 1' in log and 'automatic unlocks' in log, log
    call('SetCapture', 17460, enabled=False)
    print('PASS Mass Effect profile changes are logged as achievement slots and counters')

    # Brotherhood: the Steam save in Saved Games\\Assassin's Creed Brotherhood\\SAVES is read as
    # mission records named from the game's mission list, found without a pasted path.
    acb = base / "User/Saved Games/Assassin's Creed Brotherhood/SAVES"
    acb.mkdir(parents=True)
    (acb / 'OPTIONS').write_bytes(acb_fixture.steam_save({}))
    sq1, sq2, outro = 0x479FEEB1, 0x8A79EC38, 0x2EFFE834
    (acb / 'ACBROTHERHOODSAVEGAME0.SAV').write_bytes(acb_fixture.steam_save({sq1: True, sq2: False, outro: False}))
    (recordings / 'acb').mkdir()
    state = call('SetCapture', 48190, enabled=True)
    assert state['capture']['folderName'] == 'SAVES', state['capture']
    tick(48190)
    (acb / 'ACBROTHERHOODSAVEGAME0.SAV').write_bytes(acb_fixture.steam_save({sq1: True, sq2: True, outro: False}))
    tick(48190)
    tick(48190)
    log = (recordings / 'acb/capture log.txt').read_text()
    assert 'mission SQ01M02 0 -> 1' in log and 'missions completed 1 -> 2' in log, log
    assert 'SQ01M99_Outro' not in log
    call('SetCapture', 48190, enabled=False)
    started = call('StartRecording', 48190, index=1, name='Battle Wounds', detail='Complete DNA Sequence 1.', folder='')
    assert started['folderName'] == 'SAVES', started
    (acb / 'ACBROTHERHOODSAVEGAME0.SAV').write_bytes(acb_fixture.steam_save({sq1: True, sq2: True, outro: True}))
    report = call('FinishRecording', 48190)
    [save] = report['files']
    assert save['kind'] == 'Brotherhood missions', save
    assert any(f['where'] == 'missions completed' and (f['old'], f['new']) == (2, 3) for f in save['findings']), save['findings']
    assert any(f['where'] == 'mission SQ01M99_Outro' and (f['old'], f['new']) == (0, 1) for f in save['findings']), save['findings']
    print('PASS Brotherhood: the Saved Games folder is found on its own; saves are decompressed into named missions')

    # Settings survive a Steam restart.
    lua = start_backend()
    state = tick(6080)
    assert state['capture']['enabled'] and state['capture']['folderName'] == 'Thrillville', state
    assert state['capture']['megabytes'] >= 0
    print('PASS capture stays on after Steam restarts')

    # The size limit turns capture off instead of filling the drive.
    lua.eval('require("capture")').MAX_BYTES = 10
    tick(6080)
    struct.pack_into('<I', park, 0x40, 21)
    (thrill / 'park1.sav').write_bytes(park)
    tick(6080)
    state = tick(6080)
    assert state['capture']['enabled'] is False and '1 GB' in state['capture']['problem'], state['capture']
    assert settings['capture_6080_v1'] == {'enabled': False}
    state = call('SetCapture', 105400, enabled=False)
    assert 'capture' not in state and settings['capture_105400_v1'] == {'enabled': False}
    print('PASS the size limit stops capture and remembers it; turning capture off clears it')

    # Thrillville: the save folder under AppData\\Local is found without pasting it, and a park
    # save is logged as mission states (record layout copied from a real .ThrillvilleSaveGame).
    def park_save(states):
        body = b''
        for name, state in states.items():
            raw = name.encode()
            body += b'\xfc' + raw[:-1] + bytes([raw[-1] | 0x80]) + b'\x80\x17\x49\x4e' + bytes(state)
        return b'RGMH' + bytes(64) + b'MSSN' + body + b'\xfc' + b'P1MOLL' + bytes([ord('Y') | 0x80]) + bytes(24)
    local = base / 'Local/LucasArts/Thrillville 07/Save'
    local.mkdir(parents=True)
    slot = local / '0000000002-2048854891.ThrillvilleSaveGame'
    slot.write_bytes(park_save({'P1_P_Tank': [3, 0, 0, 0, 0], 'P1_G_Bandito': [3, 0, 0, 0, 0]}))
    env['LOCALAPPDATA'] = str(base / 'Local')
    (recordings / 'thrillville-otr').mkdir()
    lua = start_backend()
    state = call('SetCapture', 6080, enabled=True)
    assert state['capture']['enabled'] and state['capture']['folderName'] == 'Save', state
    tick(6080)
    slot.write_bytes(park_save({'P1_P_Tank': [4, 3, 0, 0, 3], 'P1_G_Bandito': [3, 2, 0, 0, 2]}))
    tick(6080)
    tick(6080)
    log = (recordings / 'thrillville-otr/capture log.txt').read_text()
    assert 'mission P1_P_Tank 03 00 00 00 00 -> 04 03 00 00 03' in log, log
    assert 'mission P1_G_Bandito 03 00 00 00 00 -> 03 02 00 00 02' in log and 'P1MOLLY' not in log, log
    print('PASS Thrillville capture finds AppData\\Local\\LucasArts\\Thrillville 07\\Save and logs park missions by name')

print('All capture tests passed.')
