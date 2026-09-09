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
      cancel(){},pause(){},resume(){},getVoices:()=>[],
      speak:utterance=>setTimeout(()=>{utterance.onstart?.();utterance.onboundary?.({charIndex:0,charLength:Math.min(3,String(utterance.text||"").length)});setTimeout(()=>utterance.onend?.(),8);},0)
    }});
    globalThis.__jijianRuntimeListeners=listeners;
  }, base);

  await page.goto(`${base}/tests/fixtures/reader-media-matrix.html`);
  await page.waitForFunction(()=>document.documentElement.dataset.mediaMatrix==='36');
  await page.evaluate(()=>Promise.all([...document.images].map(img=>img.decode().catch(()=>{}))));
  await page.addStyleTag({url:`${base}/floating.css`});await page.addScriptTag({url:`${base}/content.js`});await page.waitForTimeout(300);
  await page.evaluate(()=>__jijianRuntimeListeners.forEach(listener=>listener({action:'TOGGLE_READER_MODE'},{},()=>{})));
  await page.waitForSelector('#reader-scroll-card');
  await page.evaluate(()=>{const root=document.querySelector('#raccoon-reader-root');root.classList.add('reader-navigation-measured');root.dataset.readerSite='wikipedia';root.classList.add('reader-wikipedia-flow');});
  await page.locator('[data-reader-tool-tab=style]').click();
  const widths=[];
  for(const width of [640,780,920,1060]){
    await page.locator(`[data-width="${width}"]`).click();
    await page.waitForTimeout(150);
    widths.push(await page.evaluate(()=>{
      const root=document.querySelector('#raccoon-reader-root');const body=root.querySelector('#reader-content');
      const side=root.querySelector('.reader-media-side'),wide=root.querySelector('.reader-media-full:has(.reader-img-wide)');
      const group=[...root.querySelectorAll('.reader-media-block')].find(n=>n.querySelectorAll('.reader-img-wrap').length===2);
      const groupImages=[...group.querySelectorAll('img')].map(n=>n.getBoundingClientRect().width);
      return {body:body.getBoundingClientRect().width,side:side?.getBoundingClientRect().width,wide:wide?.getBoundingClientRect().width,groupRatio:groupImages[0]/groupImages[1],groupTotal:groupImages[0]+groupImages[1],infoImage:root.querySelector('.reader-infobox img').getBoundingClientRect().width,icons:[...root.querySelectorAll('.reader-inline-icon')].map(n=>n.getBoundingClientRect().width),hiddenGeo:body.textContent.includes('12.000, 34.000')};
    }));
  }
  if(widths.some(x=>Math.abs(x.groupRatio-2)>.1||x.groupTotal<x.body-20||x.hiddenGeo||x.icons.some(w=>w>30)||Math.abs(x.wide-x.body)>2))throw Error('Media proportions failed: '+JSON.stringify(widths));
  if(widths[3].infoImage<200)throw Error("Infobox photo remains thumbnail-sized");
  if(!(widths[3].side<widths[3].body*.6&&widths[3].side>widths[2].side))throw Error('Sidebar does not scale with body: '+JSON.stringify(widths));
  await page.locator('label[for=reader-toggle-wikipedia-magazine]').click();
  const magazine=await page.evaluate(()=>{const root=document.querySelector('#raccoon-reader-root');return {columns:getComputedStyle(root.querySelector('#reader-content')).columnCount,infoSpan:getComputedStyle(root.querySelector('.reader-infobox')).columnSpan,sideSpan:getComputedStyle(root.querySelector('.reader-media-side')).columnSpan,wideSpan:getComputedStyle(root.querySelector('.reader-media-full:has(.reader-img-wide)')).columnSpan};});
  if(magazine.columns!=='2'||magazine.infoSpan!=='none'||magazine.sideSpan!=='none'||magazine.wideSpan!=='all')throw Error('Magazine layout failed: '+JSON.stringify(magazine));
  await page.locator('#reader-scroll-area').evaluate(n=>n.scrollTop=0);await page.screenshot({path:'output/playwright/polish-media-magazine.png'});
  await page.locator('label[for=reader-toggle-wikipedia-magazine]').click();
  const outline=page.locator('.reader-outline-item.level-3');const count=await outline.count();
  for(const index of [count-1,0,Math.floor(count/2)]){
    await outline.nth(index).click();await page.waitForTimeout(500);
    const position=await outline.nth(index).evaluate(n=>{const root=document.querySelector('#raccoon-reader-root'),target=root.querySelector('#'+n.dataset.targetId),area=root.querySelector('#reader-scroll-area');return {bottom:area.scrollHeight-area.scrollTop-area.clientHeight,active:n.classList.contains('active-heading'),offset:target.getBoundingClientRect().top-area.getBoundingClientRect().top,bg:getComputedStyle(n).backgroundColor};});
    if(!position.active||position.offset<0||(position.offset>80&&position.bottom>2)||position.bg!=='rgba(0, 0, 0, 0)')throw Error('Deep outline mismatch: '+JSON.stringify(position));
  }
  return {cases:36,widths,magazine,deepOutlineTargets:3};
}
