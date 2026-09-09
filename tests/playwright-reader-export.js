async page => {
 await page.setViewportSize({width:1600,height:1000});
 await page.locator('[data-reader-tool-tab=info]').click();
 await page.evaluate(()=>{const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.__exportBlob=blob;return original(blob);};});
 await page.locator('[data-format=md]').click();
 const markdown=await page.evaluate(()=>window.__exportBlob.text());
 if(/^---$/m.test(markdown)||markdown.includes('正在同步精排译文'))throw Error('Markdown includes generated separators or placeholders');
 if(!markdown.includes('| ---')||!/^## /m.test(markdown))throw Error('Markdown lost tables or headings');
 await page.locator('[data-format=html]').click();
 const html=await page.evaluate(()=>window.__exportBlob.text());
 if(!html.includes('<table')||!html.includes('reader-scroll-card')||!html.includes('font-family:'))throw Error('Styled export lost article structure');
 if(html.includes('正在同步精排译文')||html.includes('data-reader-translate-one'))throw Error('Export contains UI');
 await page.locator('[data-format=print]').click();
 const frame=page.locator('.reader-export-print-frame').last();await frame.waitFor({state:'attached'});
 const print=await frame.getAttribute('srcdoc');if(!print.includes('print-color-adjust:exact')||!print.includes('<table'))throw Error('PDF source lost styling');
 await page.addScriptTag({url:'http://127.0.0.1:8766/vendor/qrcode.js'});await page.addScriptTag({url:'http://127.0.0.1:8766/reader-share.js'});
 const share=await page.evaluate(async()=>{const source=document.createElement('canvas');source.width=1000;source.height=800;source.getContext('2d').fillRect(0,0,1000,800);const result=[];for(const layout of ['card','editorial','compact']){const canvas=await JijianReaderShare.compose({image:source.toDataURL(),rect:{x:0,y:0,width:600,height:300},viewport:{width:1000,height:800},title:'阅读与田野材料',url:'https://example.com/article',layout,color:'dawn'});result.push({layout,width:canvas.width,height:canvas.height});}return result;});
 if(new Set(share.map(item=>item.height)).size!==3)throw Error('Share layouts are identical');
 return {markdownStructure:true,noRepeatedSeparators:true,styledHtml:true,styledPrint:true,share};
}
