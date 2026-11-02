-- Bully: Scholarship Edition detector: reads the newest BullyFile<n> save, read-only.
-- Documents\Bully Scholarship Edition\BullyFile1-6 are the save slots (22260 bytes each, the same
-- layout on PC and in the Anniversary Edition); FileTableBully holds one 56-byte entry per slot
-- (u32 valid, f32 game completion %, u32 chapter, area, mission, play time, save date), which is
-- what the load menu shows.
--
-- Save layout (little-endian, checked on three saves at 12%, about 40% and 100%):
--   0x04 u32 21 (format version), 0x08 u32 22260 (file size)
--   0x75 u8  chapter, 0 in Chapter 1 to 5 in the summer after the final chapter (it matches the
--            slot's FileTableBully entry)
--   0x2F3C   the statistics block: u32 1, u32 1468 (block size), u32 260, u32 38, then 260 u32
--            stats from 0x2F4C. Stat n is the index the game's own stats screen script uses
--            (SStats.lua: StatLayoutAddStat("STATnnnn", n)); distances (5-11) are f32 metres.
--            Checked against the in-game stats screen of the 12% save: money earned (0) 103000
--            cents = $1030.00, room trophies (1) 1, times busted (3) 7, on foot (5) 104674 m =
--            104.67 km, on bike (7) 101320 m, moped (9) 185 m, windows (20) 6, plants (21) 40,
--            cars damaged (24) 11, crates (27) 28, chocolates (37) 10, flowers (39) 10, sodas
--            drunk (40) 637, ConSumo (217-219) 1 / 2005 / 50 cents, Nut Shots high score (224)
--            52450, FS Racer 3D (228-229) 2 / 150 cents.
-- Rules: { stat = n, need = x, float = true? } (a stat reaching x), { chapter = n } (the save is
-- at least in chapter n, 0-based, so 1 means Chapter 1 is finished) and { completion = 100 }
-- (FileTableBully's game completion for this slot).
local D = { maxBytes = 65536, followFolder = true }

local SIZE = 22260
local STATS = 0x2F4C
local STAT_COUNT = 260
local ENTRY = 56
local RECORD = 'SCAB'

local function u32(s, at)
    local a, b, c, d = s:byte(at + 1, at + 4)
    if not d then return nil end
    return a + b * 256 + c * 65536 + d * 16777216
end

local function i32(s, at)
    local v = u32(s, at)
    if v and v >= 2147483648 then v = v - 4294967296 end
    return v
end

local function f32(s, at)
    local value = u32(s, at)
    if not value then return nil end
    local sign = value >= 2147483648 and -1 or 1
    local exponent = math.floor(value / 8388608) % 256
    local mantissa = value % 8388608
    if exponent == 255 then return nil end
    if exponent == 0 then return sign * mantissa * 2 ^ -149 end
    return sign * (1 + mantissa / 8388608) * 2 ^ (exponent - 127)
end

local function slot_of(name)
    local n = (name or ''):match('^[Bb][Uu][Ll][Ll][Yy][Ff][Ii][Ll][Ee]([1-6])$')
    return n and tonumber(n) or nil
end

-- The save plus its slot's FileTableBully entry (when there is one), so a change to either is
-- seen as a new snapshot.
function D.read(ctx, path)
    local save = ctx.read_small(path, D.maxBytes)
    if not save then return nil end
    local slot = slot_of(ctx.fs.filename(path))
    local table_bytes = slot and ctx.read_small(ctx.fs.join(ctx.fs.parent_path(path), 'FileTableBully'), 4096)
    local entry = table_bytes and table_bytes:sub((slot - 1) * ENTRY + 1, slot * ENTRY)
    if not entry or #entry ~= ENTRY then return save end
    return RECORD .. string.format('%08x', #save) .. save .. entry
end

local function read_entry(entry)
    if not entry or #entry ~= ENTRY or u32(entry, 0) ~= 1 then return nil end
    local completion, chapter = f32(entry, 4), u32(entry, 8)
    if not completion or completion < 0 or completion > 100.5 or chapter > 9 then return nil end
    return { completion = completion, chapter = chapter }
end

function D.parse(bytes)
    if type(bytes) ~= 'string' then return nil, 'Not a Bully save' end
    local entry
    if bytes:sub(1, 4) == RECORD then
        local n = tonumber(bytes:sub(5, 12), 16)
        if not n or #bytes < 12 + n then return nil, 'Save is incomplete' end
        entry = bytes:sub(13 + n)
        bytes = bytes:sub(13, 12 + n)
    end
    if #bytes ~= SIZE or u32(bytes, 4) ~= 21 or u32(bytes, 8) ~= SIZE then
        return nil, 'Not a Bully: Scholarship Edition save (BullyFile1-6)'
    end
    if u32(bytes, 0x2F3C) ~= 1 or u32(bytes, 0x2F40) ~= 1468 or u32(bytes, 0x2F44) ~= STAT_COUNT then
        return nil, 'This Bully save has an unknown layout'
    end
    local chapter = bytes:byte(0x75 + 1)
    if chapter > 9 then return nil, 'This Bully save has an unknown layout' end
    local stats = {}
    for n = 0, STAT_COUNT - 1 do stats[n] = i32(bytes, STATS + n * 4) end
    local slot = read_entry(entry)
    -- The slot entry is only trusted when it agrees with the save about the chapter.
    if slot and slot.chapter ~= chapter then slot = nil end
    return { chapter = chapter, completion = slot and slot.completion or nil, stats = stats, bytes = bytes }
end

local function stat(parsed, rule)
    if rule.float then return f32(parsed.bytes, STATS + rule.stat * 4) end
    return parsed.stats[rule.stat]
end

function D.evaluate(parsed, game)
    local list = {}
    for _, rule in ipairs(game.rules) do
        local hit = false
        if rule.stat then
            local value = stat(parsed, rule)
            hit = value ~= nil and value >= rule.need
        elseif rule.chapter then
            hit = parsed.chapter >= rule.chapter
        elseif rule.completion then
            hit = parsed.completion ~= nil and parsed.completion >= rule.completion - 0.005
        end
        if hit then list[#list + 1] = rule.index end
    end
    return list
end

function D.counts(parsed, game)
    local counts = {}
    for _, rule in ipairs(game.rules) do
        if rule.stat and rule.label then
            local value = stat(parsed, rule)
            if value then
                counts[tostring(rule.index)] = { have = math.max(0, math.min(math.floor(value), rule.need)), need = rule.need, label = rule.label }
            end
        end
    end
    return counts
end

function D.describe(parsed, fileName)
    local chapter = parsed.chapter < 5 and ('Chapter ' .. (parsed.chapter + 1)) or 'after the final chapter'
    local detail = chapter
    if parsed.completion then detail = detail .. string.format(', %.2f%% complete', parsed.completion) end
    return 'watching', 'Watching ' .. fileName .. ' for chapters and stats.', detail
end

local function scan_folder(ctx, folder)
    local best, bestTime, summaries = nil, -1, {}
    for _, entry in ipairs(ctx.safe_list(folder)) do
        if entry.is_file and not entry.is_symlink and slot_of(entry.name) then
            local bytes = ctx.read_small(entry.path, D.maxBytes)
            local parsed = bytes and D.parse(bytes)
            local time = ctx.fs.last_write_time(entry.path) or 0
            summaries[#summaries + 1] = { name = entry.name, bytes = bytes and #bytes or 0,
                kind = parsed and 'gameplay-slot' or 'unsupported',
                detail = parsed and (parsed.chapter < 5 and ('Chapter ' .. (parsed.chapter + 1)) or 'Endless summer') or 'unsupported format' }
            if parsed and time > bestTime then best, bestTime = entry.path, time end
        end
    end
    table.sort(summaries, function(a, b) return a.name < b.name end)
    return best, summaries
end

function D.locate(ctx)
    local home = ctx.getenv('USERPROFILE')
    if not home then return nil, nil end
    for _, docs in ipairs({ { 'Documents' }, { 'OneDrive', 'Documents' } }) do
        local path = home
        for _, part in ipairs(docs) do path = ctx.fs.join(path, part) end
        local best, summaries = scan_folder(ctx, ctx.fs.join(path, 'Bully Scholarship Edition'))
        if best then return best, summaries end
    end
    return nil, nil
end

-- Accepts a BullyFile<n> save or the Bully Scholarship Edition folder.
function D.resolve(ctx, path)
    local fs = ctx.fs
    if fs.is_directory(path) then
        local found, summaries = scan_folder(ctx, path)
        if found then return found, nil, 'Selected ' .. fs.filename(found) .. ' from the save folder.', summaries end
        return nil, 'no-gameplay-save', nil, summaries
    end
    if not fs.is_file(path) then return nil, 'path-not-found' end
    if not slot_of(fs.filename(path)) then return nil, 'Pick a BullyFile1-6 save in Documents\\Bully Scholarship Edition' end
    local parsed, reason = D.parse(ctx.read_small(path, D.maxBytes) or '')
    if not parsed then return nil, reason end
    return path
end

return D
