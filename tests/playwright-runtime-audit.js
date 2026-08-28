async page => {
  const base = "http://127.0.0.1:8765";
  await page.addInitScript(baseUrl => {
    const listeners = [];
    const settings = {
      sourceLang:"auto", targetLang:"zh-CN", displayMode:"bilingual", renderStyle:"classic",
      replaceRenderStyle:"clean", enableImageTranslation:true, enableDictionaryAi:false,
      excludeDomainList:["example.com","search.example"], excludeDomainDefaultRule:{floating:true,hover:true,selection:true,image:true,auto:true},
      readerSurface:"card", readerTheme:"white", readerWidth:"920", readerFont:"system",
      readerLineHeight:"1.82", readerParagraphSpacing:"28", readerWritingMode:"horizontal"
    };
    const reply = (callback, value) => typeof callback === "function" && queueMicrotask(() => callback(value));
    globalThis.chrome = {
      runtime: {
        id:"jijian-test-runtime", lastError:null,
        getURL:path => `${baseUrl}/${String(path||"").replace(/^\//,"")}`,
        getManifest:() => ({version:"1.0.0"}),
        onMessage:{addListener:listener => listeners.push(listener)},
        sendMessage(message, callback) {
          const action=message?.action||"";
          if(action==="GET_SETTINGS")return reply(callback,{success:true,settings:{...settings}});
          if(action==="UPDATE_SETTINGS"){Object.assign(settings,message.settings||{});return reply(callback,{success:true});}
          if(action==="TRANSLATE_BATCH_IDS"){
            const value={success:true,data:(message.items||[]).map((item,index)=>({id:item.id,text:`译文 ${index+1}：${String(item.text||"").slice(0,42)}`}))};
            if(typeof callback==="function")setTimeout(()=>callback(value),90);
            return;
          }
          if(action==="TRANSLATE_SINGLE_BLOCK")return reply(callback,{success:true,text:`译文：${String(message.text||"").slice(0,60)}`});
          if(action==="GET_IMAGE_OCR_READY_MAP")return reply(callback,{success:true,map:{}});
          if(action==="GET_TAB_TRANSLATION_SESSION")return reply(callback,{success:true,session:null});
          if(action==="GET_COLLECTION_COUNTS")return reply(callback,{success:true,vocabulary:0,highlights:0});
          return reply(callback,{success:true});
        }
      },
      tabs:{
        query:(query,callback)=>{const value=[{id:1,url:`${baseUrl}/tests/fixtures/layout-matrix.html`}];if(typeof callback==="function")queueMicrotask(()=>callback(value));return Promise.resolve(value);},
        sendMessage:(id,message,callback)=>{const value={success:true};if(typeof callback==="function")queueMicrotask(()=>callback(value));return Promise.resolve(value);},
        create:async()=>({})
      },
      permissions:{contains:async()=>false,request:async()=>false},
      storage:{local:{get:async()=>({}),set:async()=>{}},sync:{get:async()=>({}),set:async()=>{}},onChanged:{addListener:()=>{}}}
    };
    globalThis.__jijianRuntimeListeners=listeners;
  }, base);

  await page.goto(`${base}/tests/fixtures/layout-matrix.html`);
  await page.waitForFunction(() => document.documentElement.dataset.fixtureReady === "120");
  await page.addStyleTag({url:`${base}/floating.css`});
  await page.addScriptTag({url:`${base}/content.js`});
  await page.waitForFunction(() => globalThis.__jijianRuntimeListeners.length > 0);
  await page.evaluate(() => {
    for(const listener of globalThis.__jijianRuntimeListeners)listener({action:"TOGGLE_PAGE_TRANSLATION"},{},()=>{});
  });
  await page.waitForFunction(() => document.querySelector("#raccoon-pill-text")?.textContent?.includes("正在翻译"));
  const translationProgress = await page.evaluate(() => document.querySelector("#raccoon-pill-text")?.textContent || "");
  await page.waitForFunction(() => document.querySelectorAll(".raccoon-translated-block,.raccoon-translated-inline,.raccoon-linked-card-translation").length > 80, null, {timeout:20000});
  await page.waitForFunction(() => /已翻译|已替换/.test(document.querySelector("#raccoon-pill-text")?.textContent || ""), null, {timeout:20000});
  const layout = await page.evaluate(() => globalThis.runBilingualLayoutAudit());
  if(layout.missing || layout.overlaps || layout.lowContrast || layout.overflow || layout.iconDrift || layout.squeezedRows || layout.richControlDamage || layout.richLinkedMissing || layout.proseLinkDamage || layout.hiddenTocMissing || layout.tocNumberDamage || layout.alignmentMismatch || layout.emphasisMismatch){
    throw new Error(`布局矩阵失败：${JSON.stringify(layout)}`);
  }

  const hover = await page.evaluate(async () => {
    const translations=Array.from(document.querySelectorAll(".raccoon-translated-block,.raccoon-translated-inline")).slice(0,2);
    if(translations.length<2)return {error:"翻译段落不足"};
    translations.forEach(node=>node.setAttribute("data-render-style","hover-reveal"));
    const sourceFor=node=>document.querySelector(`[data-raccoon-id="${CSS.escape(node.dataset.raccoonSourceId||"")}"]`);
    sourceFor(translations[0])?.dispatchEvent(new PointerEvent("pointerover",{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,30));
    const first=translations.filter(node=>node.classList.contains("raccoon-hover-revealed")).length;
    sourceFor(translations[1])?.dispatchEvent(new PointerEvent("pointerover",{bubbles:true}));
    await new Promise(resolve=>setTimeout(resolve,30));
    const second=translations.filter(node=>node.classList.contains("raccoon-hover-revealed")).length;
    return {first,second,firstStill:translations[0].classList.contains("raccoon-hover-revealed")};
  });
  if(hover.error || hover.first!==1 || hover.second!==1 || hover.firstStill)throw new Error(`悬停配对失败：${JSON.stringify(hover)}`);

  await page.evaluate(() => {
    for(const listener of globalThis.__jijianRuntimeListeners)listener({action:"TOGGLE_READER_MODE"},{},()=>{});
  });
  await page.waitForSelector("#raccoon-reader-root");
  const reader = await page.evaluate(() => {
    const root=document.querySelector("#raccoon-reader-root");
    const buttons=Array.from(root.querySelectorAll("[data-reader-surface]"));
    const signatures=[];
    for(const button of buttons){
      button.click();
      const card=root.querySelector(".reader-scroll-card"),pair=root.querySelector(".reader-paragraph-pair");
      const cs=getComputedStyle(card),ps=pair?getComputedStyle(pair):null;
      signatures.push([root.dataset.surface,cs.maxWidth,cs.backgroundColor,cs.borderRadius,cs.paddingLeft,ps?.borderBottomStyle||""].join("|"));
    }
    return {
      count:buttons.length,
      unique:new Set(signatures).size,
      outline:root.querySelectorAll(".reader-outline-item").length,
      codeBlocks:root.querySelectorAll(".reader-code-block").length,
      quotes:root.querySelectorAll(".reader-blockquote").length,
      captions:root.querySelectorAll(".reader-figcaption").length,
      maintenanceLeaks:root.textContent.includes("Machine translation maintenance notice") ? 1 : 0
    };
  });
  if(reader.count!==4 || reader.unique<4 || reader.outline<3 || reader.codeBlocks<1 || reader.quotes<1 || reader.captions<1 || reader.maintenanceLeaks)throw new Error(`阅读模式结构失败：${JSON.stringify(reader)}`);

  await page.goto(`${base}/options.html`);
  await page.waitForFunction(() => document.querySelectorAll("[data-preview-pair]").length === 3);
  await page.evaluate(async () => {
    document.querySelector('#render-style-card-grid [data-value="click-reveal"]')?.click();
    document.querySelector('[data-preview-pair="paragraph-1"]')?.click();
    await new Promise(resolve=>setTimeout(resolve,60));
  });
  const preview = await page.evaluate(() => Array.from(document.querySelectorAll("[data-preview-pair]")).map(pair => ({
    id:pair.dataset.previewPair,
    color:getComputedStyle(pair.querySelector(".demo-trans-h,.demo-trans-p")).color
  })));
  const visiblePreview=preview.filter(item=>!item.color.endsWith(", 0)")&&!item.color.endsWith(", 0.0)"));
  if(visiblePreview.length!==1 || visiblePreview[0]?.id!=="paragraph-1"){
    throw new Error(`设置预览未按段落显示：${JSON.stringify(preview)}`);
  }
  const blacklist=await page.evaluate(() => {
    const buttons=Array.from(document.querySelectorAll(".blacklist-domain-list .domain-config-btn"));
    buttons[0]?.click();buttons[1]?.click();
    return {
      rows:buttons.length,
      openPanels:document.querySelectorAll(".blacklist-domain-list .domain-scope-panel:not([hidden])").length,
      activeButtons:document.querySelectorAll(".blacklist-domain-list .domain-config-btn.active").length,
      expandedRows:document.querySelectorAll(".blacklist-domain-list .domain-row.is-config-open").length,
      explicitRemove:document.querySelectorAll(".blacklist-domain-list .domain-remove-btn").length,
      panelFlow:buttons[1] ? getComputedStyle(buttons[1].closest(".domain-row").querySelector(".domain-scope-panel")).position : ""
    };
  });
  if(blacklist.rows<2||blacklist.openPanels!==1||blacklist.activeButtons!==1||blacklist.expandedRows!==1||blacklist.explicitRemove!==blacklist.rows||blacklist.panelFlow!=="static")throw new Error(`黑名单设置面板协调失败：${JSON.stringify(blacklist)}`);
  await page.goto(`${base}/popup.html`);
  await page.waitForFunction(()=>document.querySelector("#site-image-translation-domain")?.textContent==="127.0.0.1");
  await page.click("#site-image-translation-toggle");
  const siteImageToggle=await page.evaluate(()=>({state:document.querySelector("#site-image-translation-state")?.textContent,pressed:document.querySelector("#site-image-translation-toggle")?.getAttribute("aria-pressed")}));
  if(siteImageToggle.state!=="已关闭"||siteImageToggle.pressed!=="false")throw new Error(`当前网站图片开关失败：${JSON.stringify(siteImageToggle)}`);
  return {layout,translationProgress,hover,reader,preview,blacklist,siteImageToggle};
}
