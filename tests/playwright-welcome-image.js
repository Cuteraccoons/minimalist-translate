async page=>{
 const worker=page.context().serviceWorkers()[0];
 await worker.evaluate(()=>chrome.storage.local.set({welcomeProgress:6}));
 await page.goto(worker.url().replace('background.js','welcome.html'));
 await page.locator('#guide-ocr-image').hover();await page.locator('#raccoon-image-translate-trigger').click();
 await page.waitForFunction(()=>document.querySelector('[data-ocr-model-download]')||document.querySelector('#raccoon-image-translate-overlay.is-ready')||document.querySelector('#raccoon-image-translate-overlay.is-recognizing'),{},{timeout:10000});
 if(await page.locator('[data-ocr-model-download]').isVisible())await page.locator('[data-ocr-model-download]').click();
 await page.waitForFunction(()=>document.querySelector('#raccoon-image-translate-overlay.is-ready')||document.querySelector('[data-image-retry]'),{},{timeout:90000});
 if(!await page.locator('#raccoon-image-translate-overlay.is-ready').count())throw Error(await page.locator('#raccoon-image-translate-overlay').innerText());
 await page.waitForSelector('#guide-complete:not([hidden])');
 const size=await page.locator('#guide-ocr-image').evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
 await page.locator('#guide-next').click();await page.waitForTimeout(600);
 if(await page.locator('#raccoon-image-translate-overlay').count())throw Error('Image overlay leaked into next step');
 await page.setViewportSize({width:600,height:700});
 const bounds=await page.locator('#guide-next').boundingBox();if(bounds.width<50)throw Error('Navigation touch target too small');
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.locator('#guide-prev').click();
 await page.waitForFunction(()=>document.body.dataset.guideStep==='6');
 return {actualOcr:true,sampleTranslations:true,completionShown:true,cleanup:true,narrowButtonWidth:bounds.width,reducedMotionNavigation:true,image:size};
}
