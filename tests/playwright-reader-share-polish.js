async page=>{
 const worker=page.context().serviceWorkers()[0];
 await page.locator('[data-reader-tool-tab=info]').click();await page.locator('.reader-tools-scroll').evaluate(n=>n.scrollTop=0);
 await page.locator('#reader-scroll-area').evaluate(n=>n.scrollTop=0);
 await page.locator('#reader-share-screenshot').click();await page.mouse.move(460,300);await page.mouse.down();await page.mouse.move(1160,700,{steps:8});await page.mouse.up();
 await page.locator('#raccoon-reader-share .preview img').waitFor({state:'visible'});
 let download=page.waitForEvent('download');await page.locator('#raccoon-reader-share .download').click();await (await download).saveAs('output/playwright/share-polish-qr.png');
 for(const option of ['title','link','qr']){await page.locator(`#raccoon-reader-share [data-option=${option}]`).uncheck();await page.waitForTimeout(100);}
 await page.locator('#raccoon-reader-share [data-signature]').fill('龙猫君 · 阅读笔记');await page.locator('#raccoon-reader-share [data-signature]').press('Tab');
 await page.locator('#raccoon-reader-share [data-color=dawn]').click();await page.waitForTimeout(300);
 download=page.waitForEvent('download');await page.locator('#raccoon-reader-share .download').click();await (await download).saveAs('output/playwright/share-polish-signed.png');
 await page.screenshot({path:'output/playwright/share-polish-preview.png'});await page.keyboard.press('Escape');
 const density=await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});const result=await chrome.scripting.executeScript({target:{tabId:tab.id},func:async()=>{
   const source=document.createElement('canvas');source.width=4800;source.height=1600;source.getContext('2d').fillStyle='#e56f29';source.getContext('2d').fillRect(0,0,4800,1600);
   const canvas=await JijianReaderShare.compose({image:source.toDataURL(),rect:{x:100,y:100,width:2000,height:400},viewport:{width:2400,height:800},title:'test',url:location.href,color:'#fff',showTitle:false,showLink:false,showQR:false});
   return {width:canvas.width,height:canvas.height,pixel:[...canvas.getContext('2d').getImageData(200,200,1,1).data]};
 }});return result[0].result;});
 if(density.width!==4128||density.height!==928||density.pixel.join(',')!=='229,111,41,255')throw Error('Native pixel preservation failed: '+JSON.stringify(density));
 return {nativeCapture:true,optionalTitleLinkQR:true,signature:true,gradient:true,density};
}
