-- Minimal LZO1X decompressor for LuaJIT 2.1 / Lua 5.1, read-only.
-- Mass Effect 2 compresses its profile (BIOGame\Profile\Player1.prf) with LZO1X-1.
local M = {}

local byte, char, concat, floor = string.byte, string.char, table.concat, math.floor
local unpack = unpack or table.unpack

local function run(src, ip)
    local out, len = {}, 0
    local function literals(k)
        for i = 0, k - 1 do out[len + 1 + i] = byte(src, ip + i) or error('truncated') end
        len, ip = len + k, ip + k
    end
    local function copy(dist, k)
        if dist < 1 or dist > len then error('bad distance') end
        for _ = 1, k do len = len + 1; out[len] = out[len - dist] end
    end
    local function next_byte()
        local b = byte(src, ip) or error('truncated')
        ip = ip + 1
        return b
    end
    -- A zero byte run extends a length: each zero adds 255, then the next byte is added.
    local function extend(base)
        local k = 0
        local b = next_byte()
        while b == 0 do k = k + 255; b = next_byte() end
        return k + base + b
    end
    -- state: 0 after a match with no trailing literals, 1-3 after that many, 4 after a literal run.
    local state = 0
    local t = byte(src, ip) or error('empty')
    if t > 17 then
        ip = ip + 1
        literals(t - 17)
        state = t - 17 >= 4 and 4 or t - 17
    end
    while true do
        t = next_byte()
        local dist, k, tail
        if t < 16 then
            if state == 0 then
                if t == 0 then t = extend(15) end
                literals(t + 3)
                state = 4
            else
                dist = floor(t / 4) + next_byte() * 4 + (state < 4 and 1 or 2049)
                copy(dist, state < 4 and 2 or 3)
                tail = t % 4
            end
        elseif t >= 64 then
            dist = floor(t / 4) % 8 + next_byte() * 8 + 1
            copy(dist, floor(t / 32) + 1)
            tail = t % 4
        else
            if t >= 32 then
                k = t % 32
                if k == 0 then k = extend(31) end
                dist = 1
            else
                k = t % 8
                if k == 0 then k = extend(7) end
                dist = (floor(t / 8) % 2) * 16384
            end
            local v = next_byte()
            v = v + next_byte() * 256
            if t < 32 then
                dist = dist + floor(v / 4)
                if dist == 0 then break end -- end of stream
                dist = dist + 16384
            else
                dist = dist + floor(v / 4)
            end
            copy(dist, k + 2)
            tail = v % 4
        end
        if tail then
            literals(tail)
            state = tail
        end
    end
    local parts = {}
    for i = 1, len, 4096 do parts[#parts + 1] = char(unpack(out, i, math.min(i + 4095, len))) end
    return concat(parts)
end

-- Decompresses src from byte position start; nil when the data is damaged.
function M.decompress(src, start)
    local ok, result = pcall(run, src, start or 1)
    if ok then return result end
    return nil
end

return M
