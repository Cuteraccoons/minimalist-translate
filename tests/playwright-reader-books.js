async page => {
  await page.route("**/*", route => route.continue());
  await page.setViewportSize({width:1920,height:1000});
  const base = "https://www.gutenberg.org/__jijian-test";
  await page.route(`${base}/**`,async route=>{const response=await page.request.get(route.request().url().replace(base,"http://127.0.0.1:8768"));await route.fulfill({response});});
  await page.addInitScript(baseUrl => {
    const listeners = [];globalThis.__translationRequests=[];
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
          if(action==="TRANSLATE_BATCH_IDS"){globalThis.__translationRequests.push(...message.items);
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


  const bookUrl='https://www.gutenberg.org/files/999999/test.htm';
  const paragraph=index=>`<p id="source-${index}">This is paragraph ${index}, a detailed account of field observations and daily life. It continues with enough text to represent a long book paragraph without being mistaken for navigation.</p>`;
  const html=`<!doctype html><html lang="en"><meta charset="utf-8"><title>Book fixture</title><body><p>Metadata excluded</p><div>*** START OF THE PROJECT GUTENBERG EBOOK TEST ***</div><h1>Book fixture</h1><h2>First chapter</h2><p>Repeated prose is retained.</p><p>Repeated prose is retained.</p><p>A footnote reference <a href="#note-one">[1]</a><span class="pageno">999</span></p>${Array.from({length:310},(_,i)=>paragraph(i)).join('')}<h2>Last chapter</h2><div class="footnote" id="note-one"><p>The final footnote remains accessible.</p></div><div>*** END OF THE PROJECT GUTENBERG EBOOK TEST ***</div><p>License excluded</p></body></html>`;
  await page.route(bookUrl,route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto(bookUrl);
  await page.addStyleTag({url:`${base}/floating.css`});
  await page.addScriptTag({url:`${base}/content.js`});
  await page.waitForFunction(()=>globalThis.__jijianRuntimeListeners?.length);
  await page.evaluate(()=>__jijianRuntimeListeners.forEach(listener=>listener({action:'TOGGLE_READER_MODE'},{},()=>{})));
  await page.waitForSelector('#raccoon-reader-root');
  const result=await page.evaluate(()=>{
    const root=document.querySelector('#raccoon-reader-root'),content=root.querySelector('#reader-content');
    return {text:content.textContent,paragraphs:content.querySelectorAll('.reader-paragraph-pair').length,headings:root.querySelectorAll('.reader-outline-item').length,pagenums:content.querySelectorAll('.pageno').length};
  });
  if(result.paragraphs<315||result.pagenums||result.text.includes('Metadata excluded')||result.text.includes('License excluded')||result.text.split('Repeated prose is retained.').length!==3)throw Error('Book extraction failed '+JSON.stringify({...result,text:result.text.slice(0,200)}));
  await page.locator('.reader-context-mode-tabs [data-mode="bilingual"]').click();
  await page.waitForFunction(()=>__translationRequests.length>0);
  const requests=await page.evaluate(()=>__translationRequests.length);
  if(requests>40)throw Error('Long book was translated eagerly: '+requests);
  await page.locator('.reader-context-mode-tabs [data-mode="orig"]').click();
  await page.locator('#reader-content a[href$="#note-one"]').click();
  await page.waitForFunction(()=>document.querySelector('#reader-scroll-area').scrollTop>2000);
  return {paragraphs:result.paragraphs,headings:result.headings,pagenums:result.pagenums,initialTranslationRequests:requests,footnoteJump:true,translation:'mock'};
}
