async page=>{
 const url=__URL__,worker=page.context().serviceWorkers()[0];
 if(!worker)throw Error('Native extension service worker required');
 await worker.evaluate(()=>chrome.storage.sync.set({readerView:'orig',autoTranslateEnabled:false}));
 await page.setViewportSize({width:1440,height:1000});
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:35000});
 await page.waitForSelector('#mw-content-text .mw-parser-output',{timeout:20000});
 const source=await page.evaluate(()=>{
  const main=document.querySelector('#mw-content-text .mw-parser-output');
  const clean=n=>{const c=n.cloneNode(true);c.querySelectorAll('.mw-editsection,.mw-editsection-like').forEach(x=>x.remove());return c.textContent.replace(/\s+/g,' ').trim();};
  const selectors={infobox:'.infobox',dataTable:'table.wikitable',sortableTable:'table.sortable',mergedCell:'td[rowspan],th[rowspan],td[colspan],th[colspan]',thumbnail:'.thumb,figure[typeof*="mw:File"]',gallery:'.gallery',imagemap:'.imagemap',chess:'.chessboard',positionedDiagram:'.locmap,.noresize',math:'.mwe-math-element',chemistry:'.chemf',code:'pre,.mw-highlight',quote:'blockquote',definitionList:'dl',nestedList:'li ul,li ol',reference:'sup.reference',referenceList:'.reflist,ol.references',citation:'cite.citation',navbox:'.navbox',sidebar:'.sidebar',sisterProject:'.sistersitebox',audio:'audio',video:'video',map:'.mw-kartographer-map,.mw-kartographer-container',timeline:'.timeline',score:'.mw-ext-score',ruby:'ruby',coordinates:'.geo,.geo-dec,.geo-dms',hatnote:'.hatnote',maintenance:'.ambox,.tmbox',toc:'#toc,.toc'};
  const modules={};for(const [type,selector]of Object.entries(selectors)){const nodes=[...main.querySelectorAll(selector)];modules[type]={selector,count:nodes.length,examples:nodes.slice(0,2).map(n=>({tag:n.tagName,class:String(n.className),id:n.id}))};}
  const headings=[...main.querySelectorAll('h2,h3,h4,h5,h6')].map(n=>({text:clean(n),level:Number(n.tagName[1]),id:n.id||n.querySelector('[id]')?.id||n.parentElement.id}));
  const tables=[...main.querySelectorAll('table')].map((t,index)=>({index,cls:t.className,rows:t.rows.length,ownRows:[...t.rows].filter(x=>x.closest('table')===t).length,textLength:t.textContent.trim().length,nested:!!t.parentElement.closest('table'),caption:clean(t.querySelector('caption')||document.createElement('span')).slice(0,90),id:t.id}));
  const tailSections=headings.filter(h=>/Further reading|External links|Bibliography|Notes|References|延伸閱讀|外部連結|参考|関連|Literatur|Weblinks/i.test(h.text));
  return {shellToc:{containers:document.querySelectorAll('#vector-toc,#toc').length,items:document.querySelectorAll('.vector-toc-list-item,.toclevel-1,.toclevel-2').length},url:location.href,title:document.title,language:document.documentElement.lang,modules,headings,tables,tailSections,counts:{images:main.querySelectorAll('img').length,paragraphs:main.querySelectorAll('p').length,links:main.querySelectorAll('a[href]').length},textLength:main.innerText.length};
 });
 await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);if(!tab)throw Error('Tab missing');for(let i=0;i<15;i++){try{await chrome.tabs.sendMessage(tab.id,{action:'TOGGLE_READER_MODE'});return;}catch(error){if(i===14)throw error;await new Promise(r=>setTimeout(r,200));}}},page.url());
 await page.waitForSelector('#reader-content',{timeout:35000});
 const reader=await page.evaluate(()=>{
  const root=document.querySelector('#raccoon-reader-root'),c=root.querySelector('#reader-content');
  const headings=[...c.querySelectorAll('.reader-structural-heading.reader-orig-p')].map(n=>n.textContent.replace(/\s+/g,' ').trim());
  const imgs=[...c.querySelectorAll('img')].filter(n=>!n.closest('button')&&!n.src.startsWith('chrome-extension:'));
  const mathImages=imgs.filter(n=>/math\/render|math\/math|mathoid/i.test(n.src));
  const controls=[...root.querySelectorAll('.reader-outline-item')];
  return {headings,counts:{infoboxes:c.querySelectorAll('.reader-infobox').length,tables:c.querySelectorAll('.reader-semantic-table').length,supplements:c.querySelectorAll('.reader-supplement').length,composites:c.querySelectorAll('.reader-composite').length,images:imgs.length,mathImages:mathImages.length,audio:c.querySelectorAll('audio').length,video:c.querySelectorAll('video').length,code:c.querySelectorAll('pre,.reader-code-block').length,ruby:c.querySelectorAll('ruby').length,coloredCells:c.querySelectorAll('[data-reader-source-color]').length,sup:c.querySelectorAll('.reader-orig-p sup').length},outlineTargetsMissing:controls.filter(n=>!document.getElementById(n.dataset.targetId)).length,mathImageSizes:mathImages.slice(0,5).map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height,cls:n.className})),textLength:[...c.querySelectorAll('.reader-orig-p')].reduce((s,n)=>s+n.textContent.length,0)};
 });
 return {requestedUrl:url,status:response?.status(),source,reader,missingHeadingCandidates:source.headings.filter(h=>!reader.headings.includes(h.text)),note:'Module selectors may overlap. Missing-heading candidates include intentionally filtered navigation. Counts are not completeness or visual approval.'};
}
