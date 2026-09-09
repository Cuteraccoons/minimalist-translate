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

  await page.addInitScript(()=>{
    globalThis.__speech={speaks:0,pauses:0,resumes:0,cancels:0};
    Object.defineProperty(globalThis,'speechSynthesis',{configurable:true,value:{getVoices:()=>[{name:'测试中文',lang:'zh-CN',voiceURI:'test-zh',localService:true}],pause(){__speech.pauses++;},resume(){__speech.resumes++;},cancel(){__speech.cancels++;},speak(utterance){__speech.speaks++;__speech.text=utterance.text;__speech.rate=utterance.rate;__speech.voice=utterance.voice?.voiceURI;utterance.onstart?.();}}});
  });
  await page.goto(`${base}/tests/fixtures/reader-regressions.html`);
  await page.addStyleTag({url:`${base}/floating.css`});await page.addScriptTag({url:`${base}/content.js`});
  await page.waitForTimeout(300);
  await page.evaluate(()=>globalThis.__jijianRuntimeListeners.forEach(listener=>listener({action:'TOGGLE_READER_MODE'},{},()=>{})));
  await page.waitForSelector('#reader-context-panel');await page.locator('[data-reader-tool-tab=info]').click();
  await page.locator('[data-reader-context-action=speak]').click();await page.locator('[data-reader-speech-action=toggle]').click();
  if(!await page.evaluate(()=>CSS.highlights.has('jijian-reader-speech')))throw Error('Original speech range missing');
  const paused=await page.evaluate(()=>({...__speech,status:document.querySelector('#reader-speech-status').textContent}));
  if(paused.pauses!==1||paused.speaks!==1||paused.status!=='已暂停')throw Error('Pause waits for sentence: '+JSON.stringify(paused));
  await page.locator('[data-reader-speech-action=toggle]').click();
  await page.locator('#reader-speech-voice').selectOption('test-zh');await page.locator('#reader-speech-rate').selectOption('1.2');
  await page.locator('[data-reader-speech-action=next]').click();
  await page.locator('[data-reader-speech-action=toggle]').hover();
  const hover=await page.locator('.reader-speech-pause-icon').evaluate(n=>({display:getComputedStyle(n).display,visibility:getComputedStyle(n).visibility,width:n.getBoundingClientRect().width}));
  if(hover.display==='none'||hover.visibility==='hidden'||hover.width<20)throw Error('Hover hides icon');
  await page.screenshot({path:'output/playwright/polish-speech.png'});
  await page.locator('[data-reader-speech-action=stop]').click();
  const final=await page.evaluate(()=>({...__speech,status:document.querySelector('#reader-speech-status').textContent}));
  if(final.cancels<2||final.speaks!==2||final.rate!==1.2||final.voice!=='test-zh'||final.status!=='已停止')throw Error('Speech controls failed: '+JSON.stringify(final));
  return {mockSpeech:true,paused,hover,final};
}
