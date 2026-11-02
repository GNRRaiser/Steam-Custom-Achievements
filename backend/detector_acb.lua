-- Assassin's Creed Brotherhood detector: reads the newest save, read-only.
-- decoder_acb unpacks the save into mission records (id, progress). The pack's rules
-- (source/games/acb/game.json) name the missions from the game's own Rome mission list:
--   done  unlock when any of these missions is complete (a sequence's outro, or any later
--         story mission, so a missed outro still counts once the next sequence starts)
--   all   unlock when every one of these is complete (flags, feathers, towers)
--   seen  unlock when any of these missions has a record at all (it has been reached)
--   objects  per-item progress (Borgia flags, feathers): world objects listed in game.json
--         that the save lists as taken. Unlocking still comes from the rules above, or from
--         every listed object being taken.
-- Taken world objects: the save keeps lists of object ids (property EAD7F03B, type C69075AB,
-- {u32 count, count x u32 id}). A flag's or feather's id is added when it is taken (found
-- with a tester's captures: 1 id per flag; 101 flag and 100 feather ids in 100% saves).
-- The game also keeps its own achievement record in OPTIONS (same folder, same block
-- format): a 64-bit property, one bit per achievement (game.profileBits).
local reader = require('decoder_acb')

local D = { maxBytes = 8388608, followFolder = true }
local byte = string.byte

local function u32(s, i)
    local a, b, c, d = byte(s, i, i + 3)
    return a + b * 256 + c * 65536 + d * 16777216
end

local function le32(v)
    return string.char(v % 256, math.floor(v / 256) % 256, math.floor(v / 65536) % 256, math.floor(v / 16777216) % 256)
end

-- The save, plus OPTIONS when it is there, as one string so a change to either is seen.
function D.read(ctx, path)
    local save = ctx.read_small(path, D.maxBytes)
    if not save then return nil end
    local options = ctx.read_small(ctx.fs.join(ctx.fs.parent_path(path), 'OPTIONS'), 1048576)
    if not options then return save end
    return 'SCA\0' .. string.format('%08x', #save) .. save .. options
end

-- Ids of every taken world object: { [id] = true }.
local TAKEN = '\59\240\215\234\171\117\144\198\0\0\29\9\11\1'
local function taken_objects(objects)
    local found, at = {}, 1
    while true do
        local p = objects:find(TAKEN, at, true)
        if not p then break end
        local i = p + #TAKEN
        local n = i + 3 <= #objects and u32(objects, i) or 0
        if n > 0 and n <= 4096 and i + 3 + n * 4 <= #objects then
            for k = 0, n - 1 do found[u32(objects, i + 4 + k * 4)] = true end
        end
        at = p + 1
    end
    return found
end

-- Bit positions set in the achievement property: { [bit] = true }, or nil if absent.
local function achievement_bits(options, hash)
    local objects = options and reader.decode(options)
    if not objects then return nil end
    local at = objects:find('\21\0\0\0' .. le32(hash), 1, true)
    if not at or byte(objects, at + 16) ~= 0x0B or at + 24 > #objects then return nil end
    local bits, lo, hi = {}, u32(objects, at + 17), u32(objects, at + 21)
    for i = 0, 31 do
        if math.floor(lo / 2 ^ i) % 2 == 1 then bits[i] = true end
        if math.floor(hi / 2 ^ i) % 2 == 1 then bits[i + 32] = true end
    end
    return bits
end

function D.parse(data, game)
    local options
    if type(data) == 'string' and data:sub(1, 4) == 'SCA\0' then
        local n = tonumber(data:sub(5, 12), 16)
        if not n then return nil, 'Not a Brotherhood save' end
        data, options = data:sub(13, 12 + n), data:sub(13 + n)
    end
    local objects, reason = reader.decode(data)
    if not objects then return nil, reason end
    local done, total = reader.missions(objects)
    local records = 0
    for _ in pairs(done) do records = records + 1 end
    local profile = game and game.profileBits
    local bits = profile and options and achievement_bits(options, profile.property)
    local recorded = 0
    for _ in pairs(bits or {}) do recorded = recorded + 1 end
    return { done = done, completedCount = total, missionRecords = records, bits = bits, recorded = recorded,
             taken = taken_objects(objects) }
end

local function any_done(parsed, ids)
    for _, id in ipairs(ids or {}) do
        if parsed.done[id] == 1 then return true end
    end
    return false
end

local function count_taken(parsed, ids)
    local have = 0
    for _, id in ipairs(ids) do
        if parsed.taken and parsed.taken[id] then have = have + 1 end
    end
    return have
end

local function count_done(parsed, ids)
    local have = 0
    for _, id in ipairs(ids) do
        if parsed.done[id] == 1 then have = have + 1 end
    end
    return have
end

function D.evaluate(parsed, game)
    local earned = {}
    for _, rule in ipairs(game.rules) do
        local ok = any_done(parsed, rule.done)
        if not ok and rule.all and #rule.all > 0 then ok = count_done(parsed, rule.all) == #rule.all end
        if not ok and rule.objects then ok = count_taken(parsed, rule.objects) == #rule.objects end
        if not ok and rule.seen then
            for _, id in ipairs(rule.seen) do
                if parsed.done[id] ~= nil then ok = true; break end
            end
        end
        if ok then earned[#earned + 1] = rule.index end
    end
    local profile = game.profileBits
    if profile and parsed.bits then
        for bit, index in pairs(profile.indices) do
            if parsed.bits[tonumber(bit)] then earned[#earned + 1] = index end
        end
    end
    return earned
end

function D.counts(parsed, game)
    local counts = {}
    for _, rule in ipairs(game.rules) do
        if rule.objects then
            counts[tostring(rule.index)] = { have = count_taken(parsed, rule.objects), need = #rule.objects, label = rule.objectsLabel }
        elseif rule.all and rule.label then
            counts[tostring(rule.index)] = { have = count_done(parsed, rule.all), need = #rule.all, label = rule.label }
        end
    end
    return counts
end

function D.describe(parsed, fileName)
    if parsed.missionRecords == 0 then
        return 'no-mission-progress', 'Brotherhood save recognized, but it has no mission records yet. Waiting for gameplay progress.'
    end
    local details = parsed.completedCount .. ' of ' .. parsed.missionRecords .. ' started missions complete'
    if parsed.bits then
        details = details .. '; ' .. parsed.recorded .. (parsed.recorded == 1 and ' achievement' or ' achievements') .. ' recorded by the game'
    end
    return 'watching', 'Watching ' .. fileName .. ' for Brotherhood saves.', details
end

function D.decoders(game)
    local list = reader.decoders(game and game.missionNames)
    local profile = game and game.profileBits
    if profile then
        list[#list + 1] = {
            label = 'Brotherhood achievement record',
            accepts = function(path) return (path:match('[^\\/]+$') or path):upper() == 'OPTIONS' end,
            values = function(bytes)
                local bits = achievement_bits(bytes, profile.property)
                if not bits then return nil end
                local values = {}
                for bit = 0, 63 do values[bit] = bits[bit] and 1 or 0 end
                return values
            end,
            name = function(key) return 'achievement bit ' .. key end,
        }
    end
    return list
end

-- Newest readable save in a folder, plus summaries for the settings panel.
local function scan_folder(ctx, folder)
    local best, bestTime, summaries = nil, -1, {}
    for _, entry in ipairs(ctx.safe_list(folder)) do
        if entry.is_file and not entry.is_symlink and reader.save_name(entry.name) then
            local bytes = ctx.read_small(entry.path, D.maxBytes)
            local parsed = bytes and D.parse(bytes)
            local time = ctx.fs.last_write_time(entry.path) or 0
            summaries[#summaries + 1] = { name = entry.name, bytes = bytes and #bytes or 0,
                kind = parsed and 'gameplay-slot' or 'unsupported',
                detail = parsed and (parsed.missionRecords .. ' mission records') or 'unsupported format' }
            if parsed and time > bestTime then best, bestTime = entry.path, time end
        end
    end
    table.sort(summaries, function(a, b) return a.name < b.name end)
    return best, bestTime, summaries
end

local function folders(ctx)
    local list = {}
    local home = ctx.getenv('USERPROFILE')
    if home then
        for _, name in ipairs({ "Assassin's Creed Brotherhood", 'Assassins Creed Brotherhood' }) do
            list[#list + 1] = ctx.fs.join(home, 'Saved Games', name, 'SAVES')
        end
    end
    return list
end

function D.locate(ctx)
    local best, bestTime, available = nil, -1, nil
    for _, folder in ipairs(folders(ctx)) do
        local found, time, summaries = scan_folder(ctx, folder)
        if #summaries > 0 and not available then available = summaries end
        if found and time > bestTime then best, bestTime, available = found, time, summaries end
    end
    return best, available
end

function D.resolve(ctx, path, game)
    local fs = ctx.fs
    if fs.is_directory(path) then
        local found, _, summaries = scan_folder(ctx, path)
        if not found and fs.is_directory(fs.join(path, 'SAVES')) then
            found, _, summaries = scan_folder(ctx, fs.join(path, 'SAVES'))
        end
        if found then return found, nil, 'Selected ' .. fs.filename(found) .. ' from the save folder.', summaries end
        return nil, 'no-gameplay-save', nil, summaries
    end
    if not fs.is_file(path) then return nil, 'path-not-found' end
    local parsed, reason = D.parse(ctx.read_small(path, D.maxBytes) or '', game)
    if not parsed then return nil, reason end
    return path
end

return D
