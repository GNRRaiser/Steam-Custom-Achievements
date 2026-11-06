-- Fable III detector: reads the hero's lifetime statistics from <hero>_herosave.bin, read-only.
-- File layout (checked on 70+ PC saves): chunks of [u32 BE compressed][u32 BE uncompressed][data],
-- one sync-flushed zlib stream across the chunks, each chunk 64 KiB uncompressed except the last,
-- then an 8-byte trailer. The decompressed save is a tree of named fields; the list
-- NonLeaderboardStats holds pairs of StatNameHash (u32 BE) and StatValue (i32 BE). A stat's hash
-- is the 32-bit FNV-1 of its upper-case name, e.g. STAT_NUM_COLLECTED_GNOMES; build.py hashes
-- the names from the game pack.
--
-- When the game runs through XLiveEmu (an emulator for Games for Windows Live), the game's own
-- achievement record is <game folder>\XLiveEmu\<player>\Achievements\Achievements.txt: one
-- unlocked achievement ID per line. The IDs are the game's (the XACH table in Fable3.exe, e.g.
-- The Guild Seal = 69); build.py maps them to the pack's list (game.xlive, index -> ID).
local inflate = require('inflate')
local D = { maxBytes = 16777216 }
local RECORD = 'SCA\0'

local function be32(data, pos)
    local a, b, c, d = data:byte(pos, pos + 3)
    if not d then return nil end
    return ((a * 256 + b) * 256 + c) * 256 + d
end

