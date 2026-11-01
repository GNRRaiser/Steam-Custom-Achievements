  /* Record mode (backend/recorder.lua): snapshot the save folder, earn one achievement in
   * game, then list every value that changed next to what the achievement asks for. */
  let recordPick=null,recordBusy=false;
  const asList=value=>Array.isArray(value)?value:[];
  const shown=value=>value===null||value===undefined?"(none)":String(value);
  function reportText(report) {
    const lines=[`${report.game}: ${report.achievement} - ${report.detail}`,`Recorded ${report.started} to ${report.finished} in ${report.folderName}`];
    if(report.rule)lines.push(`Plugin rule: ${report.rule}`);
    if(report.noProgress)lines.push("Marked: no progress (changes here are ruled out)");
    const n=report.narrowing;
    if(n?.started&&n.passes>1){lines.push(`After ${n.passes} recordings (${n.progressPasses} with progress), ${n.remaining} values changed the same way every time:`);for(const c of asList(n.candidates))lines.push(`  ${c.file} ${c.where}: ${asList(c.values).map(shown).join(" -> ")}`);}
    for(const file of asList(report.files)){
      lines.push(`${file.name} [${file.change}${file.kind?`, ${file.kind}`:""}]`);
      for(const f of asList(file.findings))lines.push(`  ${f.where}: ${shown(f.old)} -> ${shown(f.new)}${f.verdict==="match"?"  <== matches":f.verdict==="rising"?"  (went up)":""}`);
    }
    if(!asList(report.files).length)lines.push("No file changed.");
    return lines.join("\n");
  }
  function renderRecordReport(result,report) {
    result.replaceChildren();
    if(!report)return;
    const files=asList(report.files);
    result.appendChild(el("h4","",`What changed for ${report.achievement}`));
    if(report.rule)result.appendChild(el("p","sca-record-rule",`Plugin rule: ${report.rule}`));
    if(report.noProgress)result.appendChild(el("p","",`Marked "no progress": the ${files.length?"values below were":"nothing was"} ruled out.`));
    const narrowing=report.narrowing;
    if(narrowing?.started&&narrowing.passes>1){
      const box=el("div","sca-record-file sca-record-narrowed");
      box.appendChild(el("div","sca-record-name",`After ${narrowing.passes} recordings (${narrowing.progressPasses} with progress): ${narrowing.remaining} value${narrowing.remaining===1?"":"s"} changed the same way every time`));
      const list=el("ul");
      for(const c of asList(narrowing.candidates).slice(0,15)){
        const item=el("li","",`${c.file} · ${c.where}: ${asList(c.values).map(shown).join(" → ")}`);
        if(c.verdict==="match"){item.dataset.verdict="match";item.appendChild(el("span","sca-record-badge","matches"));}
        list.appendChild(item);
      }
      box.appendChild(list);
      if(!narrowing.remaining)box.appendChild(el("p","","Nothing survived. Press Start with \"Keep narrowing\" unticked to begin a new search."));
      result.appendChild(box);
    }
    if(!files.length)result.appendChild(el("p","sca-record-none","No file changed. Make sure the game saved (finish the mission, or wait for the autosave), then record again."));
    else result.appendChild(el("p","",report.matches?`${report.matches} value${report.matches===1?"":"s"} now equal${report.matches===1?"s":""} a number from the achievement ("${report.detail}").`:`Nothing equals a number from the achievement yet. Values marked "went up" increased but are still below it.`));
    for(const file of files) {
      const box=el("div","sca-record-file");
      box.appendChild(el("div","sca-record-name",`${file.name} · ${file.change}${file.kind?` · ${file.kind}`:""}`));
      const list=el("ul");
      const findings=asList(file.findings);
      for(const f of findings.slice(0,15)) {
        const item=el("li","",`${f.where}: ${shown(f.old)} → ${shown(f.new)}`);
        if(f.verdict){item.dataset.verdict=f.verdict;item.appendChild(el("span","sca-record-badge",f.verdict==="match"?"matches":"went up"));}
        list.appendChild(item);
      }
      box.appendChild(list);
      const more=(file.totalFindings||findings.length)-Math.min(findings.length,15);
      if(more>0)box.appendChild(el("p","",`${more} more change${more===1?"":"s"} in the saved report.`));
      result.appendChild(box);
    }
    const buttons=el("div","sca-buttons");
    if(report.savedTo){
      result.appendChild(el("p","sca-record-saved",`Copies of the changed files (before and after) and the full report are in ${report.savedTo}. Send them along to add this achievement to automatic tracking.`));
      const path=el("button","sca-small","Copy folder path");path.onclick=()=>copyText(report.savedTo,"Folder path");buttons.appendChild(path);
    } else result.appendChild(el("p","sca-record-saved","The copies could not be saved on this PC, but the report can still be copied."));
    const copy=el("button","sca-small","Copy report");copy.onclick=()=>copyText(reportText(report),"Report");buttons.appendChild(copy);
    result.appendChild(buttons);
  }
  function buildRecordPanel() {
    const panel=el("div","sca-panel sca-record");
    panel.append(el("h3","","Record an achievement"),
      el("p","","This works like a RetroAchievements memory search, but on save files. Pick an achievement and press Start. Earn it in game, let the game save, then press Done. Every value that changed is listed, and values that match the achievement's numbers are marked."));
    const pick=el("select","sca-select sca-record-pick");pick.setAttribute("aria-label","Achievement to record");
    game.achievements.forEach((a,i)=>{const option=el("option","",`${i+1}. ${a.name}${isUnlocked(i)?" (unlocked)":""}`);option.value=String(i);pick.appendChild(option);});
    if(recordPick===null||!game.achievements[recordPick]){recordPick=game.achievements.findIndex((_a,i)=>!isUnlocked(i));if(recordPick<0)recordPick=0;}
    const detail=el("p","sca-record-detail");
    const folder=el("input","sca-input sca-record-folder");folder.type="text";folder.setAttribute("aria-label","Save folder to record");
    folder.placeholder=game.automatic?"Save folder (leave empty to use the folder of the save being tracked)":game.saveFolderHint?`Save folder (leave empty to use ${game.saveFolderHint})`:"Paste the folder where this game keeps its saves";
    folder.value=game.recordFolder||"";folder.oninput=()=>{game.recordFolder=folder.value;};
    const buttons=el("div","sca-buttons");
    const start=el("button","sca-small sca-record-start","Start");
    const done=el("button","sca-small sca-record-done","Done");
    const none=el("button","sca-small sca-record-none-done","Done, no progress");none.title="Use this when you played without making progress: anything that changed anyway is ruled out";
    const cancel=el("button","sca-small sca-record-cancel","Cancel");
    buttons.append(start,done,none,cancel);
    const narrowLabel=el("label","sca-record-narrow");const narrow=el("input");narrow.type="checkbox";
    narrowLabel.append(narrow,document.createTextNode(" Keep narrowing: combine with my earlier recordings of this achievement and keep only values that change the same way every time"));
    const status=el("p","sca-record-status");const result=el("div","sca-record-result");
    panel.append(pick,detail,folder,narrowLabel,buttons,status,result);
    const sync=()=>{
      const recording=game.recording;
      pick.value=String(recording?recording.index:recordPick);pick.disabled=!!recording||recordBusy;folder.disabled=!!recording||recordBusy;
      const a=game.achievements[Number(pick.value)];detail.textContent=a?a.detail:"";
      start.disabled=!!recording||recordBusy;done.disabled=none.disabled=cancel.disabled=!recording||recordBusy;
      const canNarrow=game.recordReport?.index===Number(pick.value);
      narrow.disabled=!!recording||recordBusy||!canNarrow;if(!canNarrow)narrow.checked=false;
      if(recording)status.textContent=`Recording "${game.achievements[recording.index].name}" since ${recording.started}: ${recording.files} file${recording.files===1?"":"s"} in ${recording.folderName} captured. Earn it in game, wait for the game to save, then press Done.`;
      else if(!recordBusy&&!game.recordError)status.textContent=game.recordReport?"":"Not recording.";
      if(game.recordError)status.textContent=game.recordError;
    };
    const run=async(method,extra)=>{
      recordBusy=true;game.recordError=null;sync();
      status.textContent=method==="StartRecording"?"Reading the save folder…":method==="FinishRecording"?"Comparing…":"Cancelling…";
      try{
        const reply=await recordCall(game,method,extra);
        if(method==="StartRecording"){game.recording=reply;renderRecordReport(result,null);}
        else{game.recording=null;if(method==="FinishRecording"){game.recordReport=reply;renderRecordReport(result,reply);narrow.checked=true;}}
      }catch(error){game.recordError=`Record mode: ${String(error?.message||error).replace(/[\r\n]+/g," ").replace(/^.*?:\d+: /,"").slice(0,300)}`;}
      finally{recordBusy=false;sync();}
    };
    pick.onchange=()=>{recordPick=Number(pick.value);sync();};
    start.onclick=()=>{const index=Number(pick.value),a=game.achievements[index];void run("StartRecording",{index,name:a.name,detail:a.detail,folder:folder.value.trim(),narrow:narrow.checked});};
    done.onclick=()=>void run("FinishRecording");
    none.onclick=()=>void run("FinishRecording",{noProgress:true});
    cancel.onclick=()=>void run("CancelRecording");
    narrow.checked=game.recordReport?.index===(game.recording?game.recording.index:recordPick);
    sync();renderRecordReport(result,game.recordReport);
    return panel;
  }
  /* Capture while I play (backend/capture.lua): no buttons during play. Every save the game
   * writes is copied with a timestamp and the changed values are logged. */
  function updateCapturePanel() {
    const panel=document.querySelector(`#${DIALOG_ID} .sca-capture`);if(!panel)return;
    const cap=game.auto?.capture;const on=!!cap?.enabled;
    panel.querySelector(".sca-capture-toggle").textContent=on?"Turn off":"Turn on";
    panel.querySelector(".sca-capture-folder").disabled=on;
    let text=on?`On · watching ${cap.folderName||"the save folder"} · ${cap.events||0} save${cap.events===1?"":"s"} captured this session · ${cap.megabytes||0} MB stored`:"Off.";
    if(on&&cap.lastEvent)text+=` · last at ${cap.lastEvent}`;
    if(cap?.problem)text+=` · ${cap.problem}`;
    panel.querySelector(".sca-capture-state").textContent=text;
    const list=panel.querySelector(".sca-capture-recent");list.replaceChildren();
    for(const line of asList(cap?.recent).slice().reverse())list.appendChild(el("li","",line));
  }
  function buildCapturePanel() {
    const panel=el("div","sca-panel sca-capture");
    panel.append(el("h3","","Capture while I play"),
      el("p","","Turn this on and just play. Every time the game saves, the plugin keeps a copy and notes which values changed, so achievements can be mapped later without you testing anything. Copies go in the plugin's recordings folder (up to 1 GB). Zip that folder now and then and send it in."));
    const folder=el("input","sca-input sca-capture-folder");folder.type="text";folder.setAttribute("aria-label","Save folder to capture");
    folder.placeholder=game.automatic?"Save folder (leave empty to follow the save being tracked)":game.saveFolderHint?`Save folder (leave empty to use ${game.saveFolderHint})`:"Paste the folder where this game keeps its saves";
    folder.value=game.recordFolder||"";folder.oninput=()=>{game.recordFolder=folder.value;};
    const buttons=el("div","sca-buttons");const toggle=el("button","sca-small sca-capture-toggle","Turn on");buttons.appendChild(toggle);
    const state=el("p","sca-capture-state");const recent=el("ul","sca-capture-recent");
    panel.append(folder,buttons,state,recent);
    toggle.onclick=async()=>{
      toggle.disabled=true;
      try{await setCapture(game,!game.auto?.capture?.enabled,folder.value.trim());}
      catch(error){state.textContent=`Capture: ${String(error?.message||error).replace(/[\r\n]+/g," ").replace(/^.*?:\d+: /,"").slice(0,300)}`;toggle.disabled=false;return;}
      toggle.disabled=false;updateCapturePanel();
    };
    return panel;
  }
