/* Steam Custom Achievements v__BUILD_VERSION__
 * Millennium 3.6.2 loose-file plugin: Xbox 360 achievement lists for Steam games
 * that have none, with read-only Lua detectors for games whose saves are mapped.
 * The entrypoint runs in SharedJSContext. UI belongs to popup.window.document.
 * No downloads, telemetry, Steamworks calls, or game-process access.
 */
(() => {
  "use strict";
  const hostWindow = window;
  const PLUGIN_NAME = "steam-custom-achievements";
  const BUILD_VERSION = "__BUILD_VERSION__";
  const SHARE_BUILD = __SHARE_BUILD__;
  const ROOT_ID = "sca-ac2-root";
  const STYLE_ID = "sca-ac2-css";
  const GAMES = __GAMES_DATA__;
  const GAME_BY_APP = new Map();
  const previous = hostWindow.__SCA_RUNTIME__;
  if (previous?.version === BUILD_VERSION && previous.active) {
    previous.refresh();
    return;
  }
  previous?.dispose?.();

  // Per-game state. Storage keys keep the v0.1 pattern, so AC2 progress carries over.
  for (const game of GAMES) {
    Object.assign(game, {
      storageKey: `sca:progress:${game.appId}:v1`,
      iconKey: `sca:icons:${game.appId}:v1`,
      progress: {}, customIcons: {}, iconsLoaded: false, storageFound: false, dirty: false,
      auto: game.automatic
        ? {status:"connecting",message:"Connecting automatic tracking",progress:{},supportedIndices:[]}
        : {status:"manual",message:"Manual tracking: mark each achievement when you earn it.",progress:{},supportedIndices:[]},
      busy: false, pendingAt: 0,
    });
    GAME_BY_APP.set(game.appId, game);
  }
  // Games polled in the background: automatic ones, plus any with "capture while I play" on.
  const polledGames = () => GAMES.filter(game => game.automatic || game.captureOn);

  const views = new Map();
  const storageCandidates = new Set();
  const errors = new Map();
  let storageAvailable = false;
  let selectedStorage = null;
  let active = true;
  let started = false;
  let timer = null;
  let popupManager = null;
  let hookState = "waiting";
  let registrations = [];
  let pollTurn = 0;
  let detectorTransport="waiting",lastDetectorError=null;

  const isGamepadWindow = targetWindow => {
    try { return /^SP BPM(?:_|$)/i.test(String(targetWindow?.name || "")); } catch (_) { return false; }
  };
  function steamUIStore() {
    try { return typeof SteamUIStore !== "undefined" ? SteamUIStore : hostWindow.SteamUIStore; } catch (_) { return null; }
  }
  // Big Picture keeps its own route. MainWindowBrowserManager only follows the
  // desktop Library, so Big Picture reads the route of its own window instead.
  function gamepadPath(targetWindow) {
    const paths = [];
    try {
      const store = steamUIStore()?.WindowStore;
      for (const instance of [store?.GetWindowInstanceFromWindow?.(targetWindow), store?.GamepadUIMainWindowInstance]) {
        if (!instance) continue;
        paths.push(instance.m_locationPathname, instance.History?.location?.pathname, instance.m_history?.location?.pathname);
      }
    } catch (_) { /* older client: try the next source */ }
    try { const nav = hostWindow.tempNavStore; if (nav) paths.push(nav.m_locationPathname, nav.m_history?.location?.pathname); } catch (_) { /* ignore */ }
    try { paths.push(targetWindow.location.pathname + " " + targetWindow.location.hash); } catch (_) { /* ignore */ }
    return paths.find(path => typeof path === "string" && APP_PATH.test(path)) || "";
  }
  const APP_PATH = /\/(?:routes\/)?library\/app\/(\d+)(?=[/?#\s]|$)/i;
  function currentAppId(targetWindow) {
    let path = "";
    if (isGamepadWindow(targetWindow)) path = gamepadPath(targetWindow);
    else try {
      const browserManager = typeof MainWindowBrowserManager !== "undefined"
        ? MainWindowBrowserManager : hostWindow.MainWindowBrowserManager;
      if (browserManager?.m_lastLocation) {
        const loc = browserManager.m_lastLocation;
        path = [loc.pathname,loc.hash].join(" ");
      } else path = [targetWindow.location.pathname,targetWindow.location.hash].join(" ");
    } catch (_) { return null; }
    const match = path.match(APP_PATH);
    return match ? Number(match[1]) : null;
  }

  function currentGame(targetWindow) {
    return GAME_BY_APP.get(currentAppId(targetWindow)) || null;
  }

  function decodeReply(value) {
    for (let count=0;count<2 && typeof value==="string";count++) value=JSON.parse(value);
    return value;
  }

  // One argument only: the Lua side receives it positionally as a JSON string.
  async function callDetector(method, request, timeoutMs = 5000) {
    const api = hostWindow.MILLENNIUM_API?.Millennium || hostWindow.Millennium;
    if (typeof api?.callServerMethod !== "function") throw new Error("Automatic backend unavailable");
    let timeout;
    try {
      const reply = await Promise.race([
        api.callServerMethod(PLUGIN_NAME, method, {payload: JSON.stringify(request)}),
        new Promise((_,reject)=>{timeout=hostWindow.setTimeout(()=>reject(new Error("Automatic backend timed out")),timeoutMs);}),
      ]);
      detectorTransport="millennium-lua";
      return decodeReply(reply);
    } finally { if(timeout!==undefined)hostWindow.clearTimeout(timeout); }
  }

  function acceptAutomaticState(game, next) {
    if (next?.schemaVersion !== 1 || next.appId !== game.appId || typeof next.progress !== "object") throw new Error("Invalid detector state");
    const before = JSON.stringify(game.auto);
    game.auto = next;
    lastDetectorError=null;
    const fresh = [];
    for (const [key,value] of Object.entries(next.progress || {})) {
      const index=Number(key);
      if (!Number.isInteger(index) || String(index)!==key || !game.achievements[index]?.automatic || typeof value!=="string" || value.length>99) continue;
      if (!game.progress[key]) { game.progress[key]=value;fresh.push(index); }
    }
    // Saved progress must be loaded first, or every old unlock would pop up again.
    const announce = game.storageFound;
    if (fresh.length) writeProgress(game);
    if (announce && fresh.length) announceUnlocks(game, fresh);
    game.captureOn = !!next.capture?.enabled;
    // Never replace a focused filter or a half-written restore/save-path field.
    if (before!==JSON.stringify(next)) {
      for (const view of views.values()) if (view.game()===game) view.updateAutomatic?.();
    }
  }

  // "Achievement unlocked" popups styled like Steam's own toast, drawn in every
  // Steam window the plugin can reach (the in-game overlay included), with Steam's
  // own unlock sound when the client has it and a short chime otherwise.
  const POPUP_KEY = "sca:popups:v1";
  const TOAST_ID = "sca-toast-host";
  const STEAM_SOUND = "/sounds/deck_ui_achievement_toast.wav";
  const toastQueue = [];
  let toastBusy = false, audioContext = null, steamSoundWorks = true;
  function popupsEnabled() {
    for (const store of storageCandidates) {
      try { const value = store.getItem(POPUP_KEY); if (value !== null) return value !== "off"; } catch (_) { /* try the next store */ }
    }
    return true;
  }
  function setPopupsEnabled(on) {
    for (const store of new Set([selectedStorage, ...storageCandidates])) {
      if (!store) continue;
      try { store.setItem(POPUP_KEY, on ? "on" : "off"); return true; } catch (error) { report("popup-setting-failed", error); }
    }
    return false;
  }
  function popupWindows() {
    const found = new Set();
    try {
      for (const popup of Array.from(getPopupManager()?.GetPopups?.() || [])) {
        const target = popupWindow(popup);
        if (target && !target.closed && target.document?.body) found.add(target);
      }
    } catch (error) { report("popup-scan-failed", error); }
    for (const target of views.keys()) if (!target.closed && target.document?.body) found.add(target);
    return [...found];
  }
  // An original two-note chime made on the fly; no sound files ship with the plugin.
  function chime() {
    try {
      const Context = hostWindow.AudioContext || hostWindow.webkitAudioContext;
      if (!Context) return;
      audioContext ||= new Context();
      if (audioContext.state === "suspended") void audioContext.resume?.();
      const start = audioContext.currentTime + 0.02;
      for (const [offset, frequency] of [[0, 784], [0.12, 1175]]) {
        const tone = audioContext.createOscillator(), gain = audioContext.createGain();
        tone.type = "sine"; tone.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.25, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.7);
        tone.connect(gain).connect(audioContext.destination);
        tone.start(start + offset); tone.stop(start + offset + 0.75);
      }
    } catch (error) { report("popup-sound-failed", error); }
  }
  // The sound file is read from the user's own Steam install, never bundled.
  function unlockSound() {
    if (!steamSoundWorks || typeof hostWindow.Audio !== "function") { chime(); return; }
    try {
      const audio = new hostWindow.Audio(STEAM_SOUND);
      audio.volume = 0.8;
      const playing = audio.play();
      if (playing?.catch) playing.catch(() => { steamSoundWorks = false; chime(); });
    } catch (_) { steamSoundWorks = false; chime(); }
  }
  function drawToast(target, item) {
    const document = target.document;
    let host = document.getElementById(TOAST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = TOAST_ID;
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      host.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:none;display:flex;flex-direction:column;gap:8px;font-family:'Motiva Sans',Arial,Helvetica,sans-serif";
      document.body.appendChild(host);
    }
    const toast = document.createElement("div");
    toast.className = "sca-toast";
    toast.style.cssText = "display:flex;align-items:center;gap:12px;width:300px;padding:10px;border-radius:4px;background:linear-gradient(135deg,#2a3443 0%,#1b2129 100%);border:1px solid rgba(255,255,255,.07);box-shadow:0 8px 24px rgba(0,0,0,.55);color:#fff;opacity:0;transform:translateY(24px);transition:opacity .3s ease,transform .3s ease";
    const badge = document.createElement("div");
    badge.style.cssText = "flex:none;width:64px;height:64px;border-radius:3px;overflow:hidden;background:#3d4450;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:24px;color:#dcdedf";
    if (item.icon) { const img = document.createElement("img"); img.alt = ""; img.src = item.icon; img.style.cssText = "width:100%;height:100%;object-fit:cover"; badge.appendChild(img); }
    else badge.textContent = String(item.count);
    const text = document.createElement("div");
    text.style.cssText = "min-width:0;line-height:1.3";
    const top = document.createElement("div");
    top.textContent = item.title;
    top.style.cssText = "font-size:12px;color:#8f98a0";
    const name = document.createElement("div");
    name.className = "sca-toast-name";
    name.textContent = item.name;
    name.style.cssText = "font-size:15px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis";
    text.append(top, name);
    if (item.detail) {
      const detail = document.createElement("div");
      detail.textContent = item.detail;
      detail.style.cssText = "font-size:12px;color:#acb2b8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden";
      text.appendChild(detail);
    }
    toast.append(badge, text);
    host.appendChild(toast);
    target.setTimeout(() => { toast.style.opacity = "1"; toast.style.transform = "none"; }, 30);
    target.setTimeout(() => { toast.style.opacity = "0"; toast.style.transform = "translateY(24px)"; }, 5200);
    target.setTimeout(() => { toast.remove(); if (!host.childElementCount) host.remove(); }, 5600);
  }
  // Steam's own achievement toast: the same one real achievements use, which Steam also
  // draws over a running game through its overlay. It is fed the way Steam's built-in
  // TestAchievement does: NotificationStore.OnNotification(id, 5 = Achievement, protobuf
  // CClientNotificationAchievement). The plugin's own toast is the fallback.
  const ACHIEVEMENT_NOTIFICATION = 5;
  let steamToastState = "untried", steamToastId = 900000;
  function protobuf(fields) {
    const out = [];
    const utf8 = text => Array.from(unescape(encodeURIComponent(text)), c => c.charCodeAt(0));
    const varint = value => { value = Math.max(0, Math.floor(value)); while (value > 127) { out.push((value % 128) | 128); value = Math.floor(value / 128); } out.push(value); };
    for (const [number, kind, value] of fields) {
      if (value === undefined || value === null || value === "") continue;
      if (kind === "string") { const bytes = utf8(String(value)); varint(number * 8 + 2); varint(bytes.length); for (const b of bytes) out.push(b); }
      else { varint(number * 8); varint(kind === "bool" ? (value ? 1 : 0) : value); }
    }
    return new Uint8Array(out);
  }
  function steamToast(item) {
    const store = hostWindow.NotificationStore;
    if (typeof store?.OnNotification !== "function") { steamToastState = "unavailable"; return false; }
    try {
      const id = Number.isInteger(store.m_nNextTestNotificationID) ? store.m_nNextTestNotificationID++ : steamToastId++;
      store.OnNotification(id, ACHIEVEMENT_NOTIFICATION, protobuf([
        [1, "string", item.key], [2, "uint", item.appId], [3, "string", item.name],
        [4, "string", item.steamDetail || item.detail], [5, "string", item.steamIcon || item.icon], [6, "bool", true],
        [7, "uint", Date.now() / 1000],
      ]));
      // Steam drops a toast without an error when its settings or UI mode say so.
      // If it neither queued nor showed ours, draw the plugin's own.
      const queue = store.m_rgNotificationToasts;
      if (Array.isArray(queue)) {
        const current = store.m_valueCurrentToast?.Value ?? store.m_valueCurrentToast?.m_currentValue;
        const queued = queue.some(toast => toast?.notificationID === id) || current?.notificationID === id;
        if (!queued) { steamToastState = `dropped-${uiMode()}`; return false; }
      }
      steamToastState = `steam-${uiMode()}`;
      return true;
    } catch (error) {
      steamToastState = "failed";
      report("steam-toast-failed", error);
      return false;
    }
  }
  // Which Steam UI is up: "desktop", "bigpicture" or the raw value.
  function uiMode() {
    try {
      const store = steamUIStore();
      const mode = store?.MainInstanceUIMode;
      if (mode === undefined || mode === null) return "unknown";
      if (typeof store.IsGamepadUIActive === "function") return store.IsGamepadUIActive() ? "bigpicture" : "desktop";
      return mode === 4 ? "bigpicture" : mode === 7 ? "desktop" : String(mode);
    } catch (_) { return "unknown"; }
  }
  function showNextToast() {
    if (toastBusy || !toastQueue.length || !active) return;
    const item = toastQueue.shift();
    // Steam queues and paces its own toasts and plays its own sound.
    if (item.appId && steamToast(item)) { showNextToast(); return; }
    toastBusy = true;
    for (const target of popupWindows()) {
      try { drawToast(target, item); } catch (error) { report("popup-draw-failed", error); }
    }
    unlockSound();
    hostWindow.setTimeout(() => { toastBusy = false; showNextToast(); }, 6000);
  }
  function announceUnlocks(game, indices, force = false) {
    if (!force && !popupsEnabled()) return;
    // A save that unlocks a lot at once gets one summary instead of a long queue.
    if (indices.length > 3) {
      let icon = null;
      try { icon = iconFor(game, indices[0]); } catch (_) { /* the badge shows the count instead */ }
      toastQueue.push({ count: indices.length, title: game.title, name: `${indices.length} achievements unlocked`,
        appId: game.appId, key: `sca-${indices.join("-")}`, steamIcon: icon, steamDetail: game.title });
    } else {
      for (const index of indices) {
        const a = game.achievements[index];
        if (!a) continue;
        let icon = null;
        try { icon = iconFor(game, index); } catch (_) { /* the badge shows a number instead */ }
        toastQueue.push({ count: 1, icon, title: "Achievement Unlocked!", name: a.name, detail: a.detail || "",
          appId: game.appId, key: `sca-${index}` });
      }
    }
    showNextToast();
  }

  async function pollGame(game) {
    if (!active || game.busy || Date.now()-game.pendingAt<1400) return;
    game.pendingAt=Date.now();game.busy=true;
    const epoch=game.resetEpoch;
    try {
      const next=await callDetector("GetTrackerState",{appId:game.appId});
      // A reply that left before "Reset to locked" still carries the old unlocks.
      if (active && epoch===game.resetEpoch) acceptAutomaticState(game,next);
    } catch (error) {
      if (active) {
        lastDetectorError=String(error?.message||error).replace(/[\r\n]+/g,' ').slice(0,300);
        game.auto={...game.auto,status:"unavailable",message:`Automatic detector error: ${lastDetectorError}`};
        for (const view of views.values()) if (view.game()===game) view.updateAutomatic?.();
      }
    } finally { game.busy=false; }
  }

  // The game on screen is checked every second; the others take turns so that
  // progress made while Steam shows another page is still recorded.
  function pollAutomatic() {
    const polled = polledGames();
    if (!polled.length) return;
    const shown = new Set();
    for (const view of views.values()) { const game=view.game(); if (game?.automatic||game?.captureOn) shown.add(game); }
    for (const game of shown) void pollGame(game);
    if (++pollTurn % 3 !== 0) return;
    const background = polled[(pollTurn / 3) % polled.length];
    if (!shown.has(background)) void pollGame(background);
  }

  async function loadCaptures() {
    try {
      const reply = await callDetector("GetCaptureList", {});
      for (const appId of Array.isArray(reply?.captures) ? reply.captures : []) {
        const game = GAME_BY_APP.get(appId);
        if (game) game.captureOn = true;
      }
    } catch (_) { /* older backend or not ready: capture stays off until turned on */ }
  }

  async function setCapture(game, enabled, folder) {
    const state=await callDetector("SetCapture",{appId:game.appId,enabled,folder},30000);
    if (active) acceptAutomaticState(game,state);
  }

  // Record mode reads a whole save folder, so it gets a longer timeout.
  async function recordCall(game, method, extra = {}) {
    const reply=await callDetector(method,{appId:game.appId,...extra},30000);
    if (reply?.appId!==game.appId) throw new Error("Invalid record mode reply");
    return reply;
  }

  // "Reset to locked": manual marks and automatic unlocks both go. The backend holds back
  // what the current save already earns, so those unlock (with a popup) only when earned again.
  async function resetProgress(game) {
    game.resetEpoch=(game.resetEpoch||0)+1;
    const state=game.automatic ? await callDetector("ResetProgress",{appId:game.appId},30000) : null;
    game.progress={};
    writeProgress(game);
    if (state && active) acceptAutomaticState(game,state);
  }

  async function selectSavePath(game, path) {
    const state=await callDetector("SetSavePath",{appId:game.appId,path});
    if (active) acceptAutomaticState(game,state);
  }

  function report(code, error) {
    if (errors.has(code)) return;
    // Diagnostics contain our error codes only, never account data or URLs.
    errors.set(code, error?.name || "Error");
    console.warn(`[Steam Custom Achievements ${BUILD_VERSION}] ${code}`, error);
  }

  function cleanProgress(game, value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const clean = {};
    game.achievements.forEach((_achievement, i) => {
      const valueAtIndex = value[String(i)];
      if (valueAtIndex === true || (typeof valueAtIndex === "string" && valueAtIndex.length > 0 && valueAtIndex.length < 100)) {
        clean[String(i)] = valueAtIndex;
      }
    });
    return clean;
  }

  function loadIcons(game) {
    if (game.iconsLoaded) return;
    for (const store of storageCandidates) {
      try {
        const raw = store.getItem(game.iconKey);
        if (raw === null) continue;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          for (const [key, value] of Object.entries(parsed)) {
            if (game.achievements[Number(key)] && typeof value === "string" && value.length < 200000) game.customIcons[key] = value;
          }
          game.iconsLoaded = true;
          return;
        }
      } catch (error) { report("icons-read-failed", error); }
    }
  }

  function loadProgress(game) {
    if (game.storageFound || game.dirty) return;
    for (const store of storageCandidates) {
      try {
        const raw = store.getItem(game.storageKey);
        selectedStorage ||= store;
        storageAvailable = true;
        if (raw === null) continue;
        const clean = cleanProgress(game, JSON.parse(raw));
        if (clean === null) {
          report("invalid-saved-progress", new TypeError("Expected progress object"));
          continue;
        }
        selectedStorage = store;
        // Keep automatic unlocks that arrived before storage was readable.
        game.progress = {...clean, ...game.progress};
        game.storageFound = true;
        if (syncCompletion(game) !== null) writeProgress(game);
        redrawViews();
        return;
      } catch (error) {
        report("progress-read-failed", error);
      }
    }
  }

  function configureStorage(targetWindow) {
    try {
      const store = targetWindow.localStorage;
      if (store) storageCandidates.add(store);
    } catch (error) {
      report("storage-access-blocked", error);
    }
    for (const game of GAMES) { loadIcons(game); loadProgress(game); }
  }

  // The platinum entry unlocks by itself once every other achievement is unlocked,
  // and locks again when one of them is locked. Returns its index when it just unlocked.
  function syncCompletion(game) {
    const index = game.achievements.findIndex(a => a.completion);
    if (index < 0) return null;
    const key = String(index);
    const all = game.achievements.every((_a, i) => i === index || !!game.progress[String(i)]);
    if (all && !game.progress[key]) { game.progress[key] = new Date().toISOString(); return index; }
    if (!all && game.progress[key]) delete game.progress[key];
    return null;
  }

  function writeProgress(game) {
    const announce = game.storageFound;
    const platinum = syncCompletion(game);
    // After the caller's own popups, so the platinum comes last.
    if (announce && platinum !== null) Promise.resolve().then(() => { if (active) announceUnlocks(game, [platinum]); });
    game.dirty = true;
    const stores = new Set([selectedStorage, ...storageCandidates]);
    storageAvailable = false;
    for (const store of stores) {
      if (!store) continue;
      try {
        store.setItem(game.storageKey, JSON.stringify(game.progress));
        selectedStorage = store;
        storageAvailable = true;
        game.storageFound = true;
        break;
      } catch (error) {
        report("progress-save-failed", error);
      }
    }
    redrawViews();
  }

  function writeIcons(game) {
    game.iconsLoaded = true;
    let saved = false;
    for (const store of new Set([selectedStorage, ...storageCandidates])) {
      if (!store) continue;
      try { store.setItem(game.iconKey, JSON.stringify(game.customIcons)); saved = true; break; }
      catch (error) { report("icons-save-failed", error); }
    }
    redrawViews();
    return saved;
  }

  function redrawViews() {
    for (const view of views.values()) view.render();
  }

  function getPopupManager() {
    try {
      return typeof g_PopupManager !== "undefined" ? g_PopupManager : hostWindow.g_PopupManager;
    } catch (_) { return null; }
  }

  function popupWindow(popup) {
    return popup?.window || popup?.m_popup?.window || null;
  }

  function windowType(popup, targetWindow) {
    const name = String(targetWindow.name || popup?.m_strName || "");
    if (/^SP Desktop(?:_|$)/i.test(name)) return "desktop";
    if (/^SP BPM(?:_|$)/i.test(name)) return "gamepad";
    if (targetWindow.document.documentElement?.classList.contains("MillenniumWindow_MainSteamWindow")) return "desktop";
    return null;
  }

  function attach(popup) {
    if (!active) return;
    try {
      const targetWindow = popupWindow(popup);
      if (!targetWindow || targetWindow.closed) return;
      const type = windowType(popup, targetWindow);
      if (!type) return;
      const old = views.get(targetWindow);
      if (old && old.document === targetWindow.document) {
        return;
      }
      old?.dispose();
      views.delete(targetWindow);
      configureStorage(targetWindow);
      const view = createTracker(targetWindow, type);
      view.type = type;
      views.set(targetWindow, view);
      view.refresh();
      console.info(`[Steam Custom Achievements ${BUILD_VERSION}] Attached to ${type} Steam window`);
    } catch (error) {
      report("window-attach-failed", error);
    }
  }

  function detach(popup) {
    const targetWindow = popupWindow(popup);
    const view = views.get(targetWindow);
    view?.dispose();
    views.delete(targetWindow);
  }

  function unregisterHooks() {
    for (const registration of registrations) {
      try {
        if (typeof registration === "function") registration();
        else registration?.Unregister?.();
      } catch (error) { report("window-unregister-failed", error); }
    }
    registrations = [];
  }

  function refresh() {
    if (!active) return;
    const manager = getPopupManager();
    if (manager !== popupManager) {
      unregisterHooks();
      popupManager = manager;
      hookState = manager ? "polling" : "waiting";
      if (manager) {
        try {
          if (typeof manager.AddPopupCreatedCallback === "function") {
            registrations.push(manager.AddPopupCreatedCallback(attach));
            hookState = "subscribed";
          }
          if (typeof manager.AddPopupDestroyedCallback === "function") {
            registrations.push(manager.AddPopupDestroyedCallback(detach));
          }
        } catch (error) { report("window-hook-failed", error); }
      }
    }
    if (manager) {
      try {
        for (const popup of Array.from(manager.GetPopups?.() || [])) attach(popup);
        // GetExistingPopup wraps m_popup in some Steam versions.
        for (const name of ["SP Desktop_uid0", "SP BPM_uid0"]) attach(manager.GetExistingPopup?.(name));
        // Big Picture's main window, in case the popup list does not include it.
        const bpm = steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance?.BrowserWindow;
        if (bpm && bpm !== hostWindow) attach({ window: bpm });
      } catch (error) { report("window-scan-failed", error); }
    }
    // Explicitly named visible windows are useful for local previewing. An
    // unnamed or SharedJSContext host is never treated as the Library window.
    if (/^SP (?:Desktop|BPM)(?:_|$)/i.test(hostWindow.name || "")) attach({ window: hostWindow });
    for (const [targetWindow, view] of views) {
      try {
        if (targetWindow.closed || targetWindow.document !== view.document) {
          view.dispose();
          views.delete(targetWindow);
        } else view.refresh();
      } catch (error) {
        view.dispose();
        views.delete(targetWindow);
        report("window-refresh-failed", error);
      }
    }
    pollAutomatic();
  }

  function diagnostics() {
    return {
      plugin: PLUGIN_NAME,
      version: BUILD_VERSION,
      active,
      windowHook: hookState,
      attachedWindows: views.size,
      windows: Array.from(views.values(), view => ({
        type: view.type,
        cardPresent: !!view.document.getElementById(ROOT_ID),
        dialogOpen: view.dialogOpen?.() || false,
        stylePresent: !!view.document.getElementById(STYLE_ID),
        placement: view.placement(),
        header: view.headerInfo?.() || null,
        controller: view.controller?.() || null,
        appId: currentAppId(view.document.defaultView),
        game: view.game()?.title || null,
      })),
      storageAvailable,
      popups: { enabled: popupsEnabled(), steamToast: steamToastState, uiMode: uiMode(), windows: (() => { try { return Array.from(getPopupManager()?.GetPopups?.() || [], popup => String(popupWindow(popup)?.name || popup?.m_strName || "").slice(0, 60)); } catch (_) { return []; } })() },
      transport: detectorTransport,
      error: lastDetectorError,
      games: GAMES.map(game => ({
        appId: game.appId, title: game.title, total: game.achievements.length,
        unlocked: Object.keys(game.progress).length, savedProgressFound: game.storageFound,
        automatic: game.automatic ? {status:game.auto.status,supported:game.auto.supportedIndices?.length||0,saveFound:!!game.auto.saveFound,
          saveFileName:game.auto.saveFileName||null,details:game.auto.details||null} : null,
      })),
      errors: Array.from(errors, ([code, name]) => ({ code, name })),
    };
  }

  function dispose() {
    if (!active) return;
    active = false;
    if (timer !== null) hostWindow.clearInterval(timer);
    timer = null;
    unregisterHooks();
    for (const view of views.values()) view.dispose();
    views.clear();
    if (hostWindow.__SCA_RUNTIME__ === runtime) delete hostWindow.__SCA_RUNTIME__;
  }

  __ICONS_SOURCE__

  __TRACKER_SOURCE__

  const lifecycle = { onDismount: dispose };
  const runtime = { version: BUILD_VERSION, get active() { return active; }, refresh, diagnostics, dispose, announceUnlocks };
  function start() {
    if (started) return lifecycle;
    started = true;
    configureStorage(hostWindow);
    void loadCaptures();
    refresh();
    // One lightweight scan handles late startup, Library recreation and lost
    // DOM nodes. No MutationObserver scans Steam's entire React tree.
    timer = hostWindow.setInterval(refresh, 1000);
    console.info(`[Steam Custom Achievements ${BUILD_VERSION}] Ready for ${GAMES.length} games; waiting for a visible Steam window if necessary`);
    return lifecycle;
  }

  hostWindow.__SCA_RUNTIME__ = runtime;
  (hostWindow.PLUGIN_LIST ||= {})[PLUGIN_NAME] ||= {};
  hostWindow.MILLENNIUM_SIDEBAR_NAVIGATION_PANELS ||= {};
  const PluginModule = {
    default: start,
    diagnostics,
    onDismount: dispose,
    __millennium_internal_plugin_name_do_not_use_or_change__: PLUGIN_NAME,
  };
  Object.assign(hostWindow.PLUGIN_LIST[PLUGIN_NAME], PluginModule);
  Promise.resolve().then(() => {
    PluginModule.default();
    const ipc = typeof MILLENNIUM_BACKEND_IPC !== "undefined"
      ? MILLENNIUM_BACKEND_IPC : hostWindow.MILLENNIUM_BACKEND_IPC;
    if (typeof ipc?.postMessage === "function") return ipc.postMessage(1, { pluginName: PLUGIN_NAME });
  }).catch(error => report("startup-failed", error));
})();
