/* Library sidebar card styled like Steam's native Achievements section, plus a
 * "View My Achievements" dialog modeled on Steam's own achievements popup. */
function createTracker(window,windowType) {
  const document=window.document;
  // Big Picture's game page has no Library sidebar, so the card floats on the page there.
  const bigPicture=windowType==="gamepad";
  const DIALOG_ID="sca-ac2-dialog";
  const ICON=48,ICON_GAP=8,STAT_ID="sca-ac2-headstat",STAT_CLASS="sca-headstat";
  let query="",group="all",sort="default",tab="achievements",message="",messageTimeout=null;
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
  // A spoiler (hidden) achievement keeps its name, description and picture hidden until it
  // unlocks or the player chooses to reveal spoilers, as on Steam.
  const isSecret=index=>!!game.achievements[index]?.hidden&&!isUnlocked(index)&&!game.revealSpoilers;
  const HIDDEN_NAME="Hidden achievement",HIDDEN_DETAIL="Details for this achievement will be revealed once unlocked";
  const HIDDEN_ICON="data:image/svg+xml,"+encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='#2a2e36'/><text x='32' y='44' font-family='Arial,Helvetica,sans-serif' font-size='36' font-weight='700' fill='#8b929a' text-anchor='middle'>?</text></svg>");
  const shownName=index=>isSecret(index)?HIDDEN_NAME:game.achievements[index].name;
  const shownDetail=index=>isSecret(index)?HIDDEN_DETAIL:(game.achievements[index].detail||"");
  const shownIcon=index=>isSecret(index)?HIDDEN_ICON:iconFor(game,index);
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
#${ROOT_ID}.sca-bpm{display:block;width:100%;box-sizing:border-box;color:#dcdedf;font-family:var(--sca-heading-family,"Motiva Sans",Arial,Helvetica,sans-serif);font-size:var(--sca-bpm-base,20px)}
#${ROOT_ID}.sca-bpm .sca-bpm-title{margin:0 0 .8em;color:var(--sca-heading-color,#fff);font-size:var(--sca-heading-size,26px);font-weight:var(--sca-heading-weight,500);letter-spacing:var(--sca-heading-spacing,normal);line-height:1.3;text-transform:none}
#${ROOT_ID}.sca-bpm .sca-bpm-panel{background:rgba(255,255,255,.035);cursor:pointer}
#${ROOT_ID}.sca-bpm .sca-bpm-summary{display:flex;align-items:center;gap:1.4em;padding:.8em .75em;background:rgba(0,0,0,.28)}
#${ROOT_ID}.sca-bpm .sca-bpm-count{flex:none;font-size:1.1em;font-weight:400;line-height:1.3;color:#dcdedf;white-space:nowrap}
#${ROOT_ID}.sca-bpm .sca-bpm-count span{color:#8b929a}
#${ROOT_ID}.sca-bpm .sca-bpm-bar{flex:1;height:.55em;background:#4b525c;overflow:hidden}
#${ROOT_ID}.sca-bpm .sca-bpm-bar>div{height:100%;background:#1a9fff}
#${ROOT_ID}.sca-bpm .sca-bpm-group{padding:1.1em .5em .4em}
#${ROOT_ID}.sca-bpm .sca-bpm-group:last-child{padding-bottom:1.2em}
#${ROOT_ID}.sca-bpm .sca-bpm-label{margin:.3em .25em .5em;font-size:.82em;font-weight:700;letter-spacing:.06em;color:#acb2b8;text-transform:uppercase}
#${ROOT_ID}.sca-bpm .sca-bpm-row{display:flex;gap:.6em;overflow:hidden;align-items:center;padding:.4em .25em}
#${ROOT_ID}.sca-bpm .sca-bpm-smallrow{gap:.6em}
#${ROOT_ID}.sca-bpm .sca-bpm-feature{flex:0 0 min(50%,48em);display:flex;gap:.6em;padding:.75em;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.12);color:inherit;font:inherit;text-align:left;min-width:0}
#${ROOT_ID}.sca-bpm .sca-bpm-feature .sca-bpm-text{min-width:0;display:flex;flex-direction:column;padding-top:.1em}
#${ROOT_ID}.sca-bpm .sca-bpm-name{font-size:1.15em;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${ROOT_ID}.sca-bpm .sca-bpm-desc{margin-top:.15em;color:#8b929a;font-size:.95em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
#${ROOT_ID}.sca-bpm .sca-bpm-when{margin-top:auto;padding-top:.4em;color:#acb2b8;font-size:.85em}
#${ROOT_ID}.sca-bpm .sca-bpm-icon{position:relative;flex:none;display:block;width:5.5em;height:5.5em;padding:0;border:0;background:#0006;overflow:visible}
#${ROOT_ID}.sca-bpm .sca-bpm-small{width:3.9em;height:3.9em}
#${ROOT_ID}.sca-bpm .sca-bpm-icon img{display:block;width:100%;height:100%;object-fit:cover}
#${ROOT_ID}.sca-bpm .sca-bpm-dim img{filter:grayscale(1) brightness(.4)}
#${ROOT_ID}.sca-bpm button.sca-bpm-icon.sca-padfocus,#${ROOT_ID}.sca-bpm button.sca-bpm-icon:hover{outline:2px solid #f6c55a;outline-offset:0;box-shadow:0 0 10px 4px rgba(246,180,60,.75),0 0 26px 8px rgba(246,180,60,.35);z-index:1}
#${ROOT_ID}.sca-bpm .sca-bpm-feature.sca-padfocus,#${ROOT_ID}.sca-bpm .sca-bpm-feature:hover{border-color:#fff;background:rgba(255,255,255,.13)}
#${ROOT_ID}.sca-bpm .sca-bpm-summary.sca-padfocus,#${ROOT_ID}.sca-bpm .sca-bpm-summary:hover{outline:2px solid #fff;outline-offset:-2px;background:rgba(255,255,255,.08)}
#${DIALOG_ID} .sca-padfocus{outline:3px solid #fff!important;outline-offset:2px}
#${DIALOG_ID} .sca-ach.sca-padfocus{outline-offset:-3px;background:#323844}
.sca-steam-dimmed{outline:none!important;box-shadow:none!important;filter:brightness(.8)}
#${DIALOG_ID}.sca-full{padding:0;background:#0e1117;backdrop-filter:none;align-items:stretch;justify-content:stretch;font-size:18px}
#${DIALOG_ID}.sca-full .sca-dialog{width:100%;height:100%;max-width:none;max-height:none;background:#0e1117;box-shadow:none}
#${DIALOG_ID}.sca-full .sca-close{display:none}
#${DIALOG_ID}.sca-full .sca-dhead{padding:96px 32px 0;background:#262b33}
#${DIALOG_ID}.sca-full .sca-dhero{filter:blur(18px) brightness(.5) saturate(.9);transform:translateZ(0);will-change:transform}
#${DIALOG_ID}.sca-full .sca-dhero.sca-preblurred{filter:brightness(.5) saturate(.9);inset:0}
html.sca-page-open body>*:not(#${DIALOG_ID}){visibility:hidden}
#${DIALOG_ID}.sca-full .sca-dbody{will-change:scroll-position;contain:content}
#${DIALOG_ID}.sca-full .sca-bpm-top{display:flex;align-items:center;gap:24px}
#${DIALOG_ID}.sca-full .sca-bpm-cover{flex:none;width:216px;height:324px;object-fit:cover;box-shadow:0 6px 24px rgba(0,0,0,.6)}
#${DIALOG_ID}.sca-full .sca-bpm-info{flex:1;min-width:0}
#${DIALOG_ID}.sca-full h2{font-size:34px;font-weight:400;letter-spacing:0;color:#fff}
#${DIALOG_ID}.sca-full .sca-bpm-stats{display:flex;align-items:flex-end;gap:24px;margin-top:30px;padding:20px;background:rgba(0,0,0,.2)}
#${DIALOG_ID}.sca-full .sca-bpm-earnedbox{flex:1;min-width:0}
#${DIALOG_ID}.sca-full .sca-earned{margin-top:0;font-size:17px;letter-spacing:.06em;color:#c6d4df}
#${DIALOG_ID}.sca-full .sca-dbar{height:10px;margin-top:14px;border-radius:5px;background:#3d4450}
#${DIALOG_ID}.sca-full .sca-dbar>div{background:#1a9fff;border-radius:5px}
#${DIALOG_ID}.sca-full .sca-bpm-play{flex:none;text-align:left}
#${DIALOG_ID}.sca-full .sca-bpm-play div:first-child{font-size:17px;font-weight:700;letter-spacing:.06em;color:#c6d4df}
#${DIALOG_ID}.sca-full .sca-bpm-play div:last-child{font-size:24px;font-weight:700;color:#fff;margin-top:4px}
#${DIALOG_ID}.sca-full .sca-tabs{margin:28px -32px 0;padding:16px 0;background:none;gap:12px}
#${DIALOG_ID}.sca-full .sca-tab{font-size:17px;padding:12px 24px;border-radius:26px;letter-spacing:.06em}
#${DIALOG_ID}.sca-full .sca-dbody{padding:12px 20px 90px;background:#0e1117}
#${DIALOG_ID}.sca-full .sca-toolbar{gap:16px;padding:0 0 12px}
#${DIALOG_ID}.sca-full .sca-search,#${DIALOG_ID}.sca-full .sca-select{height:58px;font-size:20px;width:330px;background:#262a33}
#${DIALOG_ID}.sca-full .sca-section-title{font-size:15px;margin:20px 8px 10px}
#${DIALOG_ID}.sca-full .sca-ach{min-height:118px;padding:10px 14px 10px 10px;gap:14px;margin-bottom:12px;background:#23262e}
#${DIALOG_ID}.sca-full .sca-ach-icon{width:96px;height:96px}
#${DIALOG_ID}.sca-full .sca-ach-name{font-size:22px;font-weight:500}
#${DIALOG_ID}.sca-full .sca-ach-desc{font-size:17px;margin-top:4px}
#${DIALOG_ID}.sca-full .sca-ach-side{font-size:17px;color:#8b929a}
#${DIALOG_ID}.sca-full .sca-mark,#${DIALOG_ID}.sca-full .sca-small{font-size:15px;padding:8px 14px}
#${DIALOG_ID}.sca-full .sca-panel h3{font-size:20px}
#${DIALOG_ID}.sca-full .sca-panel p{font-size:16px}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-dhead{padding:14px 32px 0}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-bpm-top{gap:16px}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-bpm-cover{width:48px;height:72px}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-bpm-info{display:flex;align-items:center;gap:24px}
#${DIALOG_ID}.sca-full.sca-collapsed h2{flex:none;font-size:24px;max-width:40%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-bpm-stats{flex:1;margin-top:0;padding:10px 16px}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-earned{font-size:14px}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-dbar{height:8px;margin-top:8px}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-bpm-play div:first-child{font-size:14px}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-bpm-play div:last-child{font-size:18px;margin-top:2px}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-tabs{margin-top:8px;padding:8px 0}
#${DIALOG_ID}.sca-full.sca-collapsed .sca-tab{padding:8px 20px;font-size:15px}
#${DIALOG_ID}.sca-full .sca-bpm-footer{position:absolute;left:0;right:0;bottom:0;height:56px;display:flex;align-items:center;justify-content:flex-end;padding:0 36px;background:#0b0d10;z-index:6}
#${DIALOG_ID}.sca-full .sca-bpm-back{display:flex;align-items:center;gap:12px;border:0;background:none;color:#fff;font-size:18px;font-weight:700;letter-spacing:.04em;padding:6px 4px}
#${DIALOG_ID}.sca-full .sca-bpm-key{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;border-radius:50%;background:#e0e0e0;color:#0b0d10;font-size:16px;font-weight:800}
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
#${DIALOG_ID} .sca-ach-rarity{display:flex;align-items:center;gap:10px;margin-top:6px;font-size:12px;color:#8b929a}
#${DIALOG_ID} .sca-rarity-meter{flex:0 1 120px;height:4px;border-radius:2px;background:#3d4450;overflow:hidden}
#${DIALOG_ID} .sca-rarity-meter>div{height:100%;background:#67707b}
#${DIALOG_ID} .sca-rarity-rare{color:#e5b143}
#${DIALOG_ID} .sca-rarity-rare .sca-rarity-meter>div{background:#e5b143}
#${DIALOG_ID} .sca-hidden-summary{display:flex;align-items:center;gap:14px;min-height:64px;padding:12px 14px 12px 10px;margin-bottom:8px;background:#20242b;border:1px dashed #3d4450}
#${DIALOG_ID} .sca-hidden-summary.sca-revealed{min-height:0}
#${DIALOG_ID} .sca-hidden-icon{display:block}
#${DIALOG_ID} .sca-hidden-icon:hover::after{display:none}
#${DIALOG_ID} .sca-hidden-icon img,.sca-hidden-icon img{width:100%;height:100%;display:block}
.sca-rare{box-shadow:0 0 0 2px #e5b143,0 0 10px #e5b14388!important}
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
.${STAT_CLASS}{display:flex;align-items:center;gap:10px;cursor:pointer;flex:none;background:none;border:0;padding:0 4px;color:inherit;font:inherit;text-align:left;align-self:flex-start;height:auto;min-height:0;margin-top:0;margin-bottom:0}
.${STAT_CLASS} svg{width:var(--sca-stat-icon,24px);height:var(--sca-stat-icon,24px);flex:none;color:var(--sca-stat-icon-color,#8b929a);opacity:var(--sca-stat-icon-opacity,1)}
.${STAT_CLASS} .sca-stat-label{color:var(--sca-stat-label,#8b929a);font-size:var(--sca-stat-label-size,12px);font-weight:var(--sca-stat-label-weight,700);letter-spacing:var(--sca-stat-label-spacing,.5px);text-transform:uppercase;line-height:1.3}
.${STAT_CLASS} .sca-stat-row{display:flex;align-items:center;gap:6px}
.${STAT_CLASS} .sca-stat-value{color:var(--sca-stat-value,#8b929a);font-size:var(--sca-stat-value-size,12px);line-height:1.3}
.${STAT_CLASS} .sca-stat-bar{width:80px;height:4px;border-radius:2px;background:#0b0d10;overflow:hidden}
.${STAT_CLASS}.sca-stat-compact{gap:6px;margin-left:12px!important}
.${STAT_CLASS}.sca-stat-compact .sca-stat-bar{width:36px}
.${STAT_CLASS} .sca-stat-bar>div{height:100%;background:linear-gradient(90deg,#1a44c2,#1a9fff)}
.${STAT_CLASS}:hover .sca-stat-label{color:#fff}
@media (max-width:640px){#${DIALOG_ID}{padding:12px}#${DIALOG_ID} .sca-close{top:6px;right:6px;width:40px;height:40px}#${DIALOG_ID} .sca-dhead{padding:18px 16px 0}#${DIALOG_ID} .sca-dbody{padding:8px 10px 18px}#${DIALOG_ID} .sca-toolbar{flex-direction:column}#${DIALOG_ID} .sca-search,#${DIALOG_ID} .sca-select{width:100%}#${DIALOG_ID} .sca-ach{flex-wrap:wrap}#${DIALOG_ID} .sca-ach-side{max-width:none;width:100%;align-items:flex-start;text-align:left;padding-left:70px}}
`;
    (document.head||document.documentElement).appendChild(style);
  }
  const LOCK_SVG="<svg viewBox='0 0 24 24'><path fill='#e8e8e8' d='M7 10V7a5 5 0 0 1 10 0v3h1.5c.8 0 1.5.7 1.5 1.5v9c0 .8-.7 1.5-1.5 1.5h-13C4.7 22 4 21.3 4 20.5v-9C4 10.7 4.7 10 5.5 10zm2.5 0h5V7a2.5 2.5 0 0 0-5 0z'/></svg>";
  function art(index,unlocked,className) {
    const holder=el(className==="sca-tile"?"button":"span",className+(unlocked?"":" sca-locked-art"));
    const img=el("img");img.alt="";img.src=shownIcon(index);img.draggable=false;holder.appendChild(img);
    if(unlocked&&isRare(index))holder.classList.add("sca-rare");
    if(!unlocked){const lock=el("span","sca-lock");lock.innerHTML=LOCK_SVG;holder.appendChild(lock);}
    return holder;
  }
  const rarity=index=>rarityFor(game,index);
  // Steam marks achievements fewer than 10% of players have as rare.
  const isRare=index=>{const value=rarity(index);return value!==null&&value<10;};
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
      tile.title=`${shownName(index)}\n${shownDetail(index)}`;
      tile.setAttribute("aria-label",`${shownName(index)} (${unlocked?"unlocked":"locked"})`);
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
      fillIconRow(row,row.dataset.kind==="unlocked"?sortUnlocked(unlocked):locked.sort((x,y)=>isSecret(x)-isSecret(y)||x-y),row.dataset.kind==="unlocked");
    });
  }
  // Most recent unlock first, like Steam.
  function sortUnlocked(indices) {
    const time=i=>{const t=Date.parse(game.progress[String(i)]);return Number.isNaN(t)?0:t;};
    return indices.slice().sort((a,b)=>time(b)-time(a)||a-b);
  }
  // Big Picture: the layout of Steam's own Achievements section on the Your Stuff tab.
  function renderBigPicture(root) {
    root.replaceChildren();root.setAttribute('aria-label',`${game.title} achievements`);
    root.appendChild(el('h2','sca-bpm-title','Achievements'));
    const panel=el('div','sca-bpm-panel');
    const completed=countUnlocked(),percent=percentDone(),total=game.achievements.length;
    const summary=el('div','sca-bpm-summary');
    const count=el('div','sca-bpm-count sca-count',`You've unlocked ${completed}/${total} `);count.appendChild(el('span','',`(${percent}%)`));
    const bar=el('div','sca-bpm-bar');bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','Achievement completion');bar.setAttribute('aria-valuemin','0');bar.setAttribute('aria-valuemax',String(total));bar.setAttribute('aria-valuenow',String(completed));
    const fill=el('div');fill.style.width=`${percent}%`;bar.appendChild(fill);
    summary.append(count,bar);summary.onclick=()=>openDialog();panel.appendChild(summary);
    const unlocked=[],locked=[];
    game.achievements.forEach((_a,i)=>(isUnlocked(i)?unlocked:locked).push(i));
    // Like Steam: the newest unlock is featured, the other unlocks follow as large pictures,
    // and locked ones get a row of small pictures. With nothing unlocked yet, the next locked
    // one is featured instead.
    const tile=(index,isOn,small)=>{
      const node=el('button',"sca-bpm-icon"+(small?" sca-bpm-small":"")+(isOn?"":" sca-bpm-dim")+(isOn&&isRare(index)?" sca-rare":""));node.type='button';
      const img=el('img');img.alt='';img.src=shownIcon(index);img.draggable=false;node.appendChild(img);
      node.title=`${shownName(index)}\n${shownDetail(index)}`;node.setAttribute('aria-label',`${shownName(index)} (${isOn?'unlocked':'locked'})`);
      node.onclick=event=>{event.stopPropagation();openDialog(index);};return node;
    };
    const feature=(index,isOn)=>{
      const a=game.achievements[index];
      const node=el('button','sca-bpm-feature');node.type='button';node.setAttribute('aria-label',`${shownName(index)} (${isOn?'unlocked':'locked'})`);
      const pic=el('span',"sca-bpm-icon"+(isOn?"":" sca-bpm-dim")+(isOn&&isRare(index)?" sca-rare":""));const img=el('img');img.alt='';img.src=shownIcon(index);img.draggable=false;pic.appendChild(img);
      const text=el('div','sca-bpm-text');text.append(el('div','sca-bpm-name',shownName(index)),el('div','sca-bpm-desc',shownDetail(index)));
      text.appendChild(el('div','sca-bpm-when',isOn?formatUnlock(game.progress[String(index)]):(a.automatic?'Unlocks automatically':'Locked')));
      node.append(pic,text);node.onclick=event=>{event.stopPropagation();openDialog(index);};return node;
    };
    const sorted=sortUnlocked(unlocked);
    // Spoilers go to the end of the locked row, so a hidden one is never the featured one.
    locked.sort((x,y)=>isSecret(x)-isSecret(y)||x-y);
    if(sorted.length){
      const box=el('div','sca-bpm-group');const row=el('div','sca-bpm-row');
      row.appendChild(feature(sorted[0],true));for(const index of sorted.slice(1))row.appendChild(tile(index,true,false));
      box.appendChild(row);panel.appendChild(box);
    }
    if(locked.length){
      const box=el('div','sca-bpm-group');box.appendChild(el('div','sca-bpm-label','Locked Achievements'));
      const row=el('div','sca-bpm-row'+(sorted.length?' sca-bpm-smallrow':''));
      if(!sorted.length){row.appendChild(feature(locked[0],false));for(const index of locked.slice(1))row.appendChild(tile(index,false,false));}
      else for(const index of locked)row.appendChild(tile(index,false,true));
      box.appendChild(row);panel.appendChild(box);
    }
    root.appendChild(panel);
  }
  function render() {
    if(!game)return;
    const root=document.getElementById(ROOT_ID);
    if(root&&bigPicture) renderBigPicture(root);
    else if(root) {
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
  function preBlur(src){
    return new Promise(resolve=>{
      const img=new window.Image();img.crossOrigin="anonymous";
      img.onload=()=>{try{const canvas=document.createElement("canvas");canvas.width=48;canvas.height=27;
        canvas.getContext("2d").drawImage(img,0,0,48,27);resolve(canvas.toDataURL("image/png"));}catch(_){resolve(null);}};
      img.onerror=()=>resolve(null);img.src=src;
    });
  }
  function closeDialog() {
    document.documentElement.classList.remove("sca-page-open");
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
    dialogOpen=true;tab="achievements";lastFocusIndex=focusIndex;
    document.getElementById(DIALOG_ID)?.remove();
    const overlay=el("div");overlay.id=DIALOG_ID;
    overlay.onmousedown=event=>{if(event.target===overlay)closeDialog();};
    const dialog=el("div","sca-dialog");dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-labelledby","sca-dialog-title");
    const close=el("button","sca-close");close.type="button";close.setAttribute("aria-label","Close");
    close.innerHTML="<svg viewBox='0 0 24 24'><path d='M5 5l14 14M19 5L5 19' stroke='#fff' stroke-width='2.2' stroke-linecap='round'/></svg>";
    close.onclick=closeDialog;
    const head=el("div","sca-dhead");
    const hero=steamImage(/library_hero/i);
    if(hero){const layer=el("div","sca-dhero");layer.style.backgroundImage=`url("${hero.replace(/["\\]/g,"")}")`;head.appendChild(layer);
      // Big Picture: a live blur filter over a screen-wide picture is costly to redraw, so blur
      // it once by shrinking it onto a tiny canvas; the browser's upscaling does the rest.
      if(bigPicture)preBlur(hero).then(url=>{if(url){layer.style.backgroundImage=`url("${url}")`;layer.classList.add("sca-preblurred");}}).catch(()=>{});}
    const titleRow=el("div","sca-title-row");const gameIcon=el("img");gameIcon.alt="";gameIcon.src=steamImage(new RegExp(`/${game.appId}/[0-9a-f]{40}\\.(jpg|png)`,"i"))||builtInIcon(game,0);
    const title=el("h2","",game.title);title.id="sca-dialog-title";titleRow.append(gameIcon,title);
    const earned=el("div","sca-earned");earned.append(el("span","sca-earned-count"),el("span","sca-earned-percent"));
    const bar=el("div","sca-dbar");bar.appendChild(el("div"));
    const tabs=el("div","sca-tabs");tabs.setAttribute("role","tablist");
    for(const [value,label] of [["achievements","MY ACHIEVEMENTS"],["settings","SETTINGS"]]) {
      const button=el("button","sca-tab",label);button.type="button";button.setAttribute("role","tab");button.dataset.tab=value;
      button.onclick=()=>{tab=value;buildBody();};tabs.appendChild(button);
    }
    if(bigPicture){
      // Big Picture: a full screen page like Steam's own achievements screen.
      overlay.classList.add("sca-full");
      // Steam's own page stays drawn underneath; hiding it while ours covers the screen saves work.
      document.documentElement.classList.add("sca-page-open");
      const top=el("div","sca-bpm-top");
      let coverSrc=null;
      // Steam's own portrait capsule for the game, as its library uses it (from its local cache).
      try{const store=hostWindow.appStore;const overview=store?.GetAppOverviewByAppID?.(game.appId);if(overview)coverSrc=store.GetVerticalCapsuleURLForApp?.(overview)||null;}catch(_){coverSrc=null;}
      coverSrc=coverSrc||steamImage(/library_600x900|portrait/i);
      if(coverSrc){const cover=el("img","sca-bpm-cover");cover.alt="";cover.src=coverSrc;top.appendChild(cover);}
      const info=el("div","sca-bpm-info");const stats=el("div","sca-bpm-stats");const box=el("div","sca-bpm-earnedbox");
      box.append(earned,bar);stats.appendChild(box);
      const played=playTimeText();
      if(played){const play=el("div","sca-bpm-play");play.append(el("div","","PLAY TIME"),el("div","",played));stats.appendChild(play);}
      info.append(title,stats);top.appendChild(info);head.append(top,tabs);
      const footer=el("div","sca-bpm-footer");const back=el("button","sca-bpm-back");back.type="button";
      back.append(el("span","sca-bpm-key","B"),el("span","","BACK"));back.onclick=closeDialog;footer.appendChild(back);
      dialog.appendChild(footer);
    } else head.append(titleRow,earned,bar,tabs);
    const body=el("div","sca-dbody");
    // The header shrinks to one line once the list scrolls, and comes back at the top.
    if(bigPicture)body.addEventListener("scroll",()=>{
      const top=body.scrollTop;
      if(top>60&&!overlay.classList.contains("sca-collapsed"))overlay.classList.add("sca-collapsed");
      else if(top<=4&&overlay.classList.contains("sca-collapsed"))overlay.classList.remove("sca-collapsed");
    },{passive:true});
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
      // Each category shows its own count, like Steam's per-set progress (DLC sets included).
      for(const value of ["all",...new Set(game.achievements.map(a=>a.group))]){
        const members=game.achievements.map((a,i)=>i).filter(i=>value==="all"||game.achievements[i].group===value);
        const have=members.filter(isUnlocked).length;
        const option=el("option","",`${value==="all"?"All types":value} (${have}/${members.length})`);option.value=value;select.appendChild(option);
      }
      select.value=group;select.onchange=()=>{group=select.value;updateList();};
      toolbar.append(search,select);
      if(game.achievements.some((_a,i)=>rarity(i)!==null)){
        const order=el("select","sca-select sca-sort");order.setAttribute("aria-label","Sort achievements");
        for(const [value,label] of [["default","Default order"],["rare","Rarest first"],["common","Most common first"]]){const option=el("option","",label);option.value=value;order.appendChild(option);}
        order.value=sort;order.onchange=()=>{sort=order.value;updateList();};toolbar.appendChild(order);
      } else sort="default";body.append(toolbar,el("div","sca-list"));
    } else buildSettings(body);
    updateDialog();updateAutomatic();
  }
  function achievementRow(index) {
    const a=game.achievements[index],unlocked=isUnlocked(index);
    const row=el("div","sca-ach"+(unlocked?"":" sca-locked"));row.dataset.index=String(index);
    const icon=art(index,unlocked,"sca-ach-icon");
    const change=el("button","sca-ach-icon"+(unlocked?"":" sca-locked-art")+(unlocked&&isRare(index)?" sca-rare":""));change.type="button";
    change.replaceChildren(...icon.childNodes);change.title="Change picture";change.setAttribute("aria-label",`Change picture for ${a.name}`);
    change.onclick=()=>{pictureTarget=index;const picker=document.querySelector(`#${DIALOG_ID} .sca-picker`);picker.multiple=false;picker.click();};
    const text=el("div","sca-ach-text");
    text.append(el("div","sca-ach-name",a.name),el("div","sca-ach-desc",a.detail));
    const count=a.completion?{have:game.achievements.filter((_b,i)=>i!==index&&isUnlocked(i)).length,need:game.achievements.length-1}:game.auto.counts?.[String(index)];
    if(!unlocked&&count&&Number.isFinite(count.have)&&Number.isFinite(count.need)&&count.need>0) {
      const meter=el("div","sca-ach-meter");const fill=el("div");fill.style.width=`${Math.min(100,count.have/count.need*100)}%`;meter.appendChild(fill);
      const holder=el("div","sca-ach-progress");holder.append(meter,el("span","",`${count.have} / ${count.need}`));text.appendChild(holder);
    }
    // Steam's global unlock rate: the share of players who have it, gold when rare.
    const rate=rarity(index);
    if(rate!==null){
      const line=el("div","sca-ach-rarity"+(rate<10?" sca-rarity-rare":""));
      const meter=el("div","sca-rarity-meter");const fill=el("div");fill.style.width=`${rate}%`;meter.appendChild(fill);
      line.append(meter,el("span","",`${formatRarity(rate)} of players have this achievement`));text.appendChild(line);
    }
    if(a.hidden&&!unlocked)text.appendChild(el("div","sca-ach-tag sca-spoiler-tag","Spoiler · hidden until unlocked"));
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
    // The list is asked to redraw whenever tracking state changes (every second or so while a
    // save is read). Redraw only when what it shows changed, so scrolling and the controller's
    // place stay put and nothing heavy runs in between.
    let key;
    try{key=JSON.stringify([game.appId,game.progress,game.auto?.counts||null,query,group,sort,game.revealSpoilers,game.customRarity,Object.entries(game.customIcons||{}).map(([k,v])=>`${k}:${String(v).length}`)]);}catch(_){key=null;}
    if(key!==null&&list.dataset.key===key)return;
    const body=list.closest(".sca-dbody");const scrollTop=body?body.scrollTop:0;
    const focusedIndex=list.querySelector(".sca-ach.sca-padfocus")?.dataset.index;
    list.replaceChildren();
    const needle=query.trim().toLowerCase();
    const matches=index=>{
      const a=game.achievements[index];
      if(group!=="all"&&group!==a.group)return false;
      return !needle||`${a.name} ${a.detail}`.toLowerCase().includes(needle);
    };
    const unlocked=[],locked=[],secret=[];
    game.achievements.forEach((a,i)=>{
      if(isSecret(i)){if(group==="all"||group===a.group)secret.push(i);return;}
      if(matches(i))(isUnlocked(i)?unlocked:locked).push(i);
    });
    const byRate=list=>{
      if(sort==="default")return list;
      const value=i=>rarity(i)??(sort==="rare"?101:-1);
      return list.slice().sort((x,y)=>(sort==="rare"?value(x)-value(y):value(y)-value(x))||x-y);
    };
    if(unlocked.length){list.appendChild(el("div","sca-section-title","Unlocked Achievements"));for(const i of byRate(sortUnlocked(unlocked)))list.appendChild(achievementRow(i));}
    if(locked.length||secret.length)list.appendChild(el("div","sca-section-title","Locked Achievements"));
    for(const i of byRate(locked))list.appendChild(achievementRow(i));
    if(secret.length){
      // Like Steam: one line for the spoilers left, with a choice to reveal them.
      const row=el("div","sca-hidden-summary");
      const text=el("div","sca-ach-text");
      text.append(el("div","sca-ach-name",`${secret.length} hidden achievement${secret.length===1?"":"s"} remaining`),el("div","sca-ach-desc","Details for each achievement will be revealed once unlocked"));
      const reveal=el("button","sca-small sca-reveal","Show spoilers");reveal.type="button";reveal.onclick=()=>setRevealSpoilers(game,true);
      const pic=el("span","sca-ach-icon sca-hidden-icon");const img=el("img");img.alt="";img.src=HIDDEN_ICON;pic.appendChild(img);
      row.append(pic,text,reveal);list.appendChild(row);
    } else if(game.revealSpoilers&&game.achievements.some((a,i)=>a.hidden&&!isUnlocked(i))){
      const row=el("div","sca-hidden-summary sca-revealed");
      const text=el("div","sca-ach-text");text.append(el("div","sca-ach-desc","Spoilers are shown. Hide them again to keep story achievements secret until they unlock."));
      const hide=el("button","sca-small sca-reveal","Hide spoilers");hide.type="button";hide.onclick=()=>setRevealSpoilers(game,false);
      row.append(text,hide);list.appendChild(row);
    }
    if(!unlocked.length&&!locked.length&&!secret.length)list.appendChild(el("div","sca-empty","No achievements match your search."));
    if(key!==null)list.dataset.key=key;
    if(body)body.scrollTop=scrollTop;
    if(focusedIndex!==undefined){const row=list.querySelector(`.sca-ach[data-index="${focusedIndex}"]`);if(row){row.tabIndex=-1;row.classList.add("sca-padfocus");row.focus?.({preventScroll:true});}}
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
    const progressTest=el("button","sca-small sca-progress-test","Test progress popup");progressTest.type="button";
    progressTest.onclick=()=>{note.textContent="Switch to your game now. The progress popup shows in 10 seconds.";window.setTimeout(()=>{const counted=Object.keys(game.auto?.counts||{}).map(Number).find(i=>game.achievements[i]&&!game.achievements[i].hidden);const index=Number.isInteger(counted)?counted:Math.max(0,game.achievements.findIndex(a=>!a.hidden));const need=game.auto?.counts?.[String(index)]?.need||20;announceProgress(game,index,Math.max(1,Math.floor(need/2)),need,true);note.textContent="";},10000);};
    buttons.append(toggle,test,progressTest);panel.append(buttons,note);
    return panel;
  }
  function buildCommonSettings(body,auto) {
    const pictures=el("div","sca-panel");
    pictures.append(el("h3","","Achievement pictures"),
      el("p","",`Click any achievement's picture in My Achievements to replace it with an image from your PC. To load many at once, pick several images named by list number (1.png to ${game.achievements.length}.png) or by achievement name (for example ${game.achievements[0].name.replace(/[^A-Za-z0-9 ]/g,"")}.jpg).`),
      el("p","","To use the real Xbox pictures, open the game's achievement list (TrueAchievements, Exophase…) in Chrome or Edge, scroll until every picture has loaded, press Ctrl+S and save as \"Webpage, Single File\". Then choose that .mhtml file with Load from saved page. If the page lists how many players have each achievement (for example Exophase's percentages), those unlock rates are loaded too and shown like Steam's global percentages, with rare ones (under 10%) in gold."));
    const pictureButtons=el("div","sca-buttons");
    const many=el("button","sca-small","Choose pictures…");many.onclick=()=>{pictureTarget=null;const picker=document.querySelector(`#${DIALOG_ID} .sca-picker`);picker.multiple=true;picker.click();};
    const fromPage=el("button","sca-small sca-from-page","Load from saved page…");fromPage.onclick=()=>document.querySelector(`#${DIALOG_ID} .sca-page-picker`).click();
    pictureButtons.appendChild(fromPage);
    const reset=el("button","sca-small","Reset to built-in pictures");reset.onclick=()=>{game.customIcons={};writeIcons(game);showMessage("Built-in pictures restored");};
    const clearRates=el("button","sca-small sca-clear-rates","Clear unlock rates");clearRates.type="button";clearRates.onclick=()=>{game.customRarity={};writeRarity(game);showMessage("Loaded unlock rates cleared");};
    if(Object.keys(game.customRarity||{}).length)pictureButtons.appendChild(clearRates);
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
          // Steam's icon size is 256x256; smaller pictures keep their own size instead of being blown up.
          const side=Math.min(image.naturalWidth,image.naturalHeight);
          const size=Math.max(1,Math.min(256,side)),canvas=document.createElement("canvas");canvas.width=canvas.height=size;
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
  function playTimeText() {
    try{const found=headerItems()[0];const text=(found?.value?.textContent||"").replace(/\s+/g," ").trim();return text.replace(/\bhours\b/i,"hrs");}catch(_){return "";}
  }
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
  // What the header search sees, for Copy status when the stat does not appear.
  function headerInfo() {
    const labels=playTimeLabels();const stats=[...document.querySelectorAll(`.${STAT_CLASS}`)];
    const path=node=>{const parts=[];for(let n=node,i=0;n&&n!==document.body&&i<6;n=n.parentElement,i++)parts.push(`${n.tagName.toLowerCase()}${n.className&&typeof n.className==="string"?"."+n.className.trim().split(/\s+/).slice(0,2).join("."):""}`);return parts.join(" < ");};
    const seen=node=>{if(!node.getClientRects().length)return false;for(let n=node;n&&n!==document.body;n=n.parentElement){const look=window.getComputedStyle(n);if(look.visibility==="hidden"||look.opacity==="0")return false;}return true;};
    return {playTimeLabels:labels.length,shown:labels.filter(seen).length,placed:stats.length,statShown:stats.filter(seen).length,
      found:headerItems().length,stats:stats.slice(0,3).map(stat=>{const box=stat.getBoundingClientRect();let clip=null;for(let n=stat.parentElement;n&&n!==document.body;n=n.parentElement){const look=window.getComputedStyle(n);if(look.overflow!=="visible"){const outer=n.getBoundingClientRect();if(box.right>outer.right+1||box.bottom>outer.bottom+1||box.left<outer.left-1){clip=`${n.tagName.toLowerCase()}.${String(n.className).split(" ")[0]}`;break;}}}return {seen:seen(stat),x:Math.round(box.x),y:Math.round(box.y),w:Math.round(box.width),h:Math.round(box.height),clippedBy:clip,after:path(stat.previousElementSibling),beside:(()=>{const near=stat.previousElementSibling||stat.nextElementSibling;if(!near)return null;const other=near.getBoundingClientRect();return {y:Math.round(other.y),h:Math.round(other.height)};})()};}),labels:labels.slice(0,3).map(label=>({path:path(label),seen:seen(label),row:normal(label.parentElement?.parentElement?.parentElement?.textContent||"").slice(0,120)}))};
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
    // A stat sits after its PLAY TIME item, or first in that row when the row was too narrow.
    if(stats.length&&stats.every(stat=>stat.isConnected&&stat.parentElement&&playTimeIn(stat.parentElement))){
      const labels=playTimeLabels();
      if(labels.every(label=>stats.some(stat=>stat.parentElement.contains(label)))){stats.forEach(fitHeaderStat);updateHeaderStat();return;}
    }
    const items=headerItems();const keep=new Set();
    for(const found of items){
      let stat=[...found.item.parentElement.children].find(child=>child.classList.contains(STAT_CLASS));
      if(!stat){stat=buildHeaderStat(found);found.item.parentElement.insertBefore(stat,found.item.nextSibling);}
      keep.add(stat);fitHeaderStat(stat);
    }
    stats.forEach(stat=>{if(!keep.has(stat))stat.remove();});
    const all=[...document.querySelectorAll(`.${STAT_CLASS}`)];all.forEach((stat,i)=>{if(i===0)stat.id=STAT_ID;else stat.removeAttribute("id");});
    updateHeaderStat();
  }
  // The ancestor that cuts off what does not fit (Steam's header row hides overflow), if the stat overflows it.
  function clippingBox(stat) {
    const box=stat.getBoundingClientRect();
    for(let n=stat.parentElement;n&&n!==document.body;n=n.parentElement){
      if(window.getComputedStyle(n).overflow!=="visible"){const outer=n.getBoundingClientRect();return box.right>outer.right+1||box.left<outer.left-1?n:null;}
    }
    return null;
  }
  // Some headers carry more stats (Fallout 3 adds CLOUD STATUS), so ours can fall off the end of
  // the row. Then it gets narrower, and if it still does not fit it moves to the front of the row.
  function fitHeaderStat(stat) {
    if(!stat.isConnected||!stat.getClientRects().length||stat.dataset.scaFront)return;
    if(!clippingBox(stat))return;
    stat.classList.add("sca-stat-compact");
    if(!clippingBox(stat))return;
    stat.dataset.scaFront="1";stat.style.marginLeft="0px";stat.style.marginRight="24px";
    stat.parentElement.insertBefore(stat,stat.parentElement.firstElementChild);
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
  // ---- Controller support in Big Picture ----
  // Big Picture sends each controller press to the page as a "vgp_onbuttondown" event on the
  // element it has focused; its own navigation listens further up. Steam's navigation does not
  // know the plugin's section, so the plugin catches presses first (capture phase) and moves
  // through its own section and list itself, handing control back at the section's edges.
  const PAD={OK:1,CANCEL:2,SECONDARY:3,BUMPER_LEFT:5,BUMPER_RIGHT:6,UP:9,DOWN:10,LEFT:11,RIGHT:12};
  let padQuietUntil=0,lastFocusIndex,padActive=false,padRow=0,padCol=0,padSteamFocus=null,padEnterCheck=null;
  function padRows(){
    const root=document.getElementById(ROOT_ID);if(!root)return [];
    const rows=[];const summary=root.querySelector('.sca-bpm-summary');if(summary)rows.push([summary]);
    root.querySelectorAll('.sca-bpm-row').forEach(row=>rows.push([...row.children]));
    return rows;
  }
  function padMark(target){
    document.querySelectorAll('.sca-padfocus').forEach(node=>{if(node!==target)node.classList.remove('sca-padfocus');});
    if(!target)return;
    target.classList.add('sca-padfocus');
    try{target.scrollIntoView({block:'nearest',inline:'nearest'});}catch(_){target.scrollIntoView?.();}
  }
  function padShow(){
    const rows=padRows();if(!rows.length){padLeave();return;}
    padRow=Math.max(0,Math.min(padRow,rows.length-1));padCol=Math.max(0,Math.min(padCol,rows[padRow].length-1));
    padMark(rows[padRow][padCol]);
  }
  function padEnter(row,steamFocus){
    padActive=true;padSteamFocus=steamFocus||null;
    // Steam's own highlight stays on the item it focused; dim it while the plugin has control.
    padSteamFocus?.classList?.add('sca-steam-dimmed');
    const rows=padRows();padRow=row<0?rows.length-1:row;padCol=0;padShow();
  }
  function padLeave(){
    padActive=false;padSteamFocus?.classList?.remove('sca-steam-dimmed');padSteamFocus=null;
    if(!dialogOpen)padMark(null);
  }
  function swallow(event){event.preventDefault();event.stopImmediatePropagation();}
  // The next focus target from `current` in a direction, by screen position.
  function spatial(current,targets,button){
    const from=current?.getBoundingClientRect();if(!from)return targets[0]||null;
    const cx=from.left+from.width/2,cy=from.top+from.height/2;let best=null,bestScore=Infinity;
    for(const node of targets){
      if(node===current)continue;const box=node.getBoundingClientRect();if(!box.width&&!box.height)continue;
      const x=box.left+box.width/2,y=box.top+box.height/2;
      let main,side;
      if(button===PAD.DOWN){main=box.top-from.top;side=Math.abs(x-cx);if(main<=2&&!(box.top>=from.bottom-2))continue;}
      else if(button===PAD.UP){main=from.top-box.top;side=Math.abs(x-cx);if(main<=2)continue;}
      else if(button===PAD.RIGHT){main=x-cx;side=Math.abs(y-cy);if(main<=2||side>from.height)continue;}
      else {main=cx-x;side=Math.abs(y-cy);if(main<=2||side>from.height)continue;}
      const score=main+side*2;if(score<bestScore){bestScore=score;best=node;}
    }
    return best;
  }
  function dialogTargets(){
    const overlay=document.getElementById(DIALOG_ID);if(!overlay)return [];
    return [...overlay.querySelectorAll('button,.sca-ach')].filter(node=>!node.hidden&&!node.disabled&&!(node.tagName==='BUTTON'&&node.closest('.sca-ach'))&&node.getClientRects().length);
  }
  function dialogFocus(node){
    if(!node)return;
    if(node.classList.contains('sca-ach')&&!node.hasAttribute('tabindex'))node.tabIndex=-1;
    node.focus?.({preventScroll:true});padMark(node);
  }
  function onDialogPad(event,button){
    const overlay=document.getElementById(DIALOG_ID);
    const targets=dialogTargets();
    let current=overlay.querySelector('.sca-padfocus');if(!current||!targets.includes(current))current=null;
    if(button===PAD.CANCEL){closeDialog();if(padActive)padShow();return;}
    if(button===PAD.BUMPER_LEFT||button===PAD.BUMPER_RIGHT){
      const tabs=[...overlay.querySelectorAll('.sca-tab')];const at=tabs.findIndex(t=>t.getAttribute('aria-selected')==='true');
      const next=tabs[(at+(button===PAD.BUMPER_RIGHT?1:tabs.length-1))%tabs.length];next?.click();
      dialogFocus(document.querySelector(`#${DIALOG_ID} .sca-tab[aria-selected="true"]`));return;
    }
    if(button===PAD.OK){
      if(!current){dialogFocus(targets[0]);return;}
      if(current.classList.contains('sca-ach')){const mark=current.querySelector('.sca-mark');if(mark){const index=current.dataset.index;mark.click();dialogFocus(document.querySelector(`#${DIALOG_ID} .sca-ach[data-index="${index}"]`));}}
      else{const wasTab=current.classList.contains('sca-tab')?current.dataset.tab:null;current.click();
        if(wasTab)dialogFocus(document.querySelector(`#${DIALOG_ID} .sca-tab[data-tab="${wasTab}"]`));}
      return;
    }
    if([PAD.UP,PAD.DOWN,PAD.LEFT,PAD.RIGHT].includes(button)){
      // Nothing picked yet (or it went away): start from the first achievement on screen, not the top.
      if(!current){const view=overlay.querySelector('.sca-dbody')?.getBoundingClientRect();
        const rows=targets.filter(t=>t.classList.contains('sca-ach'));
        dialogFocus((view&&rows.find(t=>t.getBoundingClientRect().top>=view.top-1))||rows[0]||targets[0]);return;}
      const next=spatial(current,targets,button);
      if(next)dialogFocus(next);
      else if(button===PAD.DOWN||button===PAD.UP){const body=overlay.querySelector('.sca-dbody');if(body)body.scrollTop+=button===PAD.DOWN?200:-200;}
    }
  }
  // How far below the bottom of our section an element starts (Infinity when it is not below it).
  function gapBelow(node){
    const root=document.getElementById(ROOT_ID);
    if(!root||!(node instanceof window.Element)||root.contains(node)||!(root.compareDocumentPosition(node)&4))return Infinity;
    return node.getBoundingClientRect().top-root.getBoundingClientRect().bottom;
  }
  function describe(node){
    if(!(node instanceof window.Element))return null;
    return `${node.tagName.toLowerCase()}.${String(node.className||"").trim().split(/\s+/).slice(0,2).join(".")}`.slice(0,80);
  }
  const padLog={events:0,entered:0,last:null,landed:null};
  function onPad(event){
    const button=Number(event.detail?.button);if(!button)return;
    if(event.type==='vgp_onbuttondown')padLog.events++;
    if(dialogOpen){swallow(event);if(event.type==='vgp_onbuttondown')onDialogPad(event,button);return;}
    if(event.type!=='vgp_onbuttondown'){if(padActive)swallow(event);return;}
    const root=document.getElementById(ROOT_ID);
    if(!game||!root||!currentAnchor?.section?.isConnected){if(padActive)padLeave();return;}
    if(padActive){
      const rows=padRows();
      // At the edges control goes back to Steam. Its focus stayed where it was when ours took over:
      // if that is on the side being left to, the press is used up; otherwise Steam moves on.
      if(button===PAD.UP){if(padRow===0){const steamSide=side(padSteamFocus);padLeave();
        if(steamSide==="above")swallow(event);else padQuietUntil=Date.now()+400;return;}swallow(event);padRow--;padShow();return;}
      if(button===PAD.DOWN){if(padRow>=rows.length-1){const steamSide=side(padSteamFocus);padLeave();
        if(steamSide==="below")swallow(event);else padQuietUntil=Date.now()+400;return;}swallow(event);padRow++;padShow();return;}
      if(button===PAD.LEFT){swallow(event);if(padCol>0){padCol--;padShow();}return;}
      if(button===PAD.RIGHT){swallow(event);if(padCol<rows[padRow].length-1){padCol++;padShow();}return;}
      if(button===PAD.OK){swallow(event);const target=rows[padRow]?.[padCol];target?.click();
        if(dialogOpen){const pick=lastFocusIndex!==undefined?document.querySelector(`#${DIALOG_ID} .sca-ach[data-index="${lastFocusIndex}"]`):null;dialogFocus(pick||dialogTargets().find(t=>t.classList.contains('sca-ach')));}
        return;}
      if(button===PAD.CANCEL){padLeave();return;}
      return;
    }
    const target=event.target;
    padLog.last={button,target:describe(target),gap:Math.round(gapBelow(target))};
    if((button!==PAD.UP&&button!==PAD.DOWN)||!(target instanceof window.Element)||root.contains(target))return;
    // Let Steam move, then look where its focus went. Steam's navigation does not know our
    // section, so if its focus jumped across it, our section takes over at that edge.
    const before=side(target);
    if(padEnterCheck)window.clearTimeout(padEnterCheck);
    padEnterCheck=window.setTimeout(()=>{padEnterCheck=null;
      const landed=document.querySelector('.gpfocus')||document.activeElement;
      padLog.landed=describe(landed);
      if(padActive||dialogOpen||Date.now()<padQuietUntil)return;
      const after=landed instanceof window.Element?side(landed):null;
      if(button===PAD.UP&&before==="below"&&after==="above"){padLog.entered++;padEnter(-1,landed);return;}
      if(button===PAD.DOWN&&before==="above"&&after==="below"){padLog.entered++;padEnter(0,landed);return;}
      // Nothing focusable below ours (Media can be empty), so Steam stayed put: come in anyway.
      if(button===PAD.DOWN&&before==="above"&&(landed===target||!landed||after==="above")){
        const rootBox=root.getBoundingClientRect(),box=(landed instanceof window.Element?landed:target).getBoundingClientRect();
        if(rootBox.top-box.bottom<240){padLog.entered++;padEnter(0,landed instanceof window.Element?landed:target);}
      }
    },60);
  }
  // Where an element sits compared with our section.
  function side(node){
    const root=document.getElementById(ROOT_ID);
    if(!root||!(node instanceof window.Element)||root.contains(node))return null;
    return root.compareDocumentPosition(node)&4?"below":"above";
  }
  function onPointer(){if(padActive)padLeave();}
  if(bigPicture){
    window.addEventListener('vgp_onbuttondown',onPad,true);window.addEventListener('vgp_onbuttonup',onPad,true);
    window.addEventListener('pointerdown',onPointer,true);
  }
  function removeUi(){if(padActive)padLeave();closeDialog();document.querySelectorAll(`.${STAT_CLASS}`).forEach(stat=>stat.remove());document.getElementById(ROOT_ID)?.remove();document.getElementById(STYLE_ID)?.remove();}
  const BPM_SECTIONS=["MEDIA","NOTES","DLC","ADDITIONAL CONTENT","WORKSHOP","TRADING CARDS","CLOUD SAVES"];
  function shownNode(node){
    // jsdom and other engines without layout have no boxes at all; rely on styles there.
    if(!node.getClientRects().length&&document.body.getClientRects().length)return false;
    for(let n=node;n&&n!==document.body;n=n.parentElement){const look=window.getComputedStyle(n);if(look.display==="none"||look.visibility==="hidden")return false;}
    return true;
  }
  // The first Your Stuff section heading on screen (normally Media), and the block
  // that holds it: the nearest ancestor taller than the heading itself.
  function findBigPictureSection(){
    const walker=document.createTreeWalker(document.body,4);let text;
    while((text=walker.nextNode())){
      if(!BPM_SECTIONS.includes(normal(text.nodeValue||"")))continue;
      const heading=text.parentElement;
      if(!heading||heading.closest(`#${ROOT_ID},#${DIALOG_ID},button,a,[role="button"],[role="tab"],[role="tablist"]`)||!shownNode(heading))continue;
      const tall=heading.getBoundingClientRect().height+8;
      // Climb wrappers that hold only the heading.
      let section=heading;
      while(section.parentElement&&section.parentElement!==document.body&&section.parentElement.getBoundingClientRect().height<=tall)section=section.parentElement;
      // Heading + content in one block (and no other section in it): that block is the section.
      const block=section.parentElement;
      if(block&&block!==document.body&&block.firstElementChild===section&&block.getBoundingClientRect().height>tall&&!otherSectionIn(block,heading))section=block;
      if(!section.parentElement)continue;
      return {section,heading};
    }
    return null;
  }
  function otherSectionIn(node,heading){
    const walker=document.createTreeWalker(node,4);let text;
    while((text=walker.nextNode()))if(text.parentElement!==heading&&BPM_SECTIONS.includes(normal(text.nodeValue||"")))return true;
    return false;
  }
  function matchBigPictureStyle(root,anchor){
    const heading=window.getComputedStyle(anchor.heading);
    for(const [name,value] of [["color",heading.color],["size",heading.fontSize],["weight",heading.fontWeight],["spacing",heading.letterSpacing],["family",heading.fontFamily]]) {
      if(value)root.style.setProperty(`--sca-heading-${name}`,value);
    }
    const size=parseFloat(heading.fontSize);
    if(size>=12&&size<=60)root.style.setProperty("--sca-bpm-base",`${Math.round(size*.78*10)/10}px`);
    const section=window.getComputedStyle(anchor.section);
    root.style.marginBottom=section.marginTop!=="0px"?section.marginTop:"2.4em";
  }
  function refresh() {
    if(!document.body)return;
    const shown=currentGame(window);
    if(!shown){placementState='other-page';game=null;removeUi();return;}
    // Switching between two supported games rebuilds the card for the new list.
    if(shown!==game){removeUi();game=shown;currentAnchor=null;nativeCard=null;query="";group="all";}
    const existing=document.getElementById(ROOT_ID);
    if(existing?.isConnected&&!bigPicture){
      makeStyle();
      if(!currentAnchor?.section.isConnected){currentAnchor=findSidebar();nativeCard=null;if(currentAnchor)matchNativeStyle(existing,currentAnchor);}
      alignNativeWidth(existing);layoutRows();placeHeaderStat();placementState='inline-sidebar';return;
    }
    if(bigPicture){
      // On the Your Stuff tab, where Steam puts its own Achievements: above Media.
      if(existing?.isConnected&&currentAnchor?.section.isConnected&&shownNode(currentAnchor.section)&&existing.nextElementSibling===currentAnchor.section){makeStyle();placementState='big-picture';return;}
      existing?.remove();
      const anchor=findBigPictureSection();currentAnchor=anchor;
      if(!anchor){placementState='waiting-for-your-stuff';return;}
      makeStyle();const root=el('section');root.id=ROOT_ID;root.className='sca-bpm';root.dataset.scaPlacement='big-picture';
      matchBigPictureStyle(root,anchor);
      anchor.section.parentElement.insertBefore(root,anchor.section);placementState='big-picture';render();return;
    }
    const anchor=findSidebar();
    if(!anchor){placementState='waiting-for-sidebar';return;}
    makeStyle();const root=el('section');root.id=ROOT_ID;root.dataset.scaPlacement='library-sidebar';currentAnchor=anchor;
    anchor.parent.insertBefore(root,anchor.section.nextSibling);matchNativeStyle(root,anchor);placementState='inline-sidebar';render();placeHeaderStat();
  }
  window.addEventListener('resize',refresh);
  return {document,render,refresh,updateAutomatic,placement:()=>placementState,headerInfo:()=>{try{return headerInfo();}catch(error){return {error:String(error)};}},controller:()=>bigPicture?{...padLog,active:padActive,row:padRow,col:padCol}:null,dialogOpen:()=>dialogOpen,openDialog,game:()=>game,
    dispose(){window.removeEventListener('resize',refresh);if(bigPicture){window.removeEventListener('vgp_onbuttondown',onPad,true);window.removeEventListener('vgp_onbuttonup',onPad,true);window.removeEventListener('pointerdown',onPointer,true);if(padEnterCheck)window.clearTimeout(padEnterCheck);}if(messageTimeout!==null)window.clearTimeout(messageTimeout);removeUi();}};
}
