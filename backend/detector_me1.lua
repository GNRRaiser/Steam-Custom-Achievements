-- Mass Effect detector: reads the game's own achievement record, read-only.
-- The PC version keeps the Xbox 360 achievements in Documents\BioWare\Mass Effect\Save\
-- Profile.MassEffectProfile, an Unreal Engine 3 package holding one BioGamerProfile object:
--   anAchievementStates  50 ints, one per achievement ID (1-50), non-zero once unlocked
--   RewardStats          counters such as PistolKills with Value, UnlockedAt (the target),
--                        AchievementId and IsAchievementUnlocked
-- The profile is shared by every character, like achievements on the Xbox.
local D = { maxBytes = 4194304 }

local byte = string.byte

local function i32(s, i)
    local a, b, c, d = byte(s, i, i + 3)
    if not d then return nil end
    local v = a + b * 256 + c * 65536 + d * 16777216
    if v >= 2147483648 then v = v - 4294967296 end
    return v
end

-- Walks a property list (name, type, size, array index, value) until "None".
local function properties(data, names, pos, stop, visit)
    while pos + 7 <= stop do
        local name = names[i32(data, pos)]
        if not name then return nil end
        if name == 'None' then return pos + 8 end
        if pos + 23 > stop then return nil end
        local kind = names[i32(data, pos + 8)]
        local size = i32(data, pos + 16)
        if not kind or not size or size < 0 then return nil end
        pos = pos + 24
        if kind == 'StructProperty' then pos = pos + 8 end
        if kind == 'BoolProperty' and size == 0 then size = 4 end
        if pos + size > stop + 1 then return nil end
        visit(name, kind, pos, size)
        pos = pos + size
    end
    return nil
end

