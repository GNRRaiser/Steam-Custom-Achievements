-- Capture while I play: during normal play, every save file the game writes is copied with
-- a timestamp, and a log line says which values changed. Nothing to press; the history is
-- sent in later to map more achievements. Game files are only read. Each tick lists file
-- sizes and times only; a file is read when it changes, and copied once it is stable.
local recorder = require('recorder')
local C = { INTERVAL = 5, MAX_BYTES = 1073741824, MEMORY = 67108864, MAX_FILE = 16777216 }

local function list(ctx, root)
    local found = {}
    local function walk(folder, prefix, depth)
        for _, entry in ipairs(ctx.safe_list(folder)) do
            if not entry.is_symlink then
                local rel = prefix == '' and entry.name or (prefix .. '\\' .. entry.name)
                if entry.is_file then
                    local ok, time = pcall(ctx.fs.last_write_time, entry.path)
                    found[rel] = { path = entry.path, size = entry.size or 0, time = ok and time or 0 }
                elseif entry.is_directory and depth > 0 then
                    walk(entry.path, rel, depth - 1)
                end
            end
        end
    end
    walk(root, '', 3)
    return found
end

function C.new(folder)
    return { enabled = true, folder = folder, events = 0, written = 0, recent = {}, bytes = {}, savedBefore = {}, held = 0, last = -C.INTERVAL }
end

-- Bytes already in the capture folder, so the limit holds across Steam restarts.
function C.measure(cap, ctx, out, prefix)
    local total = 0
    for _, entry in ipairs(ctx.safe_list(out)) do
        if entry.is_file and entry.name:sub(1, #prefix) == prefix then total = total + (entry.size or 0) end
    end
    cap.existing = total
end

local function remember(cap, rel, bytes)
    local old = cap.bytes[rel]
    if old then cap.held = cap.held - #old end
    if bytes and cap.held + #bytes <= C.MEMORY then
        cap.bytes[rel], cap.held = bytes, cap.held + #bytes
    else
        cap.bytes[rel] = nil
    end
end

local function note(cap, line)
    cap.recent[#cap.recent + 1] = line
    while #cap.recent > 12 do table.remove(cap.recent, 1) end
end

local function value_text(v)
    if v == nil then return '(none)' end
    return tostring(v)
end

-- One poll. out is the capture folder (or nil when nothing can be written).
function C.tick(cap, ctx, now, out, prefix, join, decoders, extra)
    if not cap.enabled or now - cap.last < C.INTERVAL then return end
    cap.last = now
    if not ctx.fs.is_directory(cap.folder) then cap.problem = 'Save folder not found'; return end
    cap.problem = nil
    local files = list(ctx, cap.folder)
    if not cap.meta then
        -- First look this session: remember the current state as the starting point.
        cap.meta = files
        for rel, info in pairs(files) do
            if info.size <= C.MAX_FILE then remember(cap, rel, ctx.read_small(info.path, C.MAX_FILE)) end
        end
        return
    end
    local changed, signature = {}, {}
    for rel, info in pairs(files) do
        local old = cap.meta[rel]
        if not old or old.size ~= info.size or old.time ~= info.time then
            changed[#changed + 1] = rel
            signature[#signature + 1] = rel .. '|' .. info.size .. '|' .. info.time
        end
    end
    if #changed == 0 then cap.pending = nil; return end
    table.sort(changed)
    table.sort(signature)
    signature = table.concat(signature, '\n')
    -- Copy only once the game has finished writing: the same change seen on two polls.
    if cap.pending ~= signature then cap.pending = signature; return end
    cap.pending = nil
    if not out then cap.problem = 'No folder to save captures in'; cap.meta = files; return end
    if (cap.existing or 0) + cap.written > C.MAX_BYTES then
        cap.enabled, cap.problem = false, 'Stopped: the capture folder reached 1 GB. Send it in, then empty it and turn capture on again.'
        return
    end
    local stamp = os.date('%Y-%m-%d %H%M%S', now)
    local log = { os.date('%Y-%m-%d %H:%M:%S', now) .. (extra and ('  ' .. extra) or '') }
    local copied = 0
    for _, rel in ipairs(changed) do
        local info = files[rel]
        local bytes = info.size <= C.MAX_FILE and ctx.read_small(info.path, C.MAX_FILE) or nil
        local before = cap.bytes[rel]
        if bytes and bytes ~= before then
            local safe = rel:gsub('[\\/:*?"<>|]', '_')
            -- The version before the first change this session is kept too.
            if before and not cap.savedBefore[rel] then
                local file = io.open(join(out, prefix .. stamp .. ' before ' .. safe), 'wb')
                if file then file:write(before); file:close(); cap.written = cap.written + #before end
            end
            cap.savedBefore[rel] = true
            local file = io.open(join(out, prefix .. stamp .. ' ' .. safe), 'wb')
            if file then file:write(bytes); file:close(); cap.written = cap.written + #bytes; copied = copied + 1 end
            local line = '  ' .. rel .. (before and '' or ' (new)')
            if before then
                local diff = recorder.compare({ files = { [rel] = before } }, { files = { [rel] = bytes } }, {}, decoders)
                local entry = diff[1]
                local findings = entry and entry.findings or {}
                local parts = {}
                for i = 1, math.min(#findings, 8) do
                    local f = findings[i]
                    parts[#parts + 1] = f.where .. ' ' .. value_text(f.old) .. ' -> ' .. value_text(f.new)
                end
                if #findings > 8 then parts[#parts + 1] = (#findings - 8) .. ' more' end
                if #parts > 0 then line = line .. ': ' .. table.concat(parts, '; ') end
            end
            log[#log + 1] = line
            note(cap, os.date('%H:%M:%S', now) .. line)
        end
        remember(cap, rel, bytes)
    end
    cap.meta = files
    if copied > 0 then
        cap.events, cap.lastEvent = cap.events + 1, os.date('%Y-%m-%d %H:%M:%S', now)
        local file = io.open(join(out, prefix .. 'capture log.txt'), 'ab')
        if file then file:write(table.concat(log, '\r\n') .. '\r\n\r\n'); file:close() end
    end
end

function C.summary(cap, fs)
    if not cap then return { enabled = false } end
    return { enabled = cap.enabled, folderName = fs.filename(cap.folder), events = cap.events,
        megabytes = math.floor(((cap.existing or 0) + cap.written) / 104857.6 + 0.5) / 10,
        lastEvent = cap.lastEvent, problem = cap.problem, recent = cap.recent }
end

return C
