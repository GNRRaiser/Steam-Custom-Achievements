  /* Pictures from a saved achievement list page. In Chrome or Edge, open the game's
   * achievement page (TrueAchievements, Exophase...), press Ctrl+S and choose
   * "Webpage, Single File" (.mhtml): the pictures are stored inside that one file.
   * Each achievement's name is found in the page and paired with the closest picture. */
  function mhtmlParts(text) {
    const boundary=/boundary="?([^";\r\n]+)"?/i.exec(text.slice(0,4000))?.[1];
    if(!boundary)throw new Error("Not a saved single-file webpage (.mhtml)");
    const parts=[];
    for(const chunk of text.split(`--${boundary}`).slice(1)) {
      const split=chunk.search(/\r?\n\r?\n/);
      if(split<0)continue;
      const head=chunk.slice(0,split),body=chunk.slice(split).replace(/^\r?\n\r?\n/,"").replace(/\r?\n$/,"");
      const header=name=>new RegExp(`^${name}:\\s*(.+)$`,"im").exec(head)?.[1].trim()||"";
      parts.push({type:header("Content-Type").split(";")[0].toLowerCase(),encoding:header("Content-Transfer-Encoding").toLowerCase(),
        location:header("Content-Location"),id:header("Content-ID").replace(/^<|>$/g,""),body});
    }
    return parts;
  }
  function quotedPrintable(text) {
    const bytes=[];const clean=text.replace(/=\r?\n/g,"");
    for(let i=0;i<clean.length;i++){
      if(clean[i]==="="&&/^[0-9A-F]{2}$/i.test(clean.slice(i+1,i+3))){bytes.push(parseInt(clean.slice(i+1,i+3),16));i+=2;}
      else bytes.push(clean.charCodeAt(i)&255);
    }
    return new window.TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
  function partBlob(part) {
    if(part.encoding!=="base64")return null;
    const raw=window.atob(part.body.replace(/\s+/g,""));
    const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return new window.Blob([bytes],{type:part.type});
  }
  // Returns [{index, blob}] for every achievement whose picture could be found.
  const labelSelector="a,span,div,h1,h2,h3,h4,h5,p,td,strong,b";
  function picturesFromPage(text) {
    // A page saved as "Webpage, Complete" (.html) keeps its pictures in a separate folder,
    // so only the unlock rates can be read from it.
    if(!/boundary=/i.test(text.slice(0,4000))&&/<html|<!doctype html/i.test(text.slice(0,4000))){
      const doc=new window.DOMParser().parseFromString(text,"text/html");
      const rates=ratesFromPage(doc,key=>[...doc.querySelectorAll(labelSelector)].filter(node=>node.children.length<=2&&slug(node.textContent||"")===key));
      if(!rates.size)throw new Error("Not a saved single-file webpage (.mhtml), and no unlock rates were found in it");
      return {pictures:[],rates};
    }
    const parts=mhtmlParts(text);
    const page=parts.find(p=>p.type==="text/html");
    if(!page)throw new Error("The saved page has no HTML");
    const html=page.encoding==="quoted-printable"?quotedPrintable(page.body):page.encoding==="base64"?new window.TextDecoder("utf-8").decode(Uint8Array.from(window.atob(page.body.replace(/\s+/g,"")),c=>c.charCodeAt(0))):page.body;
    const images=new Map();
    for(const part of parts){
      if(!part.type.startsWith("image/"))continue;
      if(part.location)images.set(part.location,part);
      if(part.id)images.set(`cid:${part.id}`,part);
    }
    const doc=new window.DOMParser().parseFromString(html,"text/html");
    const resolve=value=>{
      if(!value)return null;
      const first=value.split(",")[0].trim().split(/\s+/)[0];
      try{return new URL(first,page.location||undefined).href;}catch(_){return first;}
    };
    const imageFor=img=>{
      for(const attribute of ["src","data-src","data-original","data-lazy-src","srcset","data-srcset"]){
        const url=resolve(img.getAttribute(attribute));
        if(url&&images.has(url))return url;
        if(url&&images.has(url.split(/[?#]/)[0]))return url.split(/[?#]/)[0];
      }
      return null;
    };
    const all=[...doc.querySelectorAll("img")].map(img=>({img,url:imageFor(img)})).filter(x=>x.url);
    // Pictures used many times on the page (gamerscore badges, locked placeholders) are not achievement art.
    const uses=new Map();for(const {url} of all)uses.set(url,(uses.get(url)||0)+1);
    const usable=all.filter(x=>uses.get(x.url)<=2);
    const order=new Map([...doc.querySelectorAll("*")].map((node,i)=>[node,i]));
    const found=new Map();
    const labelsFor=key=>[...doc.querySelectorAll(labelSelector)].filter(node=>node.children.length<=2&&slug(node.textContent||"")===key);
    const rates=ratesFromPage(doc,labelsFor);
    game.achievements.forEach((a,index)=>{
      const key=slug(a.name);
      const direct=usable.find(x=>slug(x.img.getAttribute("alt")||"")===key||slug(x.img.getAttribute("title")||"")===key);
      if(direct){found.set(index,direct.url);return;}
      const labels=labelsFor(key);
      for(const label of labels){
        for(let box=label.parentElement,depth=0;box&&depth<6;box=box.parentElement,depth++){
          const inside=usable.filter(x=>box.contains(x.img));
          if(!inside.length)continue;
          const at=order.get(label);
          inside.sort((x,y)=>{const dx=at-order.get(x.img),dy=at-order.get(y.img);return (dx<0?1e6-dx:dx)-(dy<0?1e6-dy:dy);});
          found.set(index,inside[0].url);break;
        }
        if(found.has(index))break;
      }
    });
    // A picture paired with more than one achievement is ambiguous; leave those as they are.
    const counts=new Map();for(const url of found.values())counts.set(url,(counts.get(url)||0)+1);
    const pictures=[...found].filter(([,url])=>counts.get(url)===1).map(([index,url])=>({index,blob:partBlob(images.get(url))})).filter(x=>x.blob);
    return {pictures,rates};
  }
  // Unlock rates: the percentage written next to each achievement's name ("12.3%"), looked
  // for in the smallest part of the page around the name that holds no other achievement.
  function ratesFromPage(doc,labelsFor) {
    const labels=game.achievements.map(a=>labelsFor(slug(a.name)));
    const owner=new Map();labels.forEach((nodes,index)=>{for(const node of nodes)owner.set(node,index);});
    const rates=new Map();
    labels.forEach((nodes,index)=>{
      for(const label of nodes){
        for(let box=label.parentElement,depth=0;box&&box!==doc.body&&depth<6;box=box.parentElement,depth++){
          if([...owner].some(([node,other])=>other!==index&&box.contains(node)))break;
          // Sites also put the rate in an attribute, e.g. TrueAchievements' "473,147 tracked
          // gamers (99% - TA Ratio = 1.00)" tooltip; styles (width: 99%) are not rates.
          const attributes=[box,...box.querySelectorAll("*")].flatMap(node=>[...node.attributes].filter(a=>a.name!=="style"&&a.value.includes("%")).map(a=>a.value));
          const text=[(box.textContent||"").replace(label.textContent||""," "),...attributes].join(" ");
          const all=[...text.matchAll(/(?:^|[^\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s?%/g)].map(m=>Number(m[1].replace(",",".")));
          // A percentage from the achievement's own description ("Reach 80% of...") is not its rate.
          const own=[...String(game.achievements[index].detail||"").matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s?%/g)].map(m=>Number(m[1].replace(",",".")));
          const values=[...new Set(all.filter(v=>v>=0&&v<=100&&!own.includes(v)))];
          if(values.length===1){rates.set(index,values[0]);break;}
          if(values.length>1)break;
        }
        if(rates.has(index))break;
      }
    });
    return rates;
  }
  async function importPage(file) {
    try{
      if(file.size>60*1024*1024)throw new Error("That page is too large");
      const {pictures,rates}=picturesFromPage(await file.text());
      let loaded=0;
      for(const {index,blob} of pictures){try{game.customIcons[String(index)]=await shrinkImage(blob);loaded++;}catch(_){}}
      // Rates only count when most of the list has one, so a stray percentage can't stand in.
      const useRates=rates.size>=Math.max(3,Math.ceil(game.achievements.length*.5));
      if(useRates){game.customRarity={};for(const [index,value] of rates)game.customRarity[String(index)]=value;}
      if(loaded&&!writeIcons(game)){showMessage("Pictures shown, but they could not be saved on this PC");return;}
      if(useRates)writeRarity(game);
      const parts=[loaded?`${loaded} of ${game.achievements.length} pictures`:"",useRates?`${rates.size} unlock rates`:""].filter(Boolean);
      showMessage(parts.length?`${parts.join(" and ")} loaded from the saved page`:"No achievement pictures found in that page. Save it as \"Webpage, Single File\" after the pictures have loaded.");
    }catch(error){showMessage(String(error?.message||error).slice(0,200));}
  }
