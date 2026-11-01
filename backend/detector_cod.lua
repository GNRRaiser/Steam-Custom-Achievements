-- Call of Duty 4 / World at War detector: reads the single-player profile's
-- config.cfg (plain text) read-only. The campaign writes two profile dvars there:
--   seta mis_difficulty "4443..."  one digit per level, highest skill finished
--                                  (0 = not finished, 1 Recruit .. 4 Veteran)
--   seta cheat_points "12"         enemy intel collected (CoD 4)
-- Level order and award rules come from the game pack (games.lua). For CoD 4 they
-- mirror maps/_endmission.gsc from the official mod tools.
local D = { maxBytes = 1048576 }

local function dvars(text)
    local values = {}
    for name, value in text:gmatch('[Ss][Ee][Tt][Aa]%s+([%w_]+)%s+"([^"\r\n]*)"') do
        values[name:lower()] = value
    end
    return values
end

function D.parse(bytes)
    if type(bytes) ~= 'string' or #bytes == 0 then return nil, 'Config file is empty' end
    local values = dvars(bytes)
    local mission = values.mis_difficulty
    if not mission or not mission:match('^%d+$') then
        return nil, 'This config.cfg has no campaign progress (mis_difficulty). Pick the single-player profile config.'
    end
    return { dvars = values, mission = mission }
end

local function skill(parsed, position)
    return tonumber(parsed.mission:sub(position, position)) or 0
end

-- rule.levels: 1-based positions; rule.skill: minimum digit; rule.dvar/need: counter.
local function progress(parsed, rule)
    if rule.dvar then
        local have = tonumber(parsed.dvars[rule.dvar]) or 0
        return math.max(0, math.floor(have)), rule.need
    end
    local have = 0
    for _, position in ipairs(rule.levels) do
        if skill(parsed, position) >= rule.skill then have = have + 1 end
    end
    return have, #rule.levels
end

function D.evaluate(parsed, game)
    local earned = {}
    for _, rule in ipairs(game.rules) do
        local have, need = progress(parsed, rule)
        if have >= need then earned[#earned + 1] = rule.index end
    end
    return earned
end

function D.counts(parsed, game)
    local counts = {}
    for _, rule in ipairs(game.rules) do
        local have, need = progress(parsed, rule)
        if need > 1 then counts[tostring(rule.index)] = { have = have, need = need, label = rule.label } end
    end
    return counts
end

function D.describe(parsed, fileName, game)
    local finished = 0
    for position = 1, #game.levels do
        if skill(parsed, position) > 0 then finished = finished + 1 end
    end
    local details = 'Missions finished: ' .. finished .. ' / ' .. #game.levels
        .. ' · mis_difficulty ' .. parsed.mission:sub(1, #game.levels)
    if game.counterDvar then
        details = details .. ' · ' .. game.counterDvar .. ' ' .. (parsed.dvars[game.counterDvar] or '0')
    end
    return 'watching', 'Watching ' .. fileName .. ' for campaign progress.', details
end

-- Profiles live in <install>/players/profiles/<name>/config.cfg, in the UAC
-- VirtualStore copy of that folder, or under %LOCALAPPDATA%\Activision\<folder>.
local function profile_roots(ctx, game)
    local roots = {}
    local localAppData = ctx.getenv('LOCALAPPDATA')
    for _, install in ipairs(ctx.install_dirs()) do
        roots[#roots + 1] = ctx.fs.join(install, 'players', 'profiles')
        local rest = install:match('^%a:[\\/](.*)$')
        if localAppData and rest then
            roots[#roots + 1] = ctx.fs.join(localAppData, 'VirtualStore', rest, 'players', 'profiles')
        end
    end
    if localAppData then
        for _, folder in ipairs(game.appDataFolders or {}) do
            roots[#roots + 1] = ctx.fs.join(localAppData, 'Activision', folder, 'players', 'profiles')
        end
    end
    return roots
end

local function scan_profiles(ctx, root, best, bestTime, summaries)
    for _, profile in ipairs(ctx.safe_list(root)) do
        if profile.is_directory and not profile.is_symlink then
            local path = ctx.fs.join(profile.path, 'config.cfg')
            if ctx.fs.is_file(path) then
                local parsed = D.parse(ctx.read_small(path, D.maxBytes) or '')
                local time = ctx.fs.last_write_time(path) or 0
                summaries[#summaries + 1] = { name = profile.name .. '/config.cfg',
                    detail = parsed and 'campaign profile' or 'no campaign progress' }
                if parsed and time > bestTime then best, bestTime = path, time end
            end
        end
    end
    return best, bestTime
end

function D.locate(ctx, game)
    local best, bestTime, summaries = nil, -1, {}
    for _, root in ipairs(profile_roots(ctx, game)) do
        best, bestTime = scan_profiles(ctx, root, best, bestTime, summaries)
    end
    return best, #summaries > 0 and summaries or nil
end

-- Accepts config.cfg itself, a profile folder, the profiles folder, players or the install folder.
function D.resolve(ctx, path)
    local fs = ctx.fs
    if fs.is_directory(path) then
        local direct = fs.join(path, 'config.cfg')
        if fs.is_file(direct) then return D.resolve(ctx, direct) end
        local best, bestTime, summaries = nil, -1, {}
        for _, root in ipairs({ path, fs.join(path, 'profiles'), fs.join(path, 'players', 'profiles') }) do
            if fs.is_directory(root) then best, bestTime = scan_profiles(ctx, root, best, bestTime, summaries) end
        end
        if best then return best, nil, 'Selected the newest profile config in that folder.', summaries end
        return nil, 'no-gameplay-save', nil, summaries
    end
    if not fs.is_file(path) then return nil, 'path-not-found' end
    local parsed, reason = D.parse(ctx.read_small(path, D.maxBytes) or '')
    if not parsed then return nil, reason end
    return path
end

return D
