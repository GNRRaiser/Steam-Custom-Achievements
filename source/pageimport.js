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
  function picturesFromPage(text) {
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
    game.achievements.forEach((a,index)=>{
      const key=slug(a.name);
      const direct=usable.find(x=>slug(x.img.getAttribute("alt")||"")===key||slug(x.img.getAttribute("title")||"")===key);
      if(direct){found.set(index,direct.url);return;}
      const labels=[...doc.querySelectorAll("a,span,div,h1,h2,h3,h4,h5,p,td,strong,b")].filter(node=>node.children.length<=2&&slug(node.textContent||"")===key);
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
    return [...found].filter(([,url])=>counts.get(url)===1).map(([index,url])=>({index,blob:partBlob(images.get(url))})).filter(x=>x.blob);
  }
  async function importPage(file) {
    try{
      if(file.size>60*1024*1024)throw new Error("That page is too large");
      const matches=picturesFromPage(await file.text());
      let loaded=0;
      for(const {index,blob} of matches){try{game.customIcons[String(index)]=await shrinkImage(blob);loaded++;}catch(_){}}
      if(loaded&&!writeIcons(game)){showMessage("Pictures shown, but they could not be saved on this PC");return;}
      showMessage(loaded?`${loaded} of ${game.achievements.length} pictures loaded from the saved page`:"No achievement pictures found in that page. Save it as \"Webpage, Single File\" after the pictures have loaded.");
    }catch(error){showMessage(String(error?.message||error).slice(0,200));}
  }
