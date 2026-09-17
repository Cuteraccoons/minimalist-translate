async page=>{
 const worker=page.context().serviceWorkers()[0];
 const test=await page.context().newPage();
 try{
  await worker.evaluate(async()=>{await chrome.storage.sync.remove('localDictionaryEnabled');await chrome.storage.local.set({jijianLocalDictionaryMeta:{dictionaries:[{name:'Migration fixture',source:'file',enabled:true}]}});});
  await test.goto(worker.url().replace('background.js','popup.html'));
  await test.waitForFunction(()=>document.querySelector('#toggle-local-dict-enabled')?.checked);
  await test.locator('label:has(#toggle-local-dict-enabled)').click();
  await test.waitForFunction(async()=>!(await chrome.storage.sync.get('localDictionaryEnabled')).localDictionaryEnabled);
  if(await test.locator('#popup-local-dict-options').isVisible())throw Error('Disabled dictionary options are visible');
  await test.reload();await test.waitForSelector('label:has(#toggle-local-dict-enabled)');
  if(await test.locator('#toggle-local-dict-enabled').isChecked())throw Error('Explicit opt-out was overwritten by migration');
  await test.locator('label:has(#toggle-local-dict-enabled)').click();
  if(!await test.locator('#btn-open-local-dict').isVisible())throw Error('Missing configuration entry');
  await test.locator('label:has(#toggle-local-dict-priority)').click();
  await test.waitForFunction(async()=>{const s=await chrome.storage.sync.get(['localDictionaryEnabled','localDictionaryPriority']);return s.localDictionaryEnabled&&s.localDictionaryPriority;});
  return {existingDictionaryMigrated:true,optOutPersisted:true,configurationVisible:true,independentPriority:true};
 }finally{await worker.evaluate(()=>chrome.storage.local.remove('jijianLocalDictionaryMeta'));await test.close();}
}
