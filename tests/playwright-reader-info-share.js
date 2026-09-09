async page => {
  const base='http://127.0.0.1:8766';
  await page.setViewportSize({width:1600,height:1000});
  const worker=page.context().serviceWorkers()[0] || await page.context().waitForEvent('serviceworker');
  // Use an isolated extension profile. Exercise the migration from the former
  // automatically selected oblique font before opening the actual reader.
  await worker.evaluate(async()=>{await chrome.storage.sync.set({readerFont:'smiley-sans'});await chrome.storage.sync.remove('readerFontAutoV3');});
  await page.reload();
  await page.waitForTimeout(500);
  await worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});await chrome.tabs.sendMessage(tab.id,{action:'TOGGLE_READER_MODE'});});
  await page.waitForSelector('#reader-context-panel');
  await page.waitForTimeout(500);
  const result={};
  result.fonts=await page.evaluate(()=>{
    const root=document.querySelector('#raccoon-reader-root');
    const blocks=[...root.querySelectorAll('.reader-orig-p')];
    const fonts={};for(const language of ['zh-CN','en','ja','ko']){const node=blocks.find(n=>n.lang===language);if(!node)throw Error('Language missing: '+language);fonts[language]=getComputedStyle(node).fontFamily;}
    if(root.dataset.readerFont!=='auto'||Object.values(fonts).some(font=>font.includes('Smiley'))||new Set(Object.values(fonts)).size!==4)throw Error('Automatic fonts not effective: '+JSON.stringify(fonts));
    return fonts;
  });
  await page.locator('[data-reader-tool-tab=info]').click();
  await page.locator('#reader-context-panel').evaluate(node=>node.scrollTop=0);
  await page.waitForTimeout(300);
  result.info=await page.evaluate(()=>{
    const panel=document.querySelector('#reader-context-panel');
    const link=panel.querySelector('#reader-copy-link').getBoundingClientRect();
    const actions=panel.querySelector('.reader-context-section-actions').getBoundingClientRect();
    const toggles=[...panel.querySelectorAll('.reader-info-switch')].map(node=>{
      const bounds=node.getBoundingClientRect();const track=node.querySelector('i');const knob=getComputedStyle(track,'::before');
      return {width:bounds.width,height:bounds.height,knob:Number.parseFloat(knob.width),left:Number.parseFloat(knob.left),translation:new DOMMatrix(knob.transform).m41};
    });
    if(link.top>=actions.top||toggles.some(t=>t.left+t.translation+t.knob>t.width))throw Error('Info ordering or toggle overflow');
    const font=getComputedStyle(panel.querySelector('#drawer-btn-copy span')).fontFamily;
    if(font.includes('Smiley'))throw Error('Copy button oblique font returned');
    const exportGap=panel.querySelector('.reader-export-wrap').getBoundingClientRect().top-panel.querySelector('.reader-visibility-controls').getBoundingClientRect().bottom;
    if(exportGap<24)throw Error('Export spacing missing');
    return {toggles,font,exportGap};
  });
  await page.screenshot({path:'output/playwright/info-redesign-final.png'});
  await page.locator('#reader-copy-link').click();
  await page.waitForTimeout(300);
  if(await page.locator('.reader-source-copy').innerText()!=='已复制')throw Error('Copy success state missing');
  await page.screenshot({path:'output/playwright/link-animation-final.png'});
  await page.waitForTimeout(1500);
  if(await page.locator('.reader-source-copy').innerText()!=='复制')throw Error('Copy state did not reset');
  for(const id of ['reader-toggle-progress','reader-toggle-meta']){
    await page.locator('#'+id).uncheck();
    if(await page.locator('#'+id).isChecked())throw Error('Toggle off failed');
    await page.locator('#'+id).check();
  }
  // Compare structure, not colors, for both new page styles.
  result.surfaces=[];
  await page.locator('[data-reader-tool-tab=style]').click();
  for(const surface of ['safari','forum']){
    await page.locator(`[data-reader-surface=${surface}]`).click();
    await page.locator('#reader-scroll-area').evaluate(node=>node.scrollTop=0);
    await page.waitForTimeout(300);
    result.surfaces.push(await page.evaluate(()=>{const root=document.querySelector('#raccoon-reader-root');const p=root.querySelector('.reader-content>.reader-paragraph-pair:not([data-heading=true])');const css=getComputedStyle(p);return {surface:root.dataset.surface,padding:css.padding,border:css.borderTopWidth,radius:css.borderRadius,titleAlignment:getComputedStyle(root.querySelector('.reader-title')).textAlign};}));
    await page.screenshot({path:`output/playwright/reader-${surface}-final.png`});
  }
  if(result.surfaces[0].radius===result.surfaces[1].radius||result.surfaces[0].titleAlignment===result.surfaces[1].titleAlignment)throw Error('Surface structures are identical');
  await page.locator('[data-reader-surface=card]').click();
  await page.locator('[data-reader-tool-tab=info]').click();
  await page.locator('#reader-share-screenshot').click();
  await page.mouse.move(450,300);await page.mouse.down();await page.mouse.move(1150,670,{steps:10});await page.mouse.up();
  await page.locator('#raccoon-reader-share .preview img').waitFor({state:'visible'});
  await page.waitForTimeout(300);
  const before=await page.locator('#raccoon-reader-share .preview img').getAttribute('src');
  await page.locator('#raccoon-reader-share [data-color="#e3eee7"]').click();
  await page.waitForTimeout(300);
  if(before===await page.locator('#raccoon-reader-share .preview img').getAttribute('src'))throw Error('Share background did not regenerate');
  const download=page.waitForEvent('download');
  await page.locator('#raccoon-reader-share .download').click();
  await (await download).saveAs('output/playwright/share-selection-final.png');
  await page.screenshot({path:'output/playwright/share-selection-preview.png'});
  await page.keyboard.press('Escape');
  if(await page.locator('#raccoon-reader-share').count())throw Error('Share did not close');
  if(!await page.locator('#raccoon-reader-root').count())throw Error('Closing share also closed reader');
  result.share={nativeCapture:true,rectangle:{x:450,y:300,width:700,height:370},background:'mint',pngSaved:true};
  return result;
}
