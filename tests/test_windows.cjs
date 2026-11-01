/* Regression tests for Steam's separate SharedJSContext and visible windows.
 * Test dependency: jsdom. Never needed to install or run the plugin in Steam.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require(process.env.SCA_TEST_MODULES
  ? path.join(process.env.SCA_TEST_MODULES, 'jsdom') : 'jsdom');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, '.millennium/Dist/index.js'), 'utf8');
const key = 'sca:progress:33230:v1';
const id = 'sca-ac2-root';
let passes = 0;
const windows = [];

function makeWindow(name, saved) {
  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', e => errors.push(e));
  const dom = new JSDOM('<!doctype html><html><head></head><body><main><article id=content>Game content</article><aside id=sidebar><section id=friends><h2>FRIENDS WHO PLAY</h2><div class=native-card>Friend activity</div></section><section><h2>ADDITIONAL CONTENT</h2><div class=native-card>Manual</div></section></aside></main></body></html>', {
    url: 'https://steamloopback.host/index.html', runScripts: 'outside-only', virtualConsole,
  });
  const window = dom.window;
  window.name = name;
  if (saved !== undefined) window.localStorage.setItem(key, JSON.stringify(saved));
  let networkAttempts = 0;
  window.fetch = window.XMLHttpRequest = window.WebSocket = () => {
    networkAttempts++;
    throw new Error('Unexpected network attempt');
  };
  windows.push(window);
  return { window, errors, get networkAttempts() { return networkAttempts; } };
}

function makeManager(popups = []) {
  const created = new Set();
  const destroyed = new Set();
  return {
    popups, created, destroyed,
    GetPopups() { return this.popups; },
    GetExistingPopup(name) { return this.popups.find(p => (p.window || p.m_popup?.window)?.name === name); },
    AddPopupCreatedCallback(cb) { created.add(cb); return { Unregister() { created.delete(cb); } }; },
    AddPopupDestroyedCallback(cb) { destroyed.add(cb); return { Unregister() { destroyed.delete(cb); } }; },
    add(window, wrapper = false) {
      const popup = wrapper ? {m_popup: {window}} : {window};
      this.popups.push(popup);
      for (const cb of created) cb(popup);
      return popup;
    },
    remove(popup) {
      this.popups = this.popups.filter(p => p !== popup);
      for (const cb of destroyed) cb(popup);
    },
  };
}

async function boot(host, manager) {
  const ack = [];
  host.window.g_PopupManager = manager;
  host.window.Audio = undefined; // jsdom cannot play the unlock sound that marking by hand now plays
  host.window.MainWindowBrowserManager={m_lastLocation:{pathname:'/routes/library/app/33230'}};
  host.window.Millennium={callServerMethod:async(_p,_m,args)=>JSON.stringify({schemaVersion:1,appId:JSON.parse(args.payload).appId,status:'watching',message:'Automatic tracking on autosaves (25 of 50 achievements).',supportedIndices:[],progress:{},saveFound:true})};
  host.window.MILLENNIUM_BACKEND_IPC = { postMessage(...args) { ack.push(args); return Promise.resolve(); } };
  host.window.eval(script);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(JSON.stringify(ack)), [[1, {pluginName: 'steam-custom-achievements'}]]);
  return host.window.__SCA_RUNTIME__;
}
function button(window, name) {
  const found = [...window.document.querySelectorAll('button')].find(b => b.textContent === name);
  assert.ok(found, `Missing button: ${name}`);
  return found;
}
function open(window) { window.document.querySelector('.sca-view').click(); }
function check(label) { console.log('PASS', label); passes++; }

(async () => {
  const host = makeWindow('SharedJSContext', {'20': true});
  const main = makeWindow('SP Desktop_uid0');
  const settings = makeWindow('PopupWindow_Settings');
  const manager = makeManager([{window: main.window}, {window: settings.window}]);
  const runtime = await boot(host, manager);
  assert.equal(host.window.document.getElementById(id), null);
  assert.equal(settings.window.document.getElementById(id), null);
  assert.ok(main.window.document.getElementById(id));
  assert.equal(runtime.diagnostics().attachedWindows, 1);
  check('mounts in the visible Steam window, excluding hidden host and Settings');

  assert.match(main.window.document.querySelector('.sca-count').textContent, /1\/51/);
  open(main.window);
  assert.equal(main.window.document.querySelectorAll('.sca-ach').length, 51);
  main.window.document.querySelector('[aria-label="Street Cleaner: unlocked, click to toggle"]').click();
  assert.deepEqual(JSON.parse(host.window.localStorage.getItem(key)), {});
  main.window.document.querySelector('[aria-label="Street Cleaner: locked, click to toggle"]').click();
  assert.ok(JSON.parse(host.window.localStorage.getItem(key))['20']);
  check('loads prior v0.1.2 progress and saves manual toggles to the original key');

  const gamepad = makeWindow('SP BPM_uid0');
  const gpPopup = manager.add(gamepad.window, true);
  assert.match(gamepad.window.document.querySelector('.sca-count').textContent, /1\/51/);
  main.window.document.querySelector('[aria-label="Street Cleaner: unlocked, click to toggle"]').click();
  assert.match(gamepad.window.document.querySelector('.sca-count').textContent, /0\/51/);
  check('new popup callback and m_popup wrapper work; both windows share live progress');

  const search = main.window.document.querySelector('input[type=search]');
  search.value = 'Birth of an Assassin';
  search.dispatchEvent(new main.window.Event('input'));
  assert.equal(main.window.document.querySelectorAll('.sca-ach').length, 1);
  search.value = '';
  search.dispatchEvent(new main.window.Event('input'));
  const select = main.window.document.querySelector('.sca-select');
  select.value = 'Tombs';
  select.dispatchEvent(new main.window.Event('change'));
  assert.equal(main.window.document.querySelectorAll('.sca-ach').length, 6);
  select.value = 'all';
  select.dispatchEvent(new main.window.Event('change'));
  assert.equal(main.window.document.querySelectorAll('.sca-ach').length, 51);
  check('achievement search and category filter work in the popup');

  button(main.window, 'SETTINGS').click();
  button(main.window, 'Restore').click();
  let input = main.window.document.querySelector('[aria-label="Backup to restore"]');
  input.value = '{"version":1,"appId":999,"progress":{"0":true}}';
  button(main.window, 'Replace progress').click();
  assert.match(main.window.document.querySelector('.sca-editor').textContent, /Invalid backup/);
  assert.equal(JSON.parse(host.window.localStorage.getItem(key))['20'], undefined);
  input.value = JSON.stringify({version:1, appId:33230, progress:{'2':true, '100':true}});
  button(main.window, 'Replace progress').click();
  assert.deepEqual(JSON.parse(host.window.localStorage.getItem(key)), {'2':true});
  assert.match(gamepad.window.document.querySelector('.sca-count').textContent, /1\/51/);
  button(main.window, 'Backup').click();
  assert.equal(JSON.parse(main.window.document.querySelector('.sca-backup').value).progress['2'], true);
  button(main.window, 'Copy status').click();
  const status = JSON.parse(main.window.document.querySelector('.sca-backup').value);
  assert.equal(status.version, JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8')).version);
  assert.equal(status.attachedWindows, 2);
  assert.equal(JSON.stringify(status).includes('steamloopback'), false);
  check('backup, validated in-panel restore and privacy-limited status work without native prompts');

  main.window.document.getElementById(id).remove();
  main.window.document.getElementById('sca-ac2-css').remove();
  runtime.refresh();
  assert.ok(main.window.document.getElementById(id));
  assert.ok(main.window.document.getElementById('sca-ac2-css'));
  assert.match(main.window.document.querySelector('.sca-count').textContent, /1\/51/);
  host.window.eval(script);
  assert.equal(main.window.document.querySelectorAll('#'+id).length, 1);
  assert.equal(manager.created.size, 1);
  check('recovers a replaced body and removed stylesheet without duplicate roots or hooks');

  manager.remove(gpPopup);
  assert.equal(gamepad.window.document.getElementById(id), null);
  assert.equal(runtime.diagnostics().attachedWindows, 1);
  runtime.dispose();
  assert.equal(main.window.document.getElementById(id), null);
  assert.equal(manager.created.size, 0);
  assert.equal(manager.destroyed.size, 0);
  manager.add(gamepad.window);
  assert.equal(gamepad.window.document.getElementById(id), null);
  check('destroy and dismount remove UI and unregister popup hooks');

  // No manager initially: don't mount into the hidden host as a fallback.
  const lateHost = makeWindow('SharedJSContext');
  const lateRuntime = await boot(lateHost, undefined);
  assert.equal(lateRuntime.diagnostics().attachedWindows, 0);
  assert.equal(lateHost.window.document.getElementById(id), null);
  const lateMain = makeWindow('SP Desktop_uid0', {'4':true});
  lateHost.window.g_PopupManager = makeManager([{window:lateMain.window}]);
  await new Promise(resolve => setTimeout(resolve, 1150));
  assert.match(lateMain.window.document.querySelector('.sca-count').textContent, /1\/51/);
  check('real timer discovers late startup and recovers progress from the popup origin');

  lateRuntime.dispose();
  const blockedHost = makeWindow('SharedJSContext');
  const blockedMain = makeWindow('SP Desktop_uid0');
  for (const w of [blockedHost.window, blockedMain.window]) {
    Object.defineProperty(w, 'localStorage', { get() { throw new w.DOMException('Blocked', 'SecurityError'); } });
  }
  const blockedRuntime = await boot(blockedHost, makeManager([{window:blockedMain.window}]));
  open(blockedMain.window);
  blockedMain.window.document.querySelector('[aria-label="Street Cleaner: locked, click to toggle"]').click();
  assert.match(blockedMain.window.document.querySelector('.sca-count').textContent, /1\/51/);
  button(blockedMain.window, 'SETTINGS').click();
  assert.match(blockedMain.window.document.querySelector('.sca-storage-state').textContent, /saving unavailable/);
  assert.equal(blockedRuntime.diagnostics().storageAvailable, false);
  check('blocked storage leaves the tracker usable and displays a saving warning');

  for (const sample of [host, main, gamepad, settings, lateHost, lateMain, blockedHost, blockedMain]) {
    assert.equal(sample.networkAttempts, 0);
    assert.deepEqual(sample.errors, []);
  }
  blockedRuntime.dispose();
  check('no network attempts or unhandled DOM errors across all lifecycle scenarios');
  console.log(`All ${passes} window and persistence regression groups passed.`);
})().catch(error => { console.error(error); process.exitCode = 1; })
  .finally(() => { for (const w of windows) w.close(); });
