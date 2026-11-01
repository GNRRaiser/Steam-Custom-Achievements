/* Real Chromium regression: execute the bundle in the host; operate the
 * achievement panel in a separate popup, matching Steam's window architecture.
 * SCA_PLAYWRIGHT_MODULE and SCA_BROWSER optionally select an existing runtime.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(process.env.SCA_PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, '.millennium/Dist/index.js'), 'utf8');
const key = 'sca:progress:33230:v1';
const id = 'sca-ac2-root';
const errors = [];
const external = [];
const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(`<!doctype html><html><head><title>Steam Library test</title><style>
  body{margin:0;background:#101116;color:#c7c8ce;font:14px Arial}main{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,40%);gap:32px;padding:32px}aside{min-width:0;display:flex;flex-direction:column;gap:14px}.native-section{padding:0 10px}aside section>h2{font-size:14px;letter-spacing:.5px;font-weight:500;margin:0 0 7px}.native-card{background-image:linear-gradient(180deg,#3a3f48,#2b2f37);box-shadow:0 0 0 1px #ffffff12;padding:14px;min-height:70px;color:#bfc2cc}.main-content{min-height:700px}@media(max-width:700px){main{display:block;padding:18px}.main-content{min-height:120px}aside{margin-top:18px}}
  </style></head><body><div id="sortmenu" style="display:none"><div>Play time</div><div>Last played</div></div><main><article class="main-content"><h1>Assassin's Creed II</h1><div id="stats" style="display:flex;gap:24px"><div class="stat" id="lastplayed"><div style="font-size:12px;text-transform:uppercase">Last played</div><div>Oct 25</div></div><div class="stat" id="playtime" style="display:flex;align-items:center;gap:10px"><svg id="clock" viewBox="0 0 24 24" style="width:22px;height:22px;color:#8b929a;opacity:.8" fill="currentColor"><circle cx="12" cy="12" r="9"/></svg><div><div style="font-size:12px;text-transform:uppercase">Play time</div><div>10 hours</div></div></div><div class="stat" style="display:flex;align-items:center;gap:10px"><svg viewBox="0 0 24 24" style="width:22px;height:22px"></svg><div><div style="font-size:12px;text-transform:uppercase">Size on disk</div><div>8 GB</div></div></div></div><div id="measure" style="visibility:hidden;position:absolute;display:flex;gap:24px"><div><div>Last played</div><div>Oct 25</div></div><div id="playtime2" style="display:flex;gap:10px"><svg viewBox="0 0 24 24" style="width:22px;height:22px"></svg><div><div>Play time</div><div>10 hours</div></div></div></div><p>Activity and game content</p></article><aside id="sidebar"><section class="native-section" id="friends"><h2><span>FRIENDS WHO PLAY</span></h2><div class="native-card">Friend activity</div></section><section class="native-section"><h2>ADDITIONAL CONTENT</h2><div class="native-card">Manual</div></section><section class="native-section"><h2>NOTES</h2><div class="native-card">New note</div></section><section class="native-section"><h2>DLC</h2><div class="native-card">Manage DLC</div></section><section class="native-section"><h2>RECORDINGS AND SCREENSHOTS</h2><div class="native-card">Screenshots</div></section></aside></main></body></html>`);
});
let browser;

async function harness(origin) {
  const context = await browser.newContext({ viewport:{width:1200,height:850} });
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin)) return route.continue();
    external.push(route.request().url());
    return route.abort();
  });
  context.on('page', page => page.on('pageerror', e => errors.push(String(e))));
  const host = await context.newPage();
  await host.goto(origin + '/shared');
  await host.evaluate(() => {
    window.name = 'SharedJSContext';
    window.acks = [];
    window.MainWindowBrowserManager={m_lastLocation:{pathname:'/routes/library/app/33230'}};
    window.mockAuto={schemaVersion:1,appId:33230,status:'watching',message:'Automatic tracking on autosaves (25 of 50 achievements).',supportedIndices:[],progress:{},counts:{'46':{have:9,need:100,label:'Feathers'}},availableSaves:{},saveFound:true};
    window.Millennium={callServerMethod:async(_p,_m,args)=>{const appId=JSON.parse(args.payload).appId;return JSON.stringify(appId===33230?window.mockAuto:{...window.mockAuto,appId,counts:{},progress:{}});}};
    window.MILLENNIUM_BACKEND_IPC = { postMessage(type, data) { window.acks.push([type,data]); } };
    window.g_PopupManager = {
      popups: [], created:new Set(), destroyed:new Set(),
      GetPopups() { return this.popups; },
      GetExistingPopup(name) { return this.popups.find(p => p.window.name === name); },
      AddPopupCreatedCallback(cb) { this.created.add(cb); return {Unregister:()=>this.created.delete(cb)}; },
      AddPopupDestroyedCallback(cb) { this.destroyed.add(cb); return {Unregister:()=>this.destroyed.delete(cb)}; },
      add(window) {
        const popup = {window}; this.popups.push(popup);
        for (const cb of this.created) cb(popup);
      },
      remove(window) {
        const popup=this.popups.find(p=>p.window===window);
        this.popups=this.popups.filter(p=>p!==popup);
        for(const cb of this.destroyed) cb(popup);
      },
    };
  });
  const pending = host.waitForEvent('popup');
  await host.evaluate(() => {
    window.mainPopup = window.open('/main', 'SP Desktop_uid0');
    g_PopupManager.add(window.mainPopup);
  });
  const main = await pending;
  await main.waitForLoadState();
  return {context,host,main};
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    ...(process.env.SCA_BROWSER ? {executablePath:process.env.SCA_BROWSER} : {}),
    headless:true, args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-zygote'],
  });

  if (process.env.SCA_PREVIOUS_BUNDLE) {
    const old = await harness(origin);
    await old.host.addScriptTag({content:fs.readFileSync(process.env.SCA_PREVIOUS_BUNDLE,'utf8')});
    await old.host.locator('#'+id).waitFor();
    assert.equal(await old.main.locator('#'+id).count(),0);
    await old.context.close();
    console.log('PASS v0.1.2 reproduces the bug: root in host, no root in visible popup');
  }

  const {context,host,main} = await harness(origin);
  await host.evaluate(key => {localStorage.setItem(key,JSON.stringify({'20':true}));localStorage.setItem('sca:reveal:33230:v1','true');},key);
  await host.addScriptTag({content:script});
  await main.locator('.sca-count').waitFor({state:'visible'});
  assert.equal(await host.locator('#'+id).count(),0);
  assert.equal(await main.locator('#sidebar > #'+id).count(),1);
  assert.equal(await main.locator('#friends + #'+id).count(),1);
  assert.equal(await main.locator('#'+id).evaluate(node=>getComputedStyle(node).position),'static');
  const edges=await main.evaluate(()=>{const a=document.querySelector('.sca-card').getBoundingClientRect(),b=document.querySelector('#friends .native-card').getBoundingClientRect(),h=document.querySelector('.sca-heading').getBoundingClientRect(),fh=document.querySelector('#friends h2').getBoundingClientRect();return {left:Math.abs(a.left-b.left),right:Math.abs(a.right-b.right),heading:Math.abs(h.left-fh.left)};});
  assert.ok(edges.left<1&&edges.right<1&&edges.heading<1,JSON.stringify(edges));
  assert.match(await main.locator('.sca-card').evaluate(n=>getComputedStyle(n).backgroundImage),/linear-gradient/);
  assert.match(await main.locator('.sca-count').innerText(),/You've unlocked 1\/51 \(2%\)/);
  assert.equal(await main.locator('.sca-icons[data-kind="unlocked"] .sca-tile').count(),1);
  assert.match(await main.locator('.sca-icons[data-kind="locked"] .sca-more').innerText(),/^\+\d+$/);
  assert.deepEqual(await host.evaluate(()=>window.acks),[[1,{pluginName:'steam-custom-achievements'}]]);
  await main.locator('#sca-ac2-headstat').waitFor();
  assert.equal(await main.locator('#playtime + #sca-ac2-headstat').count(),1);
  assert.match(await main.locator('#sca-ac2-headstat').innerText(),/ACHIEVEMENTS\s+1\/51/i);
  await main.locator('#sca-ac2-headstat').click();
  await main.getByRole('dialog').waitFor();
  await main.keyboard.press('Escape');
  console.log('PASS native-style card sits below Friends Who Play, matches gradient card edges, shows icon rows');

  await main.locator('.sca-view').click();
  await main.getByRole('dialog').waitFor();
  assert.match(await main.locator('.sca-earned').innerText(),/1 OF 51 ACHIEVEMENTS EARNED/);
  assert.equal(await main.locator('.sca-ach').count(),51);
  assert.match(await main.locator('.sca-ach[data-index="46"] .sca-ach-progress').innerText(),/9 \/ 100/);
  {
    const box=await main.locator('.sca-close').boundingBox();const panel=await main.locator('.sca-dialog').boundingBox();
    assert.ok(box.x>=panel.x&&box.y>=panel.y&&box.x+box.width<=panel.x+panel.width,'close button sits fully inside the dialog');
    assert.equal(await main.locator('.sca-ach-tag',{hasText:'Unlocks automatically'}).count(),0,'no per-achievement automatic tag');
    await main.mouse.click(box.x+6,box.y+box.height/2);
    assert.equal(await main.getByRole('dialog').count(),0,'a click near the edge of the close button closes the list');
    await main.locator('.sca-view').click();await main.getByRole('dialog').waitFor();
    console.log('PASS close button is inside the dialog and works on its edge');
  }
  assert.match(await main.locator('.sca-ach[data-index="46"]').innerText(),/Collect all the Feathers\./);
  await main.getByRole('button',{name:'Street Cleaner: unlocked, click to toggle',exact:true}).click();
  assert.match(await main.locator('.sca-count').innerText(),/0\/51/);
  await main.getByRole('button',{name:'Street Cleaner: locked, click to toggle',exact:true}).click();
  assert.ok(await host.evaluate(key=>JSON.parse(localStorage.getItem(key))['20'],key));
  assert.match(await main.locator('.sca-ach[data-index="20"] .sca-unlocked-at').innerText(),/^Unlocked \w{3} \d+, \d{4} @ /);
  await main.keyboard.press('Escape');
  assert.equal(await main.locator('#sca-ac2-dialog').count(),0);
  console.log('PASS View My Achievements popup lists 50, toggles manual entries with dates, closes on Escape');

  await main.locator('.sca-view').click();
  await main.getByRole('searchbox').fill('Birth of an Assassin');
  assert.equal(await main.locator('.sca-ach').count(),1);
  await main.getByRole('searchbox').fill('');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAAYdQHt6cBRtQAAAABJRU5ErkJggg==','base64');
  let chooser=main.waitForEvent('filechooser');
  await main.getByRole('button',{name:'Change picture for Exit the Son',exact:true}).click();
  await (await chooser).setFiles({name:'anything.png',mimeType:'image/png',buffer:png});
  await host.waitForFunction(()=>!!JSON.parse(localStorage.getItem('sca:icons:33230:v1')||'{}')['5']);
  await main.getByRole('tab',{name:'SETTINGS'}).click();
  chooser=main.waitForEvent('filechooser');
  await main.getByRole('button',{name:'Choose pictures…',exact:true}).click();
  await (await chooser).setFiles([{name:'5.png',mimeType:'image/png',buffer:png},{name:'Vengeance.png',mimeType:'image/png',buffer:png},{name:'notes.png',mimeType:'image/png',buffer:png}]);
  await host.waitForFunction(()=>{const v=JSON.parse(localStorage.getItem('sca:icons:33230:v1')||'{}');return v['4']&&v['5']&&Object.keys(v).length===2;});
  await main.locator('.sca-feedback').filter({hasText:'1 skipped'}).waitFor();
  await main.getByRole('tab',{name:'MY ACHIEVEMENTS'}).click();
  assert.match(await main.locator('.sca-ach[data-index="4"] img').getAttribute('src'),/^data:image\/(webp|png);base64,/);
  assert.match(await main.locator('.sca-ach[data-index="0"] img').getAttribute('src'),/^data:image\/webp;base64,/);
  await main.getByRole('tab',{name:'SETTINGS'}).click();
  await main.getByRole('button',{name:'Restore',exact:true}).click();
  await main.getByRole('textbox',{name:'Backup to restore',exact:true}).fill(JSON.stringify({version:1,appId:33230,progress:{'2':true,'3':true}}));
  await main.getByRole('button',{name:'Replace progress',exact:true}).click();
  assert.match(await main.locator('.sca-count').innerText(),/2\/51/);
  assert.match(await main.locator('.sca-earned').innerText(),/2 OF 51/);
  await main.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined}));
  await main.getByRole('button',{name:'Copy status',exact:true}).click();
  const status=JSON.parse(await main.getByRole('textbox',{name:'Status report JSON',exact:true}).inputValue());
  assert.equal(status.attachedWindows,1);
  assert.equal(status.windows[0].cardPresent,true);
  assert.equal(status.windows[0].dialogOpen,true);
  await main.locator('.sca-editor').getByRole('button',{name:'Close',exact:true}).click();
  // A page saved as "Webpage, Single File": names paired with their pictures, badges ignored.
  // Quoted-printable as Chrome writes it: '=' and every non-ASCII UTF-8 byte become =XX.
  const qp=text=>[...Buffer.from(text,'utf8')].map(b=>b===61||b>127?'='+b.toString(16).toUpperCase().padStart(2,'0'):String.fromCharCode(b)).join('').replace(/.{70}/g,'$&=\r\n');
  const item=(name,src,alt='')=>`<li class="ach"><a href="/a"><img src="${src}" alt="${alt}"></a><div><a class="title" href="/a">${name}</a> <img src="/gs.png" alt=""> 30</div><p>About ${name}</p></li>`;
  const html=`<html><body><ul>${item('The Pain of Betrayal','https://www.trueachievements.com/imagestore/3.png')}${item('Bloody Sunday','/imagestore/6.png')}${item('x','/imagestore/7.png','Undertaker')}${item('Not in this game','/imagestore/9.png')}</ul></body></html>`;
  const part=(type,location,body,encoding)=>`------MultipartBoundary--t----\r\nContent-Type: ${type}\r\nContent-Transfer-Encoding: ${encoding}\r\nContent-Location: ${location}\r\n\r\n${body}\r\n`;
  const b64=png.toString('base64');
  const mhtml=['From: <Saved by Blink>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\ttype="text/html";\r\n\tboundary="----MultipartBoundary--t----"\r\n\r\n',
    part('text/html','https://www.trueachievements.com/game/AC2/achievements',qp(html),'quoted-printable'),
    ...[3,6,7,9].map(n=>part('image/png',`https://www.trueachievements.com/imagestore/${n}.png`,b64,'base64')),
    part('image/png','https://www.trueachievements.com/gs.png',b64,'base64'),'------MultipartBoundary--t------\r\n'].join('');
  await main.getByRole('button',{name:'Reset to built-in pictures',exact:true}).click();
  chooser=main.waitForEvent('filechooser');
  await main.getByRole('button',{name:'Load from saved page…',exact:true}).click();
  await (await chooser).setFiles({name:'Assassins Creed II achievements.mhtml',mimeType:'multipart/related',buffer:Buffer.from(mhtml)});
  await main.locator('.sca-feedback').filter({hasText:'3 of 51 pictures loaded from the saved page'}).waitFor();
  assert.deepEqual(Object.keys(await host.evaluate(()=>JSON.parse(localStorage.getItem('sca:icons:33230:v1')))).sort(),['3','6','7']);
  chooser=main.waitForEvent('filechooser');
  await main.getByRole('button',{name:'Load from saved page…',exact:true}).click();
  await (await chooser).setFiles({name:'page.mhtml',mimeType:'multipart/related',buffer:Buffer.from('<html>not saved as single file</html>')});
  await main.locator('.sca-feedback').filter({hasText:'Not a saved single-file webpage'}).waitFor();
  await main.getByRole('button',{name:'Reset to built-in pictures',exact:true}).click();
  assert.equal(await host.evaluate(()=>localStorage.getItem('sca:icons:33230:v1')),'{}');
  // A saved page that lists unlock rates (like Exophase): each one is shown like Steam's
  // global percentage, rare ones (under 10%) in gold, and the list can sort by them.
  {
    const names=JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'..','source','games','ac2','achievements.json'),'utf8')).map(a=>a.name);
    const rows=names.map((name,i)=>`<div class="award"><img src="/imagestore/${i}.png" alt=""><div class="award-title"><a href="/a">${name}</a></div><div class="award-description">Text</div><div class="award-earned"><span>${(i*1.5+2).toFixed(2)}%</span></div></div>`).join('');
    const page=`<html><body><h1>Assassin's Creed II</h1><div>Overall completion 3.4%</div>${rows}</body></html>`;
    const saved=['From: <Saved by Blink>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\ttype="text/html";\r\n\tboundary="----MultipartBoundary--t----"\r\n\r\n',
      part('text/html','https://www.exophase.com/game/ac2/achievements/',qp(page),'quoted-printable'),'------MultipartBoundary--t------\r\n'].join('');
    chooser=main.waitForEvent('filechooser');
    await main.getByRole('button',{name:'Load from saved page…',exact:true}).click();
    await (await chooser).setFiles({name:'ac2 exophase.mhtml',mimeType:'multipart/related',buffer:Buffer.from(saved)});
    await main.locator('.sca-feedback').filter({hasText:'50 unlock rates loaded from the saved page'}).waitFor();
    const rates=await host.evaluate(()=>JSON.parse(localStorage.getItem('sca:rarity:33230:v1')));
    assert.equal(rates['0'],2);assert.equal(rates['10'],17);assert.equal(Object.keys(rates).length,50);
    await main.getByRole('tab',{name:'MY ACHIEVEMENTS'}).click();
    assert.match(await main.locator('.sca-ach[data-index="10"] .sca-ach-rarity').innerText(),/17% of players have this achievement/);
    assert.equal(await main.locator('.sca-ach[data-index="3"] .sca-rarity-rare').count(),1,'under 10% is rare');
    assert.equal(await main.locator('.sca-ach[data-index="3"] .sca-ach-icon.sca-rare').count(),1,'an unlocked rare one gets the gold edge');
    await main.getByRole('combobox',{name:'Sort achievements'}).selectOption('rare');
    assert.equal(await main.locator('.sca-ach').nth(2).getAttribute('data-index'),'0','locked ones sort rarest first');
    await main.getByRole('combobox',{name:'Sort achievements'}).selectOption('default');
    assert.match(await main.getByRole('combobox',{name:'Filter by category'}).innerText(),/Story \(2\/17\)/);
    // Spoilers: hiding them collapses the locked story ones into one line, as on Steam.
    await main.getByRole('button',{name:'Hide spoilers',exact:true}).click();
    assert.equal(await main.locator('.sca-ach').count(),51-15);
    assert.match(await main.locator('.sca-hidden-summary').innerText(),/15 hidden achievements remaining/);
    assert.equal(await main.locator('.sca-ach',{hasText:'Vengeance'}).count(),0,'a hidden name is not shown');
    await main.getByRole('searchbox').fill('Vengeance');
    assert.equal(await main.locator('.sca-ach').count(),0,'nor found by search');
    await main.getByRole('searchbox').fill('');
    assert.match(await main.locator('.sca-icons[data-kind="locked"] .sca-tile').first().getAttribute('title'),/^(?!Hidden)/,'the card shows non-spoilers first');
    await main.getByRole('button',{name:'Show spoilers',exact:true}).click();
    assert.equal(await main.locator('.sca-ach').count(),51);
    assert.equal(await host.evaluate(()=>localStorage.getItem('sca:reveal:33230:v1')),'true');
    // A TrueAchievements page saved as "Webpage, Complete" (.html): the rate sits in a tooltip
    // attribute, a description's own percentage is ignored, and accents in names still match.
    await main.getByRole('tab',{name:'SETTINGS'}).click();
    {
      const list=JSON.parse(require('fs').readFileSync(require('path').join(__dirname,'..','source','games','ac2','achievements.json'),'utf8'));
      const rows=list.map((a,i)=>`<li><a class="title" data-af="20" href="/a">${a.name.replace('à','a')}</a><p>${a.detail}</p><div class="progress-bar" data-af="1,000 tracked gamers (${30+i}% - TA Ratio = 1.50)"><span style="width: ${30+i}%;"></span></div></li>`).join('');
      chooser=main.waitForEvent('filechooser');
      await main.getByRole('button',{name:'Load from saved page…',exact:true}).click();
      await (await chooser).setFiles({name:'AC2 _ TrueAchievements.html',mimeType:'text/html',buffer:Buffer.from(`<!DOCTYPE html><html><body><ul class="ach-panels">${rows}</ul></body></html>`)});
      await host.waitForFunction(()=>JSON.parse(localStorage.getItem('sca:rarity:33230:v1'))['0']===30);
      assert.match(await main.locator('.sca-feedback').innerText(),/50 unlock rates loaded from the saved page/);
      const ta=await host.evaluate(()=>JSON.parse(localStorage.getItem('sca:rarity:33230:v1')));
      assert.equal(ta['44'],74,'Podestà: 80% in its description is not the rate');assert.equal(ta['0'],30);
    }
    await main.getByRole('button',{name:'Clear unlock rates',exact:true}).click();
    assert.equal(await host.evaluate(()=>localStorage.getItem('sca:rarity:33230:v1')),'{}');
    console.log('PASS unlock rates from a saved page (rare in gold, sort by rarity), category counts, hidden story spoilers');
  }
  await main.getByRole('button',{name:'Close',exact:true}).click();
  assert.equal(await main.locator('#sca-ac2-dialog').count(),0);
  console.log('PASS search, custom pictures by number/name and from a saved .mhtml page, settings restore, status and picture reset');

  await main.evaluate(()=>{
    document.getElementById('sca-ac2-root').remove();
    document.getElementById('sca-ac2-css').remove();
  });
  await main.locator('.sca-count').waitFor({state:'visible'});
  assert.match(await main.locator('.sca-count').innerText(),/2\/51/);
  assert.equal(await main.locator('#sca-ac2-css').count(),1);
  await host.addScriptTag({content:script});
  assert.equal(await main.locator('#'+id).count(),1);
  assert.equal(await host.evaluate(()=>g_PopupManager.created.size),1);
  console.log('PASS real timer restores removed UI and stylesheet without duplicate registration');

  {
    const icon=await main.locator('#sca-ac2-headstat svg').evaluate(n=>{const b=n.getBoundingClientRect();const c=getComputedStyle(n);return {w:Math.round(b.width),color:c.color,opacity:c.opacity};});
    assert.deepEqual(icon,{w:22,color:'rgb(139, 146, 154)',opacity:'0.8'},'the trophy copies the PLAY TIME clock');
    assert.equal(await main.locator('#stats').evaluate(n=>[...n.children].map(c=>c.id||c.className).join(',')),'lastplayed,playtime,sca-ac2-headstat,stat');
    await main.evaluate(()=>{document.getElementById('lastplayed').remove();document.getElementById('sca-ac2-headstat').remove();});
    await main.locator('#sca-ac2-headstat').waitFor();
    assert.equal(await main.locator('#playtime + #sca-ac2-headstat').count(),1,'placed after PLAY TIME on a never-played game too');
    assert.equal(await main.locator('#stats > #sca-ac2-headstat').count(),1);
    const status=await host.evaluate(()=>window.PLUGIN_LIST['steam-custom-achievements'].diagnostics());
    const header=status.windows.find(w=>w.header)?.header;
    assert.equal(header.playTimeLabels,3);assert.equal(header.shown,1);assert.equal(header.found,2);assert.equal(header.placed,2);assert.equal(header.statShown,1);
    assert.equal(await main.locator('#playtime2 + .sca-headstat').count(),1,'the hidden measuring copy of the header gets the stat too');
    assert.equal(await main.locator('#sortmenu .sca-headstat').count(),0,'a menu entry called Play time is not a header');
    console.log('PASS header stat matches the clock icon, skips a hidden PLAY TIME, goes into every header copy, appears without LAST PLAYED, and Copy status reports it');
  }

  // Switch games while an autosave arrives; detection must continue in the host.
  await main.locator('.sca-view').click();
  await host.evaluate(()=>{
    MainWindowBrowserManager.m_lastLocation.pathname='/routes/library/app/999';
    window.mockAuto.progress={'4':'2026-10-25T21:00:00Z'};
    __SCA_RUNTIME__.refresh();
  });
  await main.locator('#'+id).waitFor({state:'detached'});
  assert.equal(await main.locator('#sca-ac2-dialog').count(),0);
  await host.waitForFunction(key=>!!JSON.parse(localStorage.getItem(key))?.['4'],key);
  await host.evaluate(()=>{MainWindowBrowserManager.m_lastLocation.pathname='/routes/library/app/33230';__SCA_RUNTIME__.refresh();});
  await main.locator('#'+id).waitFor({state:'visible'});
  assert.match(await main.locator('.sca-count').innerText(),/3\/51/);
  await main.locator('.sca-view').click();
  assert.equal(await main.locator('.sca-ach[data-index="4"] .sca-mark').count(),0);
  assert.match(await main.locator('.sca-ach[data-index="4"] .sca-unlocked-at').innerText(),/Unlocked Oct 25, 2026/);
  await main.keyboard.press('Escape');
  console.log('PASS automatic backend state unlocks progress while another page is selected; card and popup are AC2-only');

  const qaDir=process.env.SCA_QA_DIRECTORY;
  if(qaDir)fs.mkdirSync(qaDir,{recursive:true});
  for(const [width,height] of [[1200,850],[480,700],[320,600]]) {
    await main.setViewportSize({width,height});
    await main.waitForTimeout(50);
    const alignment=await main.evaluate(()=>{const a=document.querySelector('.sca-card').getBoundingClientRect(),b=document.querySelector('#friends .native-card').getBoundingClientRect();return Math.abs(a.left-b.left)+Math.abs(a.right-b.right);});
    assert.ok(alignment<1,`Native edges differ by ${alignment}px`);
    const rows=await main.evaluate(()=>[...document.querySelectorAll('.sca-icons')].map(r=>r.scrollWidth<=r.clientWidth+1));
    assert.ok(rows.every(Boolean),'icon row overflows');
    if(qaDir)await main.screenshot({path:path.join(qaDir,`tracker-${width}.png`)});
    await main.locator('.sca-view').click();
    const box=await main.locator('.sca-dialog').boundingBox();
    assert.ok(box && box.x>=0 && box.x+box.width<=width && box.y>=0 && box.y+box.height<=height, JSON.stringify(box));
    assert.equal(await main.locator('.sca-ach').count(),51);
    if(qaDir)await main.screenshot({path:path.join(qaDir,`dialog-${width}.png`)});
    await main.keyboard.press('Escape');
  }
  console.log('PASS card and popup fit at 1200px, 480px and 320px widths');

  await host.evaluate(()=>g_PopupManager.remove(window.mainPopup));
  await main.close();
  assert.equal(await host.evaluate(()=>__SCA_RUNTIME__.diagnostics().attachedWindows),0);
  const pending=host.waitForEvent('popup');
  await host.evaluate(()=>{
    window.mainPopup=window.open('/main','SP Desktop_uid0');
    g_PopupManager.add(window.mainPopup);
  });
  const recreated=await pending;
  await recreated.locator('.sca-count').waitFor({state:'visible'});
  assert.match(await recreated.locator('.sca-count').innerText(),/3\/51/);
  await host.evaluate(()=>__SCA_RUNTIME__.dispose());
  assert.equal(await recreated.locator('#'+id).count(),0);
  assert.equal(await host.evaluate(()=>g_PopupManager.created.size),0);
  assert.equal(await host.evaluate(()=>g_PopupManager.destroyed.size),0);
  assert.deepEqual(errors,[]);
  assert.deepEqual(external,[]);
  console.log('PASS popup destruction/recreation, complete cleanup, no external requests or script exceptions');
  console.log('Real Chromium window regression passed:',browser.version());
  await context.close();
})().catch(error=>{console.error(error);process.exitCode=1;})
  .finally(async()=>{await browser?.close();server.close();});
