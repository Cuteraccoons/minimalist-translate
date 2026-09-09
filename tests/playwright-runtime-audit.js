async page => {
  await page.route("**/*", route => route.continue());
  await page.setViewportSize({width:1600,height:1000});
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
      cancel(){},pause(){},resume(){},getVoices:()=>[],
      speak:utterance=>setTimeout(()=>{utterance.onstart?.();utterance.onboundary?.({charIndex:0,charLength:Math.min(3,String(utterance.text||"").length)});setTimeout(()=>utterance.onend?.(),8);},0)
    }});
    globalThis.__jijianRuntimeListeners=listeners;
  }, base);

  await page.goto(`${base}/tests/fixtures/layout-matrix.html`);
  await page.waitForFunction(() => document.documentElement.dataset.fixtureReady === "180");
  await page.addStyleTag({url:`${base}/floating.css?audit=reader-semantic-4`});
  await page.addScriptTag({url:`${base}/content.js?audit=reader-semantic-4`});
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
  const pageTranslationFont=await page.locator(".raccoon-translated-block,.raccoon-translated-inline").first().evaluate(node=>getComputedStyle(node).fontFamily);
  if(!pageTranslationFont.includes("Smiley Sans"))throw new Error(`普通网页默认译文字体失败：${pageTranslationFont}`);

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
  await page.waitForFunction(() => document.querySelectorAll("#raccoon-reader-root .reader-table-cell-pair .reader-trans-p[data-loaded='true']").length > 3, null, {timeout:10000});
  await page.waitForFunction(() => Array.from(document.querySelectorAll("#raccoon-reader-root .reader-media-index-item img")).every(image => image.complete));
  const reader = await page.evaluate(async () => {
    const root=document.querySelector("#raccoon-reader-root");
    const buttons=Array.from(root.querySelectorAll("[data-reader-surface]"));
    const signatures=[];
    for(const button of buttons){
      button.click();
      const card=root.querySelector(".reader-scroll-card"),pair=root.querySelector(".reader-paragraph-pair");
      const cs=getComputedStyle(card),ps=pair?getComputedStyle(pair):null;
      signatures.push([root.dataset.surface,cs.maxWidth,cs.backgroundColor,cs.borderRadius,cs.paddingLeft,ps?.borderBottomStyle||""].join("|"));
    }
    root.querySelector("[data-reader-nav-tab='media']")?.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const mediaRatios=Array.from(root.querySelectorAll(".reader-media-index-item img")).map(image=>({
      expected:(Number(image.getAttribute("width"))||image.naturalWidth)/Math.max(1,Number(image.getAttribute("height"))||image.naturalHeight),
      rendered:image.getBoundingClientRect().width/Math.max(1,image.getBoundingClientRect().height),
      objectFit:getComputedStyle(image).objectFit
    }));
    const layout=root.querySelector(".reader-body-layout");
    const columnsBefore=getComputedStyle(layout).gridTemplateColumns;
    root.querySelector("#reader-btn-toggle-outline")?.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.all(layout.getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));
    const columnsNavCollapsed=getComputedStyle(layout).gridTemplateColumns;
    const navCollapsed=root.classList.contains("reader-nav-collapsed");
    root.querySelector("#reader-btn-expand-outline")?.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.all(layout.getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));
    const columnsNavRestored=getComputedStyle(layout).gridTemplateColumns;
    root.querySelector("#reader-btn-toggle-tools")?.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.all(layout.getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));
    const columnsToolsCollapsed=getComputedStyle(layout).gridTemplateColumns;
    const toolsCollapsed=root.classList.contains("reader-tools-collapsed");
    root.querySelector("#reader-btn-expand-tools")?.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    await Promise.all(layout.getAnimations({subtree:true}).filter(animation=>animation.effect?.getTiming().iterations!==Infinity).map(animation=>animation.finished.catch(()=>{})));
    const columnsToolsRestored=getComputedStyle(layout).gridTemplateColumns;
    const semanticTable=root.querySelector(".reader-semantic-table");
    root.querySelector("[data-reader-open-settings]")?.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const settingsDrawer=root.querySelector(".reader-settings-drawer");
    const heading=root.querySelector(".reader-structural-heading");
    root.querySelector('[data-writing="vertical"]')?.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const verticalMetrics={
      mode:root.dataset.writingMode||"",
      cardWritingMode:getComputedStyle(root.querySelector(".reader-scroll-card")).writingMode,
      overflowX:getComputedStyle(root.querySelector(".reader-scroll-area")).overflowX,
      overflowY:getComputedStyle(root.querySelector(".reader-scroll-area")).overflowY,
      tableWritingMode:getComputedStyle(root.querySelector(".reader-table-block")).writingMode
    };
    root.querySelector('[data-writing="horizontal"]')?.click();
    const headingSizes=Array.from(root.querySelectorAll(".reader-paragraph-pair[data-heading='true']")).reduce((map,pair)=>{
      const level=pair.dataset.headingLevel;
      if(!map[level])map[level]=getComputedStyle(pair.querySelector(".reader-structural-heading")).fontSize;
      return map;
    },{});
    const modeIndicator=root.querySelector(".reader-context-mode-tabs .reader-tab-indicator");
    modeIndicator.style.setProperty("transition","none","important");
    const modeTransforms=[];
    const modeStates=[];
    const modeActiveCounts=[];
    for(const mode of ["orig","bilingual","trans"]){
      root.querySelector(`.reader-context-mode-tabs [data-mode="${mode}"]`)?.dispatchEvent(new MouseEvent("click",{bubbles:true}));
      modeStates.push(root.dataset.readerView||"");
      modeTransforms.push(getComputedStyle(modeIndicator).transform);
      modeActiveCounts.push(root.querySelectorAll(".reader-context-mode-tabs .reader-mode-btn.active").length);
    }
    const readerScrollArea=root.querySelector("#reader-scroll-area");
    const firstOutlineItem=root.querySelector(".reader-outline-item");
    const firstOutlineTarget=root.querySelector(`#${CSS.escape(firstOutlineItem?.dataset.targetId||"")}`);
    readerScrollArea.scrollTop=readerScrollArea.scrollHeight;
    firstOutlineItem?.click();
    await new Promise(resolve=>setTimeout(resolve,520));
    const outlineTargetOffset=firstOutlineTarget ? firstOutlineTarget.getBoundingClientRect().top-readerScrollArea.getBoundingClientRect().top : 9999;
    const searchInput=root.querySelector("#reader-nav-search-input");
    searchInput.value="resilient heading";
    searchInput.dispatchEvent(new Event("input",{bubbles:true}));
    searchInput.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
    const searchStatus=root.querySelector("#reader-nav-search-status")?.textContent||"";
    const searchHitCount=root.querySelectorAll(".reader-search-hit").length;
    root.querySelector("[data-reader-theme-quick='dark']")?.click();
    const darkCardBackground=getComputedStyle(root.querySelector(".reader-scroll-card")).backgroundColor;
    const advancedOpen=root.querySelector("#reader-advanced-panel")?.classList.contains("open")||false;
    root.querySelector('[data-reader-render-style="card"]')?.click();
    const styledTranslation=root.querySelector('.reader-paragraph-pair:not([data-heading="true"]):not(.reader-table-cell-pair):not(.reader-figcaption)>.reader-trans-p');
    const styledTranslationCss=styledTranslation?getComputedStyle(styledTranslation):null;
    root.querySelector('[data-reader-context-action="speak"]')?.click();
    await new Promise(resolve=>setTimeout(resolve,25));
    const speechPlayer=root.querySelector("#reader-speech-player");
    const speechPlayerVisible=!!speechPlayer&&!speechPlayer.hidden&&getComputedStyle(speechPlayer).display!=="none";
    const speechCount=root.querySelector("#reader-speech-count")?.textContent||"";
    root.querySelector('[data-reader-speech-action="stop"]')?.click();
    const speakAction=root.querySelector('[data-reader-context-action="speak"]');
    const settingsAction=root.querySelector(".reader-context-settings-section");
    const actionOrder=!!(speakAction&&settingsAction&&(speakAction.compareDocumentPosition(settingsAction)&Node.DOCUMENT_POSITION_FOLLOWING));
    const toolIndicator=root.querySelector(".reader-tool-tab-indicator");
    toolIndicator.style.setProperty("transition","none","important");
    const toolTransforms=[];
    const toolStates=[];
    const toolActiveCounts=[];
    const toolVisibleSections=[];
    for(const tool of ["format","style","info","notes"]){
      root.querySelector(`[data-reader-tool-tab="${tool}"]`)?.click();
      toolStates.push(root.querySelector("#reader-context-panel")?.dataset.activeTool||"");
      toolTransforms.push(getComputedStyle(toolIndicator).transform);
      toolActiveCounts.push(root.querySelectorAll("[data-reader-tool-tab].active").length);
      toolVisibleSections.push(Array.from(root.querySelectorAll("[data-reader-tool-section]")).filter(section=>section.getClientRects().length>0).every(section=>section.dataset.readerToolSection===tool));
    }
    return {
      count:buttons.length,
      unique:new Set(signatures).size,
      outline:root.querySelectorAll(".reader-outline-item").length,
      codeBlocks:root.querySelectorAll(".reader-code-block").length,
      quotes:root.querySelectorAll(".reader-blockquote").length,
      captions:root.querySelectorAll(".reader-figcaption").length,
      navigatorTabs:root.querySelectorAll("[data-reader-nav-tab]").length,
      mediaIndex:root.querySelectorAll(".reader-media-index-item").length,
      contextPanels:root.querySelectorAll(".reader-context-panel").length,
      dataTables:root.querySelectorAll(".reader-table-block").length,
      semanticTables:root.querySelectorAll(".reader-semantic-table").length,
      factRows:root.querySelectorAll(".reader-fact-row").length,
      inlineTableAssets:root.querySelectorAll(".reader-table-block .reader-inline-asset").length,
      details:root.querySelectorAll(".reader-details-block").length,
      semanticColumns:semanticTable?.rows?.[0]?.cells?.length||0,
      semanticColgroup:semanticTable?.querySelectorAll("colgroup col").length||0,
      hasColspan:!!semanticTable?.querySelector("[colspan='2']"),
      translatedTableCells:root.querySelectorAll(".reader-table-cell-pair .reader-trans-p[data-loaded='true']").length,
      mediaRatios,
      columnsBefore,columnsNavCollapsed,columnsNavRestored,columnsToolsCollapsed,columnsToolsRestored,
      navCollapsed,toolsCollapsed,
      settingsInline:settingsDrawer?.classList.contains("reader-settings-inline")||false,
      settingsOpen:settingsDrawer?.classList.contains("open")||false,
      fontCardsDisplay:getComputedStyle(root.querySelector("#reader-font-grid")).display,
      toolResizeCursor:getComputedStyle(root.querySelector("#reader-context-resizer")).cursor,
      headingAfter:getComputedStyle(heading,"::after").content,
      topExitButtons:root.querySelectorAll(".reader-context-header [data-reader-context-action='exit']").length,
      bottomExitButtons:root.querySelectorAll(".reader-context-exit").length,
      maintenanceLeaks:root.textContent.includes("Machine translation maintenance notice") ? 1 : 0,
      headingSizes,modeTransforms,modeStates,modeActiveCounts,modeInlineTransform:modeIndicator.style.transform||"",searchStatus,searchHitCount,darkCardBackground,advancedOpen,actionOrder,
      embeddedVideos:root.querySelectorAll(".reader-embedded-media video").length,
      readerRenderStyle:root.dataset.readerRenderStyle||"",translationCardRadius:styledTranslationCss?.borderRadius||"",translationCardPadding:styledTranslationCss?.paddingTop||"",
      speechPlayerVisible,speechCount,uiFont:getComputedStyle(root.querySelector(".reader-context-panel")).fontFamily,outlineTargetOffset,verticalMetrics,
      toolTabs:root.querySelectorAll("[data-reader-tool-tab]").length,toolTransforms,toolStates,toolActiveCounts,toolVisibleSections
    };
  });
  const mediaCropped=reader.mediaRatios.some(item=>item.objectFit!=="contain"||Math.abs(item.expected-item.rendered)>.08);
  const columnPixels=value=>(String(value).match(/[\d.]+px/g)||[]).map(Number);
  const beforeColumns=columnPixels(reader.columnsBefore), restoredNavColumns=columnPixels(reader.columnsNavRestored);
  const navDidNotCollapse=!reader.navCollapsed||!/^0px\b/.test(reader.columnsNavCollapsed)||reader.columnsBefore===reader.columnsNavCollapsed||beforeColumns.length!==restoredNavColumns.length||beforeColumns.some((value,index)=>Math.abs(value-restoredNavColumns[index])>1);
  const toolsDidNotCollapse=!reader.toolsCollapsed||!/\b0px$/.test(reader.columnsToolsCollapsed)||reader.columnsBefore===reader.columnsToolsCollapsed||reader.columnsBefore!==reader.columnsToolsRestored;
  const darkChannels=(reader.darkCardBackground.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  const darkCardTooLight=darkChannels.length<3||darkChannels.reduce((sum,value)=>sum+value,0)/3>70;
  const headingScale=new Set(Object.values(reader.headingSizes)).size;
  const modeSelectionBroken=reader.modeStates.join(",")!=="orig,bilingual,trans"||reader.modeActiveCounts.some(count=>count!==1);
  const toolSelectionBroken=reader.toolTabs!==4||reader.toolStates.join(",")!=="format,style,info,notes"||new Set(reader.toolTransforms).size!==4||reader.toolActiveCounts.some(count=>count!==1)||reader.toolVisibleSections.some(value=>!value);
  const verticalBroken=reader.verticalMetrics.mode!=="vertical"||reader.verticalMetrics.cardWritingMode!=="vertical-rl"||reader.verticalMetrics.overflowX!=="auto"||reader.verticalMetrics.overflowY!=="hidden"||reader.verticalMetrics.tableWritingMode!=="horizontal-tb";
  if(reader.count!==4 || reader.unique<2 || reader.outline<3 || reader.codeBlocks<1 || reader.quotes<1 || reader.captions<1 || reader.navigatorTabs!==3 || reader.mediaIndex<4 || reader.contextPanels!==1 || reader.dataTables<2 || reader.semanticTables<1 || reader.factRows<3 || reader.inlineTableAssets<1 || reader.details<1 || reader.semanticColumns<3 || reader.semanticColgroup<3 || !reader.hasColspan || reader.translatedTableCells<4 || mediaCropped || navDidNotCollapse || toolsDidNotCollapse || !reader.settingsInline || !reader.settingsOpen || reader.toolResizeCursor!=="col-resize" || reader.headingAfter!=="none" || reader.topExitButtons!==0 || reader.bottomExitButtons!==1 || reader.maintenanceLeaks || headingScale<2 || modeSelectionBroken || toolSelectionBroken || !/\d+\s*\/\s*\d+/.test(reader.searchStatus) || reader.searchHitCount!==1 || darkCardTooLight || !reader.advancedOpen || reader.embeddedVideos<1 || reader.readerRenderStyle!=="card" || reader.translationCardRadius==="0px" || reader.translationCardPadding==="0px" || !reader.speechPlayerVisible || !/\d+\s*\/\s*\d+/.test(reader.speechCount) || reader.uiFont.includes("Smiley Sans") || reader.outlineTargetOffset<0 || reader.outlineTargetOffset>110 || verticalBroken)throw new Error(`阅读模式结构失败：${JSON.stringify(reader)}`);

  const toolsBeforeDrag=await page.locator("#reader-context-panel").evaluate(node=>node.getBoundingClientRect().width);
  const resizeBox=await page.locator("#reader-context-resizer").boundingBox();
  if(!resizeBox)throw new Error("阅读工具拖动热区不存在");
  await page.mouse.move(resizeBox.x+resizeBox.width/2,resizeBox.y+100);
  await page.mouse.down();
  await page.mouse.move(resizeBox.x-42,resizeBox.y+100,{steps:5});
  await page.mouse.up();
  await page.waitForTimeout(330);
  const toolsAfterDrag=await page.locator("#reader-context-panel").evaluate(node=>node.getBoundingClientRect().width);
  if(toolsAfterDrag<toolsBeforeDrag+20)throw new Error(`阅读工具拖动未持续生效：${toolsBeforeDrag} -> ${toolsAfterDrag}`);

  await page.setViewportSize({width:1100,height:900});
  await page.waitForTimeout(80);
  const readerCompact=await page.evaluate(()=>{
    const root=document.querySelector("#raccoon-reader-root"),layout=root.querySelector(".reader-body-layout"),tools=root.querySelector(".reader-context-panel");
    return {columns:getComputedStyle(layout).gridTemplateColumns,toolsDisplay:getComputedStyle(tools).display,overflow:Math.max(0,root.scrollWidth-root.clientWidth)};
  });
  if(readerCompact.toolsDisplay!=="none"||readerCompact.overflow>2)throw new Error(`阅读模式窄屏失败：${JSON.stringify(readerCompact)}`);
  await page.setViewportSize({width:1728,height:1050});

  await page.goto(`${base}/options.html`);
  await page.waitForFunction(() => document.querySelectorAll("[data-preview-pair]").length === 3);
  const defaultPreviewFont=await page.locator(".demo-trans-p").first().evaluate(node=>getComputedStyle(node).fontFamily);
  const globalCard=await page.evaluate(async () => {
    document.querySelector('#render-style-card-grid [data-value="card"]')?.click();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const style=getComputedStyle(document.querySelector(".demo-trans-p"));
    return {background:style.backgroundColor,radius:style.borderRadius,padding:style.paddingTop};
  });
  if(!defaultPreviewFont.includes("Smiley Sans")||globalCard.background==="rgba(0, 0, 0, 0)"||globalCard.radius==="0px"||globalCard.padding==="0px")throw new Error(`默认字体或卡片译文预览失败：${JSON.stringify({defaultPreviewFont,globalCard})}`);
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
    const secondRow=buttons[1]?.closest(".domain-row");
    const scope=secondRow?.querySelector('.domain-scope-chip input[data-scope]');
    if(scope){scope.checked=!scope.checked;scope.dispatchEvent(new Event("change",{bubbles:true}));}
    return {
      rows:buttons.length,
      openPanels:document.querySelectorAll(".blacklist-domain-list .domain-scope-panel:not([hidden])").length,
      activeButtons:document.querySelectorAll(".blacklist-domain-list .domain-config-btn.active").length,
      expandedRows:document.querySelectorAll(".blacklist-domain-list .domain-row.is-config-open").length,
      explicitRemove:document.querySelectorAll(".blacklist-domain-list .domain-remove-btn").length,
      panelFlow:buttons[1] ? getComputedStyle(buttons[1].closest(".domain-row").querySelector(".domain-scope-panel")).position : "",
      sameRow:secondRow===document.querySelectorAll(".blacklist-domain-list .domain-row")[1],
      stayedOpen:secondRow ? !secondRow.querySelector(".domain-scope-panel").hidden : false
    };
  });
  if(blacklist.rows<2||blacklist.openPanels!==1||blacklist.activeButtons!==1||blacklist.expandedRows!==1||blacklist.explicitRemove!==blacklist.rows||blacklist.panelFlow!=="static"||!blacklist.sameRow||!blacklist.stayedOpen)throw new Error(`黑名单设置面板协调失败：${JSON.stringify(blacklist)}`);
  const optionsVisuals=await page.evaluate(() => {
    document.querySelector('[data-tab="tab-local-dict"]')?.click();
    const colors=[".local-dict-card",".local-dict-test-card",".local-dict-import-note"].map(selector=>getComputedStyle(document.querySelector(`#tab-local-dict ${selector}`)).backgroundColor);
    document.querySelector('[data-tab="tab-about"]')?.click();
    const image=document.querySelector("#tab-about .project-promo-image");
    return {colors,promoReady:!!image&&image.complete&&image.naturalWidth>0&&image.getBoundingClientRect().height>0};
  });
  if(optionsVisuals.colors.some(color=>!["rgb(255, 255, 255)","rgba(0, 0, 0, 0)"].includes(color))||!optionsVisuals.promoReady)throw new Error(`设置页视觉资源失败：${JSON.stringify(optionsVisuals)}`);
  await page.goto(`${base}/popup.html`);
  await page.waitForFunction(()=>document.querySelector("#site-image-translation-domain")?.textContent==="127.0.0.1");
  await page.click("#site-image-translation-toggle");
  await page.waitForTimeout(220);
  const siteImageToggle=await page.evaluate(()=>({hasState:!!document.querySelector("#site-image-translation-state"),pressed:document.querySelector("#site-image-translation-toggle")?.getAttribute("aria-pressed"),switchColor:getComputedStyle(document.querySelector(".site-image-translation-switch")).backgroundColor}));
  if(siteImageToggle.hasState||siteImageToggle.pressed!=="false"||siteImageToggle.switchColor!=="rgb(217, 221, 226)")throw new Error(`当前网站图片开关失败：${JSON.stringify(siteImageToggle)}`);
  return {layout,translationProgress,pageTranslationFont,hover,reader,toolsBeforeDrag,toolsAfterDrag,readerCompact,defaultPreviewFont,globalCard,preview,blacklist,optionsVisuals,siteImageToggle};
}
