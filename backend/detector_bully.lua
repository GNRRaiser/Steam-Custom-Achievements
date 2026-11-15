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
--   0x52C    the mission table: u32 1, u32 3204 (block size), u32 510, then 510 entries of three
--            u16 (attempts, passes, flags) from 0x53C. Entry n is the game's mission n: the
--            mission nodes of Act\Missions.act in file order (a dummy, chap1-5, classes,
--            minigames, punishments, tutorials, doors, debug); a mission is passed once its pass
--            count is above 0. Checked against the 12% save (only Welcome to Bullworth parts 1-3,
--            entries 4-6) and the 100% save (every class and bike race passed).
--            More stats screen entries, checked against the video of a new game's stats screen
--            and the 100% save: kisses from ladies (129, 25 in the 100% save) and from gents (132),
--            trouble points accumulated (154), time out after curfew (156, in milliseconds of real
--            time, so 1000 per in-game minute), flowers found (38), clothing items purchased (66,
--            263 in the 100% save) and go-kart races won at the carnival (55) and in the street
--            (57), 5 and 3 in the 100% save. Entries above 259 on the stats screen (percentages,
--            totals, class and carnival counts) are worked out by the game, not saved.
--   0x0C     the player block: u32 3, u32 364, then money in cents (u32 at 0x38) and clique respect
--            0-100 (u32 at 0xA4 + 4k for Nerds, Jocks, Townies, Greasers, Preps). A new game shows
--            "Hated Most By: Townies" with Townies at 0; Preps are at 100 after Chapter 2.
--   0x4578   the arcade high score tables: u32 1, u32 1004, u32 10 (tables), u32 5 (entries), u32 3
--            (letters), 50 names, then 10 tables of 5 u32 scores from 0x471C (best first). Monkey
--            Fling is table 1, Nut Shots table 2 and ConSumo table 5: the player's best on the stats
--            screen (221, 224 and 218) heads them once it beats the built-in scores.
--   0x4D0C   the errands: u32 1, u32 412, u32 50, then 50 entries of u16 attempts, u16 passes from
--            0x4D18. Entry n is errand n, the first number each errand script passes to
--            MinigameSetErrandCompletion (Algie1 0 to TheWidow 49).
-- Rules: { value = name, need = x } (errands passed, dollars held, cliques at 100% respect, paper
-- routes finished (2_R03 once, then 2_R03_X at each of its four difficulties), arcade games whose
-- top score is the player's), { stat = n, need = x, float = true?, div = d? } (a stat, divided by d, reaching x),
-- { stats = { n, ... }, need = x } (the sum of several stats reaching x), { chapter = n } (the save is
-- at least in chapter n, 0-based, so 1 means Chapter 1 is finished), { completion = 100 }
-- (FileTableBully's game completion for this slot), { mission = n } (mission n passed),
-- { missions = { n, ... }, need = x } (x of those missions passed) and { groups = { { n, ... },
-- ... }, need = x } (x groups with any of their missions passed, used for classes, where a class
-- counts once its fifth level is passed).
local D = { maxBytes = 65536, followFolder = true }

local SIZE = 22260
local STATS = 0x2F4C
local STAT_COUNT = 260
local MISSIONS = 0x53C
local MISSION_COUNT = 510
local ENTRY = 56
local PLAYER = 0x0C
local SCORES = 0x4578
local ERRANDS = 0x4D0C
local PAPER_ROUTE, PAPER_ROUTE_X = 40, 41
-- { stats screen best score, high score table } for ConSumo, Monkey Fling and Nut Shots.
local ARCADE = { { 218, 5 }, { 221, 1 }, { 224, 2 } }
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

-- Other files D.read reads, so main.lua can tell from sizes and times that nothing changed.
function D.watch(ctx, path)
    if not slot_of(ctx.fs.filename(path)) then return {} end
    return { ctx.fs.join(ctx.fs.parent_path(path), 'FileTableBully') }
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
    if u32(bytes, 0x52C) ~= 1 or u32(bytes, 0x530) ~= 3204 or u32(bytes, 0x534) ~= MISSION_COUNT then
        return nil, 'This Bully save has an unknown layout'
    end
    local chapter = bytes:byte(0x75 + 1)
    if chapter > 9 then return nil, 'This Bully save has an unknown layout' end
    local stats = {}
    for n = 0, STAT_COUNT - 1 do stats[n] = i32(bytes, STATS + n * 4) end
    local passed, passes = {}, {}
    for n = 0, MISSION_COUNT - 1 do
        local at = MISSIONS + n * 6 + 2
        passes[n] = bytes:byte(at + 1) + bytes:byte(at + 2) * 256
        passed[n] = passes[n] > 0
    end
    local values = {}
    if u32(bytes, PLAYER) == 3 and u32(bytes, PLAYER + 4) == 364 then
        values.money = math.floor(u32(bytes, 0x38) / 100)
        local cliques = 0
        for k = 0, 4 do
            if u32(bytes, 0xA4 + k * 4) >= 100 then cliques = cliques + 1 end
        end
        values.cliques = cliques
    end
    if u32(bytes, ERRANDS) == 1 and u32(bytes, ERRANDS + 4) == 412 and u32(bytes, ERRANDS + 8) == 50 then
        local done = 0
        for n = 0, 49 do
            local at = ERRANDS + 12 + n * 4 + 2
            if bytes:byte(at + 1) + bytes:byte(at + 2) * 256 > 0 then done = done + 1 end
        end
        values.errands = done
    end
    if u32(bytes, SCORES) == 1 and u32(bytes, SCORES + 4) == 1004 and u32(bytes, SCORES + 8) == 10
        and u32(bytes, SCORES + 12) == 5 then
        local tops = 0
        for _, game in ipairs(ARCADE) do
            local best = i32(bytes, STATS + game[1] * 4)
            local top = u32(bytes, SCORES + 420 + game[2] * 20)
            if best and best > 0 and best >= top then tops = tops + 1 end
        end
        values.arcade = tops
    end
    values.paper = math.min(passes[PAPER_ROUTE], 1) + math.min(passes[PAPER_ROUTE_X], 4)
    local slot = read_entry(entry)
    -- The slot entry is only trusted when it agrees with the save about the chapter.
    if slot and slot.chapter ~= chapter then slot = nil end
    return { chapter = chapter, completion = slot and slot.completion or nil, stats = stats, passed = passed, values = values, bytes = bytes }
end

local function stat(parsed, rule)
    if rule.float then return f32(parsed.bytes, STATS + rule.stat * 4) end
    local value = parsed.stats[rule.stat]
    if value and rule.div then value = value / rule.div end
    return value
end

local function stat_sum(parsed, rule)
    local total = 0
    for _, n in ipairs(rule.stats) do
        local value = parsed.stats[n]
        if not value then return nil end
        total = total + math.max(0, value)
    end
    return total
end

-- How many of a rule's missions (or mission groups) are passed.
local function passed_count(parsed, rule)
    local count = 0
    if rule.missions then
        for _, n in ipairs(rule.missions) do
            if parsed.passed[n] then count = count + 1 end
        end
    else
        for _, group in ipairs(rule.groups) do
            for _, n in ipairs(group) do
                if parsed.passed[n] then count = count + 1; break end
            end
        end
    end
    return count
end

local function value_of(parsed, rule)
    if rule.value then return parsed.values[rule.value] end
    if rule.stat then return stat(parsed, rule) end
    if rule.stats then return stat_sum(parsed, rule) end
    if rule.missions or rule.groups then return passed_count(parsed, rule) end
    return nil
end

function D.evaluate(parsed, game)
    local list = {}
    for _, rule in ipairs(game.rules) do
        local hit = false
        if rule.value or rule.stat or rule.stats or rule.missions or rule.groups then
            local value = value_of(parsed, rule)
            hit = value ~= nil and value >= rule.need
        elseif rule.mission then
            hit = parsed.passed[rule.mission] == true
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
        if rule.label then
            local value = value_of(parsed, rule)
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
    return 'watching', 'Watching ' .. fileName .. ' for chapters, missions, classes, errands, respect, money, high scores and stats.', detail
end

-- Remembers a save's summary while the file is unchanged (main.lua); tests pass no cache.
local function cached(ctx, path, compute)
    if ctx.cached then return ctx.cached(path, compute) end
    return compute()
end

local function scan_folder(ctx, folder)
    local best, bestTime, summaries = nil, -1, {}
    for _, entry in ipairs(ctx.safe_list(folder)) do
        if entry.is_file and not entry.is_symlink and slot_of(entry.name) then
            local info = cached(ctx, entry.path, function()
                local bytes = ctx.read_small(entry.path, D.maxBytes)
                local parsed = bytes and D.parse(bytes)
                return { bytes = bytes and #bytes or 0, ok = parsed and true or false,
                    detail = parsed and (parsed.chapter < 5 and ('Chapter ' .. (parsed.chapter + 1)) or 'Endless summer') or 'unsupported format' }
            end)
            local time = ctx.fs.last_write_time(entry.path) or 0
            summaries[#summaries + 1] = { name = entry.name, bytes = info.bytes,
                kind = info.ok and 'gameplay-slot' or 'unsupported', detail = info.detail }
            if info.ok and time > bestTime then best, bestTime = entry.path, time end
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
