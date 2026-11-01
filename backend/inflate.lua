-- Minimal DEFLATE decoder (RFC 1951) for LuaJIT 2.1 / Lua 5.1, read-only.
-- Unlike most decoders it also accepts a stream that ends on a block boundary
-- without a final block, which is how Fable III writes its sync-flushed saves.
local M = {}

local byte, char, concat = string.byte, string.char, table.concat

local LEN_BASE = { 3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258 }
local LEN_EXTRA = { 0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0 }
local DIST_BASE = { 1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,
    4097,6145,8193,12289,16385,24577 }
local DIST_EXTRA = { 0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13 }
local CL_ORDER = { 16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15 }

-- Canonical Huffman table: counts[len] and symbols in code order.
local function build(lengths, n)
    local counts, offs, symbols = {}, {}, {}
    for i = 0, 15 do counts[i] = 0 end
    for s = 0, n - 1 do counts[lengths[s] or 0] = counts[lengths[s] or 0] + 1 end
    counts[0] = 0
    offs[1] = 0
    for i = 1, 14 do offs[i + 1] = offs[i] + counts[i] end
    for s = 0, n - 1 do
        local len = lengths[s] or 0
        if len ~= 0 then symbols[offs[len]] = s; offs[len] = offs[len] + 1 end
    end
    return { counts = counts, symbols = symbols }
end

local fixedLit, fixedDist
do
    local l = {}
    for s = 0, 143 do l[s] = 8 end
    for s = 144, 255 do l[s] = 9 end
    for s = 256, 279 do l[s] = 7 end
    for s = 280, 287 do l[s] = 8 end
    fixedLit = build(l, 288)
    local d = {}
    for s = 0, 29 do d[s] = 5 end
    fixedDist = build(d, 30)
end

local Truncated = {}

-- Decodes data (a string) starting at byte `start` (1-based). Returns the output string.
function M.raw(data, start, maxOut)
    local pos, bitbuf, bitcnt = start or 1, 0, 0
    local size = #data
    local out, outn = {}, 0
    local window = {}           -- output bytes as numbers, for back-references
    local limit = maxOut or 67108864

    local function need(n)
        while bitcnt < n do
            if pos > size then error(Truncated) end
            bitbuf = bitbuf + byte(data, pos) * 2 ^ bitcnt
            pos, bitcnt = pos + 1, bitcnt + 8
        end
    end
    local function bits(n)
        if n == 0 then return 0 end
        need(n)
        local p = 2 ^ n
        local v = bitbuf % p
        bitbuf, bitcnt = (bitbuf - v) / p, bitcnt - n
        return v
    end
    local function decode(h)
        local code, first, index = 0, 0, 0
        for len = 1, 15 do
            code = code + bits(1)
            local count = h.counts[len]
            if code - count < first then return h.symbols[index + (code - first)] end
            index, first = index + count, (first + count) * 2
            code = code * 2
        end
        error('invalid Huffman code')
    end
    local function emit(b)
        outn = outn + 1
        window[outn] = b
        if outn > limit then error('output too large') end
    end

    local ok, err = pcall(function()
        while true do
            if pos > size and bitcnt < 3 then return end      -- clean end after a sync flush
            local final = bits(1)
            local kind = bits(2)
            if kind == 0 then
                bitbuf, bitcnt = 0, 0                         -- align to a byte
                if pos + 3 > size then error(Truncated) end
                local len = byte(data, pos) + byte(data, pos + 1) * 256
                pos = pos + 4
                if pos + len - 1 > size then error(Truncated) end
                for i = pos, pos + len - 1 do emit(byte(data, i)) end
                pos = pos + len
            elseif kind == 1 or kind == 2 then
                local lit, dist = fixedLit, fixedDist
                if kind == 2 then
                    local hlit, hdist, hclen = bits(5) + 257, bits(5) + 1, bits(4) + 4
                    local cl = {}
                    for i = 1, hclen do cl[CL_ORDER[i]] = bits(3) end
                    local clh = build(cl, 19)
                    local lengths, i = {}, 0
                    while i < hlit + hdist do
                        local sym = decode(clh)
                        if sym < 16 then lengths[i] = sym; i = i + 1
                        else
                            local rep, val = 0, 0
                            if sym == 16 then
                                if i == 0 then error('bad repeat') end
                                val, rep = lengths[i - 1], 3 + bits(2)
                            elseif sym == 17 then rep = 3 + bits(3)
                            else rep = 11 + bits(7) end
                            for _ = 1, rep do lengths[i] = val; i = i + 1 end
                        end
                    end
                    local ll, dl = {}, {}
                    for s = 0, hlit - 1 do ll[s] = lengths[s] end
                    for s = 0, hdist - 1 do dl[s] = lengths[hlit + s] end
                    lit, dist = build(ll, hlit), build(dl, hdist)
                end
                while true do
                    local sym = decode(lit)
                    if sym < 256 then emit(sym)
                    elseif sym == 256 then break
                    else
                        sym = sym - 257
                        local len = LEN_BASE[sym + 1] + bits(LEN_EXTRA[sym + 1])
                        local d = decode(dist)
                        local back = DIST_BASE[d + 1] + bits(DIST_EXTRA[d + 1])
                        if back > outn then error('distance too far back') end
                        for _ = 1, len do emit(window[outn - back + 1]) end
                    end
                end
            else
                error('invalid block type')
            end
            if final == 1 then return end
        end
    end)
    if not ok and err ~= Truncated then return nil, tostring(err) end
    if not ok and err == Truncated and outn == 0 then return nil, 'truncated' end
    for i = 1, outn, 4096 do
        out[#out + 1] = char(unpack(window, i, math.min(i + 4095, outn)))
    end
    return concat(out), not ok and 'truncated' or nil
end

-- zlib wrapper: 2-byte header, then raw deflate. The Adler-32 trailer is not required.
function M.zlib(data)
    if #data < 2 then return nil, 'too short' end
    local cmf, flg = byte(data, 1), byte(data, 2)
    if cmf % 16 ~= 8 or (cmf * 256 + flg) % 31 ~= 0 then return nil, 'not a zlib stream' end
    return M.raw(data, 3)
end

return M
