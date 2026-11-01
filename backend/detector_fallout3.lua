-- Fallout 3 detector: reads the newest .fos save in Documents\My Games\Fallout3\Saves, read-only.
-- Layout (checked on two real PC saves, GOTY with all five DLCs, save version 0x30, form version 21):
--   "FO3SAVEGAME", u32 header size, header fields separated by '|' (version, screenshot width and
--   height, save number, player name, karma title, level, location, play time), the RGB
--   screenshot, form version u8, u32 plugin-list size, plugin count u8 '|' then (u16 len '|' name '|').
--   The file location table follows: u32 offsets of the form ID array, unknown table 3, global
--   data table 1, change forms and global data table 2, then the table 1, table 2 and change
--   form counts.
--   Global data type 0 = the Pip-Boy's misc statistics: u32 count '|' then count x (u32 '|'),
--   in the order of the game's list (Quests Completed, Locations Discovered, People Killed, ...).
--   Change form: 3-byte ref ID (big-endian; top 2 bits 0 = 1-based index into the form ID array,
--   1 = a Fallout3.esm form), u32 change flags, u8 type (top 2 bits = size of the length field:
--   1, 2 or 4 bytes), u8 version, length, data. Type 9 is a quest: with change flag 0x2 its data
--   starts with the quest flags byte, where 0x02 = completed and 0x01 = running. A form ID's top
--   byte is the plugin's position in the save's own plugin list, so DLC quests are matched by
--   plugin name, not by load order.
--   The player reference (form 0x14): 3-byte cell + 6 floats, then '|' and 220 floats each
--   followed by '|'; float 96 (73 + actor value 23) is karma (1000 on a Messiah save, 0 on a
--   neutral one).
-- The file is 5-20 MB, so read() keeps only these values (as a short text summary) and
-- re-reads the file only when its size or time changes.
local D = { maxBytes = 67108864, followFolder = true }

local MAGIC = 'FO3SAVEGAME'
local QUEST_TYPE = 9
local KARMA_INDEX = 96

local function u16(s, at) local a, b = s:byte(at, at + 1); if not b then return nil end; return a + b * 256 end
local function u32(s, at)
    local a, b, c, d = s:byte(at, at + 3)
    if not d then return nil end
    return a + b * 256 + c * 65536 + d * 16777216
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

-- A '|'-separated string field: u16 length, '|', bytes, '|'.
local function field(s, at)
    local n = u16(s, at)
    if not n or s:sub(at + 2, at + 2) ~= '|' or s:sub(at + 3 + n, at + 3 + n) ~= '|' then return nil end
    return s:sub(at + 3, at + 2 + n), at + 4 + n
end

