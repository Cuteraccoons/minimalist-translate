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
        getURL:path => `${location.origin}/__reader_assets/${String(path||"").replace(/^\//,"")}`,
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

  const url='https://www.reddit.com/r/test/comments/fixture/thread';
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="en"><title>Forum reading fixture</title><main><shreddit-post><h1>Fieldwork discussion</h1><div slot="text-body"><p>This is the original discussion about fieldwork and interpretation. Reading this paragraph should retain the author's text and omit unrelated forum navigation and promotion.</p></div></shreddit-post><shreddit-comment author="Researcher"><div slot="comment"><p>First reply preserves a <strong>meaningful distinction</strong> and an <a href="https://example.org">evidence link</a>.</p></div><shreddit-comment author="Student"><div slot="comment"><p>Nested reply follows its parent and can be collapsed without disturbing the rest of the discussion.</p></div></shreddit-comment></shreddit-comment><shreddit-comment author="Observer"><div slot="comment"><p>An independent reply remains visible when another branch is collapsed. This is a separate contribution.</p></div></shreddit-comment><aside>Advertisement should not appear in the reader.</aside></main></html>`}));
  await page.route('**/__reader_assets/**',async route=>{const path=route.request().url().split('/__reader_assets/')[1];const response=await page.request.get(`${base}/${path}`);await route.fulfill({body:await response.body(),headers:response.headers()});});
  await page.goto(url);await page.addStyleTag({content:await (await page.request.get(`${base}/floating.css`)).text()});await page.addScriptTag({content:await (await page.request.get(`${base}/content.js`)).text()});await page.waitForTimeout(300);
  await page.evaluate(()=>__jijianRuntimeListeners.forEach(listener=>listener({action:'TOGGLE_READER_MODE'},{},()=>{})));
  await page.waitForSelector('.reader-forum-reply');
  const structure=await page.evaluate(()=>({replies:document.querySelectorAll('.reader-forum-reply').length,nested:document.querySelectorAll('.reader-forum-reply .reader-forum-reply').length,links:document.querySelectorAll('.reader-forum-reply .reader-orig-p a').length,duplicates:[...document.querySelectorAll('.reader-orig-p')].filter(n=>n.textContent.includes('First reply preserves')).length,ads:document.querySelector('#reader-content').textContent.includes('Advertisement')}));
  if(structure.replies!==3||structure.nested!==1||structure.links!==1||structure.duplicates!==1||structure.ads)throw Error(JSON.stringify(structure));
  await page.locator('.reader-forum-reply>summary').first().click();
  if(await page.locator('.reader-forum-reply .reader-forum-reply').isVisible())throw Error('Nested reply not collapsed');
  if(!await page.locator('.reader-forum-reply').last().isVisible())throw Error('Other branch hidden');
  return {fixture:true,...structure,independentCollapse:true};
}