function D.parse(bytes)
    if type(bytes) ~= 'string' or #bytes < 64 or i32(bytes, 1) ~= -1641380927 then
        return nil, 'Pick Profile.MassEffectProfile'
    end
    local folder = i32(bytes, 13)
    if not folder or folder < 0 or folder > 256 then return nil, 'Unrecognized profile layout' end
    local at = 17 + folder + 4
    local nameCount, nameOffset = i32(bytes, at), i32(bytes, at + 4)
    local exportCount, exportOffset = i32(bytes, at + 8), i32(bytes, at + 12)
    if not exportOffset or nameCount < 1 or nameCount > 4096 or exportCount < 1 then return nil, 'Unrecognized profile layout' end
    local names, pos = {}, nameOffset + 1
    for index = 0, nameCount - 1 do
        local length = i32(bytes, pos)
        if not length or length < 1 or length > 1024 then return nil, 'Unrecognized profile layout' end
        names[index] = bytes:sub(pos + 4, pos + 2 + length)
        pos = pos + 4 + length + 8
    end
    if names[i32(bytes, exportOffset + 1 + 12)] ~= 'BioGamerProfile' then return nil, 'Not a Mass Effect profile' end
    local size, offset = i32(bytes, exportOffset + 1 + 32), i32(bytes, exportOffset + 1 + 36)
    if not offset or offset + size > #bytes then return nil, 'Profile is incomplete' end
    local states, stats = nil, {}
    local finished = properties(bytes, names, offset + 1 + 4, offset + size, function(name, kind, p, length)
        if name == 'anAchievementStates' and kind == 'ArrayProperty' then
            local count = i32(bytes, p)
            if count and count >= 0 and count * 4 + 4 == length then
                states = {}
                for i = 1, count do states[i] = i32(bytes, p + i * 4) end
            end
        elseif name == 'RewardStats' and kind == 'ArrayProperty' then
            local count, q = i32(bytes, p), p + 4
            for _ = 1, count or 0 do
                local stat = {}
                q = properties(bytes, names, q, p + length - 1, function(field, fieldKind, r, n)
                    if fieldKind == 'StrProperty' then
                        local len = i32(bytes, r)
                        if len and len > 0 and len <= n then stat[field] = bytes:sub(r + 4, r + 2 + len) end
                    elseif fieldKind == 'IntProperty' or fieldKind == 'BoolProperty' then
                        stat[field] = i32(bytes, r)
                    end
                end)
                if not q then break end
                if stat.sName then stats[stat.sName] = stat end
            end
        end
    end)
    if not finished or not states then return nil, 'Unrecognized profile layout' end
    -- Which slot holds achievement 1? Slot 1 (the expected layout) unless counters the
    -- game has already marked unlocked say otherwise.
    local base, votes = 0, { [0] = 0, [1] = 0 }
    for _, stat in pairs(stats) do
        local id = stat.AchievementId
        if id and stat.IsAchievementUnlocked and stat.IsAchievementUnlocked ~= 0 then
            if (states[id] or 0) ~= 0 then votes[0] = votes[0] + 1 end
            if (states[id + 1] or 0) ~= 0 then votes[1] = votes[1] + 1 end
        end
    end
    if votes[1] > votes[0] then base = 1 end
    local unlocked = 0
    for _, v in ipairs(states) do if v ~= 0 then unlocked = unlocked + 1 end end
    return { states = states, stats = stats, base = base, unlocked = unlocked, slots = #states }
end

local function earned(parsed, rule)
    if rule.stat then
        local stat = parsed.stats[rule.stat]
        if stat and ((stat.IsAchievementUnlocked or 0) ~= 0 or (stat.Value or 0) >= (stat.UnlockedAt or rule.need or 1e12)) then
            return true
        end
    end
    return (parsed.states[rule.id + parsed.base] or 0) ~= 0
end

function D.evaluate(parsed, game)
    local list = {}
    for _, rule in ipairs(game.rules) do
        if earned(parsed, rule) then list[#list + 1] = rule.index end
    end
    return list
end

function D.counts(parsed, game)
    local counts = {}
    for _, rule in ipairs(game.rules) do
        local stat = rule.stat and parsed.stats[rule.stat]
        if stat and stat.Value then
            counts[tostring(rule.index)] = { have = math.max(stat.Value, 0), need = stat.UnlockedAt or rule.need, label = rule.label }
        end
    end
    return counts
end

function D.describe(parsed, fileName)
    return 'watching', 'Watching ' .. fileName .. ' for achievements the game has recorded.',
        parsed.unlocked .. ' of ' .. parsed.slots .. ' achievements recorded in the profile'
end

-- Record mode and capture: the profile compares as named achievement slots and counters.
function D.decoders()
    return { {
        label = 'Mass Effect profile',
        accepts = function(path) return (path:match('[^\\/]+$') or path):lower() == 'profile.masseffectprofile' end,
        values = function(bytes)
            local parsed = D.parse(bytes)
            if not parsed then return nil end
            local values = {}
            for i, v in ipairs(parsed.states) do values['achievement slot ' .. i] = v end
            for name, stat in pairs(parsed.stats) do values[name] = stat.Value end
            return values
        end,
        name = function(key) return key end,
    } }
end

local function candidates(ctx)
    local home = ctx.getenv('USERPROFILE')
    if not home then return {} end
    local list = {}
    for _, docs in ipairs({ { 'Documents' }, { 'OneDrive', 'Documents' } }) do
        local path = home
        for _, part in ipairs(docs) do path = ctx.fs.join(path, part) end
        list[#list + 1] = ctx.fs.join(path, 'BioWare', 'Mass Effect', 'Save', 'Profile.MassEffectProfile')
    end
    return list
end

function D.locate(ctx)
    for _, path in ipairs(candidates(ctx)) do
        if ctx.fs.is_file(path) then return path, { { name = ctx.fs.filename(path), detail = 'achievement profile' } } end
    end
    return nil, nil
end

function D.resolve(ctx, path)
    local fs = ctx.fs
    if fs.is_directory(path) then
        local inside = fs.join(path, 'Profile.MassEffectProfile')
        if fs.is_file(inside) then return inside, nil, 'Selected Profile.MassEffectProfile.' end
        return nil, 'no-gameplay-save'
    end
    if not fs.is_file(path) then return nil, 'path-not-found' end
    local parsed, reason = D.parse(ctx.read_small(path, D.maxBytes) or '')
    if not parsed then return nil, reason end
    return path
end

return D
