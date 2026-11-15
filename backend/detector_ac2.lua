-- Assassin's Creed II detector: read-only autosave evidence. Record layout/mappings derived from AC2AP (MIT).
-- See third_party/AC2AP-LICENSE.txt. Unknown layouts never count as complete.
local rules = require('auto_rules')
local collectibles = require('collectible_rules')
local tasks = require('tracker_rules')
local checklists = require('checklist_rules')
local D = { supported = {}, maxBytes = 16777216, followFolder = true }
for _, rule in ipairs(rules) do D.supported[#D.supported + 1] = rule.index end
for _, rule in ipairs(collectibles) do D.supported[#D.supported + 1] = rule.index end
for _, rule in ipairs(tasks) do D.supported[#D.supported + 1] = rule.index end
for _, rule in ipairs(checklists) do D.supported[#D.supported + 1] = rule.index end
table.sort(D.supported)

-- Millennium 3.6.2 embeds LuaJIT (Lua 5.1). Do not use Lua 5.3+ pack/unpack.
local function u32(data, pos)
    local a,b,c,d = data:byte(pos,pos+3)
    if not d then return nil end
    return a + b*256 + c*65536 + d*16777216
end

local mission_marker = string.char(17,0,0,0,160,203,218,95,160,203,218,95)

local function le32(value)
    return string.char(value % 256, math.floor(value / 256) % 256,
        math.floor(value / 65536) % 256, math.floor(value / 16777216) % 256)
end

-- Collected feathers/statuettes are stored as their object IDs. A distinct ID that
-- appears anywhere in a gameplay save counts once; duplicated containers do not.
local function count_collectibles(data)
    local counts = {}
    for _, rule in ipairs(collectibles) do
        local have = 0
        for _, id in ipairs(rule.ids) do
            if data:find(le32(id), 553, true) then have = have + 1 end
        end
        counts[tostring(rule.index)] = { have = have, need = rule.need, label = rule.label }
    end
    return counts
end

-- The game's own task list: ObjectID (u32), a not-started bool, Completed (bool) and
-- CurrentCount (int32), serialized with fixed property hashes. Exact byte match only.
local task_head = string.char(17,0,0,0, 0x41,0x6F,0x6A,0x5B, 0,0,0,0, 0,0, 7,0, 11)
local task_b1 = string.char(14,0,0,0, 0xB6,0x6C,0xA5,0x72, 0,0,0,0,0,0,0,0, 11)
local task_b2 = string.char(14,0,0,0, 0xCD,0xDE,0x09,0xB8, 0,0,0,0,0,0,0,0, 11)
local task_count = string.char(17,0,0,0, 0xE3,0xA9,0xBF,0xCE, 0,0,0,0,0,0, 7,0, 11)
local function read_tasks(data)
    local wanted, found = {}, {}
    for _, rule in ipairs(tasks) do
        wanted[rule.objectId] = wanted[rule.objectId] or {}
        table.insert(wanted[rule.objectId], rule)
    end
    local cursor = 553
    while true do
        local at = data:find(task_head, cursor, true)
        if not at then break end
        cursor = at + 1
        local p = at + #task_head
        local id = u32(data, p)
        local list = id and wanted[id]
        if list then
            p = p + 4
            if data:sub(p, p + #task_b1 - 1) == task_b1 then
                p = p + #task_b1 + 1
                if data:sub(p, p + #task_b2 - 1) == task_b2 then
                    local done = data:byte(p + #task_b2)
                    p = p + #task_b2 + 1
                    if data:sub(p, p + #task_count - 1) == task_count then
                        local count = u32(data, p + #task_count)
                        if count and count >= 2147483648 then count = 0 end
                        if count and (done == 0 or done == 1) then
                            for _, rule in ipairs(list) do
                                local key = tostring(rule.index)
                                local old = found[key]
                                if not old or count > old.have or (done == 1 and not old.done) then
                                    found[key] = { have = count, need = rule.need, label = rule.label, done = done == 1 }
                                end
                            end
                        end
                    end
                end
            end
        end
    end
    return found
end

-- Every accomplishment in the save (AccomplishmentManagerData): ObjectID -> completed. The
-- game's achievement definitions (DataPC.forge, Game Bootstrap Settings) name them, e.g.
-- 'Buy Firenze Painting' or 'Wear Auditore Cape in Villa', and an achievement such as
-- Art Connoisseur unlocks when all of its accomplishments are completed.
local function read_accomplishments(data)
    local done, cursor = {}, 553
    while true do
        local at = data:find(task_head, cursor, true)
        if not at then return done end
        cursor = at + 1
        local p = at + #task_head
        local id = u32(data, p)
        p = p + 4
        if data:sub(p, p + #task_b1 - 1) == task_b1 then
            p = p + #task_b1 + 1
            if data:sub(p, p + #task_b2 - 1) == task_b2 then
                local flag = data:byte(p + #task_b2)
                if flag == 0 or flag == 1 then done[id] = done[id] or flag == 1 end
            end
        end
    end
end

-- Stronghold building levels (VillaSaveData, hash 9FA9AB85): an array of 11 bytes, one per
-- shop and renovation. Exact header match only.
local villa_head = string.char(0x85, 0xAB, 0xA9, 0x9F)
local levels_head = string.char(0x1D,0,0,0, 0xB2,0xD6,0xE8,0x08, 0,0,0,0,0,0, 0x9D,0x01, 0x0B,0x01, 0x0B,0,0,0)
local function read_villa(data)
    local villa = data:find(villa_head, 553, true)
    local at = villa and data:find(levels_head, villa, true)
    if not at or at > villa + 400 then return nil end
    local levels = { data:byte(at + #levels_head, at + #levels_head + 10) }
    if #levels ~= 11 then return nil end
    for _, level in ipairs(levels) do
        if level > 3 then return nil end
    end
    return levels
end

-- The stronghold's value (VillaSaveData int, hash 21945328): 1280 on a new game. The game's
-- villa manager holds the 150000 that its own item, building and bonus values add up to;
-- Podesta of Monteriggioni is 80% of that.
local value_head = string.char(0x11,0,0,0, 0x28,0x53,0x94,0x21, 0,0,0,0,0,0, 0x07,0x00, 0x0B)
local function read_villa_value(data)
    local villa = data:find(villa_head, 553, true)
    local at = villa and data:find(value_head, villa, true)
    if not at or at > villa + 120 then return nil end
    local value = u32(data, at + #value_head)
    if not value or value > 10000000 then return nil end
    return value
end

local function read_checklists(data)
    local accomplishments, levels, value = read_accomplishments(data), read_villa(data), read_villa_value(data)
    local found = {}
    for _, rule in ipairs(checklists) do
        local have, need = 0, nil
        if rule.tasks then
            need = #rule.tasks
            for _, id in ipairs(rule.tasks) do
                if accomplishments[id] then have = have + 1 end
            end
        elseif rule.villaValue then
            if value then need, have = rule.need, value end
        elseif levels then
            need = rule.need
            for i, base in ipairs(rule.villaBase) do
                if levels[i] > base then have = have + 1 end
            end
        end
        if need then found[tostring(rule.index)] = { have = math.min(have, need), need = need, label = rule.label } end
    end
    return found
end

function D.parse(data)
    if type(data) ~= 'string' or #data < 552 then return nil, 'Save is incomplete' end
    local slot, padding_start
    if data:sub(51,54) == '-\0001\0' then
        slot, padding_start = -1, 55
    elseif data:byte(51) >= 48 and data:byte(51) <= 50 and data:byte(52) == 0 then
        slot, padding_start = data:byte(51)-48, 53
    end
    if u32(data,1) ~= 548 or data:sub(5, 8) ~= string.rep('\0', 4)
        or data:sub(41, 50) ~= 'A\0C\0I\0I\0 \0' or slot == nil
        or data:sub(padding_start or 553, 552) ~= string.rep('\0', 553-(padding_start or 553)) then
        return nil, 'Unrecognized AC2 save format'
    end
    local completed, count, mission_ids, mission_count = {}, 0, {}, 0
    local cursor = 1
    while true do
        local magic = data:find(mission_marker, cursor, true)
        if not magic then break end
        cursor = magic + 1
        local start = magic - 8
        if start >= 1 and start + 0x32 - 1 <= #data then
            local size, size2 = u32(data,start), u32(data,start+4)
            if size >= 0x32 and size <= 1048576 and size2 == size - 8
                and start + size + 8 - 1 <= #data
                and data:byte(start + 0x18) == 0x0B then
                local id = u32(data,start+0x19)
                if not mission_ids[id] then mission_ids[id],mission_count=true,mission_count+1 end
                if data:byte(start+0x2D) == 0x0B and u32(data,start+0x2E) == 100 then
                    if not completed[id] then completed[id], count = true, count + 1 end
                end
            end
        end
    end
    return { completed = completed, recordCount = count, missionRecords=mission_count,
        collectibles = slot ~= -1 and count_collectibles(data) or {},
        tasks = slot ~= -1 and read_tasks(data) or {},
        checklists = slot ~= -1 and read_checklists(data) or {},
        slot=slot, kind=slot == -1 and 'unassigned-slot' or 'gameplay-slot' }
end

function D.evaluate(parsed)
    local earned = {}
    if not parsed or parsed.slot == -1 then return earned end
    for _, rule in ipairs(rules) do
        for _, id in ipairs(rule.missionIds) do
            if parsed.completed[id] then
                earned[#earned + 1] = rule.index
                break
            end
        end
    end
    for _, rule in ipairs(collectibles) do
        local count = parsed.collectibles and parsed.collectibles[tostring(rule.index)]
        if count and count.have >= rule.need then earned[#earned + 1] = rule.index end
    end
    for _, rule in ipairs(tasks) do
        local task = parsed.tasks and parsed.tasks[tostring(rule.index)]
        -- countOnly: the game never sets this task's flag (e.g. glyphs), so the count decides.
        if task and (task.done or rule.countOnly) and task.have >= rule.need then earned[#earned + 1] = rule.index end
    end
    for _, rule in ipairs(checklists) do
        local list = parsed.checklists and parsed.checklists[tostring(rule.index)]
        if list and list.have >= list.need then earned[#earned + 1] = rule.index end
    end
    return earned
end

-- Watcher interface (see main.lua). Everything below only reads files.
local function plausible_name(name)
    return name:match('^%d+%.save$') ~= nil or name:match('^save%d+$') ~= nil
end

-- Remembers a save's summary while the file is unchanged (main.lua); tests pass no cache.
local function cached(ctx, path, compute)
    if ctx.cached then return ctx.cached(path, compute) end
    return compute()
end

local function scan_folder(ctx, folder)
    local best,bestTime,bestRecords=nil,-1,-1
    local summaries={}
    for _,entry in ipairs(ctx.safe_list(folder)) do
        if entry.is_file and not entry.is_symlink and plausible_name(entry.name)
            and not entry.name:find('999',1,true) then
            local info=cached(ctx,entry.path,function()
                local bytes=ctx.read_small(entry.path,D.maxBytes)
                local parsed=bytes and D.parse(bytes)
                return {bytes=bytes and #bytes or 0,slot=parsed and parsed.slot or nil,kind=parsed and parsed.kind or 'unsupported',
                    records=parsed and parsed.missionRecords or nil,
                    detail=parsed and (parsed.slot==-1 and 'unassigned slot' or (parsed.missionRecords..' mission records')) or 'unsupported format'}
            end)
            local time=ctx.fs.last_write_time(entry.path) or 0
            summaries[#summaries+1]={name=entry.name,bytes=info.bytes,slot=info.slot,kind=info.kind,detail=info.detail}
            if info.slot and info.slot>=0 and (time>bestTime
                or (time==bestTime and info.records>bestRecords)) then
                best,bestTime,bestRecords=entry.path,time,info.records
            end
        end
    end
    table.sort(summaries,function(a,b)return a.name<b.name end)
    return best,bestTime,summaries
end

-- Returns path or nil, plus a list of save summaries for the settings panel.
function D.locate(ctx)
    local roots = {}
    for _, variable in ipairs({'ProgramFiles(x86)', 'ProgramFiles'}) do
        local base = ctx.getenv(variable)
        if base then roots[#roots+1] = ctx.fs.join(base, 'Ubisoft', 'Ubisoft Game Launcher', 'savegames') end
    end
    local appdata = ctx.getenv('LOCALAPPDATA')
    if appdata then roots[#roots+1] = ctx.fs.join(appdata, 'Ubisoft Game Launcher', 'savegames') end
    for _, install in ipairs(ctx.install_dirs()) do roots[#roots+1] = ctx.fs.join(install, 'savegames') end
    local best, bestTime, available = nil, -1, nil
    for _, root in ipairs(roots) do
        for _, account in ipairs(ctx.safe_list(root)) do
            if account.is_directory and not account.is_symlink then
                local found,time,summaries=scan_folder(ctx, ctx.fs.join(account.path,'4'))
                if #summaries>0 and not best then available=summaries end
                if found and time>bestTime then best,bestTime,available=found,time,summaries end
            end
        end
    end
    return best, available
end

-- Resolves a user-chosen file or folder. Returns path, or nil and a reason.
function D.resolve(ctx, path)
    local fs=ctx.fs
    local original,note=path,nil
    if not fs.is_file(path) and not fs.is_directory(path) and fs.is_file(path..'.save') then
        path=path..'.save'
        note='Added the hidden .save extension.'
    end
    if fs.is_directory(path) then
        local found,_,summaries=scan_folder(ctx, path)
        if found then return found,nil,'Selected '..fs.filename(found)..' from the save folder.',summaries end
        return nil,'no-gameplay-save',nil,summaries
    end
    if not fs.is_file(path) then return nil,'path-not-found' end
    local bytes=ctx.read_small(path,D.maxBytes)
    local parsed,reason=D.parse(bytes)
    if not parsed then return nil,reason end
    if parsed.slot==-1 then
        local found,_,summaries=scan_folder(ctx, fs.parent_path(path))
        if found then
            return found,nil,fs.filename(path)..' has no mission progress; selected '..fs.filename(found)..' from the same folder.',summaries
        end
    elseif path~=original then
        note='Selected '..fs.filename(path)..' after adding the .save extension.'
    end
    return path,nil,note
end

function D.counts(parsed)
    local counts={}
    for key,value in pairs(parsed.collectibles or {}) do counts[key]=value end
    for key,value in pairs(parsed.tasks or {}) do counts[key]={have=value.have,need=value.need,label=value.label} end
    for key,value in pairs(parsed.checklists or {}) do counts[key]=value end
    return counts
end

function D.describe(parsed, fileName)
    if parsed.slot==-1 then
        return 'unassigned-slot','This is an AC2 slot -1 file with no gameplay mission records. Select the save folder to find the active game.'
    elseif parsed.missionRecords==0 then
        return 'no-mission-progress','AC2 save recognized, but no mission records are present yet. Waiting for gameplay progress.'
    end
    return 'watching','Watching '..fileName..' for autosaves ('..#D.supported..' of 50 achievements).',
        parsed.recordCount..' completed mission records'
end

return D
