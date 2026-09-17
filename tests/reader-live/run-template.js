async page => {
 const cases=__CASES__;
 const worker=page.context().serviceWorkers()[0];
 await worker.evaluate(()=>chrome.storage.sync.set({autoTranslateEnabled:false,readerTheme:'white',readerFont:'auto',readerWidth:'1000',readerOutlineCollapsed:false,readerToolsCollapsed:false,readerSurface:'card'}));
 const run=async item=>{
  const tab=await page.context().newPage(),errors=[];const start=Date.now();
  tab.on('pageerror',error=>{if(/raccoon|reader|jijian/i.test(error.stack||''))errors.push(error.message.slice(0,140));});
  const result={...item};
  try{
   await tab.setViewportSize({width:1440,height:1000});
   try{const response=await tab.goto(item.url,{waitUntil:'domcontentloaded',timeout:22000});result.http=response?.status();}catch(error){result.navigation=error.message.split('\n')[0];}
   result.finalUrl=tab.url();
   if(tab.url().startsWith('https://www.nature.com/')){const reject=tab.getByRole('button',{name:'Reject optional cookies',exact:true});if(await reject.count()){await reject.click();result.cookieChoice='reject-optional';}}
   const before=await tab.evaluate(selector=>{
    const text=document.body?.innerText||'';
    const root=document.querySelector(selector)||document.querySelector('article,main')||document.body;
    const visible=el=>!el.closest('nav,header,footer,aside,[aria-hidden="true"],.reflist,.references,.mw-references-wrap')&&el.getBoundingClientRect().height>0;
    const paragraphs=[...root.querySelectorAll('p,pre,li,blockquote')].filter(visible).map(x=>{const clone=x.cloneNode(true);clone.querySelectorAll('script,style,noscript,[hidden],[aria-hidden="true"],.descriptor').forEach(n=>n.remove());return clone.textContent.trim();}).filter(x=>x.length>=80);
    const samples=Array.from({length:Math.min(24,paragraphs.length)},(_,i)=>paragraphs[Math.floor(i*(paragraphs.length-1)/Math.max(1,Math.min(24,paragraphs.length)-1))]).map(x=>x.slice(0,130));
    return {pageTitle:document.title,chars:text.length,sourceChars:root.innerText.length,paragraphs:paragraphs.length,heads:root.querySelectorAll('h1,h2,h3,h4').length,images:[...root.querySelectorAll('img')].filter(visible).length,tables:root.querySelectorAll('table').length,pre:root.querySelectorAll('pre').length,samples,blocked:/^(?:Access Denied|Just a moment|Attention Required|Checking your browser|403 Forbidden|Robot Challenge)/i.test(document.title)||text.length<150||(/blocked by network security|verify you are human|prove your humanity|unusual traffic/i.test(text)&&text.length<3000)};
   },item.selector);
   result.before={...before};delete result.before.samples;
   if(before.blocked||result.http>=400){result.status='unavailable';return result;}
   const url=tab.url();
   await worker.evaluate(async url=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(tab=>tab.url===url);if(!tab)throw Error('Tab not found');for(let attempt=0;attempt<12;attempt++){try{await Promise.race([chrome.tabs.sendMessage(tab.id,{action:'TOGGLE_READER_MODE'}),new Promise((_,reject)=>setTimeout(()=>reject(Error('Reader activation timeout')),15000))]);return;}catch(error){if(attempt===11)throw error;await new Promise(resolve=>setTimeout(resolve,500));}}},url);
   await tab.waitForSelector('#raccoon-reader-root',{timeout:16000});
   result.after=await tab.evaluate(samples=>{
    const root=document.querySelector('#raccoon-reader-root'),content=root.querySelector('#reader-content');
    const normalize=t=>t.normalize('NFKC').replace(/\[\d+\]/g,'').replace(/\s+/g,'').toLowerCase();
    const text=content.textContent,normalized=normalize(text);
    const matched=samples.filter(x=>normalized.includes(normalize(x))).length;
    const targets=[...root.querySelectorAll('.reader-outline-item')].map(x=>x.dataset.targetId);
    const invalidTargets=targets.filter(id=>!root.querySelector('[id="'+CSS.escape(id)+'"]'));
    const scroll=root.querySelector('#reader-scroll-area');
    return {title:root.querySelector('.reader-title')?.textContent,chars:text.length,paragraphs:content.querySelectorAll('.reader-paragraph-pair').length,heads:targets.length,images:[...content.querySelectorAll('img:not(.reader-img-icon)')].filter(img=>!img.closest('button')).length,tables:content.querySelectorAll('table').length,pre:content.querySelectorAll('pre,.reader-code-block').length,samples:samples.length,matched,missing:samples.filter(x=>!normalized.includes(normalize(x))).slice(0,4).map(x=>x.slice(0,100)),invalidTargets:invalidTargets.length,overflow:scroll.scrollWidth-scroll.clientWidth,empty:root.querySelector('.reader-empty')?.textContent||'',tail:text.slice(-160)};
   },before.samples);
   const last=tab.locator('.reader-outline-item').last();
   if(await last.count()) {await last.click({timeout:3000});await tab.waitForTimeout(200);result.outlineClick=true;}
   result.status=result.after.chars<200?'failed':result.after.matched<Math.ceil(result.after.samples*.72)||result.after.invalidTargets||result.after.overflow>8?'inspect':'checked';
  }catch(error){result.status='error';result.error=error.message.split('\n')[0];}
  finally{result.ms=Date.now()-start;result.errors=errors;await tab.close();}
  return result;
 };
 return await Promise.all(cases.map(run));
}
