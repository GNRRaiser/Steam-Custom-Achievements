/* Library sidebar card styled like Steam's native Achievements section, plus a
 * "View My Achievements" dialog modeled on Steam's own achievements popup. */
function createTracker(window) {
  const document=window.document;
  const DIALOG_ID="sca-ac2-dialog";
  const ICON=48,ICON_GAP=8,STAT_ID="sca-ac2-headstat",STAT_CLASS="sca-headstat";
  let query="",group="all",tab="achievements",message="",messageTimeout=null;
  let placementState="waiting-for-ac2",dialogOpen=false,returnFocus=null,pictureTarget=null;
  let currentAnchor=null,nativeCard=null;
  // The game pack for the Library page on screen; null on any other page.
  let game=null;
  const titles=new Set(["FRIENDS WHO PLAY","ADDITIONAL CONTENT","NOTES","DLC","RECORDINGS AND SCREENSHOTS","MY REVIEW"]);
  const normal=text=>text.replace(/\s+/g," ").trim().toUpperCase();
  function el(tag,className,text) {
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  const isUnlocked=index=>!!game.progress[String(index)];
  function countUnlocked(){return game.achievements.reduce((n,_a,i)=>n+(isUnlocked(i)?1:0),0);}
  function percentDone(){return Math.round(countUnlocked()/game.achievements.length*100);}
  function findSidebar() {
    const headings=[];
    const walker=document.createTreeWalker(document.body,4);
    let text;
    while((text=walker.nextNode())) {
      if(!titles.has(normal(text.nodeValue||"")))continue;
      const node=text.parentElement;
      if(!node||node.closest(`#${ROOT_ID},#${DIALOG_ID},[hidden],[aria-hidden="true"],button,a,[role="button"]`))continue;
      const style=window.getComputedStyle(node);
      if(style.display==="none"||style.visibility==="hidden")continue;
      if(!headings.includes(node))headings.push(node);
    }
    if(headings.length<2)return null;
    const first=headings.find(node=>normal(node.textContent)==="FRIENDS WHO PLAY")||headings[0];
    for(let parent=first.parentElement;parent&&parent!==document.body;parent=parent.parentElement) {
      const inside=headings.filter(node=>parent.contains(node));
      if(inside.length<2)continue;
      const strong=inside.filter(node=>["FRIENDS WHO PLAY","ADDITIONAL CONTENT","RECORDINGS AND SCREENSHOTS","MY REVIEW"].includes(normal(node.textContent)));
      if(new Set(strong.map(node=>normal(node.textContent))).size<2)continue;
      let before=first;
      while(before.parentElement!==parent)before=before.parentElement;
      // Steam lists Achievements directly below Friends Who Play.
      return {parent,section:before,heading:first};
    }
    return null;
  }
  // The native card is the first wide box after the section heading. Its
  // background may be a gradient image, so we match geometry, not colour.
  function findNativeCard(anchor) {
    const frame=anchor.section.getBoundingClientRect();
    if(frame.width<=0)return null;
    for(const node of anchor.section.querySelectorAll("*")) {
      if(node===anchor.heading||node.contains(anchor.heading)||anchor.heading.contains(node))continue;
      if(!(anchor.heading.compareDocumentPosition(node)&4))continue;
      const box=node.getBoundingClientRect();
      if(box.width>=frame.width*.6&&box.height>=24)return node;
    }
    return null;
  }
  function matchNativeStyle(root,anchor) {
    const section=window.getComputedStyle(anchor.section);
    root.style.marginTop=section.marginTop;
    root.style.marginBottom=section.marginBottom;
    const heading=window.getComputedStyle(anchor.heading);
    for(const [name,value] of [["color",heading.color],["size",heading.fontSize],["weight",heading.fontWeight],["spacing",heading.letterSpacing],["family",heading.fontFamily],["transform",heading.textTransform]]) {
      if(value)root.style.setProperty(`--sca-heading-${name}`,value);
    }
    nativeCard=findNativeCard(anchor);
    if(!nativeCard)return;
    const card=window.getComputedStyle(nativeCard);
    const surface=card.backgroundColor&&card.backgroundColor!=="rgba(0, 0, 0, 0)"?card.backgroundColor:"transparent";
    root.style.setProperty("--sca-surface",surface);
    root.style.setProperty("--sca-surface-image",card.backgroundImage&&card.backgroundImage!=="none"?card.backgroundImage:"none");
    if(surface==="transparent"&&(!card.backgroundImage||card.backgroundImage==="none"))root.style.setProperty("--sca-surface","rgba(255,255,255,.06)");
    root.style.setProperty("--sca-radius",card.borderRadius||"0px");
    root.style.setProperty("--sca-border",card.borderTopWidth!=="0px"?`${card.borderTopWidth} ${card.borderTopStyle} ${card.borderTopColor}`:"0 none transparent");
    root.style.setProperty("--sca-shadow",card.boxShadow||"none");
  }
  function alignNativeWidth(root) {
    if(!root.isConnected||!currentAnchor?.section.isConnected)return;
    if(!nativeCard?.isConnected)matchNativeStyle(root,currentAnchor);
    const frame=root.getBoundingClientRect();
    if(frame.width<=0)return;
    let left,right;
    if(nativeCard?.isConnected) {
      const card=nativeCard.getBoundingClientRect();
      left=card.left-frame.left;right=frame.right-card.right;
    } else {
      const heading=currentAnchor.heading.getBoundingClientRect();
      left=right=heading.left-frame.left;
    }
    left=Math.max(0,Math.round(left*10)/10);right=Math.max(0,Math.round(right*10)/10);
    if(left+right<frame.width-80){
      root.style.paddingLeft=`${left}px`;
      root.style.paddingRight=`${right}px`;
    }
    const heading=root.querySelector(".sca-heading");
    if(heading&&nativeCard?.isConnected) {
      const gap=nativeCard.getBoundingClientRect().top-currentAnchor.heading.getBoundingClientRect().bottom;
      if(gap>=0&&gap<=40)heading.style.marginBottom=`${gap}px`;
    }
  }
  function makeStyle() {
    if(document.getElementById(STYLE_ID))return;
    const style=el('style');style.id=STYLE_ID;
    style.textContent=`
#${ROOT_ID}{position:static;display:block;width:100%;min-width:0;max-width:none;flex:0 0 auto;box-sizing:border-box;color:inherit;font:inherit;--sca-surface:rgba(255,255,255,.06);--sca-surface-image:none;--sca-radius:0px;--sca-border:0 none transparent;--sca-shadow:none;-webkit-app-region:no-drag}
#${ROOT_ID} *,#${DIALOG_ID} *,#${ROOT_ID} *::before,#${DIALOG_ID} *::before,#${DIALOG_ID} *::after{box-sizing:border-box}
#${ROOT_ID} button,#${DIALOG_ID} button,#${DIALOG_ID} input,#${DIALOG_ID} select,#${DIALOG_ID} textarea{font:inherit}
#${ROOT_ID} button,#${DIALOG_ID} button{cursor:pointer}
#${ROOT_ID} button:focus-visible,#${DIALOG_ID} button:focus-visible,#${DIALOG_ID} input:focus-visible,#${DIALOG_ID} select:focus-visible,#${DIALOG_ID} textarea:focus-visible{outline:2px solid #a6c9ff;outline-offset:2px}
#${ROOT_ID} .sca-heading{margin:0 0 6px;color:var(--sca-heading-color,#c7c8ce);font-size:var(--sca-heading-size,14px);font-weight:var(--sca-heading-weight,500);letter-spacing:var(--sca-heading-spacing,.5px);font-family:var(--sca-heading-family,inherit);text-transform:var(--sca-heading-transform,uppercase);line-height:1.3}
#${ROOT_ID} .sca-card{background-color:var(--sca-surface);background-image:var(--sca-surface-image);border:var(--sca-border);border-radius:var(--sca-radius);box-shadow:var(--sca-shadow);overflow:hidden;min-width:0}
#${ROOT_ID} .sca-summary{padding:10px 10px 12px}
#${ROOT_ID} .sca-count{font-size:13px;font-weight:700;color:#dcdedf;line-height:1.4}
#${ROOT_ID} .sca-count span{font-weight:400;color:#8b929a}
#${ROOT_ID} .sca-progress{height:8px;margin-top:8px;border-radius:4px;background:#000;overflow:hidden}
#${ROOT_ID} .sca-progress-inner,#${DIALOG_ID} .sca-dbar>div{height:100%;background:linear-gradient(90deg,#1a44c2,#1a9fff);border-radius:inherit}
#${ROOT_ID} .sca-rows{padding:12px 10px 4px;border-top:1px solid rgba(255,255,255,.05);background:rgba(0,0,0,.08)}
#${ROOT_ID} .sca-row-label{font-size:12px;color:#8b929a;margin:0 0 7px}
#${ROOT_ID} .sca-icons{display:flex;gap:${ICON_GAP}px;margin-bottom:12px;min-height:${ICON}px;overflow:hidden}
#${ROOT_ID} .sca-tile{position:relative;flex:none;width:${ICON}px;height:${ICON}px;padding:0;border:0;background:#0006;border-radius:2px;overflow:hidden;box-shadow:0 0 4px #0008}
#${ROOT_ID} .sca-tile img,#${DIALOG_ID} .sca-ach-icon img{display:block;width:100%;height:100%;object-fit:cover}
#${ROOT_ID} .sca-tile:hover{outline:1px solid #ffffff60}
.sca-locked-art img{filter:grayscale(1) brightness(.42) contrast(.9)}
.sca-lock{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.sca-lock svg{width:42%;height:42%;filter:drop-shadow(0 1px 2px #000)}
#${ROOT_ID} .sca-more{flex:none;width:${ICON}px;height:${ICON}px;border:0;background:rgba(255,255,255,.08);color:#dcdedf;font-size:14px;font-weight:700;border-radius:2px}
#${ROOT_ID} .sca-more:hover{background:rgba(255,255,255,.16)}
#${ROOT_ID} .sca-card-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:2px 10px 12px;background:rgba(0,0,0,.08);flex-wrap:wrap}
#${ROOT_ID} .sca-auto-state{font-size:11px;color:#6f767e;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1 1 120px}
#${ROOT_ID} .sca-auto-state[data-problem]{color:#d9a35b}
#${ROOT_ID} .sca-view{border:0;background:none;padding:0;color:#8b929a;font-size:13px;margin-left:auto}
#${ROOT_ID} .sca-view:hover{color:#fff}
#${DIALOG_ID}{position:fixed;inset:0;z-index:2147480000;-webkit-app-region:no-drag;display:flex;align-items:center;justify-content:center;padding:40px 20px;background:rgba(0,0,0,.6);backdrop-filter:blur(6px);color:#dcdedf;font-family:"Motiva Sans",Arial,Helvetica,sans-serif;font-size:14px}
#${DIALOG_ID} .sca-dialog{position:relative;display:flex;flex-direction:column;width:min(846px,100%);height:min(900px,100%);background:#1b1f26;box-shadow:0 0 40px #000c}
#${DIALOG_ID} .sca-close{position:absolute;top:10px;right:10px;width:44px;height:44px;padding:0;margin:0;border-radius:50%;border:2px solid #ffffff55;background:rgba(40,44,52,.85);color:#fff;display:flex;align-items:center;justify-content:center;z-index:5;cursor:pointer;-webkit-app-region:no-drag}
#${DIALOG_ID} .sca-close:hover{background:rgba(70,75,85,.95)}
#${DIALOG_ID} .sca-close svg{width:22px;height:22px;pointer-events:none}
#${DIALOG_ID} .sca-dhead{position:relative;overflow:hidden;padding:22px 24px 0;background:#2b2f37;flex:none}
#${DIALOG_ID} .sca-dhero{position:absolute;inset:-30px;background-size:cover;background-position:center 30%;filter:blur(14px) brightness(.55) saturate(.9)}
#${DIALOG_ID} .sca-dhead::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(40,44,52,.25) 0%,rgba(30,33,40,.65) 100%)}
#${DIALOG_ID} .sca-dhead>*:not(.sca-dhero){position:relative;z-index:1}
#${DIALOG_ID} .sca-title-row{display:flex;align-items:center;gap:12px;padding-right:48px}
#${DIALOG_ID} .sca-title-row img{width:32px;height:32px;border-radius:2px}
#${DIALOG_ID} h2{margin:0;font-size:22px;font-weight:700;color:#fff;letter-spacing:.2px}
#${DIALOG_ID} .sca-earned{display:flex;justify-content:space-between;margin-top:16px;font-size:12px;font-weight:700;letter-spacing:.6px;color:#c6d4df}
#${DIALOG_ID} .sca-dbar{height:8px;margin-top:8px;border-radius:4px;background:#3d4450;overflow:hidden}
#${DIALOG_ID} .sca-tabs{display:flex;justify-content:center;gap:8px;margin:18px -24px 0;padding:10px 0;background:rgba(10,12,16,.45)}
#${DIALOG_ID} .sca-tab{border:0;background:none;color:#dcdedf;font-size:13px;font-weight:700;letter-spacing:.5px;padding:8px 16px;border-radius:20px}
#${DIALOG_ID} .sca-tab[aria-selected="true"]{background:rgba(255,255,255,.18);color:#fff}
#${DIALOG_ID} .sca-tab:hover{color:#fff}
#${DIALOG_ID} .sca-dbody{overflow-y:auto;overscroll-behavior:contain;padding:8px 20px 24px;min-height:200px;scrollbar-width:thin;scrollbar-color:#4b525c transparent}
#${DIALOG_ID} .sca-toolbar{display:flex;justify-content:flex-end;gap:10px;padding:0 0 4px}
#${DIALOG_ID} .sca-search,#${DIALOG_ID} .sca-select,#${DIALOG_ID} .sca-input{height:40px;border:0;border-radius:2px;background:#2d333c;color:#dcdedf;padding:0 12px;font-size:14px;min-width:0}
#${DIALOG_ID} .sca-search{width:220px}
#${DIALOG_ID} .sca-select{width:220px}
#${DIALOG_ID} .sca-section-title{margin:18px 0 8px;font-size:12px;font-weight:700;letter-spacing:.6px;color:#8b929a;text-transform:uppercase}
#${DIALOG_ID} .sca-ach{display:flex;align-items:center;gap:14px;min-height:80px;padding:12px 14px 12px 10px;margin-bottom:8px;background:#262a33}
#${DIALOG_ID} .sca-ach-icon{position:relative;flex:none;width:56px;height:56px;padding:0;border:0;background:#0006;border-radius:2px;overflow:hidden}
#${DIALOG_ID} .sca-ach-icon:hover::after{content:"Change";position:absolute;left:0;right:0;bottom:0;background:#000b;color:#fff;font-size:10px;line-height:16px;text-align:center}
#${DIALOG_ID} .sca-ach-text{flex:1;min-width:0}
#${DIALOG_ID} .sca-ach-name{font-size:16px;font-weight:600;color:#fff}
#${DIALOG_ID} .sca-ach.sca-locked .sca-ach-name{color:#dcdedf}
#${DIALOG_ID} .sca-ach-desc{font-size:13px;color:#acb2b8;margin-top:3px;line-height:1.35}
#${DIALOG_ID} .sca-ach-progress{display:flex;align-items:center;gap:10px;margin-top:6px;font-size:12px;color:#acb2b8}
#${DIALOG_ID} .sca-ach-meter{flex:0 1 220px;height:6px;border-radius:3px;background:#3d4450;overflow:hidden}
#${DIALOG_ID} .sca-ach-meter>div{height:100%;background:linear-gradient(90deg,#1a44c2,#1a9fff)}
#${DIALOG_ID} .sca-ach-tag{font-size:11px;color:#6f767e;margin-top:4px}
#${DIALOG_ID} .sca-ach-side{flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px;text-align:right;font-size:12px;color:#8b929a;max-width:42%}
#${DIALOG_ID} .sca-mark,#${DIALOG_ID} .sca-small{border:0;border-radius:2px;background:rgba(255,255,255,.1);color:#dcdedf;padding:6px 10px;font-size:12px}
#${DIALOG_ID} .sca-mark:hover,#${DIALOG_ID} .sca-small:hover{background:rgba(255,255,255,.2);color:#fff}
#${DIALOG_ID} .sca-small:disabled{opacity:.4;cursor:default;background:rgba(255,255,255,.1);color:#dcdedf}
#${DIALOG_ID} .sca-empty{padding:30px 10px;text-align:center;color:#8b929a}
#${DIALOG_ID} .sca-panel{background:#262a33;padding:16px;margin-top:12px}
#${DIALOG_ID} .sca-panel h3{margin:0 0 6px;font-size:15px;color:#fff}
#${DIALOG_ID} .sca-panel p{margin:6px 0;font-size:13px;color:#acb2b8;line-height:1.45}
#${DIALOG_ID} .sca-buttons{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
#${DIALOG_ID} .sca-input{width:100%;margin-top:6px}
#${DIALOG_ID} .sca-auto-details{font-family:Consolas,"Courier New",monospace;font-size:12px;color:#8b929a;word-break:break-all}
#${DIALOG_ID} .sca-auto-details:empty{display:none}
#${DIALOG_ID} .sca-provisional{color:#d9a35b}
#${DIALOG_ID} .sca-feedback{margin-top:10px;font-size:13px;color:#a6c9ff;min-height:1em}
#${DIALOG_ID} .sca-editor{margin-top:10px}
#${DIALOG_ID} .sca-editor textarea{width:100%;background:#1b1f26;color:#dcdedf;border:1px solid #3d4450;padding:8px;font-size:12px}
#${DIALOG_ID} .sca-footer{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
#${DIALOG_ID} .sca-record-pick{width:100%;margin-top:6px}
#${DIALOG_ID} .sca-capture-state{color:#a6c9ff}
#${DIALOG_ID} .sca-capture-recent{margin:6px 0 0;padding-left:18px;font-family:Consolas,"Courier New",monospace;font-size:12px;color:#acb2b8;max-height:160px;overflow-y:auto}
#${DIALOG_ID} .sca-capture-recent li{margin:2px 0;word-break:break-all}
#${DIALOG_ID} .sca-record-detail{font-style:italic}
#${DIALOG_ID} .sca-record-narrow{display:flex;gap:8px;align-items:flex-start;margin-top:10px;font-size:13px;color:#acb2b8;line-height:1.4}
#${DIALOG_ID} .sca-record-narrow input{margin-top:3px}
#${DIALOG_ID} .sca-record-narrowed{border-left:3px solid #1a9fff}
#${DIALOG_ID} .sca-record-status{color:#a6c9ff}
#${DIALOG_ID} .sca-record-status:empty{display:none}
#${DIALOG_ID} .sca-record-result h4{margin:14px 0 4px;font-size:14px;color:#fff}
#${DIALOG_ID} .sca-record-file{background:#1b1f26;padding:10px 12px;margin-top:8px}
#${DIALOG_ID} .sca-record-name{font-size:13px;color:#dcdedf;font-weight:600;word-break:break-all}
#${DIALOG_ID} .sca-record-file ul{margin:6px 0 0;padding-left:18px;font-family:Consolas,"Courier New",monospace;font-size:12px;color:#acb2b8}
#${DIALOG_ID} .sca-record-file li{margin:2px 0;word-break:break-all}
#${DIALOG_ID} .sca-record-file li[data-verdict="match"]{color:#a4d007}
#${DIALOG_ID} .sca-record-file li[data-verdict="rising"]{color:#d9a35b}
#${DIALOG_ID} .sca-record-badge{margin-left:8px;padding:1px 6px;border-radius:8px;background:rgba(255,255,255,.1);font-family:inherit;font-size:11px}
#${DIALOG_ID} .sca-version{margin-top:16px;font-size:11px;color:#6f767e;text-align:center}
.${STAT_CLASS}{display:flex;align-items:center;gap:10px;cursor:pointer;flex:none;background:none;border:0;padding:0 4px;color:inherit;font:inherit;text-align:left}
.${STAT_CLASS} svg{width:var(--sca-stat-icon,24px);height:var(--sca-stat-icon,24px);flex:none;color:var(--sca-stat-icon-color,#8b929a);opacity:var(--sca-stat-icon-opacity,1)}
.${STAT_CLASS} .sca-stat-label{color:var(--sca-stat-label,#8b929a);font-size:var(--sca-stat-label-size,12px);font-weight:var(--sca-stat-label-weight,700);letter-spacing:var(--sca-stat-label-spacing,.5px);text-transform:uppercase;line-height:1.3}
.${STAT_CLASS} .sca-stat-row{display:flex;align-items:center;gap:6px}
.${STAT_CLASS} .sca-stat-value{color:var(--sca-stat-value,#8b929a);font-size:var(--sca-stat-value-size,12px);line-height:1.3}
.${STAT_CLASS} .sca-stat-bar{width:80px;height:4px;border-radius:2px;background:#0b0d10;overflow:hidden}
.${STAT_CLASS} .sca-stat-bar>div{height:100%;background:linear-gradient(90deg,#1a44c2,#1a9fff)}
.${STAT_CLASS}:hover .sca-stat-label{color:#fff}
@media (max-width:640px){#${DIALOG_ID}{padding:12px}#${DIALOG_ID} .sca-close{top:6px;right:6px;width:40px;height:40px}#${DIALOG_ID} .sca-dhead{padding:18px 16px 0}#${DIALOG_ID} .sca-dbody{padding:8px 10px 18px}#${DIALOG_ID} .sca-toolbar{flex-direction:column}#${DIALOG_ID} .sca-search,#${DIALOG_ID} .sca-select{width:100%}#${DIALOG_ID} .sca-ach{flex-wrap:wrap}#${DIALOG_ID} .sca-ach-side{max-width:none;width:100%;align-items:flex-start;text-align:left;padding-left:70px}}
`;
    (document.head||document.documentElement).appendChild(style);
  }
  const LOCK_SVG="<svg viewBox='0 0 24 24'><path fill='#e8e8e8' d='M7 10V7a5 5 0 0 1 10 0v3h1.5c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5h-13C4.7 22 4 21.3 4 20.5v-9C4 10.7 4.7 10 5.5 10zm2.5 0h5V7a2.5 2.5 0 0 0-5 0z'/></svg>";
  function art(index,unlocked,className) {
    const holder=el(className==="sca-tile"?"button":"span",className+(unlocked?"":" sca-locked-art"));
    const img=el("img");img.alt="";img.src=iconFor(game,index);img.draggable=false;holder.appendChild(img);
    if(!unlocked){const lock=el("span","sca-lock");lock.innerHTML=LOCK_SVG;holder.appendChild(lock);}
    return holder;
  }
  function formatUnlock(value) {
    if(typeof value!=="string")return "Unlocked";
    const date=new Date(value);
    if(Number.isNaN(date.getTime()))return "Unlocked";
    const day=date.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
    const time=date.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}).replace(" ","").toLowerCase();
    return `Unlocked ${day} @ ${time}`;
  }
  function showMessage(text){
    message=text;if(messageTimeout)window.clearTimeout(messageTimeout);
    document.querySelectorAll(`#${DIALOG_ID} .sca-feedback`).forEach(node=>node.textContent=message);
    messageTimeout=window.setTimeout(()=>{message="";document.querySelectorAll(`#${DIALOG_ID} .sca-feedback`).forEach(node=>node.textContent="");},4000);
  }
  __BACKUP_SOURCE__
  __RECORD_SOURCE__
  __PAGEIMPORT_SOURCE__
  function shortStatus() {
    const state=game.auto||{};
    if(state.status==="manual")return {text:"Local · manual tracking",problem:false};
    if(state.status==="watching"&&state.saveFileName)return {text:`Local · auto-tracking ${state.saveFileName}`,problem:false};
    if(state.status==="stabilizing")return {text:"Local · reading save…",problem:false};
    if(state.status==="connecting")return {text:"Local · connecting auto-tracking…",problem:false};
    return {text:"Local · auto-tracking needs setup",problem:true};
  }
  function updateAutomatic(){
    if(!game)return;
    const status=shortStatus();
    document.querySelectorAll(`#${ROOT_ID} .sca-auto-state`).forEach(node=>{
      node.textContent=status.text;node.title=game.auto.message||"";
      if(status.problem)node.dataset.problem="";else delete node.dataset.problem;
    });
    document.querySelectorAll(`#${DIALOG_ID} .sca-auto-message`).forEach(node=>node.textContent=game.auto.message||"Automatic tracking on saves.");
    document.querySelectorAll(`#${DIALOG_ID} .sca-auto-details`).forEach(node=>node.textContent=game.auto.details||"");
    document.querySelectorAll(`#${DIALOG_ID} .sca-source-result`).forEach(node=>{
      const files=Array.isArray(game.auto.availableSaves)?game.auto.availableSaves:[];
      const candidates=files.map(file=>`${file.name}: ${file.detail||'found'}`).join(' · ');
      node.textContent=[game.auto.selectionNote,candidates].filter(Boolean).join(' ');
    });
    updateCapturePanel();
    if(dialogOpen&&tab==="achievements")updateList();
  }
  function fillIconRow(row,indices,unlocked) {
    const width=row.clientWidth;
    if(width>0&&row.dataset.width===String(width)&&row.childElementCount)return;
    row.dataset.width=String(width);
    const fit=width>0?Math.max(1,Math.floor((width+ICON_GAP)/(ICON+ICON_GAP))):indices.length;
    const shown=indices.length>fit?fit-1:indices.length;
    row.replaceChildren();
    for(const index of indices.slice(0,shown)) {
      const tile=art(index,unlocked,"sca-tile");tile.type="button";
      const a=game.achievements[index];tile.title=`${a.name}\n${a.detail}`;
      tile.setAttribute("aria-label",`${a.name} (${unlocked?"unlocked":"locked"})`);
      tile.onclick=()=>openDialog(index);
      row.appendChild(tile);
    }
    if(indices.length>shown) {
      const more=el("button","sca-more",`+${indices.length-shown}`);more.type="button";
      more.setAttribute("aria-label",`${indices.length-shown} more ${unlocked?"unlocked":"locked"} achievements`);
      more.onclick=()=>openDialog();row.appendChild(more);
    }
  }
  function layoutRows() {
    const unlocked=[],locked=[];
    game.achievements.forEach((_a,i)=>(isUnlocked(i)?unlocked:locked).push(i));
    document.querySelectorAll(`#${ROOT_ID} .sca-icons`).forEach(row=>{
      fillIconRow(row,row.dataset.kind==="unlocked"?sortUnlocked(unlocked):locked,row.dataset.kind==="unlocked");
    });
  }
  // Most recent unlock first, like Steam.
  function sortUnlocked(indices) {
    const time=i=>{const t=Date.parse(game.progress[String(i)]);return Number.isNaN(t)?0:t;};
    return indices.slice().sort((a,b)=>time(b)-time(a)||a-b);
  }
  function render() {
    if(!game)return;
    const root=document.getElementById(ROOT_ID);
    if(root) {
      root.replaceChildren();root.setAttribute('aria-label',`${game.title} achievements`);
      root.appendChild(el('h2','sca-heading','ACHIEVEMENTS'));
      const card=el('div','sca-card');const summary=el('div','sca-summary');
      const completed=countUnlocked(),percent=percentDone();
      const count=el('div','sca-count',`You've unlocked ${completed}/${game.achievements.length} `);count.appendChild(el('span','',`(${percent}%)`));
      const bar=el('div','sca-progress');bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','Achievement completion');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(game.achievements.length));bar.setAttribute('aria-valuenow',String(completed));
      const fill=el('div','sca-progress-inner');fill.style.width=`${percent}%`;bar.appendChild(fill);
      summary.append(count,bar);card.appendChild(summary);
      const rows=el('div','sca-rows');
      if(completed>0){rows.appendChild(el('div','sca-row-label','Unlocked Achievements'));const row=el('div','sca-icons');row.dataset.kind="unlocked";rows.appendChild(row);}
      if(completed<game.achievements.length){rows.appendChild(el('div','sca-row-label','Locked Achievements'));const row=el('div','sca-icons');row.dataset.kind="locked";rows.appendChild(row);}
      card.appendChild(rows);
      const footer=el('div','sca-card-footer');
      const view=el('button','sca-view','View My Achievements');view.type='button';view.onclick=()=>openDialog();
      footer.append(el('span','sca-auto-state'),view);card.appendChild(footer);
      root.appendChild(card);
      alignNativeWidth(root);layoutRows();
    }
    if(dialogOpen)updateDialog();
    updateHeaderStat();
    updateAutomatic();
  }
  function closeDialog() {
    dialogOpen=false;
    document.getElementById(DIALOG_ID)?.remove();
    document.removeEventListener("keydown",onKey,true);
    if(returnFocus?.isConnected)returnFocus.focus();
    returnFocus=null;
  }
  function onKey(event) {
    if(event.key==="Escape"&&dialogOpen){event.preventDefault();event.stopPropagation();closeDialog();}
  }
  function openDialog(focusIndex) {
    makeStyle();
    if(!dialogOpen){returnFocus=document.activeElement;document.addEventListener("keydown",onKey,true);}
    dialogOpen=true;tab="achievements";
    document.getElementById(DIALOG_ID)?.remove();
    const overlay=el("div");overlay.id=DIALOG_ID;
    overlay.onmousedown=event=>{if(event.target===overlay)closeDialog();};
    const dialog=el("div","sca-dialog");dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-labelledby","sca-dialog-title");
    const close=el("button","sca-close");close.type="button";close.setAttribute("aria-label","Close");
    close.innerHTML="<svg viewBox='0 0 24 24'><path d='M5 5l14 14M19 5L5 19' stroke='#fff' stroke-width='2.2' stroke-linecap='round'/></svg>";
    close.onclick=closeDialog;
    const head=el("div","sca-dhead");
    const hero=steamImage(/library_hero/i);
    if(hero){const layer=el("div","sca-dhero");layer.style.backgroundImage=`url("${hero.replace(/["\\]/g,"")}")`;head.appendChild(layer);}
    const titleRow=el("div","sca-title-row");const gameIcon=el("img");gameIcon.alt="";gameIcon.src=steamImage(new RegExp(`/${game.appId}/[0-9a-f]{40}\\.(jpg|png)`,"i"))||builtInIcon(game,0);
    const title=el("h2","",game.title);title.id="sca-dialog-title";titleRow.append(gameIcon,title);
    const earned=el("div","sca-earned");earned.append(el("span","sca-earned-count"),el("span","sca-earned-percent"));
    const bar=el("div","sca-dbar");bar.appendChild(el("div"));
    const tabs=el("div","sca-tabs");tabs.setAttribute("role","tablist");
    for(const [value,label] of [["achievements","MY ACHIEVEMENTS"],["settings","SETTINGS"]]) {
      const button=el("button","sca-tab",label);button.type="button";button.setAttribute("role","tab");button.dataset.tab=value;
      button.onclick=()=>{tab=value;buildBody();};tabs.appendChild(button);
    }
    head.append(titleRow,earned,bar,tabs);
    const body=el("div","sca-dbody");
    const picker=el("input","sca-picker");picker.type="file";picker.accept="image/*";picker.hidden=true;
    picker.onchange=()=>{const files=Array.from(picker.files||[]);picker.value="";void applyPictures(files);};
    const pagePicker=el("input","sca-page-picker");pagePicker.type="file";pagePicker.accept=".mhtml,.mht,multipart/related";pagePicker.hidden=true;
    pagePicker.onchange=()=>{const file=pagePicker.files?.[0];pagePicker.value="";if(file)void importPage(file);};
    dialog.append(close,head,body,picker,pagePicker);overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    buildBody();
    if(focusIndex!==undefined) {
      const row=overlay.querySelector(`[data-index="${focusIndex}"]`);
      row?.scrollIntoView?.({block:"center"});
    }
    close.focus();
  }
  function updateDialog() {
    const overlay=document.getElementById(DIALOG_ID);
    if(!overlay){dialogOpen=false;return;}
    const completed=countUnlocked(),percent=percentDone();
    overlay.querySelector(".sca-earned-count").textContent=`${completed} OF ${game.achievements.length} ACHIEVEMENTS EARNED`;
    overlay.querySelector(".sca-earned-percent").textContent=`(${percent}%)`;
    overlay.querySelector(".sca-dbar>div").style.width=`${percent}%`;
    overlay.querySelectorAll(".sca-tab").forEach(button=>button.setAttribute("aria-selected",String(button.dataset.tab===tab)));
    if(tab==="achievements")updateList();
    else overlay.querySelectorAll(".sca-storage-state").forEach(node=>node.textContent=storageAvailable?"Progress and pictures are saved on this PC.":"Warning: local saving unavailable.");
  }
  function buildBody() {
    const overlay=document.getElementById(DIALOG_ID);if(!overlay)return;
    const body=overlay.querySelector(".sca-dbody");body.replaceChildren();body.scrollTop=0;
    if(tab==="achievements") {
      const toolbar=el("div","sca-toolbar");
      const search=el("input","sca-search");search.type="search";search.placeholder="Search";search.setAttribute("aria-label","Search achievements");search.value=query;
      search.oninput=()=>{query=search.value;updateList();};
      const select=el("select","sca-select");select.setAttribute("aria-label","Filter by category");
      for(const value of ["all",...new Set(game.achievements.map(a=>a.group))]){const option=el("option","",value==="all"?"All types":value);option.value=value;select.appendChild(option);}
      select.value=group;select.onchange=()=>{group=select.value;updateList();};
      toolbar.append(search,select);body.append(toolbar,el("div","sca-list"));
    } else buildSettings(body);
    updateDialog();updateAutomatic();
  }
  function achievementRow(index) {
    const a=game.achievements[index],unlocked=isUnlocked(index);
    const row=el("div","sca-ach"+(unlocked?"":" sca-locked"));row.dataset.index=String(index);
    const icon=art(index,unlocked,"sca-ach-icon");
    const change=el("button","sca-ach-icon"+(unlocked?"":" sca-locked-art"));change.type="button";
    change.replaceChildren(...icon.childNodes);change.title="Change picture";change.setAttribute("aria-label",`Change picture for ${a.name}`);
    change.onclick=()=>{pictureTarget=index;const picker=document.querySelector(`#${DIALOG_ID} .sca-picker`);picker.multiple=false;picker.click();};
    const text=el("div","sca-ach-text");
    text.append(el("div","sca-ach-name",a.name),el("div","sca-ach-desc",a.detail));
    const count=a.completion?{have:game.achievements.filter((_b,i)=>i!==index&&isUnlocked(i)).length,need:game.achievements.length-1}:game.auto.counts?.[String(index)];
    if(!unlocked&&count&&Number.isFinite(count.have)&&Number.isFinite(count.need)&&count.need>0) {
      const meter=el("div","sca-ach-meter");const fill=el("div");fill.style.width=`${Math.min(100,count.have/count.need*100)}%`;meter.appendChild(fill);
      const holder=el("div","sca-ach-progress");holder.append(meter,el("span","",`${count.have} / ${count.need}`));text.appendChild(holder);
    }
    // Automatic ones carry no tag: the list is automatic unless a row says otherwise.
    if(!unlocked&&!a.automatic)text.appendChild(el("div","sca-ach-tag",a.completion?"Unlocks by itself when every other achievement is unlocked":"Manual · mark it when you earn it"));
    const side=el("div","sca-ach-side");
    if(unlocked)side.appendChild(el("span","sca-unlocked-at",formatUnlock(game.progress[String(index)])));
    if(!a.automatic&&!a.completion) {
      const mark=el("button","sca-mark",unlocked?"Mark as locked":"Mark as unlocked");mark.type="button";
      mark.setAttribute("aria-label",`${a.name}: ${unlocked?"unlocked":"locked"}, click to toggle`);
      // Marking one by hand plays the same unlock popup as an automatic unlock.
      mark.onclick=()=>{if(unlocked){delete game.progress[String(index)];writeProgress(game);return;}game.progress[String(index)]=new Date().toISOString();writeProgress(game);announceUnlocks(game,[index]);};
      side.appendChild(mark);
    }
    row.append(change,text,side);
    return row;
  }
  function updateList() {
    const list=document.querySelector(`#${DIALOG_ID} .sca-list`);if(!list)return;
    const body=list.closest(".sca-dbody");const scrollTop=body?body.scrollTop:0;
    list.replaceChildren();
    const needle=query.trim().toLowerCase();
    const matches=index=>{
      const a=game.achievements[index];
      if(group!=="all"&&group!==a.group)return false;
      return !needle||`${a.name} ${a.detail}`.toLowerCase().includes(needle);
    };
    const unlocked=[],locked=[];
    game.achievements.forEach((_a,i)=>{if(matches(i))(isUnlocked(i)?unlocked:locked).push(i);});
    if(unlocked.length){list.appendChild(el("div","sca-section-title","Unlocked Achievements"));for(const i of sortUnlocked(unlocked))list.appendChild(achievementRow(i));}
    if(locked.length){list.appendChild(el("div","sca-section-title","Locked Achievements"));for(const i of locked)list.appendChild(achievementRow(i));}
    if(!unlocked.length&&!locked.length)list.appendChild(el("div","sca-empty","No achievements match your search."));
    if(body)body.scrollTop=scrollTop;
  }
  function buildSettings(body) {
    const auto=el("div","sca-panel");
    const autoCount=game.achievements.filter(a=>a.automatic).length;
    auto.append(el("h3","",game.automatic?`Automatic tracking (${autoCount} of ${game.achievements.length})`:"Tracking"),el("p","sca-auto-message"),el("p","",game.trackingNote));
    if(!game.automatic){buildCommonSettings(body,auto);return;}
    if(game.provisional)auto.appendChild(el("p","sca-provisional",game.provisional));
    auto.appendChild(el("p","sca-auto-details"));
    const input=el("input","sca-input");input.type="text";input.placeholder=game.pathPlaceholder;input.setAttribute("aria-label",`${game.title} save file or folder`);
    const controls=el("div","sca-buttons");const use=el("button","sca-small","Use file / folder");const detect=el("button","sca-small","Auto-detect save");const note=el("p","sca-source-note");
    const setPath=async path=>{use.disabled=detect.disabled=true;try{await selectSavePath(game,path);note.textContent='Save selection updated.';}catch(error){note.textContent=`Detector reported: ${String(error?.message||error).replace(/[\r\n]+/g,' ').slice(0,300)}`;}finally{use.disabled=detect.disabled=false;}};
    use.onclick=()=>{if(input.value.trim())void setPath(input.value);else note.textContent='Paste the complete save-file or save-folder path first.';};detect.onclick=()=>void setPath('');
    controls.append(use,detect);auto.append(input,controls,note,el("p","sca-source-result"));
    buildCommonSettings(body,auto);
  }
  // Unlock popups: on/off, plus a delayed test so it can be seen over a game.
  function buildPopupPanel() {
    const panel=el("div","sca-panel sca-popup-panel");
    panel.append(el("h3","","Unlock popups"),el("p","","When the plugin unlocks an achievement while you play, a Steam-style popup shows in the corner with an unlock sound. Manual marks never pop up."));
    const buttons=el("div","sca-buttons"),note=el("p","sca-popup-note");
    const toggle=el("button","sca-small sca-popup-toggle");toggle.type="button";
    const label=()=>{toggle.textContent=popupsEnabled()?"Popups: on":"Popups: off";};label();
    toggle.onclick=()=>{setPopupsEnabled(!popupsEnabled());label();};
    const test=el("button","sca-small sca-popup-test","Test in 10 seconds");test.type="button";
    test.onclick=()=>{note.textContent="Switch to your game now. The test popup shows in 10 seconds.";window.setTimeout(()=>{const pick=game.achievements.findIndex(a=>a.automatic);announceUnlocks(game,[pick>=0?pick:0],true);note.textContent="";},10000);};
    buttons.append(toggle,test);panel.append(buttons,note);
    return panel;
  }
  function buildCommonSettings(body,auto) {
    const pictures=el("div","sca-panel");
    pictures.append(el("h3","","Achievement pictures"),
      el("p","",`Click any achievement's picture in My Achievements to replace it with an image from your PC. To load many at once, pick several images named by list number (1.png to ${game.achievements.length}.png) or by achievement name (for example ${game.achievements[0].name.replace(/[^A-Za-z0-9 ]/g,"")}.jpg).`),
      el("p","","To use the real Xbox pictures, open the game's achievement list (TrueAchievements, Exophase…) in Chrome or Edge, scroll until every picture has loaded, press Ctrl+S and save as \"Webpage, Single File\". Then choose that .mhtml file with Load from saved page."));
    const pictureButtons=el("div","sca-buttons");
    const many=el("button","sca-small","Choose pictures…");many.onclick=()=>{pictureTarget=null;const picker=document.querySelector(`#${DIALOG_ID} .sca-picker`);picker.multiple=true;picker.click();};
    const fromPage=el("button","sca-small sca-from-page","Load from saved page…");fromPage.onclick=()=>document.querySelector(`#${DIALOG_ID} .sca-page-picker`).click();
    pictureButtons.appendChild(fromPage);
    const reset=el("button","sca-small","Reset to built-in pictures");reset.onclick=()=>{game.customIcons={};writeIcons(game);showMessage("Built-in pictures restored");};
    pictureButtons.append(many,reset);pictures.appendChild(pictureButtons);
    const data=el("div","sca-panel sca-backup-area");
    data.append(el("h3","","Progress"),el("p","sca-storage-state"));
    const buttons=el("div","sca-buttons");
    for(const [label,handler] of [['Backup',exportBackup],['Restore',importBackup],['Copy status',()=>copyText(JSON.stringify(diagnostics(),null,2),'Status report')]]){const button=el('button','sca-small',label);button.type="button";button.onclick=handler;buttons.appendChild(button);}
    data.append(buttons,el("div","sca-feedback",message));
    // Reset to locked, for testing: a second click confirms; Backup first keeps a copy.
    const wipe=el("button","sca-small sca-reset-progress","Reset to locked");wipe.type="button";
    const wipeNote=el("p","sca-reset-note",game.automatic?"Locks every achievement for this game. Ones your current save already has stay locked until the game earns them again (load an older save or start a new game), then they unlock with a popup.":"Clears every mark for this game.");
    let armed=null;
    wipe.onclick=async()=>{
      if(!armed){wipe.textContent="Click again to lock all";armed=window.setTimeout(()=>{armed=null;wipe.textContent="Reset to locked";},5000);return;}
      window.clearTimeout(armed);armed=null;wipe.disabled=true;
      try{await resetProgress(game);showMessage("All achievements locked");}
      catch(error){showMessage(`Reset failed: ${String(error?.message||error).replace(/[\r\n]+/g,' ').slice(0,200)}`);}
      finally{wipe.disabled=false;wipe.textContent="Reset to locked";}
    };
    const wipeButtons=el("div","sca-buttons");wipeButtons.appendChild(wipe);
    data.append(wipeButtons,wipeNote);
    // The share build leaves out the tester panels (popup switch, capture, record mode); popups stay on.
    body.append(auto,...(SHARE_BUILD?[]:[buildPopupPanel(),buildCapturePanel(),buildRecordPanel()]),pictures,data,el("div","sca-version",`v${BUILD_VERSION} · ${game.platform} achievement list · Local only · Not connected to your Steam account's achievements`));
    updateCapturePanel();
  }
  function slug(text){return String(text).toLowerCase().replace(/\.[a-z0-9]+$/,"").replace(/[^a-z0-9]+/g,"");}
  function indexForFile(name) {
    const number=/^0*(\d{1,3})(?!\d)/.exec(name);
    if(number){const index=Number(number[1])-1;if(game.achievements[index])return index;}
    const key=slug(name);
    const found=game.achievements.findIndex(a=>slug(a.name)===key);
    return found>=0?found:null;
  }
  function shrinkImage(file) {
    return new Promise((resolve,reject)=>{
      if(!/^image\//.test(file.type||"")||file.size>20*1024*1024){reject(new Error("Not an image"));return;}
      const reader=new window.FileReader();
      reader.onerror=()=>reject(reader.error);
      reader.onload=()=>{
        const image=new window.Image();
        image.onerror=()=>reject(new Error("Unreadable image"));
        image.onload=()=>{
          const size=128,canvas=document.createElement("canvas");canvas.width=canvas.height=size;
          const side=Math.min(image.naturalWidth,image.naturalHeight);
          const context=canvas.getContext("2d");
          context.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,size,size);
          let url=canvas.toDataURL("image/webp",.9);
          if(!url.startsWith("data:image/webp"))url=canvas.toDataURL("image/png");
          resolve(url);
        };
        image.src=reader.result;
      };
      reader.readAsDataURL(file);
    });
  }
  async function applyPictures(files) {
    let loaded=0,skipped=0;
    for(const file of files) {
      const index=files.length===1&&pictureTarget!==null?pictureTarget:indexForFile(file.name);
      if(index===null){skipped++;continue;}
      try{game.customIcons[String(index)]=await shrinkImage(file);loaded++;}catch(_){skipped++;}
    }
    pictureTarget=null;
    if(loaded){if(!writeIcons(game)){showMessage("Pictures shown, but they could not be saved on this PC");return;}}
    showMessage(`${loaded} picture${loaded===1?"":"s"} updated${skipped?`, ${skipped} skipped (name didn't match an achievement)`:""}`);
  }
  // Reuse images Steam has already loaded for this page (hero art, game icon).
  function steamImage(pattern) {
    for(const img of document.images) {
      const src=img.currentSrc||img.src||"";
      if(pattern.test(src)&&!img.closest(`#${DIALOG_ID},#${ROOT_ID}`))return src;
    }
    return null;
  }
  // Steam's own achievement badge (the base UI's icon); it takes the colour of the PLAY TIME clock.
  const AWARD_SVG="<svg viewBox='0 0 24 24' fill='currentColor'><path d='M12 2l1.6 1.2 2-.2.8 1.8 1.8.8-.2 2L19.2 9 18 10.6l.2 2-1.8.8-.8 1.8-2-.2L12 16.2l-1.6-1.2-2 .2-.8-1.8-1.8-.8.2-2L4.8 9 6 7.6l-.2-2 1.8-.8.8-1.8 2 .2zm0 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM8 16.8l1.2.9L8 22l-1.6-1.6L4.5 21zM16 16.8l3.5 4.2-1.9-.6L16 22l-1.2-4.3z'/></svg>";
  // Steam's game header shows LAST PLAYED / PLAY TIME / ACHIEVEMENTS. These games have
  // no Steam achievements, so add our own stat next to PLAY TIME.
  const isPlayTime=value=>/^PLAY ?TIME:?$/.test(normal(value||""));
  // Every PLAY TIME label on the page, ones on screen first: Steam can keep other pages
  // (or menus) in the document, so the first match is not always this game's header.
  function playTimeLabels() {
    const walker=document.createTreeWalker(document.body,4);let text;const labels=[];
    while((text=walker.nextNode())){const label=text.parentElement;if(isPlayTime(text.nodeValue)&&label&&!label.closest(`#${DIALOG_ID},#${ROOT_ID},.${STAT_CLASS}`)&&!labels.includes(label))labels.push(label);}
    const shown=labels.filter(label=>label.getClientRects().length>0);
    return [...shown,...labels.filter(label=>!shown.includes(label))];
  }
  // Steam draws the header row more than once (one copy is kept for measuring), so every
  // copy that has PLAY TIME gets the stat, and whichever Steam shows has it.
  function headerItems() {
    const found=[];
    for(const label of playTimeLabels()){const item=headerItem(label);if(item&&item.value&&item.item!==label&&!found.some(other=>other.item===item.item))found.push(item);}
    return found;
  }
  function findHeaderStat() {return headerItems()[0]||null;}
  // What the header search sees, for Copy status when the stat does not appear.
  function headerInfo() {
    const labels=playTimeLabels();const stats=[...document.querySelectorAll(`.${STAT_CLASS}`)];
    const path=node=>{const parts=[];for(let n=node,i=0;n&&n!==document.body&&i<6;n=n.parentElement,i++)parts.push(`${n.tagName.toLowerCase()}${n.className&&typeof n.className==="string"?"."+n.className.trim().split(/\s+/).slice(0,2).join("."):""}`);return parts.join(" < ");};
    const seen=node=>{if(!node.getClientRects().length)return false;for(let n=node;n&&n!==document.body;n=n.parentElement){const look=window.getComputedStyle(n);if(look.visibility==="hidden"||look.opacity==="0")return false;}return true;};
    return {playTimeLabels:labels.length,shown:labels.filter(seen).length,placed:stats.length,statShown:stats.filter(seen).length,
      found:headerItems().length,stats:stats.slice(0,3).map(stat=>{const box=stat.getBoundingClientRect();let clip=null;for(let n=stat.parentElement;n&&n!==document.body;n=n.parentElement){const look=window.getComputedStyle(n);if(look.overflow!=="visible"){const outer=n.getBoundingClientRect();if(box.right>outer.right+1||box.bottom>outer.bottom+1||box.left<outer.left-1){clip=`${n.tagName.toLowerCase()}.${String(n.className).split(" ")[0]}`;break;}}}return {seen:seen(stat),x:Math.round(box.x),y:Math.round(box.y),w:Math.round(box.width),h:Math.round(box.height),clippedBy:clip,after:path(stat.previousElementSibling)};}),labels:labels.slice(0,3).map(label=>({path:path(label),seen:seen(label),row:normal(label.parentElement?.parentElement?.parentElement?.textContent||"").slice(0,120)}))};
  }
  function headerItem(label) {
    let text;
    // The stat is the PLAY TIME block (icon + label + value) inside the horizontal row of stats.
    let item=label,inRow=false;
    for(let depth=0;depth<6&&item.parentElement&&item.parentElement!==document.body;depth++) {
      const row=window.getComputedStyle(item.parentElement);
      const textSibling=[...item.parentElement.children].some(child=>child!==item&&normal(child.textContent||""));
      if(item!==label&&/flex/.test(row.display)&&!/column/.test(row.flexDirection)&&textSibling){inRow=true;break;}
      item=item.parentElement;
    }
    if(!inRow) {
      // Otherwise the block whose parent also holds LAST PLAYED.
      item=label;
      while(item.parentElement&&item.parentElement!==document.body&&!normal(item.parentElement.textContent||"").includes("LAST PLAYED"))item=item.parentElement;
      if(!item.parentElement||item.parentElement===document.body)return null;
    }
    let value=null;const values=document.createTreeWalker(item,4);
    while((text=values.nextNode())){if(text.parentElement!==label&&normal(text.nodeValue||""))value=text.parentElement;}
    return {item,label,value};
  }
  function buildHeaderStat(found) {
    const stat=el("button",STAT_CLASS);stat.type="button";stat.setAttribute("aria-label",`View my ${game.title} achievements`);
    stat.innerHTML=AWARD_SVG;
    const column=el("div");const row=el("div","sca-stat-row");const bar=el("div","sca-stat-bar");bar.appendChild(el("div"));
    row.append(el("span","sca-stat-value"),bar);column.append(el("div","sca-stat-label","Achievements"),row);stat.appendChild(column);
    const labelStyle=window.getComputedStyle(found.label);
    stat.style.setProperty("--sca-stat-label",labelStyle.color);stat.style.setProperty("--sca-stat-label-size",labelStyle.fontSize);
    stat.style.setProperty("--sca-stat-label-weight",labelStyle.fontWeight);stat.style.setProperty("--sca-stat-label-spacing",labelStyle.letterSpacing);
    if(found.value){const valueStyle=window.getComputedStyle(found.value);stat.style.setProperty("--sca-stat-value",valueStyle.color);stat.style.setProperty("--sca-stat-value-size",valueStyle.fontSize);}
    const clock=found.item.querySelector("svg,img");
    if(clock){const box=clock.getBoundingClientRect();const look=window.getComputedStyle(clock);
      if(box.width>=12&&box.width<=40){stat.style.setProperty("--sca-stat-icon",`${Math.round(box.width)}px`);}
      stat.style.setProperty("--sca-stat-icon-color",look.color);stat.style.setProperty("--sca-stat-icon-opacity",look.opacity);}
    const itemStyle=window.getComputedStyle(found.item);const rowStyle=window.getComputedStyle(found.item.parentElement);
    const rowGap=/flex|grid/.test(rowStyle.display)&&parseFloat(rowStyle.columnGap)>0;
    stat.style.marginLeft=itemStyle.marginLeft!=="0px"?itemStyle.marginLeft:rowGap?"0px":"24px";
    stat.onclick=()=>openDialog();
    return stat;
  }
  function placeHeaderStat() {
    const stats=[...document.querySelectorAll(`.${STAT_CLASS}`)];
    // Cheap path: every stat still sits right after a PLAY TIME item.
    if(stats.length&&stats.every(stat=>stat.isConnected&&stat.previousElementSibling&&playTimeIn(stat.previousElementSibling))){
      const labels=playTimeLabels();
      if(labels.every(label=>stats.some(stat=>stat.previousElementSibling.contains(label)))){updateHeaderStat();return;}
    }
    const items=headerItems();const keep=new Set();
    for(const found of items){
      let stat=found.item.nextElementSibling;
      if(!stat?.classList.contains(STAT_CLASS)){stat=buildHeaderStat(found);found.item.parentElement.insertBefore(stat,found.item.nextSibling);}
      keep.add(stat);
    }
    stats.forEach(stat=>{if(!keep.has(stat))stat.remove();});
    const all=[...document.querySelectorAll(`.${STAT_CLASS}`)];all.forEach((stat,i)=>{if(i===0)stat.id=STAT_ID;else stat.removeAttribute("id");});
    updateHeaderStat();
  }
  function playTimeIn(node) {
    const walker=document.createTreeWalker(node,4);let text;
    while((text=walker.nextNode()))if(isPlayTime(text.nodeValue))return true;
    return false;
  }
  function updateHeaderStat() {
    const completed=countUnlocked();
    document.querySelectorAll(`.${STAT_CLASS}`).forEach(stat=>{
      stat.querySelector(".sca-stat-value").textContent=`${completed}/${game.achievements.length}`;
      stat.querySelector(".sca-stat-bar>div").style.width=`${percentDone()}%`;
    });
  }
  function removeUi(){closeDialog();document.querySelectorAll(`.${STAT_CLASS}`).forEach(stat=>stat.remove());document.getElementById(ROOT_ID)?.remove();document.getElementById(STYLE_ID)?.remove();}
  function refresh() {
    if(!document.body)return;
    const shown=currentGame(window);
    if(!shown){placementState='other-page';game=null;removeUi();return;}
    // Switching between two supported games rebuilds the card for the new list.
    if(shown!==game){removeUi();game=shown;currentAnchor=null;nativeCard=null;query="";group="all";}
    const existing=document.getElementById(ROOT_ID);
    if(existing?.isConnected){
      makeStyle();
      if(!currentAnchor?.section.isConnected){currentAnchor=findSidebar();nativeCard=null;if(currentAnchor)matchNativeStyle(existing,currentAnchor);}
      alignNativeWidth(existing);layoutRows();placeHeaderStat();placementState='inline-sidebar';return;
    }
    const anchor=findSidebar();
    if(!anchor){placementState='waiting-for-sidebar';return;}
    makeStyle();const root=el('section');root.id=ROOT_ID;root.dataset.scaPlacement='library-sidebar';currentAnchor=anchor;
    anchor.parent.insertBefore(root,anchor.section.nextSibling);matchNativeStyle(root,anchor);placementState='inline-sidebar';render();placeHeaderStat();
  }
  window.addEventListener('resize',refresh);
  return {document,render,refresh,updateAutomatic,placement:()=>placementState,headerInfo:()=>{try{return headerInfo();}catch(error){return {error:String(error)};}},dialogOpen:()=>dialogOpen,openDialog,game:()=>game,
    dispose(){window.removeEventListener('resize',refresh);if(messageTimeout!==null)window.clearTimeout(messageTimeout);removeUi();}};
}
