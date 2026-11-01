-- Assassin's Creed detector: reads the newest save, read-only.
-- %APPDATA%\Ubisoft\Assassin's Creed\Saved Games\<number>.sav is big-endian: the file size,
-- 12 34 FE DC, then the game's objects. Each story objective (class 44 B5 74 18) ends with
--   state, flag, 00, its object ID, then a reference count (00 00 00 n)
-- and state 3 means the objective is finished. The fields before the state vary in length,
-- so an objective is found by its ID. IDs and names come from the game's own objective list
-- (the AssassinsCreed entry of DataPC.forge), kept in source/games/ac1/objectives.json; the
-- pack's rules (game.json) unlock when any of their objectives is finished.
--
-- Collectibles live in a progress block just before the first objective, starting 04 FD. It
-- has a fixed layout of 863 bytes plus lists of one-byte indices (u32 state, u32 count,
-- entries), so each list's count sits at its place in that layout plus the entries of the
-- lists before it. Positions come from play captures (Kingdom, Damascus) and two 100%
-- community saves, whose lists fill exactly: Templars 60, flags Kingdom 100, Masyaf 20,
-- Jerusalem 100, Damascus 100 and Acre 33/34/33, then every viewpoint synchronized: 91 in
-- all, the 100% save's global list holding indices 0-90 with its state at 2 (complete), as
-- the TrueAchievements walkthrough says. The Kingdom's own list has 12 places but completes
-- with 11. In a 48-save community playthrough the 533 list starts filling at the first Acre
-- visit (Garnier, the Hospitalier leader) and the 515 list only when Sibrand's district opens,
-- so 533 holds the Hospitalier flags and 515 the Teutonic ones. The other lists are walked
-- to keep the positions right and are shown in capture logs until they are named. List
-- rules unlock when a list has `need` entries.
--
-- The same block is the game's own achievement record: one record per achievement, in the
-- pack's order (indices 0-43), each starting with a u32 state, 1 locked and 2 unlocked. Some
-- records are the lists above (their state is the list's), the others 5 to 14 bytes, a few with
-- a running counter after the state. In a 48-save community playthrough every achievement it
-- earned went from 1 to 2 at the save where the game awarded it, and none ever went back; a
-- 100% save holds 2s for those plus Conversationalist, Eagle's Challenge and the others it
-- earned. With game.achievementRecord set, a record state of 2 unlocks its achievement.
local D = { maxBytes = 4194304, followFolder = true }

local byte = string.byte
local MAGIC = '\18\52\254\220'
local CLASS = '\68\181\116\24'
local FINISHED = 3
local BLOCK = '\0\0\4\253'
local LISTS = {
    { key = 'templars', at = 212, label = 'Templars killed', below = 60 },
    { key = 'kingdomFlags', at = 221, label = 'Flags in the Kingdom', below = 100 },
    { key = 'masyafFlags', at = 230, label = 'Flags in Masyaf', below = 20 },
    { key = 'jerusalemFlags', at = 239, label = 'Flags in Jerusalem', below = 100 },
    { key = 'damascusFlags', at = 248, label = 'Flags in Damascus', below = 100 },
    { key = 'viewpoints', at = 307, label = 'Viewpoints synchronized', below = 256 },
    { key = 'list326', at = 326 }, { key = 'list335', at = 335 }, { key = 'list344', at = 344 },
    -- Acre: the 34-flag list is the Templar flags (Rich District); the two 33-flag lists are
    -- the Hospitalier (Poor) and Teutonic (Middle) flags, order not yet known.
    { key = 'acreTeutonicFlags', at = 515, label = 'Teutonic flags in Acre', below = 33 },
    { key = 'acreTemplarFlags', at = 524, label = 'Templar flags in Acre', below = 34 },
    { key = 'acreHospitalierFlags', at = 533, label = 'Hospitalier flags in Acre', below = 33 },
    { key = 'list644', at = 644 },
    -- One list per district (the first is Damascus, the last the Kingdom's viewpoints).
    { key = 'district658', at = 658 }, { key = 'district667', at = 667 }, { key = 'district676', at = 676 },
    { key = 'district685', at = 685 }, { key = 'district694', at = 694 }, { key = 'district703', at = 703 },
    { key = 'district712', at = 712 }, { key = 'district721', at = 721 }, { key = 'district730', at = 730 },
    { key = 'kingdomViewpoints', at = 739, label = 'Viewpoints in the Kingdom', below = 12 },
}

-- Each achievement's state word, by index + 1, at its place in the layout (without list entries).
local RECORD = { 198, 203, 208, 217, 226, 235, 244, 253, 258, 263, 268, 273, 278, 283, 288, 293, 298,
    303, 312, 322, 331, 340, 349, 359, 373, 384, 395, 405, 410, 422, 432, 442, 452, 462, 471, 481, 491,
    501, 511, 520, 529, 538, 543, 548 }
-- Running counters checked against real saves: the value sits 5 bytes after the state and stops
-- at the achievement's target.
local COUNTERS = {
    { index = 26, need = 100, label = 'City guards killed' },
    { index = 29, need = 100, label = 'Counter kills' },
    { index = 31, need = 50, label = 'Stealth kills' },
    { index = 32, need = 50, label = 'Leaps of faith' },
    { index = 34, need = 20, label = 'Times blended with scholars' },
}
-- The record is read only when the walk got past the last list before its end.
local RECORD_LISTS = 'acreHospitalierFlags'

local function u32be(s, i)
    local a, b, c, d = byte(s, i, i + 3)
    if not d then return nil end
    return ((a * 256 + b) * 256 + c) * 256 + d
end

local function be32(v)
    return string.char(math.floor(v / 16777216) % 256, math.floor(v / 65536) % 256, math.floor(v / 256) % 256, v % 256)
end

-- The objective's state, or nil when the save has no objective with that ID.
local function objective_state(data, id)
    local key, at = be32(id), 1
    while true do
        local p = data:find(key, at, true)
        if not p then return nil end
        at = p + 1
        local state = byte(data, p - 3)
        local class = p > 40 and data:find(CLASS, p - 40, true)
        if class and class < p and byte(data, p - 1) == 0 and state and state <= FINISHED
            and data:sub(p + 4, p + 6) == '\0\0\0' and (byte(data, p + 7) or 255) <= 64 then
            return state
        end
    end
end

-- The progress block's lists: key -> entry count, for every list read before the layout stops
-- matching (a list the walk does not know yet would move the ones after it). Also returns the
-- block's start and the walked lists, so layout positions can be turned into file positions.
local function progress_lists(data)
    local limit = data:find(CLASS, 1, true) or #data
    local start, at = nil, 1
    while true do
        local p = data:find(BLOCK, at, true)
        if not p or p > limit then break end
        start, at = p + 2, p + 1
    end
    local lists, walked = {}, {}
    if not start then return lists end
    local extra = 0
    for _, list in ipairs(LISTS) do
        local p = start + list.at + extra
        local state, n = u32be(data, p - 4), u32be(data, p)
        if not n or state > 2 or n > 120 or p + 3 + n > #data then break end
        if list.below then
            local seen = {}
            for i = p + 4, p + 3 + n do
                local entry = byte(data, i)
                if entry >= list.below or seen[entry] then return lists, start, walked end
                seen[entry] = true
            end
        end
        lists[list.key] = n
        walked[#walked + 1] = { at = list.at, n = n, key = list.key }
        extra = extra + n
    end
    return lists, start, walked
end

-- File position of a layout position: the entries of every list placed before it move it on.
local function place(start, walked, at)
    local p = start + at
    for _, list in ipairs(walked) do
        if list.at < at then p = p + list.n end
    end
    return p
end

-- The game's achievement record: { states = {[index] = 1 or 2}, counters = {[index] = value} },
-- or nil when the block does not match the layout.
local function achievement_record(data, start, walked)
    if not start then return nil end
    local reached = false
    for _, list in ipairs(walked) do
        if list.key == RECORD_LISTS then reached = true end
    end
    if not reached then return nil end
    local states, counters = {}, {}
    for i, at in ipairs(RECORD) do
        local state = u32be(data, place(start, walked, at))
        if state ~= 1 and state ~= 2 then return nil end
        states[i - 1] = state
    end
    for _, counter in ipairs(COUNTERS) do
        counters[counter.index] = u32be(data, place(start, walked, RECORD[counter.index + 1]) + 5)
    end
    return { states = states, counters = counters }
end

local function count_objectives(data)
    local n, at = 0, 1
    while true do
        local p = data:find(CLASS, at, true)
        if not p then return n end
        n, at = n + 1, p + 4
    end
end

function D.parse(data, game)
    if type(data) ~= 'string' or #data < 64 then return nil, 'Save is incomplete' end
    if u32be(data, 1) ~= #data or data:sub(5, 8) ~= MAGIC then return nil, "Not an Assassin's Creed save" end
    local states, finished = {}, 0
    for _, rule in ipairs(game and game.rules or {}) do
        for _, id in ipairs(rule.done or {}) do
            if states[id] == nil then states[id] = objective_state(data, id) or false end
        end
    end
    for _, state in pairs(states) do
        if state == FINISHED then finished = finished + 1 end
    end
    local lists, start, walked = progress_lists(data)
    return { states = states, objectives = count_objectives(data), finished = finished, lists = lists,
        record = achievement_record(data, start, walked) }
end

function D.evaluate(parsed, game)
    local list, seen = {}, {}
    if game.achievementRecord and parsed.record then
        for index = 0, #RECORD - 1 do
            if parsed.record.states[index] == 2 then list[#list + 1] = index; seen[index] = true end
        end
    end
    for _, rule in ipairs(game.rules) do
        if seen[rule.index] then
        elseif rule.list then
            if (parsed.lists[rule.list] or 0) >= rule.need then list[#list + 1] = rule.index end
        else
            for _, id in ipairs(rule.done or {}) do
                if parsed.states[id] == FINISHED then list[#list + 1] = rule.index; break end
            end
        end
    end
    return list
end

function D.counts(parsed, game)
    local counts = {}
    for _, rule in ipairs(game.rules) do
        if rule.list and parsed.lists[rule.list] then
            counts[tostring(rule.index)] = { have = parsed.lists[rule.list], need = rule.need, label = rule.label }
        end
    end
    if game.achievementRecord and parsed.record then
        for _, counter in ipairs(COUNTERS) do
            local value = parsed.record.counters[counter.index]
            if value then
                counts[tostring(counter.index)] = { have = math.min(value, counter.need), need = counter.need, label = counter.label }
            end
        end
    end
    return counts
end

function D.describe(parsed, fileName)
    if parsed.objectives == 0 then
        return 'no-mission-progress', "Assassin's Creed save recognized, but it has no story objectives yet. Waiting for gameplay progress."
    end
    local detail = parsed.objectives .. ' story objectives in the save'
    if parsed.lists.viewpoints then detail = detail .. ', ' .. parsed.lists.viewpoints .. ' viewpoints synchronized' end
    if parsed.record then
        local n = 0
        for _, state in pairs(parsed.record.states) do
            if state == 2 then n = n + 1 end
        end
        detail = detail .. ', ' .. n .. ' of ' .. #RECORD .. " achievements in the game's own record"
    end
    return 'watching', 'Watching ' .. fileName .. " for Assassin's Creed saves.", detail
end

local function save_name(name)
    return name:lower():match('%.sav$') ~= nil
end

-- Record mode and capture: every named objective's state (0 none, 1 open, 2 active, 3 finished)
-- and the entry count of each progress list.
function D.decoders(game)
    local names = game and game.objectiveNames or {}
    return { {
        label = "Assassin's Creed objectives",
        accepts = function(path) return save_name(path:match('[^\\/]+$') or path) end,
        values = function(bytes)
            if type(bytes) ~= 'string' or u32be(bytes, 1) ~= #bytes or bytes:sub(5, 8) ~= MAGIC then return nil end
            local values = {}
            for id in pairs(names) do values[id] = objective_state(bytes, id) end
            local lists, start, walked = progress_lists(bytes)
            for key, n in pairs(lists) do values['list:' .. key] = n end
            local record = achievement_record(bytes, start, walked)
            for index, state in pairs(record and record.states or {}) do values['record:' .. index] = state end
            return values
        end,
        name = function(key)
            if type(key) == 'string' and key:sub(1, 7) == 'record:' then
                local index = tonumber(key:sub(8))
                local name = game and game.recordNames and game.recordNames[index + 1]
                return "game's record of " .. (name or ('achievement ' .. index))
            end
            if type(key) == 'string' then
                local wanted = key:sub(6)
                for _, list in ipairs(LISTS) do
                    if list.key == wanted then return list.label or ('progress list ' .. list.at) end
                end
                return key
            end
            local name = names[key]
            return name and string.format('objective %s (%08X)', name, key) or string.format('objective %08X', key)
        end,
    } }
end

-- Newest readable save in a folder, plus summaries for the settings panel.
local function scan_folder(ctx, folder, game)
    local best, bestTime, summaries = nil, -1, {}
    for _, entry in ipairs(ctx.safe_list(folder)) do
        if entry.is_file and not entry.is_symlink and save_name(entry.name) then
            local bytes = ctx.read_small(entry.path, D.maxBytes)
            local parsed = bytes and D.parse(bytes, game)
            local time = ctx.fs.last_write_time(entry.path) or 0
            summaries[#summaries + 1] = { name = entry.name, bytes = bytes and #bytes or 0,
                kind = parsed and 'gameplay-slot' or 'unsupported',
                detail = parsed and (parsed.objectives .. ' story objectives') or 'unsupported format' }
            if parsed and time > bestTime then best, bestTime = entry.path, time end
        end
    end
    table.sort(summaries, function(a, b) return a.name < b.name end)
    return best, bestTime, summaries
end

local function folders(ctx)
    local list = {}
    local appdata = ctx.getenv('APPDATA')
    if appdata then
        for _, name in ipairs({ "Assassin's Creed", 'Assassins Creed' }) do
            list[#list + 1] = ctx.fs.join(appdata, 'Ubisoft', name, 'Saved Games')
        end
    end
    return list
end

function D.locate(ctx, game)
    local best, bestTime, available = nil, -1, nil
    for _, folder in ipairs(folders(ctx)) do
        local found, time, summaries = scan_folder(ctx, folder, game)
        if #summaries > 0 and not available then available = summaries end
        if found and time > bestTime then best, bestTime, available = found, time, summaries end
    end
    return best, available
end

-- Accepts a .sav file, the Saved Games folder, or the Assassin's Creed folder above it.
function D.resolve(ctx, path, game)
    local fs = ctx.fs
    if fs.is_directory(path) then
        local found, _, summaries = scan_folder(ctx, path, game)
        if not found and fs.is_directory(fs.join(path, 'Saved Games')) then
            found, _, summaries = scan_folder(ctx, fs.join(path, 'Saved Games'), game)
        end
        if found then return found, nil, 'Selected ' .. fs.filename(found) .. ' from the save folder.', summaries end
        return nil, 'no-gameplay-save', nil, summaries
    end
    if not fs.is_file(path) then return nil, 'path-not-found' end
    if not save_name(fs.filename(path) or '') then return nil, 'Pick the .sav file in Saved Games' end
    local parsed, reason = D.parse(ctx.read_small(path, D.maxBytes) or '', game)
    if not parsed then return nil, reason end
    return path
end

return D
