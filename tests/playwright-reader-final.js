async page => {
 await page.bringToFront();
 const worker=page.context().serviceWorkers()[0]||await page.context().waitForEvent('serviceworker');
 await worker.evaluate(async()=>{await chrome.storage.sync.set({excludeDomainList:[]});await chrome.storage.local.remove('readerNotes:http://127.0.0.1:8766/tests/fixtures/reader-regressions.html');});
 await page.setViewportSize({width:1600,height:1000});await page.reload();await page.waitForTimeout(500);
 const toggle=()=>worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.sendMessage(tab.id,{action:'TOGGLE_READER_MODE'});});
 await toggle();await page.waitForSelector('#reader-context-panel');
 await page.locator('[data-reader-tool-tab=format]').click();await page.locator('button[data-reader-render-style=card]').click();
 const tones=await page.locator('.reader-card-tone-grid').evaluate(n=>{const r=n.getBoundingClientRect();return [...n.children].every(c=>{const b=c.getBoundingClientRect();return b.left>=r.left+4&&b.right<=r.right-4;});});if(!tones)throw Error('Card outline clipped');
 await page.locator('[data-reader-tool-tab=style]').click();
 const paper=await page.locator('.reader-context-themes').evaluate(n=>{const r=n.getBoundingClientRect();return [...n.children].every(c=>{const b=c.getBoundingClientRect();return b.width<=24&&b.left>=r.left+4&&b.right<=r.right-4;});});if(!paper)throw Error('Paper outline clipped');
 await page.locator('[data-reader-theme-quick=dark]').click();await page.locator('.reader-context-exit').hover();
 const dark=await page.locator('.reader-context-exit').evaluate(n=>({background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color}));if(dark.background!=='rgb(255, 255, 255)'||dark.color!=='rgb(0, 0, 0)')throw Error('Dark exit contrast '+JSON.stringify(dark));
 await page.locator('[data-reader-theme-quick=white]').click();await page.locator('#reader-outline-accent').selectOption('green');
 await page.locator('[data-reader-tool-tab=info]').click();await page.locator('#reader-copy-link').click();
 await page.waitForFunction(()=>document.querySelector('#reader-copy-link .reader-source-copy').textContent==='已复制');
 await page.waitForTimeout(300);
 const copy=await page.locator('#reader-copy-link').evaluate(n=>({background:getComputedStyle(n).backgroundColor,text:n.querySelector('.reader-source-copy').textContent}));await page.waitForTimeout(300);if(copy.text!=='已复制'||copy.background!=='rgb(0, 0, 0)')throw Error('Copy failed');
 await page.evaluate(()=>document.querySelector('#raccoon-reader-root').classList.remove('reader-settings-open'));
 await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.scripting.executeScript({target:{tabId:tab.id},func:async()=>{const root=document.querySelector('#raccoon-reader-root');const block=[...root.querySelectorAll('.reader-orig-p')].find(n=>n.textContent.includes('Needle bridge'));const range=document.createRange();range.setStart(block.firstChild,0);range.setEnd(block.querySelector('strong').firstChild,6);await root.readerNotes.addText(range,range.toString(),true);}});});
 await page.locator('.reader-note-editor textarea').fill('最终回归：独立笔记编辑。');
 const floating=await page.locator('.reader-note-editor').evaluate(n=>({parent:n.parentElement.id,position:getComputedStyle(n).position,settingsOpen:n.closest('#raccoon-reader-root').classList.contains('reader-settings-open')}));if(floating.position!=='fixed'||floating.settingsOpen)throw Error('Editor forces settings open');
 await page.locator('[data-save]').click();await page.waitForTimeout(200);
 const collection=await worker.evaluate(async()=>{const data=await chrome.storage.local.get(null);return Object.entries(data).filter(([k])=>k.startsWith('readerNotes:')).flatMap(([,v])=>v);});if(!collection.some(n=>n.note.includes('独立笔记')&&n.articleTitle))throw Error('Missing article title or persisted note');
 const settings=await page.context().newPage();const id=worker.url().split('/')[2];await settings.goto(`chrome-extension://${id}/options.html?tab=tab-highlights#tab-highlights`);
 await settings.waitForSelector('.highlight-article-group');if(!(await settings.locator('.highlight-article-group').textContent()).includes('独立笔记'))throw Error('Reader note absent from collection');await settings.close();
 return {tones,paper,dark,copy,floating,groupedCollection:true};
}
