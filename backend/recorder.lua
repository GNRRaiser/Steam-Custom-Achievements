-- Record mode: snapshot a game's save folder, let the player earn one achievement, then
-- compare. It works like a memory inspector, but on save files: every value that changed
-- is listed next to what the achievement asks for. Game files are only read. On Done,
-- copies of the changed files (before and after) and a report go into the recordings folder.
local R = {}

local MAX_FILE, MAX_TOTAL, MAX_FILES, MAX_DEPTH = 16777216, 67108864, 300, 3
local MAX_FINDINGS = 60

local function be32(s, p) local a, b, c, d = s:byte(p, p + 3); return ((a * 256 + b) * 256 + c) * 256 + d end
local function le32(s, p) local a, b, c, d = s:byte(p, p + 3); return ((d * 256 + c) * 256 + b) * 256 + a end
local function le16(s, p) local a, b = s:byte(p, p + 1); return b * 256 + a end

-- Every regular file under root, read into memory (bounded).
function R.snapshot(ctx, root)
    local files, total, count, skipped = {}, 0, 0, 0
    local function walk(folder, prefix, depth)
        for _, entry in ipairs(ctx.safe_list(folder)) do
            if not entry.is_symlink then
                local rel = prefix == '' and entry.name or (prefix .. '\\' .. entry.name)
                if entry.is_file then
                    if count >= MAX_FILES or (entry.size or 0) > MAX_FILE or total + (entry.size or 0) > MAX_TOTAL then
                        skipped = skipped + 1
                    else
                        local bytes = ctx.read_small(entry.path, MAX_FILE)
                        if bytes then files[rel], total, count = bytes, total + #bytes, count + 1 end
                    end
                elseif entry.is_directory and depth > 0 then
                    walk(entry.path, rel, depth - 1)
                end
            end
        end
    end
    walk(root, '', MAX_DEPTH)
    return { files = files, count = count, bytes = total, skipped = skipped }
end