local function unpack_chunks(bytes)
    local parts, pos = {}, 1
    while pos + 7 <= #bytes do
        local compressed, size = be32(bytes, pos), be32(bytes, pos + 4)
        if compressed == 0 or pos + 7 + compressed > #bytes or size > 65536 then break end
        parts[#parts + 1] = bytes:sub(pos + 8, pos + 7 + compressed)
        pos = pos + 8 + compressed
        if size < 65536 then return table.concat(parts) end
    end
    return nil
end

local function read_stats(data)
    local start = data:find('NonLeaderboardStats', 1, true)
    if not start then return nil end
    local h = data:find('\0\0\0\13StatNameHash\0', start, true)
    local v = data:find('\0\0\0\10StatValue\0', start, true)
    if not h or not v or h < 3 or v < 3 then return nil end
    local hid, vid = data:sub(h - 2, h - 1), data:sub(v - 2, v - 1)
    local stats, count = {}, 0
    local function take(hashAt, valueAt)
        local hash, value = be32(data, hashAt), be32(data, valueAt)
        if not hash or not value then return end
        if value >= 2147483648 then value = value - 4294967296 end
        if stats[hash] == nil then count = count + 1 end
        stats[hash] = value
    end
    -- The first pair carries the field-name definitions inline.
    local first = h + 4 + 13
    if data:sub(first, first + 1) == '\2\2' and data:sub(first + 6, first + 9) == '\1\0' .. vid
        and data:sub(first + 10, first + 23) == '\0\0\0\10StatValue\0' and data:sub(first + 24, first + 25) == '\2\3' then
        take(first + 2, first + 26)
    end
    local marker = hid .. '\2\2'
    local tail = '\1\0' .. vid .. '\2\3'
    local pos = h
    while true do
        local at = data:find(marker, pos, true)
        if not at then break end
        pos = at + 1
        if data:sub(at + 8, at + 13) == tail then take(at + 4, at + 14) end
    end
    return stats, count
end

-- The IDs in XLiveEmu's record, or nil when the text is not a list of numbers.
local function recorded_ids(text)
    if not text or text:find('[^%d%s]') then return nil end
    local ids, count = {}, 0
    for n in text:gmatch('%d+') do
        local id = tonumber(n)
        if id and not ids[id] then ids[id], count = true, count + 1 end
    end
    return ids, count
end

local function record_paths(ctx)
    local paths = {}
    for _, install in ipairs(ctx.install_dirs and ctx.install_dirs() or {}) do
        for _, entry in ipairs(ctx.safe_list(ctx.fs.join(install, 'XLiveEmu'))) do
            if entry.is_directory and not entry.is_symlink then
                paths[#paths + 1] = ctx.fs.join(entry.path, 'Achievements', 'Achievements.txt')
            end
        end
    end
    return paths
end

local function emulator_records(ctx)
    local texts = {}
    for _, path in ipairs(record_paths(ctx)) do
        local text = ctx.read_small(path, 65536)
        if text and recorded_ids(text) then texts[#texts + 1] = text end
    end
    return #texts > 0 and table.concat(texts, '\n') or nil
end

-- Other files D.read reads, so main.lua can tell from sizes and times that nothing changed.
function D.watch(ctx)
    return record_paths(ctx)
end

-- The hero save, plus XLiveEmu's achievement record when there is one, as one string so a
-- change to either is seen.
function D.read(ctx, path)
    local save = ctx.read_small(path, D.maxBytes)
    if not save then return nil end
    local record = emulator_records(ctx)
    if not record then return save end
    return RECORD .. string.format('%08x', #save) .. save .. record
end

function D.parse(bytes)
    local record
    if type(bytes) == 'string' and bytes:sub(1, 4) == RECORD then
        local n = tonumber(bytes:sub(5, 12), 16)
        if not n then return nil, 'Save is incomplete' end
        bytes, record = bytes:sub(13, 12 + n), bytes:sub(13 + n)
    end
    if type(bytes) ~= 'string' or #bytes < 16 then return nil, 'Save is incomplete' end
    local stream = unpack_chunks(bytes)
    if not stream then return nil, 'Unrecognized Fable III save layout' end
    local data, problem = inflate.zlib(stream)
    if not data or problem then return nil, 'Fable III save could not be decompressed' end
    if not data:find('HeroSaveData', 1, true) then return nil, 'Pick a *_herosave.bin file' end
    local stats, count = read_stats(data)
    if not stats or count == 0 then return nil, 'No hero statistics in this save' end
    local ids, recorded = recorded_ids(record)
    return { stats = stats, statCount = count, recorded = ids, recordedCount = recorded }
end

local function have(parsed, rule)
    local value = parsed.stats[rule.hash] or 0
    return value > 0 and value or 0
end

function D.evaluate(parsed, game)
    local earned, seen = {}, {}
    for _, rule in ipairs(game.rules) do
        if have(parsed, rule) >= rule.need then earned[#earned + 1], seen[rule.index] = rule.index, true end
    end
    for index, id in pairs(parsed.recorded and game.xlive or {}) do
        if parsed.recorded[id] and not seen[index] then earned[#earned + 1] = index end
    end
    table.sort(earned)
    return earned
end

function D.counts(parsed, game)
    local counts = {}
    for _, rule in ipairs(game.rules) do
        counts[tostring(rule.index)] = { have = have(parsed, rule), need = rule.need, label = rule.label }
    end
    return counts
end

function D.describe(parsed, fileName)
    local detail = parsed.statCount .. ' hero statistics read'
    if parsed.recorded then detail = detail .. ', ' .. parsed.recordedCount .. " in the game's own achievement record (XLiveEmu)" end
    return 'watching', 'Watching ' .. fileName .. ' for hero statistics.', detail
end

local function hero_file(name)
    return name:match('^hero%d+.*_herosave%.bin$') ~= nil and not name:find('failquest', 1, true)
end

-- For record mode: hero saves compare as named statistics instead of raw bytes.
function D.decoders(game)
    local names = game.statNames or {}
    return { {
        label = 'hero statistics',
        accepts = function(path) return (path:match('[^\\/]+$') or path):match('_herosave%.bin$') ~= nil end,
        values = function(bytes) local parsed = D.parse(bytes); return parsed and parsed.stats end,
        name = function(hash) return names[hash] or string.format('stat 0x%08x', hash) end,
    } }
end

-- Newest hero save in a folder, or in its profile subfolders.
local function newest(ctx, folder, depth, best, bestTime, summaries)
    for _, entry in ipairs(ctx.safe_list(folder)) do
        if entry.is_file and not entry.is_symlink and hero_file(entry.name) then
            local time = ctx.fs.last_write_time(entry.path) or 0
            if #summaries < 40 then summaries[#summaries + 1] = { name = entry.name, detail = 'hero save' } end
            if time > bestTime then best, bestTime = entry.path, time end
        elseif entry.is_directory and not entry.is_symlink and depth > 0 then
            best, bestTime = newest(ctx, entry.path, depth - 1, best, bestTime, summaries)
        end
    end
    return best, bestTime
end

function D.locate(ctx)
    local summaries, best, bestTime = {}, nil, -1
    local home = ctx.getenv('USERPROFILE')
    if home then
        best, bestTime = newest(ctx, ctx.fs.join(home, 'Saved Games', 'Lionhead Studios', 'Fable 3'), 1, best, bestTime, summaries)
    end
    return best, #summaries > 0 and summaries or nil
end

function D.resolve(ctx, path)
    local fs = ctx.fs
    if fs.is_directory(path) then
        local summaries = {}
        local best = newest(ctx, path, 1, nil, -1, summaries)
        if best then return best, nil, 'Selected the newest hero save, ' .. fs.filename(best) .. '.', summaries end
        return nil, 'no-gameplay-save', nil, summaries
    end
    if not fs.is_file(path) then return nil, 'path-not-found' end
    local parsed, reason = D.parse(ctx.read_small(path, D.maxBytes) or '')
    if not parsed then return nil, reason end
    return path
end

return D
