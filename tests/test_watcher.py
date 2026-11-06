"""Execute backend/main.lua with a stand-in detector to check how often it touches the disk.
Optional developer dependency: pip install lupa. Only files in a temporary folder are used.

Checks: a save that has stopped changing is not read again every poll (only its size and write
time are looked at, plus a full read once a minute); any change to the save or to a file the
detector also reads is still picked up; folder scans parse only saves that changed; Steam's
library list is read again only when it changes; a file system error while searching for saves
does not stop tracking.
"""
import json
import os
from pathlib import Path
import tempfile
from lupa.luajit21 import LuaRuntime, lua_type

ROOT = Path(__file__).resolve().parent.parent
GAME = {'appId': 4242, 'title': 'Test Game', 'detector': 'me2', 'progressKey': 'testProgress',
        'pathKey': 'testPath', 'supported': [0, 1]}

FAKE_DETECTOR = r'''
local D = { maxBytes = 1048576 }
counts = { reads = 0, parses = 0, scans = 0, summaries = 0, locateErrors = 0 }
SAVE, EXTRA, FOLDER, FAIL_LOCATE = nil, nil, nil, false
function D.watch(ctx, path) return EXTRA and { EXTRA } or {} end
function D.read(ctx, path)
    counts.reads = counts.reads + 1
    local bytes = ctx.read_small(path, D.maxBytes)
    if bytes and EXTRA then bytes = bytes .. '|' .. (ctx.read_small(EXTRA, 4096) or '') end
    return bytes
end
function D.parse(bytes)
    counts.parses = counts.parses + 1
    return { size = #bytes, earned = bytes:find('WIN', 1, true) ~= nil }
end
function D.locate(ctx)
    if FAIL_LOCATE then counts.locateErrors = counts.locateErrors + 1; error('disk went away') end
    counts.scans = counts.scans + 1
    ctx.install_dirs()
    if FOLDER then
        for _, entry in ipairs(ctx.safe_list(FOLDER)) do
            ctx.cached(entry.path, function() counts.summaries = counts.summaries + 1; return { ok = true } end)
        end
        -- A file deleted between listing and checking answers nil instead of throwing.
        assert(ctx.fs.last_write_time(ctx.fs.join(FOLDER, 'gone.sav')) == nil)
        assert(ctx.fs.is_file(ctx.fs.join(FOLDER, 'gone.sav')) == false)
    end
    return SAVE, {}
end
function D.resolve(ctx, path) return path end
function D.evaluate(parsed) return parsed.earned and { 1 } or {} end
function D.counts() return {} end
function D.describe(parsed, name) return 'watching', 'Watching ' .. name, parsed.size .. ' bytes' end
return D
'''


def from_lua(value):
    if lua_type(value) != 'table':
        return value
    pairs = dict(value.items())
    if pairs and set(pairs) == set(range(1, len(pairs) + 1)):
        return [from_lua(pairs[i]) for i in range(1, len(pairs) + 1)]
    return {str(k): from_lua(v) for k, v in pairs.items()}


def to_lua(lua, value):
    if isinstance(value, dict):
        return lua.table_from({k: to_lua(lua, v) for k, v in value.items()})
    if isinstance(value, list):
        return lua.table_from([to_lua(lua, v) for v in value])
    return value


