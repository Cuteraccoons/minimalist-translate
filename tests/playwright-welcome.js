async page => {
 const worker=page.context().serviceWorkers()[0];
 await worker.evaluate(()=>chrome.storage.local.set({welcomeProgress:0}));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(worker.url().replace('background.js','welcome.html'));
 await page.locator('#guide-next').click();
 await page.locator('#raccoon-pill-main').click();
 await page.waitForFunction(()=>document.querySelectorAll('.raccoon-translated-block,.raccoon-translated-inline').length>0,{},{timeout:25000});
 const translations=await page.locator('.raccoon-translated-block,.raccoon-translated-inline').allTextContents();
 await page.locator('#guide-next').click();await page.locator('#step-actions button').click();
 await page.waitForSelector('#raccoon-sidebar-root');
 await page.locator('#guide-next').click();await page.locator('#step-actions button').click();
 await page.waitForSelector('#raccoon-reader-root');
 const reader=await page.locator('.reader-title').innerText();
 const media=await page.locator('#reader-content img[src$="welcome-market.svg"]').count();if(!media)throw Error('Missing sample image');
 for(const width of [230,340]){
  await page.evaluate(width=>document.querySelector('#raccoon-reader-root').style.setProperty('--reader-outline-width',width+'px'),width);
  await page.waitForTimeout(250);
  const visible=await page.locator('.reader-navigator-tabs button span').first().isVisible();
  if(visible!==(width===340))throw Error('Navigation count visibility at '+width);
 }
 // These actual clicks must reach the controls above the reader, without forcing or exiting it first.
 await page.locator('#guide-next').click();
 if(await page.locator('#raccoon-reader-root').count())throw Error('Reader did not close on next step');
 if(await page.locator('#step-title').innerText()!=='高亮与笔记')throw Error('Wrong next step');
 await page.locator('#step-actions button').click();await page.waitForSelector('#raccoon-reader-root');
 await page.setViewportSize({width:600,height:700});
 await page.locator('#guide-next').click();
 if(await page.locator('#welcome-extras article').count()!==5)throw Error('Tool cards missing');
 if(await page.locator('a[href="reading-lab.html"]').count())throw Error('Test lab leaked into onboarding');
 await page.locator('#guide-prev').click();
 await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));
 const reachable=await page.locator('#guide-next').evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});
 if(!reachable)throw Error('Next button unreachable after scrolling');
 await page.locator('#guide-next').click();await page.locator('#guide-next').click();
 if(await page.locator('#step-title').innerText()!=='指南已完成'||errors.length)throw Error(JSON.stringify(errors));
 return {media,translations:translations.slice(0,2),reader,readerNextWorks:true,narrowCountsHidden:true,fixedNavigation:true,errors};
}
