async page=>{
 const url=__URL__;
 const worker=page.context().serviceWorkers()[0];
 await worker.evaluate(()=>chrome.storage.sync.set({readerView:'orig',autoTranslateEnabled:false}));
 const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
 await page.waitForSelector('.J-lemma-content',{timeout:20000});
 const source=await page.evaluate(()=>{
  const main=document.querySelector('[class^="mainContent_"],.main-content')||document.body;
  const count=selector=>main.querySelectorAll(selector).length;
  const modules={};main.querySelectorAll('[data-module-type]').forEach(n=>{const type=n.getAttribute('data-module-type');modules[type]=(modules[type]||0)+1;});
  const classes={};main.querySelectorAll('[class]').forEach(n=>String(n.className).split(/\s+/).forEach(cls=>{if(/timeline|timeLine|chron|event|history|catalog|basicInfo|works|movie|album|gallery|picture|video|table|reference|star|dynamicWiki|award|relation/i.test(cls))classes[cls]=(classes[cls]||0)+1;}));
  const headings=[...main.querySelectorAll('.J-lemma-content h2,.J-lemma-content h3,.J-lemma-content h4')].map(n=>n.textContent.trim());
  const timelines=[...main.querySelectorAll('[class]')].filter(n=>/timeline|timeLine|chronology|eventList|eventItem|bigEvent|dynamicWiki/i.test(String(n.className))).slice(0,12).map(n=>({tag:n.tagName,cls:n.className,children:[...n.children].slice(0,6).map(x=>({tag:x.tagName,cls:x.className})),textLength:n.textContent.length,labels:[...n.querySelectorAll('h2,h3,button,[role=tab]')].map(x=>x.textContent.trim()).slice(0,12)}));
  return {url:location.href,title:document.title,headings,modules,classes,timelines,counts:{paragraphs:count('[data-tag="paragraph"],.para'),facts:count('.J-basic-info dt,.basic-info dt'),tables:count('table'),tableRows:count('table tr'),works:count('[class^="movieItem_"],[class^="albumItem_"]'),galleryGroups:count('[class^="albumWrap_"]'),images:count('img'),videos:document.querySelectorAll('video').length,catalogs:count('[class^="catalog_"],.lemma-catalog'),dynamic:count('[class^="dynamicWiki_"]'),starMaps:count('[class^="lemmaStructured_"]')},hero:!!document.querySelector('[class^="posterBg_"]'),textLength:main.innerText.length};
 });
 await worker.evaluate(async url=>{const tab=(await chrome.tabs.query({})).find(t=>t.url===url);for(let i=0;i<15;i++){try{await chrome.tabs.sendMessage(tab.id,{action:'TOGGLE_READER_MODE'});return;}catch(error){if(i===14)throw error;await new Promise(resolve=>setTimeout(resolve,200));}}},page.url());
 await page.waitForSelector('#reader-content',{timeout:30000});
 const reader=await page.evaluate(()=>{
  const root=document.querySelector('#raccoon-reader-root'),content=root.querySelector('#reader-content');
  const labels=[...root.querySelectorAll('.reader-outline-label')].map(n=>n.textContent.trim());
  const headings=[...content.querySelectorAll('.reader-structural-heading.reader-orig-p')].map(n=>n.textContent.trim());
  const originalText=[...content.querySelectorAll('.reader-orig-p')].map(n=>n.textContent).join('\n');
  const imageFrequency={};content.querySelectorAll('img').forEach(image=>{if(!image.closest('button')&&!image.src.startsWith('chrome-extension:'))imageFrequency[image.src]=(imageFrequency[image.src]||0)+1;});
  return {labels,headings,imageStats:{uniqueContent:Object.keys(imageFrequency).length,maxDuplicate:Math.max(0,...Object.values(imageFrequency)),totalIncludingControls:content.querySelectorAll('img').length},counts:{facts:content.querySelectorAll('.reader-fact-row').length,tables:content.querySelectorAll('.reader-semantic-table').length,works:content.querySelectorAll('.reader-baike-card').length,galleryImages:content.querySelectorAll('.reader-baike-gallery img').length,images:Object.values(imageFrequency).reduce((a,b)=>a+b,0),videos:content.querySelectorAll('video').length,videoFallbacks:content.querySelectorAll('.reader-baike-videos figcaption a').length},outlineTargetsMissing:[...root.querySelectorAll('.reader-outline-item')].filter(n=>!root.querySelector('#'+n.dataset.targetId)).length,originalTextLength:originalText.length,emptyGalleries:content.querySelectorAll('.reader-baike-gallery:empty').length};
 });
 return {requestedUrl:url,status:response?.status(),source,reader,missingHeadings:source.headings.filter(text=>!reader.headings.includes(text)),note:'结构统计，不等同于完整性或视觉验收；原网页媒体会随懒加载变化。'};
}
