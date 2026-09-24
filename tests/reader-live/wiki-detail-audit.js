async page=>{
 const results=[],worker=page.context().serviceWorkers()[0];
 for(const slug of ['Pythagorean_theorem','List_of_countries_and_dependencies_by_population','Climate_of_London','Symphony_No._5_(Beethoven)','Python_(programming_language)']){
  await page.goto('https://en.wikipedia.org/wiki/'+slug,{waitUntil:'domcontentloaded',timeout:35000});
  await page.waitForSelector('#mw-content-text .mw-parser-output');
  const source=await page.evaluate(()=>{
   const main=document.querySelector('#mw-content-text .mw-parser-output');
   return {codeCounts:{pre:main.querySelectorAll('pre').length,highlight:main.querySelectorAll('.mw-highlight').length},title:document.title,math:[...main.querySelectorAll('.mwe-math-element')].slice(0,3).map(n=>({html:n.outerHTML.slice(0,1300),text:n.textContent.trim(),math:n.querySelectorAll('math').length,svg:n.querySelectorAll('svg').length,img:n.querySelectorAll('img').length,display:getComputedStyle(n).display})),tables:[...main.querySelectorAll('table.wikitable')].map(n=>({id:n.id,cls:n.className,rows:n.rows.length,chars:n.innerText.length,caption:n.querySelector('caption')?.textContent.trim(),samples:[...n.rows].filter(r=>r.cells.length>1).filter((r,i,a)=>i===1||i===Math.floor(a.length/2)||i===a.length-1).map(r=>[...r.cells].slice(0,2).map(c=>c.innerText.trim().replace(/\s+/g,' ').slice(0,70)))})),audio:[...main.querySelectorAll('audio')].map(n=>({src:n.currentSrc||n.src,sources:[...n.querySelectorAll('source')].map(x=>x.src),parent:n.parentElement.tagName,parentClass:n.parentElement.className,inTable:!!n.closest('table'),inFigure:!!n.closest('figure')})),score:[...main.querySelectorAll('.mw-ext-score')].slice(0,3).map(n=>({imgs:n.querySelectorAll('img').length,audios:n.querySelectorAll('audio').length,svgs:n.querySelectorAll('svg').length}))};
  });
  await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);for(let i=0;i<15;i++){try{await chrome.tabs.sendMessage(tab.id,{action:'TOGGLE_READER_MODE'});return;}catch(e){if(i===14)throw e;await new Promise(r=>setTimeout(r,200));}}},page.url());
  await page.waitForSelector('#reader-content',{timeout:35000});
  const reader=await page.evaluate(source=>{const c=document.querySelector('#reader-content');const text=c.textContent.replace(/\s+/g,' ');return {codeBlocks:c.querySelectorAll('.reader-code-block,pre').length,mathTags:c.querySelectorAll('math').length,svgTags:c.querySelectorAll('svg:not(button svg)').length,mathSnippets:source.math.map(m=>{const key=m.text.replace(/\s+/g,' ');const index=text.indexOf(key);return {found:index>=0,outputExcerpt:index>=0?text.slice(index,index+Math.min(key.length,180)):null};}),tables:source.tables.map(t=>({id:t.id,rows:t.rows,sampleFound:t.samples.map(row=>row.map(v=>({text:v,found:text.includes(v)})))})),audio:c.querySelectorAll('audio').length,video:c.querySelectorAll('video').length,mediaLinks:[...c.querySelectorAll('a[href]')].filter(n=>/\.ogg|\.oga|\.mp3|\.webm|\.ogv/.test(n.href)).length};},source);
  results.push({url:page.url(),source,reader});
 }
 return results;
}
