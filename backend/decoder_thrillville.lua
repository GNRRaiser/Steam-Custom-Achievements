-- Thrillville: Off the Rails save reader for capture and record mode, read-only.
-- A .ThrillvilleSaveGame (in %LOCALAPPDATA%\LucasArts\Thrillville 07\Save) is an RGMH file
-- whose MSSN block lists each park's missions and people: 0xFC, the name with its last
-- character's top bit set (P1_G_Bandito, P1MOLLY), then a few small status bytes mixed with
-- 4-byte words whose first byte has the top bit set. The status bytes are what change when a
-- mission is played (e.g. 03 00 00 00 00 -> 04 03 00 00 03), so they are listed by name.
local D = {}

local byte, char = string.byte, string.char
local MAX_STATUS = 32

-- Name and status text, or nil when pos does not start a record.
local function record(bytes, pos)
    local name = {}
    local i = pos + 1
    while #name < 40 do
        local b = byte(bytes, i)
        if not b then return nil end
        local c = b >= 128 and b - 128 or b
        if not (c == 95 or (c >= 48 and c <= 57) or (c >= 65 and c <= 90) or (c >= 97 and c <= 122)) then return nil end
        name[#name + 1] = char(c)
        i = i + 1
        if b >= 128 then break end
    end
    if #name < 3 or byte(bytes, i - 1) < 128 then return nil end
    name = table.concat(name)
    if not name:match('^P%d') then return nil end
    local status, stop = {}, math.min(#bytes, i + MAX_STATUS - 1)
    while i <= stop do
        local b = byte(bytes, i)
        if b == 0xFC then break end
        if b >= 128 then
            -- A 4-byte word, unless the next record starts inside it.
            local inside = bytes:find('\252', i + 1, true)
            if inside and inside < i + 4 then break end
            i = i + 4
        else
            status[#status + 1] = string.format('%02X', b)
            i = i + 1
        end
    end
    -- The status is the last five bytes (state, medal, 00 00, medal); padding before it varies.
    return name, table.concat(status, ' ', math.max(1, #status - 4))
end

-- Every mission and person record by name, in file order of first appearance.
function D.records(bytes)
    if type(bytes) ~= 'string' or bytes:sub(1, 4) ~= 'RGMH' then return nil end
    local found, count, pos = {}, 0, 1
    while true do
        pos = bytes:find('\252', pos, true)
        if not pos then break end
        local name, status = record(bytes, pos)
        if name and found[name] == nil then found[name], count = status, count + 1 end
        pos = pos + 1
    end
    if count == 0 then return nil end
    return found, count
end

function D.decoders()
    return { {
        label = 'Thrillville missions',
        accepts = function(path) return (path:match('[^\\/]+$') or path):lower():match('%.thrillvillesavegame$') ~= nil end,
        values = function(bytes) return (D.records(bytes)) end,
        name = function(key)
            return (key:find('_', 1, true) and 'mission ' or 'person ') .. key
        end,
    } }
end

return D