with tempfile.TemporaryDirectory() as temporary:
    base = Path(temporary)
    steam = base / 'Steam'
    (steam / 'steamapps').mkdir(parents=True)
    (steam / 'steamapps/appmanifest_4242.acf').write_text('"installdir" "testgame"')
    folder = base / 'saves'
    folder.mkdir()
    save = folder / 'slot1.sav'
    save.write_bytes(b'A' * 5000)
    other = folder / 'slot2.sav'
    other.write_bytes(b'B' * 3000)
    extra = folder / 'OPTIONS'
    extra.write_bytes(b'opt1')
    config = {}
    opened = []

    def join(*parts):
        return str(Path(parts[0]).joinpath(*(p.replace('\\', '/') for p in parts[1:])))

    def list_dir(path):
        directory = Path(path)
        return lua.table_from([lua.table_from({'path': str(item), 'name': item.name, 'is_file': item.is_file(),
            'is_directory': item.is_dir(), 'is_symlink': item.is_symlink(), 'size': item.stat().st_size})
            for item in (sorted(directory.iterdir()) if directory.is_dir() else [])])

    def strict(check):
        # Like Millennium's fs: asking about a file that is not there throws.
        def call(p):
            if not Path(p).exists():
                raise FileNotFoundError(p)
            return check(Path(p))
        return call

    lua = LuaRuntime(unpack_returned_tuples=True)
    lua.execute('package.path = ... .. ";" .. package.path', str(ROOT / 'backend/?.lua'))
    modules = {
        'millennium': lua.table_from({'ready': lambda: True, 'steam_path': lambda: str(steam),
            'config': lua.table_from({'get': lambda k: None, 'set': lambda k, v: config.__setitem__(k, from_lua(v)) or True})}),
        'fs': lua.table_from({'list': list_dir, 'join': join, 'filename': lambda p: Path(p).name,
            'is_file': strict(lambda p: p.is_file()), 'is_directory': lambda p: Path(p).is_dir(),
            'parent_path': lambda p: str(Path(p).parent), 'last_write_time': strict(lambda p: int(p.stat().st_mtime))}),
        'json': lua.table_from({'encode': lambda v: json.dumps(from_lua(v)), 'decode': lambda v: lua.table_from(json.loads(v))}),
    }
    for name, module in modules.items():
        lua.globals().package.loaded[name] = module
    lua.globals().package.loaded['games'] = to_lua(lua, [GAME])
    lua.globals().package.loaded['detector_me2'] = lua.execute(FAKE_DETECTOR)
    lua.globals().record_open = lambda path: opened.append(Path(path).name)
    lua.execute('''clock = 100; os.time = function() return clock end; os.getenv = function() return nil end
        local real_open = io.open
        io.open = function(path, mode) record_open(path); return real_open(path, mode) end''')
    lua.globals().SAVE = str(save)
    backend = lua.execute((ROOT / 'backend/main.lua').read_text())
    backend['on_load']()
    counts = lua.globals().counts

    def tick(seconds=1):
        lua.globals().clock += seconds
        return json.loads(lua.globals().GetTrackerState(json.dumps({'appId': 4242})))

    later = [int(save.stat().st_mtime)]

    def bump(path, data):
        # A new write: new bytes and a later write time (whole seconds, like the real fs).
        path.write_bytes(data)
        later[0] += 10
        os.utime(path, (later[0], later[0]))

    # 1. A settled save is no longer read every poll; it is read in full again once a minute.
    tick(); state = tick()
    assert state['status'] == 'watching', state
    assert counts.parses == 1
    for _ in range(5): state = tick()
    reads = counts.reads
    for _ in range(20): state = tick()
    assert counts.reads == reads, (reads, counts.reads)
    assert state['status'] == 'watching' and state['saveFileName'] == 'slot1.sav', state
    for _ in range(50): tick()
    assert counts.reads == reads + 1, (reads, counts.reads)
    assert counts.parses == 1
    print('PASS an unchanged save is not read again every poll (only its size and time), and is fully re-read once a minute')

    # 2. A change in size, or the same size with a later write time, is read, settled and parsed.
    reads = counts.reads
    bump(save, b'A' * 4000 + b'WIN' + b'A' * 997)
    state = tick()
    assert state['status'] == 'stabilizing' and counts.reads == reads + 1, state
    state = tick()
    assert state['status'] == 'watching' and '1' in state['progress'], state
    for _ in range(6): tick()
    reads = counts.reads
    bump(save, b'C' * 5000)
    assert tick()['status'] == 'stabilizing' and counts.reads == reads + 1
    assert tick()['details'] == '5000 bytes'
    print('PASS a save rewritten at the same size but a later time is still read, settled and parsed')

    # 3. A file the detector also reads (Brotherhood OPTIONS, Bully FileTableBully) counts too.
    lua.globals().EXTRA = str(extra)
    tick(); tick()
    for _ in range(6): tick()
    reads = counts.reads
    for _ in range(5): tick()
    assert counts.reads == reads
    bump(extra, b'opt2')
    assert tick()['status'] == 'stabilizing' and counts.reads == reads + 1
    extra.unlink()
    assert tick()['status'] == 'stabilizing'
    print('PASS a change to (or removal of) another file the detector reads is picked up')

    # 4. A search error keeps the save already watched.
    lua.globals().FAIL_LOCATE = True
    for _ in range(25): state = tick()
    assert counts.locateErrors >= 2, counts.locateErrors
    assert state['saveFileName'] == 'slot1.sav' and state['status'] == 'watching', state
    lua.globals().FAIL_LOCATE = False
    print('PASS an error while searching for saves keeps the watched save and tracking goes on')

    # 5. Folder scans summarise each save once while it is unchanged.
    lua.globals().FOLDER = str(folder)
    for _ in range(12): tick(5)
    first = counts.summaries
    scans = counts.scans
    for _ in range(12): tick(5)
    assert counts.scans > scans
    assert counts.summaries == first, (first, counts.summaries)
    bump(other, b'B' * 3001)
    for _ in range(12): tick(5)
    assert counts.summaries > first
    print('PASS folder scans parse a save again only after it changes')

    # 6. Steam's library list and app manifest are read again only when the list changes
    # (or once a minute), not on every search.
    opened.clear()
    (steam / 'steamapps/libraryfolders.vdf').write_text('"libraryfolders" { }')
    for _ in range(3): tick(5)
    assert opened.count('appmanifest_4242.acf') == 1, opened.count('appmanifest_4242.acf')
    scans = counts.scans
    for _ in range(9): tick(5)
    assert counts.scans >= scans + 3
    assert opened.count('appmanifest_4242.acf') == 1, opened.count('appmanifest_4242.acf')
    for _ in range(4): tick(5)
    assert opened.count('appmanifest_4242.acf') == 2, opened.count('appmanifest_4242.acf')
    print('PASS Steam library folders and app manifests are re-read only when the library list changes')

print('All watcher tests passed.')
