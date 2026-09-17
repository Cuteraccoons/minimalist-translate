async page => {
 const worker=page.context().serviceWorkers()[0];
 await page.goto(worker.url().replace('background.js','welcome.html'));
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.locator('#guide-steps button').nth(1).click();
 await page.locator('#raccoon-pill-main').click();
 await page.waitForFunction(()=>document.querySelectorAll('.raccoon-translated-block,.raccoon-translated-inline').length>0,{},{timeout:25000});
 const translations=await page.locator('.raccoon-translated-block,.raccoon-translated-inline').allTextContents();
 await page.locator('#guide-steps button').nth(2).click();
 await page.locator('#step-actions button').click();
 await page.waitForSelector('#raccoon-sidebar-root');
 const sidebar=await page.locator('#raccoon-sidebar-root').innerText();
 await page.locator('#guide-steps button').nth(3).click();
 await page.locator('#step-actions button').click();
 await page.waitForSelector('#raccoon-reader-root');
 const reader=await page.locator('.reader-title').innerText();
 const notes=await page.evaluate(()=>chrome.runtime.sendMessage({action:'GET_READER_NOTES'}));
 const media=await page.locator("#reader-content img[src$=\"welcome-market.svg\"]").count();if(!media)throw Error("Missing sample image");
 return {media,translations:translations.slice(0,2),sidebarText:sidebar.slice(0,180),reader,notesSuccess:notes.success,errors};
}
