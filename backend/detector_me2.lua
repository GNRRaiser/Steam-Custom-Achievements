-- Mass Effect 2 detector: reads the game's own achievement record, read-only.
-- The PC version shows its achievements in the main menu (Extras) and keeps them in
-- Documents\BioWare\Mass Effect 2\BIOGame\Profile\Player1.prf, shared by every character:
--   20-byte hash, big-endian uncompressed size, then LZO1X data holding the Unreal Engine 3
--   profile settings (count, then {owner, id, type, value, advertisement} entries).
-- Settings 0x32 and 0x33 are the achievement bits: bit N of 0x32 is AchievementID N (0-31)
-- and bit N of 0x33 is AchievementID 32 + N, as listed in BioGame\Config\PC\Cooked\Coalesced.ini
-- and the DLC BIOGame.ini files (StaticAchievementData).
local lzo = require('lzo1x')

local D = { maxBytes = 1048576 }

local byte, floor = string.byte, math.floor
local unpack = unpack or table.unpack
local MASKS = { [0] = 0x32, [1] = 0x33 }

local function u32be(s, i)
    local a, b, c, d = byte(s, i, i + 3)
    if not d then return nil end
    return ((a * 256 + b) * 256 + c) * 256 + d
end

local function i32be(s, i)
    local v = u32be(s, i)
    if v and v >= 2147483648 then v = v - 4294967296 end
    return v
end

-- Value sizes by setting type: 1 int32, 2 int64, 3 double, 5 float, 7 date, 8 byte;
-- 4 (UTF-16 string, length in characters) and 6 (blob, length in bytes) are length-prefixed.
local FIXED = { [0] = 0, [1] = 4, [2] = 8, [3] = 8, [5] = 4, [7] = 8, [8] = 1 }

local function settings(data)
    local count = u32be(data, 1)
    if not count or count > 4096 then return nil end
    local list, pos = {}, 5
    for _ = 1, count do
        local id, kind = u32be(data, pos + 1), byte(data, pos + 5)
        if not kind then return nil end
        pos = pos + 6
        local size = FIXED[kind]
        if kind == 1 then
            list[id] = i32be(data, pos)
        elseif kind == 4 or kind == 6 then
            local length = i32be(data, pos)
            if not length or length < 0 then return nil end
            size = 4 + (kind == 4 and length * 2 or length)
        elseif not size then
            return nil
        end
        pos = pos + size + 1
        if pos > #data + 1 then return nil end
    end
    return list
end

function D.parse(bytes)
    if type(bytes) ~= 'string' or #bytes < 28 then return nil, 'Pick Player1.prf' end
    local size = u32be(bytes, 21)
    if not size or size < 4 or size > 65536 then return nil, 'Pick Player1.prf' end
    local data = lzo.decompress(bytes, 25)
    if not data or #data ~= size then return nil, 'Unrecognized profile layout' end
    local values = settings(data)
    if not values or not values[MASKS[0]] or not values[MASKS[1]] then return nil, 'Unrecognized profile layout' end
    local bits, unlocked = {}, 0
    for word = 0, 1 do
        local v = values[MASKS[word]]
        if v < 0 then v = v + 4294967296 end
        for bit = 0, 31 do
            if floor(v / 2 ^ bit) % 2 == 1 then
                bits[word * 32 + bit], unlocked = true, unlocked + 1
            end
        end
    end
    return { bits = bits, values = values, unlocked = unlocked }
end

function D.evaluate(parsed, game)
    local list = {}
    for _, rule in ipairs(game.rules) do
        if parsed.bits[rule.id] then list[#list + 1] = rule.index end
    end
    return list
end

function D.counts()
    return {}
end

function D.describe(parsed, fileName)
    return 'watching', 'Watching ' .. fileName .. ' for achievements the game has recorded.',
        parsed.unlocked .. ' achievements recorded in the profile'
end

-- Record mode and capture: the profile compares as its numbered settings.
function D.decoders()
    return { {
        label = 'Mass Effect 2 profile',
        accepts = function(path) return (path:match('[^\\/]+$') or path):lower():match('%.prf$') ~= nil end,
        values = function(bytes)
            local parsed = D.parse(bytes)
            if not parsed then return nil end
            local values = {}
            for id, v in pairs(parsed.values) do values[string.format('setting 0x%x', id)] = v end
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
        list[#list + 1] = ctx.fs.join(path, 'BioWare', 'Mass Effect 2', 'BIOGame', 'Profile', 'Player1.prf')
    end
    return list
end

function D.locate(ctx)
    for _, path in ipairs(candidates(ctx)) do
        if ctx.fs.is_file(path) then return path, { { name = ctx.fs.filename(path), detail = 'achievement profile' } } end
    end
    return nil, nil
end

-- Accepts Player1.prf, its Profile folder, or the Mass Effect 2 / BIOGame folder above it.
function D.resolve(ctx, path)
    local fs = ctx.fs
    if fs.is_directory(path) then
        for _, inside in ipairs({ { 'Player1.prf' }, { 'Profile', 'Player1.prf' }, { 'BIOGame', 'Profile', 'Player1.prf' } }) do
            local file = fs.join(path, unpack(inside))
            if fs.is_file(file) then return file, nil, 'Selected Player1.prf.' end
        end
        return nil, 'no-gameplay-save'
    end
    if not fs.is_file(path) then return nil, 'path-not-found' end
    if not (fs.filename(path) or ''):lower():match('%.prf$') then return nil, 'Pick Player1.prf' end
    local parsed, reason = D.parse(ctx.read_small(path, D.maxBytes) or '')
    if not parsed then return nil, reason end
    return path
end

return D
