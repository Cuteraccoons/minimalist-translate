async page=>{
 const worker=page.context().serviceWorkers()[0]||await page.context().waitForEvent('serviceworker');
 await page.setViewportSize({width:1600,height:1000});
 await page.reload();await page.waitForTimeout(500);
 await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.sendMessage(tab.id,{action:'TOGGLE_READER_MODE'});});
 await page.waitForSelector('#reader-context-panel');
 await page.locator('[data-reader-tool-tab=style]').click();
 const colors=await page.locator('.reader-context-themes').evaluate(n=>{const r=[...n.children].map(c=>c.getBoundingClientRect());return {rows:new Set(r.map(x=>x.top)).size,labels:[...n.querySelectorAll('span')].some(c=>getComputedStyle(c).display!=='none')};});
 if(colors.rows!==1||colors.labels)throw Error('Theme swatches not one row');
 await page.screenshot({path:'output/playwright/polish-style.png'});
 const footer=await page.locator('.reader-context-exit').boundingBox();
 await page.locator('.reader-tools-scroll').evaluate(n=>n.scrollTop=n.scrollHeight);
 const after=await page.locator('.reader-context-exit').boundingBox();
 if(Math.abs(footer.y-after.y)>1||after.y+after.height>1000)throw Error('Footer moves or overflows');
 await page.locator('[data-reader-tool-tab=info]').click();
 await page.locator('.reader-tools-scroll').evaluate(n=>n.scrollTop=0);
 await page.locator('[data-reader-copy=orig]').click();
 await page.waitForFunction(()=>document.querySelector('[data-reader-copy=orig]').textContent.includes('已复制'));
 await page.locator('.reader-tools-scroll').evaluate(n=>n.scrollTop=0);
 await page.screenshot({path:'output/playwright/polish-info.png'});
 await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.scripting.executeScript({target:{tabId:tab.id},func:async()=>{
  const root=document.querySelector('#raccoon-reader-root');const block=[...root.querySelectorAll('.reader-orig-p')].find(n=>n.textContent.includes('Needle bridge'));
  const range=document.createRange();range.setStart(block.firstChild,0);range.setEnd(block.querySelector('strong').firstChild,6);
  await root.readerNotes.addText(range,range.toString(),true);
 }});});
 await page.locator('.reader-note-editor textarea').fill('这是跨行内标签的笔记。保留原文与我的想法。');
 await page.locator('[data-save]').click();
 await page.locator('[data-reader-tool-tab=notes]').click();
 await page.waitForSelector('.reader-note-card');
 if(await page.locator('.reader-note-highlight').count()<2)throw Error('Cross-inline mark lost');
 await page.screenshot({path:'output/playwright/polish-notes.png'});
 await page.locator('.reader-note-highlight').first().dblclick();
 await page.waitForSelector('.reader-note-editor textarea');await page.locator('[data-cancel]').click();
 await page.locator('[data-note-capture]').click();
 await page.mouse.move(460,315);await page.mouse.down();await page.mouse.move(1100,400,{steps:8});await page.mouse.up();
 await page.waitForSelector('.reader-note-editor textarea');
 await page.locator('.reader-note-editor textarea').fill('截图中的观察。');await page.locator('[data-save]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.reader-note-card').length===2);
 await page.locator('.reader-context-exit').click();
 await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.sendMessage(tab.id,{action:'TOGGLE_READER_MODE'});});
 await page.waitForSelector('#reader-context-panel');await page.locator('[data-reader-tool-tab=notes]').click();
 await page.waitForFunction(()=>document.querySelectorAll('.reader-note-card').length===2);
 if(await page.locator('.reader-note-highlight').count()<2)throw Error('Reopen lost anchor');
 await page.screenshot({path:'output/playwright/polish-notes-persisted.png'});
 // Exercise both print layouts and save their exact print document as a PDF.
 for(const mode of ['notes','article']){
  await page.locator(`[data-note-print=${mode}]`).click();
  const frame=page.locator('.reader-notes-print-frame').last();await frame.waitFor({state:'attached'});
  const html=await frame.getAttribute('srcdoc');
  if(mode==='article'&&!html.includes('class="row"'))throw Error('Mixed PDF rows absent');
  const printPage=await page.context().newPage();await printPage.setContent(html);await printPage.evaluate(()=>Promise.all([...document.images].map(img=>img.decode())));
  await printPage.pdf({path:`output/playwright/reader-${mode}.pdf`,format:'A4',printBackground:true});await printPage.close();
 }
 return {colors,fixedFooter:true,crossInlineHighlight:true,textAndScreenshotNotes:2,persisted:true,pdfLayouts:2};
}
