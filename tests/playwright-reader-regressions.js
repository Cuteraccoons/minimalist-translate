async page => {
  await page.route("**/*", route => route.continue());
  await page.setViewportSize({width:1920,height:1000});
  const base = "http://127.0.0.1:8766";
  await page.addInitScript(baseUrl => {
    const listeners = [];
    const settings = {
      sourceLang:"auto", targetLang:"zh-CN", displayMode:"bilingual", renderStyle:"classic", fontFamily:"smiley-sans",
      replaceRenderStyle:"clean", enableImageTranslation:true, enableDictionaryAi:false,
      excludeDomainList:["example.com","search.example"], excludeDomainDefaultRule:{floating:true,hover:true,selection:true,image:true,auto:true},
      readerSurface:"card", readerRenderStyle:"classic", readerTheme:"white", readerWidth:"920", readerFont:"smiley-sans",
      readerLineHeight:"1.82", readerParagraphSpacing:"28", readerWritingMode:"horizontal",
      readerOutlineCollapsed:false, readerToolsCollapsed:false
    };
    const reply = (callback, value) => {
      if(typeof callback === "function"){
        queueMicrotask(() => callback(value));
        return undefined;
      }
      return Promise.resolve(value);
    };
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
    globalThis.SpeechSynthesisUtterance = class {
      constructor(text){this.text=text;this.lang="";this.rate=1;this.pitch=1;}
    };
    Object.defineProperty(globalThis,"speechSynthesis",{configurable:true,value:{
      getVoices:()=>[],
      speak:utterance=>setTimeout(()=>{utterance.onstart?.();utterance.onboundary?.({charIndex:0,charLength:Math.min(3,String(utterance.text||"").length)});setTimeout(()=>utterance.onend?.(),8);},0)
    }});
    globalThis.__jijianRuntimeListeners=listeners;
  }, base);

  await page.goto(`${base}/tests/fixtures/reader-regressions.html`);
  await page.addStyleTag({url:`${base}/floating.css`});
  await page.addScriptTag({url:`${base}/content.js`});
  await page.waitForFunction(() => globalThis.__jijianRuntimeListeners.length > 0);
  await page.evaluate(() => { for (const listener of __jijianRuntimeListeners) listener({action:"TOGGLE_READER_MODE"},{},()=>{}); });
  await page.waitForSelector("#raccoon-reader-root");
  await page.locator('.reader-context-mode-tabs [data-mode="bilingual"]').click();
  await page.waitForFunction(() => document.querySelector('.reader-trans-p[data-loaded="true"]'));
  await page.evaluate(() => document.fonts.ready);
  const result = await page.evaluate(async () => {
    const root = document.querySelector("#raccoon-reader-root");
    const click = selector => root.querySelector(selector).click();
    const pause = () => new Promise(resolve => setTimeout(resolve,400));
    click('[data-mode="orig"]');
    click('[data-reader-nav-tab="search"]');
    const input = root.querySelector("#reader-nav-search-input");
    const search = query => { input.value=query;input.dispatchEvent(new Event("input",{bubbles:true})); };
    search("Needle bridge");
    const ranges=[...CSS.highlights.get("reader-search-match")];
    if(ranges.length!==2 || ranges.some(range=>range.toString()!=="Needle bridge"))throw Error("Cross-node occurrence matching failed");
    click('[data-search-index="1"]');
    if([...CSS.highlights.get("reader-search-current")][0].startContainer!==ranges[1].startContainer)throw Error("Second match target failed");
    input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
    if(!root.querySelector("#reader-nav-search-status").textContent.startsWith("1 / 2"))throw Error("Search did not wrap");
    search("[a+b]");
    if(CSS.highlights.get("reader-search-match").size!==1)throw Error("Literal search escaping failed");
    search("Needle bridge");
    click('[data-mode="trans"]');
    await pause();
    const visibleOnly=[...CSS.highlights.get("reader-search-match")].every(range=>range.startContainer.parentElement.closest(".reader-trans-p"));
    if(!visibleOnly)throw Error("Hidden originals remain in search");
    click('[data-mode="orig"]');await pause();
    // Translation writes should rebuild the matching ranges without losing input.
    const paragraph=root.querySelector('.reader-paragraph-pair:not([data-heading="true"]) > .reader-orig-p');
    paragraph.append(document.createTextNode(" Needle bridge"));await pause();
    if(CSS.highlights.get("reader-search-match").size!==3)throw Error("Search did not refresh after DOM update");
    search("");
    const widths=[];
    click('[data-reader-tool-tab="style"]');
    root.dataset.readerSite="wikipedia";
    for(const surface of ["card","flat","safari","forum"]){
      click(`[data-reader-surface="${surface}"]`);
      const values=[];
      for(const width of [640,780,920,1060]){click(`[data-width="${width}"]`);await pause();values.push(root.querySelector(".reader-scroll-card").getBoundingClientRect().width);}
      if(values.some((value,index)=>Math.abs(value-[640,780,920,1060][index])>2))throw Error("Width preset ineffective: "+surface+JSON.stringify(values));
      widths.push({surface,values});
    }
    click('[data-reader-surface="card"]');click('[data-width="920"]');
    const table=root.querySelectorAll('.reader-data-table')[2];
    const scroller=table.querySelector('.reader-table-scroll');
    if(scroller.scrollWidth<=scroller.clientWidth)throw Error("Wide table has no horizontal scroll");
    scroller.scrollLeft=200;
    if(scroller.scrollLeft<190)throw Error("Horizontal table scroll failed");
    search("observations 7");
    click('[data-search-index="0"]');
    if(scroller.scrollLeft<1000)throw Error("Search did not reveal offscreen table cell");
    search("");
    if(root.querySelectorAll('.reader-chart').length!==1)throw Error("Non-numeric table was offered charts");
    const chart=root.querySelector('.reader-chart');chart.open=true;await pause();
    for(const type of ["bar","line","pie"]){
      click(`[data-chart-type="${type}"]`);
      if(chart.querySelectorAll('[data-chart-point]').length!==3)throw Error("Chart points missing: "+type);
    }
    chart.querySelector('[data-chart-point="1"]').dispatchEvent(new Event("focusin",{bubbles:true}));
    if(!chart.querySelector('.reader-chart-caption').textContent.includes("17"))throw Error("Chart tooltip not updated");
    const small=[];
    for(const tab of ["format","style","info"]){
      click(`[data-reader-tool-tab="${tab}"]`);
      for(const node of root.querySelectorAll('.reader-context-panel *, .reader-outline-panel *')){
        if(node.children.length || !node.textContent.trim() || !node.checkVisibility())continue;
        if(parseFloat(getComputedStyle(node).fontSize)<13)small.push({text:node.textContent,size:getComputedStyle(node).fontSize});
      }
    }
    if(small.length)throw Error("Sub-13px UI: "+JSON.stringify(small));
    click('[data-reader-tool-tab="format"]');
    const indicators=[...root.querySelectorAll('.reader-tool-tab-indicator,.reader-context-mode-tabs .reader-tab-indicator,.reader-writing-tabs .reader-tab-indicator')].filter(node=>node.checkVisibility()).map(node=>node.getBoundingClientRect().height);
    if(indicators.some(height=>height<25))throw Error("Collapsed selection background");
    return {searchOccurrences:2,crossInlineMarkup:true,literalQuery:true,hiddenTextExcluded:visibleOnly,refreshAfterTranslation:true,widths,wideTable:{width:scroller.clientWidth,content:scroller.scrollWidth},charts:3,uiMinimum:13,indicatorHeights:indicators,fontLoaded:document.fonts.check('14px "Smiley Sans"'),whitePaper:getComputedStyle(root.querySelector('.reader-scroll-card')).backgroundColor};
  });
  await page.locator('[data-reader-tool-tab="style"]').click();
  await page.locator('#reader-scroll-area').evaluate(node=>node.scrollTop=0);
  await page.waitForTimeout(350);
  await page.screenshot({path:'output/playwright/reader-final-style.png'});
  await page.locator('[data-reader-tool-tab="info"]').click();
  await page.waitForTimeout(350);
  await page.screenshot({path:'output/playwright/reader-final-info.png'});
  await page.locator('[data-reader-tool-tab="format"]').click();
  await page.waitForTimeout(350);
  await page.screenshot({path:'output/playwright/reader-final-format.png'});
  await page.setViewportSize({width:1100,height:900});
  await page.locator('#reader-btn-open-settings').click();
  if(!await page.locator('#reader-context-panel').isVisible())throw Error('Narrow viewport settings inaccessible');
  await page.waitForTimeout(350);
  await page.screenshot({path:'output/playwright/reader-final-narrow.png'});
  return result;
}