-- Numbers the achievement text asks for, e.g. "Collect all 50 Silver Keys and 4 Gold Keys" -> 50, 4, 54.
function R.targets(detail)
    local list, seen, sum, n = {}, {}, 0, 0
    for digits in tostring(detail or ''):gmatch('%d[%d,]*') do
        local value = tonumber((digits:gsub(',', '')))
        if value and value >= 2 and not seen[value] then
            seen[value], list[#list + 1] = true, value
            sum, n = sum + value, n + 1
        end
    end
    if n > 1 and not seen[sum] then list[#list + 1] = sum end
    return list
end

local function judge(old, new, targets)
    for _, t in ipairs(targets) do
        if new == t then return 'match' end
    end
    if old and new and new > old then
        for _, t in ipairs(targets) do
            if new < t then return 'rising' end
        end
    end
    return nil
end

local function is_text(bytes)
    local sample = bytes:sub(1, 4096)
    if sample:find('\0', 1, true) then return false end
    local odd = select(2, sample:gsub('[^\9\10\13\32-\126\128-\255]', ''))
    return odd * 20 < #sample + 1
end

local function line_key(line)
    local a, b = line:match('^%s*(%S+)%s+(%S+)')
    if a and (a == 'seta' or a == 'set' or a == 'bind') then return a .. ' ' .. b end
    local k = line:match('^%s*([^=:]+)[=:]')
    return k and k:gsub('%s+$', '') or nil
end

local function split_lines(text)
    local lines = {}
    for line in (text .. '\n'):gmatch('([^\r\n]*)\r?\n') do lines[#lines + 1] = line end
    return lines
end

-- Lines of a that are not in b, counting duplicates.
local function missing(a, b)
    local available, out = {}, {}
    for _, line in ipairs(b) do available[line] = (available[line] or 0) + 1 end
    for _, line in ipairs(a) do
        if (available[line] or 0) > 0 then available[line] = available[line] - 1 else out[#out + 1] = line end
    end
    return out
end

local function text_changes(before, after, targets)
    local lines_a, lines_b = split_lines(before), split_lines(after)
    local removed, added = missing(lines_a, lines_b), missing(lines_b, lines_a)
    local findings, byKey = {}, {}
    for i, line in ipairs(removed) do local k = line_key(line); if k then byKey[k] = i end end
    local used = {}
    for _, line in ipairs(added) do
        local k = line_key(line)
        local i = k and byKey[k]
        local old = i and removed[i] or nil
        if i then used[i] = true end
        local oldValue = old and tonumber(old:match('(-?%d+%.?%d*)"?%s*$'))
        local newValue = tonumber(line:match('(-?%d+%.?%d*)"?%s*$'))
        findings[#findings + 1] = { where = k or 'line', old = old, new = line,
            verdict = newValue and judge(oldValue, newValue, targets) or nil }
    end
    for i, line in ipairs(removed) do
        if not used[i] then findings[#findings + 1] = { where = line_key(line) or 'line', old = line, new = nil } end
    end
    return findings
end

-- Changed byte ranges, then the small integers that cover them (u8, u16/u32 little and big endian).
local function binary_changes(before, after, targets)
    local findings, ranges = {}, {}
    local n = math.min(#before, #after)
    local pos = 1
    while pos <= n and #ranges < 400 do
        local stop = math.min(pos + 63, n)
        if before:sub(pos, stop) ~= after:sub(pos, stop) then
            local i = pos
            while i <= stop do
                if before:byte(i) ~= after:byte(i) then
                    local j = i
                    while j < n and j - i < 64 and before:byte(j + 1) ~= after:byte(j + 1) do j = j + 1 end
                    ranges[#ranges + 1] = { i, j }
                    i = j + 1
                else
                    i = i + 1
                end
            end
        end
        pos = stop + 1
    end
    for _, range in ipairs(ranges) do
        local first, last = range[1], range[2]
        local best
        local function consider(kind, start, width, reader)
            if start < 1 or start + width - 1 > n or start > first or start + width - 1 < last then return end
            local old, new = reader(before, start), reader(after, start)
            if old == new or old > 1000000 or new > 1000000 then return end
            local score = math.abs(new - old)
            if not best or score < best.score then best = { kind = kind, start = start, old = old, new = new, score = score } end
        end
        if first == last then consider('u8', first, 1, function(s, p) return s:byte(p) end) end
        for start = last - 1, first do consider('u16 LE', start, 2, le16) end
        for start = last - 3, first do
            consider('u32 LE', start, 4, le32)
            consider('u32 BE', start, 4, be32)
        end
        local where = string.format('offset 0x%X', first - 1)
        if best then
            findings[#findings + 1] = { where = string.format('offset 0x%X (%s)', best.start - 1, best.kind),
                old = best.old, new = best.new, verdict = judge(best.old, best.new, targets) }
        else
            local length = math.min(last - first + 1, 16)
            local function hex(s) return (s:sub(first, first + length - 1):gsub('.', function(c) return string.format('%02X ', c:byte()) end)) end
            findings[#findings + 1] = { where = where, old = hex(before), new = hex(after) }
        end
    end
    if #before ~= #after then
        findings[#findings + 1] = { where = 'file size', old = #before, new = #after }
    end
    return findings, #ranges
end

-- Optional decoders turn a file into named values first (e.g. Fable III hero statistics).
local function decoded_changes(decoder, before, after, targets)
    local a, b = decoder.values(before), decoder.values(after)
    if not a or not b then return nil end
    local findings = {}
    for key, new in pairs(b) do
        local old = a[key]
        if old ~= new then
            findings[#findings + 1] = { where = decoder.name(key), old = old, new = new,
                verdict = type(new) == 'number' and judge(old, new, targets) or nil }
        end
    end
    table.sort(findings, function(x, y) return x.where < y.where end)
    return findings
end

local rank = { match = 1, rising = 2 }

function R.compare(before, after, targets, decoders)
    local files, names = {}, {}
    for name in pairs(before.files) do names[name] = true end
    for name in pairs(after.files) do names[name] = true end
    local sorted = {}
    for name in pairs(names) do sorted[#sorted + 1] = name end
    table.sort(sorted)
    local matches = 0
    for _, name in ipairs(sorted) do
        local a, b = before.files[name], after.files[name]
        if a ~= b then
            local entry = { name = name, change = not a and 'added' or not b and 'removed' or 'changed', sizeBefore = a and #a, sizeAfter = b and #b }
            if a and b then
                local findings
                for _, decoder in ipairs(decoders or {}) do
                    if decoder.accepts(name) then
                        findings = decoded_changes(decoder, a, b, targets)
                        if findings then entry.kind = decoder.label; break end
                    end
                end
                if not findings and is_text(a) and is_text(b) then
                    findings, entry.kind = text_changes(a, b, targets), 'text'
                elseif not findings then
                    local ranges
                    findings, ranges = binary_changes(a, b, targets)
                    entry.kind, entry.changedRanges = 'binary', ranges
                end
                -- Stable sort keeps file order among equally interesting findings.
                for i, f in ipairs(findings) do f.order = i end
                table.sort(findings, function(x, y)
                    local p, q = rank[x.verdict] or 3, rank[y.verdict] or 3
                    if p ~= q then return p < q end
                    return x.order < y.order
                end)
                for _, f in ipairs(findings) do f.order = nil; if f.verdict == 'match' then matches = matches + 1 end end
                entry.totalFindings = #findings
                entry.findings = findings
            end
            files[#files + 1] = entry
        end
    end
    return files, matches
end

-- Keeps reports small; narrowing runs on the full lists first.
function R.trim(files)
    for _, file in ipairs(files) do
        local findings = file.findings or {}
        while #findings > MAX_FINDINGS do table.remove(findings) end
    end
end

local function direction(old, new)
    if type(old) == 'number' and type(new) == 'number' then return new > old and 'up' or 'down' end
    return 'changed'
end

-- Multi-pass narrowing, like a RetroAchievements memory search. A recording where the
-- progress happened keeps only values that changed again, the same way; a recording
-- where nothing happened rules out every value that changed anyway.
function R.narrow(state, files, noProgress)
    state.passes = state.passes + 1
    local seen = {}
    for _, file in ipairs(files) do
        for _, f in ipairs(file.findings or {}) do
            seen[file.name .. ' | ' .. f.where] = { file = file.name, where = f.where, old = f.old, new = f.new,
                dir = direction(f.old, f.new), verdict = f.verdict }
        end
        if not file.findings then
            seen[file.name .. ' | (file)'] = { file = file.name, where = '(file ' .. file.change .. ')', dir = file.change }
        end
    end
    if noProgress then
        for key in pairs(seen) do
            state.excluded[key] = true
            if state.candidates then state.candidates[key] = nil end
        end
    else
        state.progressPasses = state.progressPasses + 1
        if not state.candidates then
            state.candidates = {}
            for key, f in pairs(seen) do
                if not state.excluded[key] then state.candidates[key] = { file = f.file, where = f.where, dir = f.dir, steps = { { f.old, f.new } }, verdict = f.verdict } end
            end
        else
            for key, c in pairs(state.candidates) do
                local f = seen[key]
                if f and (f.dir == c.dir or c.dir == 'changed') then
                    c.steps[#c.steps + 1] = { f.old, f.new }
                    c.verdict = f.verdict
                else
                    state.candidates[key] = nil
                end
            end
        end
    end
    local list = {}
    for _, c in pairs(state.candidates or {}) do
        local values = { c.steps[1][1] }
        for _, step in ipairs(c.steps) do values[#values + 1] = step[2] end
        list[#list + 1] = { file = c.file, where = c.where, values = values, verdict = c.verdict }
    end
    table.sort(list, function(a, b)
        local p, q = rank[a.verdict] or 3, rank[b.verdict] or 3
        if p ~= q then return p < q end
        if a.file ~= b.file then return a.file < b.file end
        return a.where < b.where
    end)
    local remaining = #list
    while #list > 40 do table.remove(list) end
    return { passes = state.passes, progressPasses = state.progressPasses, remaining = remaining,
        started = state.candidates ~= nil, candidates = list }
end

local function value_text(v)
    if v == nil then return '(none)' end
    return tostring(v)
end

function R.report_text(report)
    local out = {
        'Steam Custom Achievements - record mode report',
        'Game: ' .. report.game,
        'Achievement: ' .. report.achievement .. ' - ' .. report.detail,
        'Numbers it asks for: ' .. (#report.targets > 0 and table.concat(report.targets, ', ') or 'none'),
        'Started: ' .. report.started .. '   Done: ' .. report.finished,
        'Folder: ' .. report.folderName .. ' (' .. report.filesWatched .. ' files watched)',
    }
    if report.rule then out[#out + 1] = 'Plugin rule: ' .. report.rule end
    out[#out + 1] = ''
    if report.noProgress then out[#out + 1] = 'This recording was marked "no progress": values that changed here are ruled out.' end
    local n = report.narrowing
    if n and n.started then
        out[#out + 1] = string.format('After %d recordings (%d with progress): %d values changed the same way every time.', n.passes, n.progressPasses, n.remaining)
        for _, c in ipairs(n.candidates) do
            local values = {}
            for i, v in ipairs(c.values) do values[i] = value_text(v) end
            out[#out + 1] = string.format('    %s  %s: %s%s', c.file, c.where, table.concat(values, ' -> '), c.verdict == 'match' and '  <== matches' or '')
        end
        out[#out + 1] = ''
    end
    if #report.files == 0 then out[#out + 1] = 'No file changed. Did the game save after you earned it?' end
    for _, file in ipairs(report.files) do
        out[#out + 1] = string.format('%s  [%s%s]', file.name, file.change, file.kind and (', ' .. file.kind) or '')
        for _, f in ipairs(file.findings or {}) do
            local mark = f.verdict == 'match' and '  <== matches the achievement' or f.verdict == 'rising' and '  (went up)' or ''
            out[#out + 1] = string.format('    %s: %s -> %s%s', f.where, value_text(f.old), value_text(f.new), mark)
        end
        if (file.totalFindings or 0) > #(file.findings or {}) then
            out[#out + 1] = string.format('    ... %d more changes not listed', file.totalFindings - #file.findings)
        end
    end
    return table.concat(out, '\r\n') .. '\r\n'
end

-- Writes flat files into an existing folder (no folders are created).
function R.save(folder, join, stem, before, after, report, encode)
    if not folder then return nil end
    local written = {}
    local function put(name, bytes)
        local file = io.open(join(folder, name), 'wb')
        if not file then return false end
        file:write(bytes)
        file:close()
        written[#written + 1] = name
        return true
    end
    if not put(stem .. ' report.txt', R.report_text(report)) then return nil end
    put(stem .. ' report.json', encode(report))
    for _, file in ipairs(report.files) do
        local safe = file.name:gsub('[\\/:*?"<>|]', '_')
        if before.files[file.name] then put(stem .. ' before ' .. safe, before.files[file.name]) end
        if after.files[file.name] then put(stem .. ' after ' .. safe, after.files[file.name]) end
    end
    return written
end

return R
