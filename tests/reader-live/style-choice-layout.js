async page=>{
 const worker=page.context().serviceWorkers()[0];
 await worker.evaluate(()=>chrome.storage.sync.set({readerView:'orig',autoTranslateEnabled:false,readerToolsCollapsed:false}));
 const tab=await page.context().newPage(),results=[];
 try{
  await tab.route('https://reader-fixture.example/**',route=>route.fulfill({contentType:'text/html',body:'<article><h1>Reader choices</h1><p>A long enough paragraph for the article reader to show its settings and preserve the original reading content.</p><h2>Section</h2><p>Check keyboard selection and the layout of the colour controls at different sidebar widths.</p></article>'}));
  await tab.goto('https://reader-fixture.example/choices');
  await worker.evaluate(async url=>{const t=(await chrome.tabs.query({})).find(t=>t.url===url);for(let i=0;i<15;i++){try{await chrome.tabs.sendMessage(t.id,{action:'TOGGLE_READER_MODE'});return;}catch(e){if(i===14)throw e;await new Promise(r=>setTimeout(r,200));}}},tab.url());
  await tab.waitForSelector('#reader-content');
  for(const viewport of [1440,800]){
   await tab.setViewportSize({width:viewport,height:1000});
   if(!await tab.locator('[data-reader-tool-tab="style"]').isVisible())await tab.locator('#reader-btn-open-settings').click();
   await tab.locator('[data-reader-tool-tab="style"]').click();
   for(const width of [260,320,420]){
    await tab.locator('#raccoon-reader-root').evaluate((root,width)=>root.style.setProperty('--reader-tools-width',width+'px'),width);
    for(const theme of ['white','dark']){
     await tab.locator(`[data-reader-theme-quick="${theme}"]`).click();
     const geometry=await tab.locator('#reader-outline-accent').evaluate(group=>{
      const rect=group.getBoundingClientRect(),buttons=[...group.querySelectorAll('button')],boxes=buttons.map(n=>n.getBoundingClientRect());
      const overlaps=boxes.some((a,i)=>boxes.some((b,j)=>j>i&&Math.min(a.right,b.right)>Math.max(a.left,b.left)+.5&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+.5));
      return {display:getComputedStyle(group).display,overlaps,contained:boxes.every(b=>b.left>=rect.left-.5&&b.right<=rect.right+.5),labelsFit:buttons.every(b=>b.scrollWidth<=b.clientWidth+1&&b.scrollHeight<=b.clientHeight+1),width:rect.width,heights:boxes.map(b=>b.height)};
     });
     if(geometry.display!=='grid'||geometry.overlaps||!geometry.contained||!geometry.labelsFit||geometry.heights.some(h=>h<38))throw Error(JSON.stringify({viewport,width,theme,geometry}));
     results.push({viewport,width,theme,...geometry});
    }
   }
  }
  const green=tab.locator('#reader-outline-accent [data-value="green"]');await green.focus();await tab.keyboard.press('Enter');
  if(await green.getAttribute('aria-pressed')!=='true')throw Error('Keyboard selection failed');
  return {passed:true,cases:results.length,results};
 }finally{await tab.close();}
}
