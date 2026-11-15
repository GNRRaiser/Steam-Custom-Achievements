/* Saved progress when Steam's local storage is not readable at first: automatic unlocks that
 * arrive before it are merged with the saved list once a Library window gives access to it,
 * and saved there, instead of hiding the hand-marked ones. Test dependency: jsdom.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require(process.env.SCA_TEST_MODULES
  ? path.join(process.env.SCA_TEST_MODULES, 'jsdom') : 'jsdom');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, '.millennium/Dist/index.js'), 'utf8');
const page = '<!doctype html><html><head></head><body><main><aside><section><h2>FRIENDS WHO PLAY</h2><div>Friends</div></section><section><h2>ADDITIONAL CONTENT</h2><div>Manual</div></section></aside></main></body></html>';
const KEY = 'sca:progress:7940:v1';

function makeWindow(name) {
  const dom = new JSDOM(page, { url: 'https://steamloopback.host/index.html', runScripts: 'outside-only' });
  dom.window.name = name;
  return dom.window;
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

(async () => {
  const host = makeWindow('SharedJSContext');
  const main = makeWindow('SP Desktop_uid0');
  // The plugin's own context has no usable storage; the Library window's has a hand-marked unlock.
  Object.defineProperty(host, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } });
  main.localStorage.setItem(KEY, JSON.stringify({ '24': '2026-10-01T00:00:00.000Z' }));
  main.localStorage.setItem('sca:reveal:7940:v1', 'true');
  let popups = [];
  host.MainWindowBrowserManager = { m_lastLocation: { pathname: '/routes/library/app/7940' } };
  host.g_PopupManager = { GetPopups: () => popups };
  // The game is running, so it is checked on every refresh.
  host.SteamUIStore = { RunningApps: [{ appid: 7940 }] };
  host.Millennium = { callServerMethod: async (_plugin, method, args) => {
    const request = JSON.parse(args.payload);
    if (request.appId === 7940 && method === 'GetTrackerState') {
      return JSON.stringify({ schemaVersion: 1, appId: 7940, status: 'watching', message: 'Watching config.cfg', saveFound: true,
        saveFileName: 'config.cfg', supportedIndices: [0, 1], progress: { '0': '2026-10-26T10:00:00Z', '1': '2026-10-26T11:00:00Z' } });
    }
    return JSON.stringify({ schemaVersion: 1, appId: request.appId, status: 'no-save', message: 'No save', progress: {}, supportedIndices: [] });
  } };
  host.Audio = undefined;
  host.eval(script);
  await tick(); await tick();
  const runtime = host.__SCA_RUNTIME__;
  // The automatic unlocks arrive while no window (and so no storage) is attached yet.
  runtime.refresh();
  for (let i = 0; i < 40 && !runtime.diagnostics().games.find(g => g.appId === 7940).unlocked; i++) await new Promise(r => setTimeout(r, 25));
  assert.equal(runtime.diagnostics().games.find(g => g.appId === 7940).unlocked, 2, 'automatic unlocks arrived first');
  assert.equal(runtime.diagnostics().storageAvailable, false);

  // The Library window opens: its storage holds the hand-marked unlock.
  popups = [{ window: main }];
  runtime.refresh(); await tick();
  const doc = main.document;
  assert.match(doc.querySelector('.sca-count').textContent, /3\/37/, 'the hand-marked unlock is still shown');
  assert.deepEqual(Object.keys(JSON.parse(main.localStorage.getItem(KEY))).sort(), ['0', '1', '24'], 'saved list holds both');
  assert.equal(doc.querySelector('.sca-toast'), null, 'no popups for unlocks that were already there');
  console.log('PASS automatic unlocks that arrive before storage is readable are merged with the saved list, not put over it');

  runtime.dispose();
  console.log('All storage tests passed.');
})().catch(error => { console.error(error); process.exit(1); });
