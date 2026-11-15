-- Thrillville: Off the Rails detector: reads the newest park save, read-only.
-- %LOCALAPPDATA%\LucasArts\Thrillville 07\Save\<slot>-<id>.ThrillvilleSaveGame lists the
-- missions of the park being played with a status (see decoder_thrillville.lua): 00 01 ...
-- locked, 03 ... open, 04 <medal> ... finished. The mission names and their English titles
-- come from the game's own park files (high\ovldata\Parks\<park>.zap, <park>_English.ovl):
-- e.g. "Bribery 101!" is P1_G_WinPrizes. Rules unlock when one of their missions is finished
-- ("finished") or when any mission of a park is open or finished ("opened", a park unlocked).
local reader = require('decoder_thrillville')

local D = { maxBytes = 1048576, followFolder = true }

local LOCKED = '00 01 00 00 00'

local function state(status)
    if not status or status == '' or status == LOCKED then return 'locked' end
    local first = status:sub(1, 2)
    if first == '04' then return 'finished' end
    if first == '03' then return 'open' end
    return 'locked'
end

-- The statistics block near the end of the save: u32 0x576C0 is the number of missions
-- finished (4, 9, 10 on real saves, matching the mission list) and u32 0x576F0 the park
-- owner level (1, 2, 2 on the same saves, as the game showed). The level is only trusted when
-- the finished count matches the missions read above.
local function u32(bytes, at)
    local a, b, c, d = bytes:byte(at + 1, at + 4)
    if not d then return nil end
    return a + b * 256 + c * 65536 + d * 16777216
end

local function owner_level(bytes, finished)
    if u32(bytes, 0x576C0) ~= finished then return nil end
    local level = u32(bytes, 0x576F0)
    if level and level >= 1 and level <= 50 then return level end
    return nil
end

function D.parse(bytes)
    if type(bytes) ~= 'string' or bytes:sub(1, 4) ~= 'RGMH' then return nil, 'Not a Thrillville park save' end
    local records, count = reader.records(bytes)
    if not records then return nil, 'No park missions in this save yet' end
    local missions, finished = {}, 0
    for name, status in pairs(records) do
        if name:find('_', 1, true) then
            missions[name] = state(status)
            if missions[name] == 'finished' then finished = finished + 1 end
        end
    end
    return { missions = missions, records = count, finished = finished, ownerLevel = owner_level(bytes, finished) }
end

function D.evaluate(parsed, game)
    local list = {}
    for _, rule in ipairs(game.rules) do
        local hit = false
        for _, name in ipairs(rule.finished or {}) do
            if parsed.missions[name] == 'finished' then hit = true end
        end
        if rule.ownerLevel and (parsed.ownerLevel or 0) >= rule.ownerLevel then hit = true end
        for _, name in ipairs(rule.opened or {}) do
            local s = parsed.missions[name]
            if s == 'open' or s == 'finished' then hit = true end
        end
        if hit then list[#list + 1] = rule.index end
    end
    return list
end

function D.counts(parsed, game)
    local counts = {}
    for _, rule in ipairs(game.rules) do
        if rule.ownerLevel and parsed.ownerLevel then
            counts[tostring(rule.index)] = { have = math.min(parsed.ownerLevel, rule.ownerLevel), need = rule.ownerLevel, label = rule.label }
        end
    end
    return counts
end

function D.describe(parsed, fileName)
    local detail = parsed.finished .. ' missions finished in this park'
    if parsed.ownerLevel then detail = detail .. ', owner level ' .. parsed.ownerLevel end
    return 'watching', 'Watching ' .. fileName .. ' for park missions.', detail
end

local function save_name(name)
    return name:lower():match('%.thrillvillesavegame$') ~= nil
end

-- Record mode and capture keep using the mission reader.
function D.decoders()
    return reader.decoders()
end

-- Remembers a save's summary while the file is unchanged (main.lua); tests pass no cache.
local function cached(ctx, path, compute)
    if ctx.cached then return ctx.cached(path, compute) end
    return compute()
end

local function scan_folder(ctx, folder)
    local best, bestTime, summaries = nil, -1, {}
    for _, entry in ipairs(ctx.safe_list(folder)) do
        if entry.is_file and not entry.is_symlink and save_name(entry.name) then
            local info = cached(ctx, entry.path, function()
                local bytes = ctx.read_small(entry.path, D.maxBytes)
                local parsed = bytes and D.parse(bytes)
                return { bytes = bytes and #bytes or 0, ok = parsed and true or false,
                    detail = parsed and (parsed.finished .. ' missions finished') or 'unsupported format' }
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
    local base = ctx.getenv('LOCALAPPDATA')
    if not base then return nil, nil end
    local best, summaries = scan_folder(ctx, ctx.fs.join(base, 'LucasArts', 'Thrillville 07', 'Save'))
    return best, #summaries > 0 and summaries or nil
end

-- Accepts a .ThrillvilleSaveGame, the Save folder, or the Thrillville 07 folder above it.
function D.resolve(ctx, path)
    local fs = ctx.fs
    if fs.is_directory(path) then
        local found, summaries = scan_folder(ctx, path)
        if not found and fs.is_directory(fs.join(path, 'Save')) then
            found, summaries = scan_folder(ctx, fs.join(path, 'Save'))
        end
        if found then return found, nil, 'Selected ' .. fs.filename(found) .. ' from the save folder.', summaries end
        return nil, 'no-gameplay-save', nil, summaries
    end
    if not fs.is_file(path) then return nil, 'path-not-found' end
    if not save_name(fs.filename(path) or '') then return nil, 'Pick the .ThrillvilleSaveGame file in Save' end
    local parsed, reason = D.parse(ctx.read_small(path, D.maxBytes) or '')
    if not parsed then return nil, reason end
    return path
end

return D
