async page => {
 const worker=page.context().serviceWorkers()[0];
 const cases=[
  {name:'legacy-layout',html:'<table role="presentation"><tr><td><font>'+Array.from({length:16},(_,i)=>`Legacy paragraph ${i}: a long-form essay must retain its prose inside an old presentation table, including the final paragraph.<br><br>`).join('')+'</font></td></tr></table>',expected:['Legacy paragraph 0','Legacy paragraph 15']},
  {name:'semantic-article',html:'<article><h1>Article title<a class="headerlink">¶</a></h1><p>A long introduction establishes the article content before its later sections, which must not be discarded as unrelated navigation.</p><h2>Related projects</h2><p>RETAIN LATER CHAPTER with useful project details and a substantial concluding passage.</p><blockquote><pre><code>const preserved = 42;\nconsole.log(preserved);</code></pre></blockquote><p><img src="https://reader-fixture.example/image.svg" width="480" height="240" alt="Article illustration"></p><table><caption>Real data</caption><tr><th>Year</th><th>Total</th></tr><tr><td>2026</td><td>42</td></tr></table><div><style>.shouldNeverAppear { color: red }</style></div></article>',expected:['RETAIN LATER CHAPTER','const preserved = 42;','Real data'],media:true}
 ];
 const results=[];
 for(const item of cases){
  const tab=await page.context().newPage();
  try{
   await tab.route('https://reader-fixture.example/**',route=>route.fulfill({contentType:route.request().url().endsWith('.svg')?'image/svg+xml':'text/html',body:route.request().url().endsWith('.svg')?'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240"><rect width="480" height="240" fill="gray"/></svg>':`<!doctype html><html><head><title>Fixture</title></head><body><main>${item.html}</main></body></html>`}));
   await tab.goto('https://reader-fixture.example/'+item.name);
   await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);for(let i=0;i<15;i++){try{await chrome.tabs.sendMessage(tab.id,{action:'TOGGLE_READER_MODE'});return;}catch(e){if(i===14)throw e;await new Promise(r=>setTimeout(r,200));}}},tab.url());
   await tab.waitForSelector('#reader-content');
   const actual=await tab.locator('#reader-content').textContent();
   for(const text of item.expected)if(!actual.includes(text))throw Error(item.name+': missing '+text);
   if(actual.includes('shouldNeverAppear'))throw Error('Leaked CSS text');
   if(item.media){if(await tab.locator('#reader-content img').evaluateAll(images=>images.filter(img=>!img.closest('button')).length)!==1)throw Error('Image-only paragraph lost');if(await tab.locator('#reader-content .reader-code-block').count()!==1)throw Error('Quoted code lost');if(await tab.locator('#reader-content table').count()!==1)throw Error('Data table lost');if((await tab.locator('.reader-title').innerText())!=='Article title')throw Error('Title permalink leaked');}
   results.push({name:item.name,passed:true});
  }finally{await tab.close();}
 }
 return results;
}
