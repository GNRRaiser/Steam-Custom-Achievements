-- Assassin's Creed Brotherhood save reader, read-only.
-- The Steam version keeps plain saves in Saved Games\Assassin's Creed Brotherhood\SAVES
-- (ACBROTHERHOODSAVEGAME0.SAV): a 16-byte header (16 00 00 00 AC DB FE 00 ...), then the
-- objects in Anvil compressed blocks (magic 33 AA FB 57 99 FA 04 10, LZO2A chunks).
-- Ubisoft Connect saves wrap the same data in the AC2 layout (548-byte header) and XOR it
-- with a short repeating key that differs between accounts. Once decoded, mission records
-- look like AC2's: completed missions have their progress at 100.
local D = {}

local byte, char, concat = string.byte, string.char, table.concat
local MAGIC = '\51\170\251\87\153\250\4\16'
local MISSION = string.char(17,0,0,0,160,203,218,95,160,203,218,95)

local function u32(s, i)
    local a, b, c, d = byte(s, i, i + 3)
    return a + b * 256 + c * 65536 + d * 16777216
end

-- LZO2A (from the LZO library): a bit flag per item, literal bytes and back references.
local function lzo2a(src, at, limit, outlen)
    local out, n = {}, 0
    local ip, bits, k = at, 0, 0
    local function need(j)
        while k < j do
            if ip > limit then error('truncated') end
            bits = bits + byte(src, ip) * 2 ^ k; ip = ip + 1; k = k + 8
        end
    end
    local function take(j)
        need(j)
        local v = bits % 2 ^ j
        bits = (bits - v) / 2 ^ j; k = k - j
        return v
    end
    local function nextbyte()
        if ip > limit then error('truncated') end
        local v = byte(src, ip); ip = ip + 1
        return v
    end
    while n < outlen do
        if take(1) == 0 then
            n = n + 1; out[n] = nextbyte()
        else
            local t, m
            if take(1) == 0 then
                t = 2 + take(2)
                m = n - nextbyte()
            else
                t = nextbyte()
                local off = t % 32 + nextbyte() * 32
                m = n - off + 1
                t = (t - t % 32) / 32
                if t == 0 then
                    t = 9
                    local v = nextbyte()
                    while v == 0 do t = t + 255; v = nextbyte() end
                    t = t + v
                elseif off == 0 then
                    break
                else
                    t = t + 2
                end
            end
            if m < 1 then error('bad back reference') end
            for _ = 1, t do n = n + 1; out[n] = out[m]; m = m + 1 end
        end
    end
    if n ~= outlen then error('size mismatch') end
    local parts = {}
    for i = 1, n, 4096 do parts[#parts + 1] = char(unpack(out, i, math.min(i + 4095, n))) end
    return concat(parts)
end

-- Bytes 4..7 and 16..31 after the header are always the same; they give the key.
local KNOWN = { [4] = 0xAC, [5] = 0xDB, [6] = 0xFE, [7] = 0x00 }
for i = 1, 8 do KNOWN[15 + i] = byte(MAGIC, i) end
for i, v in ipairs({ 0x01, 0x00, 0x02, 0x00, 0x80, 0x00, 0x00, 0x01 }) do KNOWN[23 + i] = v end

local function find_key(data)
    for length = 1, 16 do
        local key, ok = {}, true
        for pos, plain in pairs(KNOWN) do
            local c = byte(data, 553 + pos)
            if not c then return nil end
            local slot = pos % length
            local value = bit.bxor(c, plain)
            if key[slot] and key[slot] ~= value then ok = false; break end
            key[slot] = value
        end
        if ok then return key, length end
    end
    return nil
end

local function decrypt(data)
    local key, length = find_key(data)
    if not key then return nil end
    local out, bxor = {}, bit.bxor
    local body = #data - 552
    for i = 0, body - 1, 4096 do
        local last = math.min(i + 4095, body - 1)
        local chunk = { byte(data, 553 + i, 553 + last) }
        for j = 1, #chunk do chunk[j] = bxor(chunk[j], key[(i + j - 1) % length]) end
        out[#out + 1] = char(unpack(chunk))
    end
    return concat(out)
end

-- Returns the decompressed objects, or nil and a reason.
function D.decode(data)
    if type(data) ~= 'string' or #data < 64 then return nil, 'Not a Brotherhood save' end
    local plain
    if data:sub(5, 8) == '\172\219\254\0' and data:sub(17, 24) == MAGIC then
        plain = data
    elseif #data >= 600 and u32(data, 1) == 548 then
        plain = decrypt(data)
    end
    if not plain then return nil, 'Not a Brotherhood save' end
    local parts, at = {}, 1
    while true do
        local i = plain:find(MAGIC, at, true)
        if not i then break end
        local maxchunk = u32(plain, i + 11)
        local j = i + 15
        repeat
            if byte(plain, j) ~= 1 then return nil, 'Unknown block layout' end
            local comp, size = u32(plain, j + 1), u32(plain, j + 5)
            if size > maxchunk or j + 13 + comp - 1 > #plain then return nil, 'Unknown block layout' end
            local ok, chunk = pcall(lzo2a, plain, j + 13, math.min(#plain, j + 13 + comp + 15), size)
            if not ok then return nil, 'Damaged block' end
            parts[#parts + 1] = chunk
            j = j + 13 + comp
        until size < maxchunk
        at = j
    end
    if #parts == 0 then return nil, 'No data blocks' end
    return concat(parts)
end

-- Mission id -> 1 (completed) or 0, plus the number completed.
function D.missions(objects)
    local done, total = {}, 0
    local cursor = 1
    while true do
        local magic = objects:find(MISSION, cursor, true)
        if not magic then break end
        cursor = magic + 1
        local start = magic - 8
        if start >= 1 and start + 0x32 <= #objects and byte(objects, start + 0x18) == 0x0B then
            local id = u32(objects, start + 0x19)
            local finished = byte(objects, start + 0x2D) == 0x0B and u32(objects, start + 0x2E) == 100
            if finished and done[id] ~= 1 then total = total + 1 end
            if finished or done[id] == nil then done[id] = finished and 1 or 0 end
        end
    end
    return done, total
end

-- Save file names: ACBROTHERHOODSAVEGAME<n>.SAV (Steam) or <n>.save (Ubisoft Connect).
function D.save_name(name)
    return name:upper():match('^ACBROTHERHOODSAVEGAME%d+%.SAV$') ~= nil or name:match('^%d+%.save$') ~= nil
end

function D.decoders(names)
    return { {
        label = 'Brotherhood missions',
        accepts = function(path) return D.save_name(path:match('[^\\/]+$') or path) end,
        values = function(bytes)
            local objects = D.decode(bytes)
            if not objects then return nil end
            local done, total = D.missions(objects)
            done.total = total
            return done
        end,
        name = function(key)
            if key == 'total' then return 'missions completed' end
            local name = names and names[key]
            return name and ('mission ' .. name) or string.format('mission %08X', key)
        end,
    } }
end

return D
