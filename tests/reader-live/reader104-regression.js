async page=>{
 const worker=page.context().serviceWorkers()[0],results=[];
 await worker.evaluate(()=>chrome.storage.sync.set({readerView:'orig',autoTranslateEnabled:false,readerToolsCollapsed:false}));
 const open=async tab=>{await worker.evaluate(async url=>{const target=(await chrome.tabs.query({})).find(t=>t.url===url);for(let i=0;i<15;i++){try{await chrome.tabs.sendMessage(target.id,{action:'TOGGLE_READER_MODE'});return;}catch(e){if(i===14)throw e;await new Promise(r=>setTimeout(r,200));}}},tab.url());await tab.waitForSelector('#reader-content',{timeout:25000});};
 const tab=await page.context().newPage();await tab.setViewportSize({width:1440,height:1000});
 try{
  await tab.route('https://reader-fixture.example/**',route=>route.fulfill({contentType:'text/html',body:'<article><h1>Climate and links</h1><p>A substantial introduction to the article with enough context for its headings, links and temperature statistics to be retained.</p><h2>Overview</h2><p>Compare the monthly values in this article.</p><h3>Heat</h3><p>Meaningful source colours distinguish values.</p><table><tr><th>Month</th><th>Temperature</th></tr><tr><td>January</td><td style="background:rgb(255,200,100)">20</td></tr><tr><td>July</td><td style="background:rgb(150,20,10)">40</td></tr></table><p><a href="https://example.org">External reference</a></p></article>'}));
  await tab.goto('https://reader-fixture.example/climate');await open(tab);
  const colors=await tab.locator('[data-reader-source-color]').evaluateAll(cells=>cells.map(cell=>({bg:getComputedStyle(cell).backgroundColor,ink:getComputedStyle(cell.querySelector('.reader-orig-p')).color})));
  if(colors.length!==2||colors[0].bg!=='rgb(255, 200, 100)'||colors[1].bg!=='rgb(150, 20, 10)'||colors[1].ink!=='rgb(255, 255, 255)')throw Error('Heat map colours lost '+JSON.stringify(colors));
  const row=tab.locator('.reader-outline-item').filter({hasText:'Heat'});const rect=await row.boundingBox();await row.click({position:{x:rect.width-6,y:rect.height/2}});
  const rowGeometry=await row.evaluate(el=>({width:el.getBoundingClientRect().width,parent:el.parentElement.getBoundingClientRect().width,pinned:document.querySelector('#raccoon-reader-root').dataset.readerOutlinePinned,target:el.dataset.target}));
  if(rowGeometry.width<rowGeometry.parent-50||!rowGeometry.pinned)throw Error('Outline hit area too small '+JSON.stringify(rowGeometry));
  if(!await tab.locator('[data-reader-tool-tab="style"]').isVisible())await tab.locator('#reader-btn-open-settings').click();
  await tab.locator('[data-reader-tool-tab="style"]').click();await tab.locator('#reader-link-style [data-value="blue"]').click();await tab.locator('#reader-outline-accent [data-value="green"]').click();
  if(await tab.locator('#raccoon-reader-root').getAttribute('data-reader-link-style')!=='blue')throw Error('Link choice failed');
  const swatches=await tab.locator('.reader-context-themes button').evaluateAll(nodes=>nodes.map(x=>({width:x.getBoundingClientRect().width,radius:getComputedStyle(x.querySelector('i')).borderRadius})));
  if(swatches.some(x=>x.width<32||x.radius!=='50%'))throw Error('Swatch hit area or shape failed');
  await tab.locator('[data-reader-theme-quick="dark"]').click();
  const darkRing=await tab.locator('.reader-context-themes button.active i').evaluate(x=>getComputedStyle(x).outlineColor);
  if(darkRing!=='rgb(255, 255, 255)')throw Error('Dark selection invisible');
  await tab.locator('[data-reader-theme-quick="white"]').click();results.push({fixture:'colors, full-row outline, choices and circular swatches',colors,rowGeometry,passed:true});
 }finally{await tab.close();}
 for(const url of ['https://en.wikipedia.org/wiki/Queen%27s_Pawn_Game','https://baike.baidu.com/item/周杰伦/129156','https://baike.baidu.com/item/杭州市/200167','https://baike.baidu.com/item/水/34133']){
  const tab=await page.context().newPage();
  try{
   await tab.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await tab.waitForSelector('h1',{timeout:25000});
   const original=await tab.evaluate(()=>({headings:[...document.querySelectorAll('.J-lemma-content h2,.J-lemma-content h3')].map(x=>x.textContent.trim()),facts:document.querySelectorAll('.J-basic-info dt').length,cards:document.querySelectorAll('[class^="movieItem_"],[class^="albumItem_"]').length}));
   await open(tab);
   const state=await tab.evaluate(()=>{const root=document.querySelector('#raccoon-reader-root');return {text:root.querySelector('#reader-content').textContent,headings:[...root.querySelectorAll('.reader-outline-label')].map(x=>x.textContent.trim()),facts:root.querySelectorAll('.reader-infobox .reader-fact-row').length,cards:root.querySelectorAll('.reader-baike-card').length,galleryImages:root.querySelectorAll('.reader-baike-gallery img').length,video:root.querySelectorAll('.reader-baike-videos video').length,links:[...root.querySelectorAll('#reader-content a[href]')].map(x=>x.href),tables:root.querySelectorAll('.reader-supplement table').length};});
   if(url.includes('wikipedia')){if(!state.links.some(x=>x.includes('lichess.org'))||!state.text.includes('Ware')||!state.tables)throw Error('Further reading/navigation lost');}
   else{const missing=original.headings.filter(x=>!state.headings.includes(x));if(missing.length||original.facts&&state.facts<original.facts||original.cards&&state.cards<original.cards)throw Error(JSON.stringify({missing,original,facts:state.facts,cards:state.cards}));if(state.headings.includes('目录')||state.headings.includes('相关星图'))throw Error('Host navigation leaked');}
   results.push({url,passed:true,headings:state.headings.length,facts:state.facts,cards:state.cards,galleryImages:state.galleryImages,video:state.video,tables:state.tables});
  }finally{await tab.close();}
 }
 return results;
}
