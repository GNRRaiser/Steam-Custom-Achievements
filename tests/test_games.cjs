/* Multi-game regression: each supported Library page gets its own list, progress
 * key and tracking mode; unsupported pages get nothing. Test dependency: jsdom.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.SCA_TEST_MODULES
  ? path.join(process.env.SCA_TEST_MODULES, 'jsdom') : 'jsdom');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, '.millennium/Dist/index.js'), 'utf8');
const id = 'sca-ac2-root';
const page = '<!doctype html><html><head></head><body><main><aside><section><h2>FRIENDS WHO PLAY</h2><div>Friends</div></section><section><h2>ADDITIONAL CONTENT</h2><div>Manual</div></section></aside></main></body></html>';

function makeWindow(name) {
  const dom = new JSDOM(page, { url: 'https://steamloopback.host/index.html', runScripts: 'outside-only' });
  dom.window.name = name;
  return dom.window;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

(async () => {
  const host = makeWindow('SharedJSContext');
  const main = makeWindow('SP Desktop_uid0');
  const calls = [];
  const recordRequests = [];
  const captureRequests = [];
  const finishRequests = [];
  const narrowed = {passes:2, progressPasses:1, remaining:1, started:true, candidates:[{file:'config.cfg', where:'seta cheat_points', values:['seta cheat_points "14"','seta cheat_points "15"'], verdict:'match'}]};
  const recordReport = {schemaVersion:1, appId:7940, game:'Call of Duty 4: Modern Warfare', index:22, achievement:'Look Sharp', detail:'Find 15 enemy intel items',
    targets:[15], started:'2026-10-26 15:40:00', finished:'2026-10-26 15:52:00', folderName:'Player1', filesWatched:3, matches:1,
    rule:'unlocked by the plugin', savedTo:'C:\\Steam\\plugins\\steam-custom-achievements\\recordings', savedFiles:3,
    files:[{name:'config.cfg', change:'changed', kind:'text', totalFindings:2, findings:[
      {where:'seta cheat_points', old:'seta cheat_points "14"', new:'seta cheat_points "15"', verdict:'match'},
      {where:'seta mis_difficulty', old:'seta mis_difficulty "41"', new:'seta mis_difficulty "414"'}]}]};
  const backend = {
    7940: {schemaVersion:1, appId:7940, status:'watching', message:'Watching config.cfg for campaign progress.',
      details:'Missions finished: 2 / 21 · mis_difficulty 410000000000000000000', saveFound:true, saveFileName:'config.cfg',
      supportedIndices:[0,1], progress:{'0':'2026-10-26T10:00:00Z','1':'2026-10-26T11:00:00Z'},
      counts:{'22':{have:12,need:15,label:'Enemy intel'}}},
  };
  host.MainWindowBrowserManager = {m_lastLocation:{pathname:'/routes/library/app/7940'}};
  host.g_PopupManager = { GetPopups: () => [{window: main}] };
  host.Millennium = { callServerMethod: async (_plugin, method, args) => {
    const request = JSON.parse(args.payload);
    calls.push([method, request.appId]);
    if (method === 'SetCapture') { captureRequests.push(request); backend[request.appId] = {schemaVersion:1, appId:request.appId, status:'manual', message:'Manual tracking only.', progress:{}, supportedIndices:[],
      capture: request.enabled ? {enabled:true, folderName:'Thrillville', events:0, megabytes:0, recent:[]} : undefined}; return JSON.stringify(backend[request.appId]); }
    if (method === 'ResetProgress') { backend[request.appId] = {...backend[request.appId], progress:{}}; return JSON.stringify(backend[request.appId]); }
    if (method === 'StartRecording') { recordRequests.push(request); return JSON.stringify({recording:true, appId:request.appId, index:request.index, folderName:'Player1', files:3, bytes:9000, skipped:0, started:'2026-10-26 15:40:00'}); }
    if (method === 'FinishRecording') { finishRequests.push(request); return JSON.stringify(request.noProgress ? {...recordReport, noProgress:true, narrowing:narrowed} : recordReport); }
    const state = backend[request.appId] || {schemaVersion:1, appId:request.appId, status:'no-save', message:'No save', progress:{}, supportedIndices:[]};
    return JSON.stringify(state);
  } };
  host.localStorage.setItem('sca:progress:33230:v1', JSON.stringify({'20': '2026-10-01T00:00:00Z'}));
  // The older checks below expect every row listed, so spoilers start revealed here.
  for (const app of [15100, 33230, 48190, 7940, 10090, 105400, 22370, 17460, 24980, 6080]) host.localStorage.setItem(`sca:reveal:${app}:v1`, 'true');
  host.Audio = undefined; // jsdom cannot play sound; the chime fallback finds no AudioContext either
  host.eval(script);
  await tick(); await tick();
  const runtime = host.__SCA_RUNTIME__;
  runtime.refresh(); await tick();

  const doc = main.document;
  assert.ok(doc.getElementById(id));
  assert.equal(doc.getElementById(id).getAttribute('aria-label'), 'Call of Duty 4: Modern Warfare achievements');
  assert.match(doc.querySelector('.sca-count').textContent, /2\/37/);
  assert.ok(calls.some(([m, app]) => m === 'GetTrackerState' && app === 7940));
  assert.deepEqual(Object.keys(JSON.parse(host.localStorage.getItem('sca:progress:7940:v1'))).sort(), ['0', '1']);
  doc.querySelector('.sca-view').click();
  assert.equal(doc.querySelector('#sca-dialog-title').textContent, 'Call of Duty 4: Modern Warfare');
  assert.equal(doc.querySelectorAll('.sca-ach').length, 37);
  assert.match(doc.querySelector('.sca-ach[data-index="26"] img').getAttribute('src'), /^data:image\/webp;base64,/, 'CoD 4 pictures are built in');
  assert.match(doc.querySelector('.sca-ach[data-index="22"] .sca-ach-progress').textContent, /12 \/ 15/);
  assert.equal(doc.querySelector('.sca-ach[data-index="22"] .sca-ach-tag'), null, 'automatic entries carry no "unlocks automatically" tag');
  assert.ok([...doc.querySelectorAll('.sca-ach-tag')].some(t => /^Manual/.test(t.textContent)), 'manual entries keep their tag');
  assert.ok(!/sca-close\{[^}]*translate/.test(doc.getElementById('sca-ac2-css')?.textContent || ''), 'close button sits inside the dialog');
  assert.ok(doc.querySelector('[aria-label="Down Boy Down: locked, click to toggle"]'), 'manual entries keep a toggle');
  assert.equal(doc.querySelector('[aria-label^="Make the Jump:"]'), null, 'automatic entries have no toggle');
  [...doc.querySelectorAll('.sca-tab')].find(b => b.dataset.tab === 'settings').click();
  assert.match(doc.querySelector('.sca-auto-details').textContent, /mis_difficulty 4100/);
  assert.ok(doc.querySelector('.sca-input'));
  console.log('PASS CoD 4 page shows its own 37 achievements, automatic unlocks, intel progress and raw campaign value');

  const pick = doc.querySelector('.sca-record-pick');
  assert.equal(pick.options.length, 37);
  pick.value = '22'; pick.dispatchEvent(new main.Event('change'));
  assert.equal(doc.querySelector('.sca-record-detail').textContent, 'Find 15 enemy intel items');
  assert.ok(doc.querySelector('.sca-record-done').disabled);
  doc.querySelector('.sca-record-start').click(); await tick(); await tick();
  assert.deepEqual(recordRequests[0], {appId:7940, index:22, name:'Look Sharp', detail:'Find 15 enemy intel items', folder:'', narrow:false});
  assert.match(doc.querySelector('.sca-record-status').textContent, /Recording "Look Sharp" since 2026-10-26 15:40:00: 3 files in Player1/);
  assert.ok(doc.querySelector('.sca-record-start').disabled && !doc.querySelector('.sca-record-done').disabled);
  doc.querySelector('.sca-record-done').click(); await tick(); await tick();
  const match = doc.querySelector('.sca-record-file li[data-verdict="match"]');
  assert.match(match.textContent, /seta cheat_points: seta cheat_points "14" → seta cheat_points "15"matches/);
  assert.match(doc.querySelector('.sca-record-rule').textContent, /unlocked by the plugin/);
  assert.match(doc.querySelector('.sca-record-saved').textContent, /recordings/);
  assert.ok(!doc.querySelector('.sca-record-start').disabled);
  const narrowBox = doc.querySelector('.sca-record-narrow input');
  assert.ok(narrowBox.checked && !narrowBox.disabled, 'a second recording of the same achievement narrows by default');
  doc.querySelector('.sca-record-start').click(); await tick(); await tick();
  assert.equal(recordRequests[1].narrow, true);
  doc.querySelector('.sca-record-none-done').click(); await tick(); await tick();
  assert.deepEqual(finishRequests.map(r => !!r.noProgress), [false, true]);
  assert.match(doc.querySelector('.sca-record-narrowed').textContent, /After 2 recordings \(1 with progress\): 1 value changed the same way every time/);
  pick.value = '0'; pick.dispatchEvent(new main.Event('change'));
  assert.ok(!narrowBox.checked && narrowBox.disabled, 'another achievement starts a fresh search');
  console.log('PASS record mode: pick an achievement, Start, Done; the matching value and the saved copies are shown; a second pass narrows');

  assert.equal(doc.getElementById('sca-toast-host'), null, 'unlocks already in the save on first sight do not pop up');
  backend[7940].progress['2'] = '2026-10-26T19:30:00Z';
  await new Promise(r => setTimeout(r, 1500)); runtime.refresh(); await tick(); await tick();
  assert.equal(doc.querySelector('#sca-toast-host .sca-toast-name')?.textContent, 'Dancing in the Dark', 'a new automatic unlock pops up');
  assert.match(doc.getElementById('sca-toast-host').textContent, /Achievement Unlocked!/);
  assert.ok(doc.querySelector('#sca-toast-host img'), 'the popup shows the achievement picture');
  [...doc.querySelectorAll('.sca-tab')].find(b => b.dataset.tab === 'settings').click();
  assert.equal(doc.querySelector('.sca-popup-toggle').textContent, 'Popups: on');
  doc.querySelector('.sca-popup-toggle').click();
  assert.equal(doc.querySelector('.sca-popup-toggle').textContent, 'Popups: off');
  assert.equal(host.localStorage.getItem('sca:popups:v1'), 'off');
  assert.ok(doc.querySelector('.sca-popup-test'), 'a delayed test button lets the popup be checked over a game');
  await new Promise(r => setTimeout(r, 6000));
  assert.equal(doc.getElementById('sca-toast-host'), null, 'the popup goes away by itself');
  backend[7940].progress['3'] = '2026-10-26T19:35:00Z';
  await new Promise(r => setTimeout(r, 1500)); runtime.refresh(); await tick(); await tick();
  assert.ok(JSON.parse(host.localStorage.getItem('sca:progress:7940:v1'))['3'], 'the unlock is still recorded');
  assert.equal(doc.getElementById('sca-toast-host'), null, 'no popup while popups are off');
  doc.querySelector('.sca-popup-toggle').click();
  console.log('PASS a new automatic unlock shows a Steam-style popup with its picture; popups can be turned off');

  const wipe = doc.querySelector('.sca-reset-progress');
  wipe.click(); await tick();
  assert.equal(wipe.textContent, 'Click again to lock all', 'the first click only asks for confirmation');
  assert.ok(!calls.some(([m]) => m === 'ResetProgress'));
  assert.ok(Object.keys(JSON.parse(host.localStorage.getItem('sca:progress:7940:v1'))).length > 0);
  wipe.click(); await tick(); await tick();
  assert.ok(calls.some(([m, app]) => m === 'ResetProgress' && app === 7940));
  assert.deepEqual(JSON.parse(host.localStorage.getItem('sca:progress:7940:v1')), {});
  assert.match(doc.querySelector('.sca-count').textContent, /0\/37/);
  assert.match(doc.querySelector('.sca-reset-note').textContent, /stay locked until the game earns them again/);
  backend[7940].progress['5'] = '2026-10-26T20:30:00Z';
  await new Promise(r => setTimeout(r, 1500)); runtime.refresh(); await tick(); await tick();
  assert.deepEqual(Object.keys(JSON.parse(host.localStorage.getItem('sca:progress:7940:v1'))), ['5'], 'a later unlock is recorded again');
  console.log('PASS Reset to locked asks twice, clears manual and automatic unlocks, and later unlocks still arrive');

  host.MainWindowBrowserManager.m_lastLocation = {pathname:'/routes/library/app/105400'};
  runtime.refresh(); await tick();
  assert.equal(doc.querySelector('#sca-ac2-dialog'), null, 'switching games closes the old popup');
  assert.match(doc.querySelector('.sca-count').textContent, /0\/60/);
  assert.equal(doc.getElementById(id).getAttribute('aria-label'), 'Fable III achievements');
  assert.ok(calls.some(([m, app]) => m === 'GetTrackerState' && app === 105400), 'Fable III asks the backend');
  doc.querySelector('.sca-view').click();
  assert.equal(doc.querySelectorAll('.sca-mark').length, 0, 'every Fable III entry, Traitor\'s Keep included, is automatic');
  assert.match(doc.querySelector('.sca-ach[data-index="26"] img').getAttribute('src'), /^data:image\/webp;base64,/, 'Fable III pictures are built in');
  assert.equal(doc.querySelector('[aria-label^="Gnome Invasion:"]'), null, 'statistic entries are automatic');
  assert.equal(doc.querySelector('[aria-label^="The Guild Seal:"][aria-label$="click to toggle"]'), null, 'story entries are automatic');
  assert.equal(doc.querySelector('[aria-label^="A Revolutionary Idea:"][aria-label$="click to toggle"]'), null, 'DLC entries are automatic');
  [...doc.querySelectorAll('.sca-tab')].find(b => b.dataset.tab === 'settings').click();
  assert.ok(doc.querySelector('.sca-input'), 'Fable III has a save picker');
  console.log('PASS Fable III page has all 60 achievements automatic (Traitor\'s Keep included) and a save picker');

  host.MainWindowBrowserManager.m_lastLocation = {pathname:'/routes/library/app/6080'};
  runtime.refresh(); await tick();
  assert.match(doc.querySelector('.sca-count').textContent, /0\/50/);
  assert.match(doc.querySelector('.sca-auto-state').textContent, /auto-tracking needs setup/, 'no park save yet');
  assert.ok(calls.some(([m, app]) => m === 'GetTrackerState' && app === 6080), 'Thrillville asks the backend for its park save');
  doc.querySelector('.sca-view').click();
  assert.equal(doc.querySelectorAll('.sca-mark').length, 32, 'missions and owner levels are automatic, the rest manual');
  assert.equal(doc.querySelector('[aria-label^="Critics:"][aria-label$="click to toggle"]'), null, 'Critics (Bribery 101!) is automatic');
  [...doc.querySelectorAll('.sca-tab')].find(b => b.dataset.tab === 'settings').click();
  assert.ok(doc.querySelector('.sca-input:not(.sca-record-folder):not(.sca-capture-folder)'), 'Thrillville has a save picker');
  assert.match(doc.querySelector('.sca-record-folder').placeholder, /folder of the save being tracked/, 'record mode follows the park save');
  assert.equal(doc.querySelector('.sca-capture-state').textContent, 'Off.');
  doc.querySelector('.sca-capture-folder').value = 'D:\\Games\\Thrillville\\Saves';
  doc.querySelector('.sca-capture-folder').dispatchEvent(new main.Event('input'));
  doc.querySelector('.sca-capture-toggle').click(); await tick(); await tick();
  assert.deepEqual(captureRequests[0], {appId:6080, enabled:true, folder:'D:\\Games\\Thrillville\\Saves'});
  assert.match(doc.querySelector('.sca-capture-state').textContent, /^On · watching Thrillville · 0 saves captured/);
  assert.equal(doc.querySelector('.sca-capture-toggle').textContent, 'Turn off');
  runtime.refresh(); await new Promise(r => setTimeout(r, 1500)); runtime.refresh(); await tick();
  console.log('PASS Thrillville page has 18 automatic achievements (missions and owner levels), a save picker and capture');

  const added = {17460:[50, 50, 4, /follow the save being tracked/, false], 24980:[63, 63, 1, /follow the save being tracked/, false],
    15100:[44, 44, 0, /follow the save being tracked/, false], 48190:[61, 61, 10, /follow the save being tracked/, false]};
  for (const [app, [count, pictures, marks, placeholder, manual]] of Object.entries(added)) {
    host.MainWindowBrowserManager.m_lastLocation = {pathname:`/routes/library/app/${app}`};
    runtime.refresh(); await tick();
    assert.match(doc.querySelector('.sca-count').textContent, new RegExp(`0/${count}`), app);
    doc.querySelector('.sca-view').click();
    assert.equal(doc.querySelectorAll('.sca-mark').length, marks, `${app}: entries marked by hand`);
    assert.equal([...doc.querySelectorAll('.sca-ach img')].filter(img => /^data:image\/webp;base64,/.test(img.getAttribute('src'))).length, pictures, `${app}: built-in pictures`);
    [...doc.querySelectorAll('.sca-tab')].find(b => b.dataset.tab === 'settings').click();
    assert.match(doc.querySelector('.sca-capture-folder').placeholder, placeholder, `${app}: capture folder hint`);
    if (manual) assert.equal(calls.filter(([, a]) => a === Number(app)).length, 0, `${app}: no backend calls while manual`);
    else assert.ok(calls.some(([m, a]) => m === 'GetTrackerState' && a === Number(app)), `${app}: automatic games ask the backend`);
  }
  console.log('PASS Mass Effect (45 automatic), Brotherhood (50 automatic), Mass Effect 2 (61 automatic) and AC1 (44 automatic): full lists with platinums, all 218 built-in pictures, save folders shown');

  // From here on Steam's own NotificationStore is present, as in the real client.
  const steamToasts = [];
  host.NotificationStore = { m_nNextTestNotificationID: 10000, OnNotification: (id, type, bytes) => steamToasts.push({id, type, bytes}) };
  const readProto = bytes => {
    const out = {}; let i = 0;
    const varint = () => { let v = 0, m = 1, b; do { b = bytes[i++]; v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
    while (i < bytes.length) {
      const key = varint(), field = Math.floor(key / 8);
      if (key % 8 === 2) { const n = varint(); out[field] = Buffer.from(bytes.slice(i, i + n)).toString('utf8'); i += n; } else out[field] = varint();
    }
    return out;
  };
  // Mass Effect 2's profile reports the 61 achievements the PC game records; Highly Trained is marked by hand.
  const me2Auto = [...Array(62).keys()].filter(i => i !== 1);
  backend[24980] = {schemaVersion:1, appId:24980, status:'watching', message:'Watching Player1.prf', progress:{}, supportedIndices:me2Auto};
  host.MainWindowBrowserManager.m_lastLocation = {pathname:'/routes/library/app/24980'};
  runtime.refresh(); await tick();
  doc.querySelector('.sca-view').click();
  const platinum = doc.querySelector('.sca-ach[data-index="62"]');
  assert.match(platinum.textContent, /N7 Elite/);
  assert.match(platinum.textContent, /Unlocks by itself when every other achievement is unlocked/);
  assert.match(platinum.textContent, /0 \/ 62/, 'the platinum shows how many of the others are unlocked');
  const stamp = '2026-10-27T02:18:00Z';
  backend[24980] = {...backend[24980], progress:{'0':stamp}};
  await new Promise(r => setTimeout(r, 1500)); runtime.refresh(); await tick(); await tick();
  assert.deepEqual(Object.keys(JSON.parse(host.localStorage.getItem('sca:progress:24980:v1'))), ['0'], 'the profile\'s unlock is recorded');
  assert.equal(steamToasts.filter(t => readProto(t.bytes)[2] === 24980).length, 0, 'unlocks already in the profile when the plugin first sees it do not pop up');
  backend[24980] = {...backend[24980], progress:Object.fromEntries(me2Auto.map(i => [String(i), stamp]))};
  await new Promise(r => setTimeout(r, 1500)); runtime.refresh(); await tick(); await tick();
  assert.equal(doc.querySelectorAll('.sca-mark[aria-label$=": locked, click to toggle"]').length, 1, 'only Highly Trained is left to mark by hand');
  for (let guard = 0; guard < 70; guard++) {
    const next = doc.querySelector('.sca-mark[aria-label$=": locked, click to toggle"]');
    if (!next) break;
    next.click();
  }
  await tick(); await tick();
  let me2 = JSON.parse(host.localStorage.getItem('sca:progress:24980:v1'));
  assert.equal(Object.keys(me2).length, 63);
  assert.ok(me2['62'], 'the platinum unlocks once every other achievement is unlocked');
  const me2Toasts = steamToasts.filter(t => readProto(t.bytes)[2] === 24980);
  assert.equal(me2Toasts.length, 3, 'the profile\'s batch, the hand-marked one and then the platinum go to Steam\'s own achievement toast');
  assert.equal(readProto(me2Toasts[0].bytes)[3], '60 achievements unlocked', 'a big batch from the profile pops up once as a summary');
  assert.equal(readProto(me2Toasts[1].bytes)[3], 'Highly Trained', 'marking one by hand pops it up');
  const sent = readProto(me2Toasts[2].bytes);
  assert.equal(me2Toasts[2].type, 5, 'Steam notification type 5 is Achievement');
  assert.ok(steamToasts.every((t, i) => t.id === 10000 + i), 'Steam\'s own notification IDs are used');
  assert.equal(sent[2], 24980); assert.equal(sent[3], 'N7 Elite'); assert.equal(sent[4], 'Acquire all trophies.');
  assert.match(sent[5], /^data:image\/webp;base64,/, 'with its picture'); assert.equal(sent[6], 1);
  assert.equal(doc.getElementById('sca-toast-host'), null, 'no second, home-made popup when Steam shows its own');
  assert.match(JSON.parse(JSON.stringify(runtime.diagnostics())).popups.steamToast, /^steam/);
  doc.querySelector('.sca-mark[aria-label$=": unlocked, click to toggle"]').click();
  me2 = JSON.parse(host.localStorage.getItem('sca:progress:24980:v1'));
  assert.equal(me2['62'], undefined, 'locking another achievement locks the platinum again');
  await new Promise(r => setTimeout(r, 6000));
  console.log('PASS the platinum (N7 Elite) unlocks once all others are unlocked, through Steam\'s own achievement toast (shown over games by the overlay)');

  // Steam can take the notification and drop it without an error (its settings, or Big
  // Picture). Then nothing is queued, and the plugin draws its own popup instead.
  const dropped = [];
  host.NotificationStore = { m_nNextTestNotificationID: 20000, m_rgNotificationToasts: [], OnNotification: (id, type, bytes) => dropped.push({id, type, bytes}) };
  doc.querySelector('.sca-mark[aria-label$=": locked, click to toggle"]').click();
  await tick(); await tick();
  assert.ok(dropped.length >= 1, 'Steam is still asked first');
  assert.ok(doc.querySelector('#sca-toast-host .sca-toast-name'), 'a toast Steam dropped is drawn by the plugin');
  assert.match(JSON.parse(JSON.stringify(runtime.diagnostics())).popups.steamToast, /^dropped/);
  const queuing = { m_nNextTestNotificationID: 30000, m_rgNotificationToasts: [], OnNotification(id) { this.m_rgNotificationToasts.push({notificationID: id}); } };
  await new Promise(r => setTimeout(r, 12500));
  assert.equal(doc.getElementById('sca-toast-host'), null);
  host.NotificationStore = queuing;
  doc.querySelector('.sca-mark[aria-label$=": unlocked, click to toggle"]').click();
  doc.querySelector('.sca-mark[aria-label$=": locked, click to toggle"]').click();
  await tick(); await tick();
  assert.ok(queuing.m_rgNotificationToasts.length >= 1, 'a toast Steam queued');
  assert.equal(doc.getElementById('sca-toast-host'), null, 'is not drawn twice');
  console.log('PASS a popup Steam silently drops is drawn by the plugin; one Steam queues is not');

  // Progress popups, like Steam's IndicateAchievementProgress: once per quarter of the way,
  // sent to Steam's own toast with achieved = false and the progress numbers.
  {
    const fo3 = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'source', 'games', 'fallout3', 'game.json'), 'utf8')).achievements;
    const open = fo3.findIndex(a => a.group !== 'Story'), story = fo3.findIndex(a => a.group === 'Story');
    const sentBytes = [];
    host.NotificationStore = { m_nNextTestNotificationID: 40000, OnNotification: (id, type, bytes) => sentBytes.push(bytes) };
    const decode = bytes => {
      const out = {}; let i = 0;
      const varint = () => { let v = 0, m = 1, b; do { b = bytes[i++]; v += (b & 127) * m; m *= 128; } while (b & 128); return v; };
      while (i < bytes.length) {
        const key = varint(), field = Math.floor(key / 8), wire = key % 8;
        if (wire === 2) { const n = varint(); out[field] = Buffer.from(bytes.slice(i, i + n)).toString('utf8'); i += n; }
        else if (wire === 5) { out[field] = Buffer.from(bytes.slice(i, i + 4)).readFloatLE(0); i += 4; }
        else out[field] = varint();
      }
      return out;
    };
    const state = counts => ({schemaVersion:1, appId:22370, status:'watching', message:'Watching', progress:{}, supportedIndices:[open, story], counts});
    backend[22370] = state({[open]:{have:2, need:10}, [story]:{have:1, need:10}});
    host.MainWindowBrowserManager.m_lastLocation = {pathname:'/routes/library/app/22370'};
    runtime.refresh(); await tick();
    await new Promise(r => setTimeout(r, 1500)); runtime.refresh(); await tick(); await tick();
    assert.equal(sentBytes.length, 0, 'the first reading only sets the starting point');
    backend[22370] = state({[open]:{have:6, need:10}, [story]:{have:9, need:10}});
    await new Promise(r => setTimeout(r, 1500)); runtime.refresh(); await tick(); await tick();
    assert.equal(sentBytes.length, 1, 'one popup: the story (spoiler) achievement does not pop up');
    const sent = decode(sentBytes[0]);
    assert.equal(sent[3], fo3[open].name); assert.equal(sent[6], 0, 'not achieved');
    assert.equal(sent[9], 6); assert.equal(sent[10], 10);
    backend[22370] = state({[open]:{have:7, need:10}, [story]:{have:9, need:10}});
    await new Promise(r => setTimeout(r, 1500)); runtime.refresh(); await tick(); await tick();
    assert.equal(sentBytes.length, 1, 'no second popup inside the same quarter');
    assert.deepEqual(JSON.parse(host.localStorage.getItem('sca:milestones:22370:v1'))[String(open)], 2);
    console.log('PASS progress popups go to Steam\'s toast at each quarter, never for spoilers');
  }

  host.MainWindowBrowserManager.m_lastLocation = {pathname:'/routes/library/app/33230'};
  runtime.refresh(); await tick();
  assert.match(doc.querySelector('.sca-count').textContent, /1\/51/);
  assert.deepEqual(Object.keys(JSON.parse(host.localStorage.getItem('sca:progress:33230:v1'))), ['20']);
  host.MainWindowBrowserManager.m_lastLocation = {pathname:'/routes/library/app/220'};
  runtime.refresh(); await tick();
  assert.equal(doc.getElementById(id), null);
  const diag = JSON.parse(JSON.stringify(runtime.diagnostics()));
  assert.deepEqual(diag.games.map(g => g.appId), [15100, 33230, 48190, 7940, 10090, 105400, 22370, 17460, 24980, 6080]);
  assert.equal(diag.games.find(g => g.appId === 7940).unlocked, 1, 'one unlock since the reset');
  assert.equal(diag.popups.enabled, true);
  console.log('PASS AC2 keeps its v0.1 progress; other games\' pages show no card; diagnostics list every game');

  for (let i = 0; i < 12; i++) { runtime.refresh(); await tick(); await new Promise(r => setTimeout(r, 120)); }
  runtime.dispose();
  console.log('All multi-game regression groups passed.');
})().catch(error => { console.error(error); process.exit(1); });
