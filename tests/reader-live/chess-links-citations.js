async page=>{
 const worker=page.context().serviceWorkers()[0],result={};
 await worker.evaluate(async()=>{await chrome.storage.sync.set({autoTranslateEnabled:false,readerView:'orig',readerLinkStyle:'underline'});});
 const toggle=async tab=>{await worker.evaluate(async url=>{const t=(await chrome.tabs.query({})).find(t=>t.url===url);for(let i=0;i<12;i++){try{await chrome.tabs.sendMessage(t.id,{action:'TOGGLE_READER_MODE'});return;}catch(e){if(i===11)throw e;await new Promise(r=>setTimeout(r,200));}}},tab.url());await tab.waitForSelector('#reader-content');};
 await page.goto("https://en.wikipedia.org/wiki/Queen%27s_Pawn_Game",{waitUntil:'domcontentloaded'});
 await page.waitForSelector('.chess-pieces');
 const geometry=()=>{const images=[...document.querySelectorAll('#raccoon-reader-root .reader-composite img')];const root=document.querySelector('#raccoon-reader-root');const all=root?images:[...document.querySelectorAll('.chess-pieces img')];const board=all.find(img=>/Chessboard/.test(img.src)),pawn=all.find(img=>img.alt==='d4 white pawn'),rook=all.find(img=>img.alt==='a8 black rook');const b=board.getBoundingClientRect(),p=pawn.getBoundingClientRect(),r=rook.getBoundingClientRect();return {pieces:all.length,board:[b.width,b.height],pawn:[(p.left-b.left)/b.width,(p.top-b.top)/b.height],rook:[(r.left-b.left)/b.width,(r.top-b.top)/b.height]};};
 result.before=await page.evaluate(geometry);
 await toggle(page);
 await page.locator('.reader-composite').first().scrollIntoViewIfNeeded();
 result.after=await page.evaluate(geometry);
 if(result.before.pieces!==result.after.pieces||result.before.pawn.some((v,i)=>Math.abs(v-result.after.pawn[i])>.01)||result.after.board[0]<150)throw Error(JSON.stringify(result));
 await page.setViewportSize({width:700,height:900});await page.waitForTimeout(150);
 result.narrow=await page.evaluate(geometry);
 if(result.before.pawn.some((v,i)=>Math.abs(v-result.narrow.pawn[i])>.01))throw Error('Narrow chess geometry changed');
 await page.setViewportSize({width:1440,height:1000});
 const tab=await page.context().newPage();
 try{
  await worker.evaluate(async()=>{
   await chrome.storage.local.set({translationEngine:'google'});
   self.__readerTestFetch=self.fetch;
   self.fetch=async(input,init)=>{const url=String(input?.url||input);if(url.includes('translate.googleapis.com')){const q=new URL(url).searchParams.get('q')||'';const text=q.replace('First claim.','第一句话。').replace('Second claim.','第二句话。');return new Response(JSON.stringify([[[text,q,null,null]],null,'en']),{headers:{'Content-Type':'application/json'}});}return self.__readerTestFetch(input,init);};
  });
  await tab.route('https://reader-fixture.example/**',route=>route.fulfill({contentType:'text/html',body:'<article><h1>References and links</h1><p>First claim.<sup><a href="#cite_note_1">[1]</a></sup> Second claim.<sup><a href="#cite_note_2">[2]</a></sup> Ordinary number 2021 stays unchanged.</p><p><a href="https://example.org/article">Read the original article</a> for more background and context.</p><ol><li id="cite_note_1">First source document reference.</li><li id="cite_note_2">Second source document reference.</li></ol></article>'}));
  await tab.goto('https://reader-fixture.example/references');
  await tab.evaluate(()=>{const figure=document.createElement('figure');figure.className='phone-mockup';figure.style.cssText='position:relative;width:600px;height:300px;margin:0';figure.innerHTML='<img alt="Phone frame" src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22600%22 height=%22300%22/%3E" style="position:absolute;left:0;top:0;width:600px;height:300px"><span style="position:absolute;left:120px;top:60px;width:100px;height:30px">Screen label</span>';document.querySelector('article').append(figure);});
  await toggle(tab);
  const phoneGeometry=()=>{const frame=document.querySelector('.reader-composite img[alt="Phone frame"]');const label=[...frame.parentElement.querySelectorAll('span')].find(x=>x.textContent==='Screen label');const f=frame.getBoundingClientRect(),l=label.getBoundingClientRect();return {x:(l.left-f.left)/f.width,y:(l.top-f.top)/f.height};};
  result.phone=await tab.evaluate(phoneGeometry);
  await tab.setViewportSize({width:700,height:900});await tab.waitForTimeout(150);
  result.phoneNarrow=await tab.evaluate(phoneGeometry);
  for(const value of [result.phone,result.phoneNarrow])if(Math.abs(value.x-.2)>.01||Math.abs(value.y-.2)>.01)throw Error('Phone layers separated: '+JSON.stringify(result));
  await tab.setViewportSize({width:1440,height:1000});
  if(!await tab.locator('[data-reader-tool-tab="style"]').isVisible())await tab.locator('#reader-btn-open-settings').click();
  await tab.locator('[data-reader-tool-tab="style"]').click();
  await tab.locator('#reader-link-style [data-value="blue"]').click();
  result.blue=await tab.locator('#reader-content .reader-orig-p a').last().evaluate(x=>getComputedStyle(x).color);
  await tab.locator('[data-reader-tool-tab="format"]').click();
  await tab.locator('.reader-mode-btn[data-mode="bilingual"]:visible').click();
  await tab.waitForSelector('.reader-trans-p[data-loaded="true"] .raccoon-citation',{timeout:15000});
  result.citations=await tab.locator('.reader-trans-p').evaluateAll(nodes=>nodes.filter(x=>x.querySelector('.raccoon-citation')).map(x=>({text:x.textContent,refs:[...x.querySelectorAll('sup a')].map(a=>({label:a.textContent,href:a.hash,vertical:getComputedStyle(a.parentElement).verticalAlign}))})));
  if(result.citations[0].refs.length!==2||!result.citations[0].text.includes('2021')||result.citations[0].refs.some(x=>x.vertical!=='super'))throw Error(JSON.stringify(result));
  await tab.locator('[data-reader-tool-tab="style"]').click();
  await tab.locator('#reader-link-style [data-value="underline"]').click();
  result.underline=await tab.locator('#reader-content .reader-orig-p a').last().evaluate(x=>getComputedStyle(x).textDecorationLine);
  if(result.underline!=='underline'||result.blue!=='rgb(23, 105, 194)')throw Error(JSON.stringify(result));
 }finally{await worker.evaluate(()=>{if(self.__readerTestFetch){self.fetch=self.__readerTestFetch;delete self.__readerTestFetch;}});await tab.close();}
 return result;
}