-- Positions below are 1-based (Lua strings).
local function header(s)
    if s:sub(1, #MAGIC) ~= MAGIC then return nil, 'Not a Fallout 3 save' end
    local size = u32(s, 12)
    local width, height = u32(s, 21), u32(s, 26)
    if not size or not width or not height or width > 4096 or height > 4096 then return nil, 'Unknown save header' end
    local pos = 36
    local name, karmaTitle
    name, pos = field(s, pos); if not name then return nil, 'Unknown save header' end
    karmaTitle, pos = field(s, pos); if not karmaTitle then return nil, 'Unknown save header' end
    local level = u32(s, pos)
    if not level or s:sub(pos + 4, pos + 4) ~= '|' or level < 1 or level > 255 then return nil, 'Unknown save header' end
    local body = 16 + size + width * height * 3
    local pluginSize = u32(s, body + 1)
    if not pluginSize then return nil, 'Save is cut short' end
    local count = s:byte(body + 5)
    if not count or s:sub(body + 6, body + 6) ~= '|' then return nil, 'Unknown plugin list' end
    local plugins, p = {}, body + 7
    for i = 1, count do
        local plugin
        plugin, p = field(s, p)
        if not plugin then return nil, 'Unknown plugin list' end
        plugins[i - 1] = plugin:lower()
    end
    local tableAt = body + 5 + pluginSize
    if p ~= tableAt then return nil, 'Unknown plugin list' end
    local t = {}
    for i = 1, 8 do t[i] = u32(s, tableAt + (i - 1) * 4) end
    if not t[8] then return nil, 'Save is cut short' end
    return { level = level, plugins = plugins, formIds = t[1], global1 = t[3], changeForms = t[4],
        global2 = t[5], global1Count = t[6], global2Count = t[7], changeFormCount = t[8] }
end

local function misc_stats(s, h)
    local p = h.global1 + 1
    for _ = 1, h.global1Count do
        local kind, len = u32(s, p), u32(s, p + 4)
        if not len then return nil end
        if kind == 0 then
            local count = u32(s, p + 8)
            if not count or count > 64 or count * 5 + 5 ~= len then return nil end
            local stats = {}
            for i = 0, count - 1 do
                local at = p + 13 + i * 5
                if s:sub(at + 4, at + 4) ~= '|' then return nil end
                stats[i] = u32(s, at)
            end
            return stats
        end
        p = p + 8 + len
    end
    return nil
end

local function karma(data)
    if not data or data:sub(28, 28) ~= '|' then return nil end
    local count, p = 0, 28
    while data:sub(p, p) == '|' and data:sub(p + 5, p + 5) == '|' do count = count + 1; p = p + 5 end
    if count ~= 220 then return nil end
    local value = f32(data, 29 + KARMA_INDEX * 5)
    if not value or value < -1000 or value > 1000 then return nil end
    return math.floor(value + 0.5)
end

-- Walks the change forms; returns completed / running quests as "plugin:ID" and the player data.
local function change_forms(s, h)
    local formCount = u32(s, h.formIds + 1)
    if not formCount or h.formIds + 4 + formCount * 4 > #s then return nil end
    local function form_id(ref)
        local kind, value = math.floor(ref / 4194304), ref % 4194304
        if kind == 1 then return value end
        if kind ~= 0 or value < 1 or value > formCount then return nil end
        return u32(s, h.formIds + 5 + (value - 1) * 4)
    end
    local quests, player = {}, nil
    local p, stop = h.changeForms + 1, h.global2 + 1
    for _ = 1, h.changeFormCount do
        local a, b, c = s:byte(p, p + 2)
        local kindByte = s:byte(p + 7)
        if not kindByte then return nil end
        local sizeCode = math.floor(kindByte / 64)
        if sizeCode == 3 then return nil end
        local len
        if sizeCode == 0 then len = s:byte(p + 9) elseif sizeCode == 1 then len = u16(s, p + 9) else len = u32(s, p + 9) end
        local dataAt = p + 9 + 2 ^ sizeCode
        if not len or dataAt + len > stop then return nil end
        local kind = kindByte % 64
        if kind == QUEST_TYPE then
            local flags = u32(s, p + 3)
            if flags % 4 >= 2 and len >= 2 then
                local fid = form_id((a * 256 + b) * 256 + c)
                local questFlags = s:byte(dataAt)
                if fid and s:sub(dataAt + 1, dataAt + 1) == '|' then
                    local plugin = h.plugins[math.floor(fid / 16777216)]
                    if plugin then
                        local key = plugin .. ':' .. string.format('%X', fid % 16777216)
                        if questFlags % 4 >= 2 then quests[key] = 'done' elseif questFlags % 2 == 1 then quests[key] = 'running' end
                    end
                end
            end
        elseif not player and form_id((a * 256 + b) * 256 + c) == 0x14 then
            player = s:sub(dataAt, dataAt + len - 1)
        end
        p = dataAt + len
    end
    if p ~= stop then return nil end
    return quests, player
end

-- The summary text that read() hands to parse(): one "key value" per line.
local function summarize(s)
    local h, reason = header(s)
    if not h then return 'error ' .. reason end
    local stats = misc_stats(s, h)
    if not stats then return 'error No Pip-Boy statistics in this save' end
    local quests, player = change_forms(s, h)
    if not quests then return 'error Unknown change form layout' end
    local lines = { 'fo3 1', 'level ' .. h.level }
    local k = karma(player)
    if k then lines[#lines + 1] = 'karma ' .. k end
    for i = 0, 63 do if stats[i] then lines[#lines + 1] = 'stat ' .. i .. ' ' .. stats[i] end end
    local keys = {}
    for key in pairs(quests) do keys[#keys + 1] = key end
    table.sort(keys)
    for _, key in ipairs(keys) do lines[#lines + 1] = 'quest ' .. key .. ' ' .. quests[key] end
    return table.concat(lines, '\n')
end
D.summarize = summarize

local cache = {}
function D.read(ctx, path)
    local file = io.open(path, 'rb')
    if not file then return nil end
    local size = file:seek('end')
    local time = ctx.fs.last_write_time(path) or 0
    local key = path .. '|' .. tostring(size) .. '|' .. tostring(time)
    if cache.key == key then file:close(); return cache.summary end
    if not size or size > D.maxBytes then file:close(); return nil end
    file:seek('set', 0)
    local bytes = file:read('*a')
    file:close()
    if not bytes or #bytes ~= size then return nil end
    cache.key, cache.summary = key, summarize(bytes)
    return cache.summary
end

function D.parse(text)
    if type(text) ~= 'string' then return nil, 'Not a Fallout 3 save' end
    if text:sub(1, 6) == 'error ' then return nil, text:sub(7) end
    if text:sub(1, 5) == MAGIC:sub(1, 5) then text = summarize(text); if text:sub(1, 6) == 'error ' then return nil, text:sub(7) end end
    if text:sub(1, 6) ~= 'fo3 1\n' then return nil, 'Not a Fallout 3 save' end
    local parsed = { stats = {}, quests = {}, done = 0 }
    for line in text:gmatch('[^\n]+') do
        local word, rest = line:match('^(%S+) (.*)$')
        if word == 'level' then parsed.level = tonumber(rest)
        elseif word == 'karma' then parsed.karma = tonumber(rest)
        elseif word == 'stat' then
            local i, v = rest:match('^(%d+) (%d+)$')
            if i then parsed.stats[tonumber(i)] = tonumber(v) end
        elseif word == 'quest' then
            local key, state = rest:match('^(%S+) (%S+)$')
            if key then
                parsed.quests[key] = state
                if state == 'done' then parsed.done = parsed.done + 1 end
            end
        end
    end
    return parsed
end

local function karma_kind(value)
    if not value then return nil end
    if value >= 250 then return 'good' end
    if value <= -250 then return 'bad' end
    return 'neutral'
end

local function quest_key(q) return q.plugin .. ':' .. q.id end

local function rule_met(parsed, rule)
    if rule.quests then
        for _, q in ipairs(rule.quests) do
            local state = parsed.quests[quest_key(q)]
            if state == 'done' or (rule.started and state == 'running') then return true end
        end
        return false
    end
    if rule.stat then return (parsed.stats[rule.stat] or 0) >= rule.need end
    if rule.level then
        return (parsed.level or 0) >= rule.level and karma_kind(parsed.karma) == rule.karma
    end
    return false
end

function D.evaluate(parsed, game)
    local list = {}
    for _, rule in ipairs(game.rules) do
        if rule_met(parsed, rule) then list[#list + 1] = rule.index end
    end
    return list
end

function D.counts(parsed, game)
    local counts = {}
    for _, rule in ipairs(game.rules) do
        if rule.stat and parsed.stats[rule.stat] then
            counts[tostring(rule.index)] = { have = math.min(parsed.stats[rule.stat], rule.need), need = rule.need, label = rule.label }
        elseif rule.level and parsed.level then
            counts[tostring(rule.index)] = { have = math.min(parsed.level, rule.level), need = rule.level,
                label = 'Level (' .. (karma_kind(parsed.karma) or 'unknown') .. ' karma now)' }
        end
    end
    return counts
end

function D.describe(parsed, fileName)
    local detail = 'Level ' .. (parsed.level or '?') .. ', ' .. parsed.done .. ' quests completed'
    if parsed.karma then detail = detail .. ', karma ' .. parsed.karma end
    return 'watching', 'Watching ' .. fileName .. ' for quests, stats, level and karma.', detail
end

local function save_name(name)
    return name:lower():match('%.fos$') ~= nil
end

local function scan_folder(ctx, folder)
    local best, bestTime, summaries = nil, -1, {}
    for _, entry in ipairs(ctx.safe_list(folder)) do
        if entry.is_file and not entry.is_symlink and save_name(entry.name) then
            local time = ctx.fs.last_write_time(entry.path) or 0
            summaries[#summaries + 1] = { name = entry.name, bytes = 0, kind = 'gameplay-slot', detail = 'Fallout 3 save' }
            if time > bestTime then best, bestTime = entry.path, time end
        end
    end
    table.sort(summaries, function(a, b) return a.name < b.name end)
    return best, summaries
end

function D.locate(ctx)
    local home = ctx.getenv('USERPROFILE')
    if not home then return nil, nil end
    local join = ctx.fs.join
    for _, docs in ipairs({ join(home, 'Documents'), join(home, 'OneDrive', 'Documents') }) do
        local best, summaries = scan_folder(ctx, join(docs, 'My Games', 'Fallout3', 'Saves'))
        if best then return best, summaries end
    end
    return nil, nil
end

-- Accepts a .fos file, the Saves folder, or the Fallout3 folder above it.
function D.resolve(ctx, path)
    local fs = ctx.fs
    if fs.is_directory(path) then
        local found, summaries = scan_folder(ctx, path)
        if not found and fs.is_directory(fs.join(path, 'Saves')) then
            found, summaries = scan_folder(ctx, fs.join(path, 'Saves'))
        end
        if found then return found, nil, 'Selected ' .. fs.filename(found) .. ' from the save folder.', summaries end
        return nil, 'no-gameplay-save', nil, summaries
    end
    if not fs.is_file(path) then return nil, 'path-not-found' end
    if not save_name(fs.filename(path) or '') then return nil, 'Pick a .fos file in Documents\\My Games\\Fallout3\\Saves' end
    local parsed, reason = D.parse(D.read(ctx, path) or '')
    if not parsed then return nil, reason end
    return path
end

return D
