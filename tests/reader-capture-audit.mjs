import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8');
const start=source.indexOf('  if (action === "CAPTURE_READER_SHARE")');
const end=source.indexOf('  if (action === "OPEN_OPTIONS_PAGE")',start);
const branch=source.slice(start,end);
async function exercise(sender,ids){
  let captures=0,index=0;
  const result=await new Promise(resolve=>{
    const context={sender,action:'CAPTURE_READER_SHARE',sendResponse:resolve,chrome:{tabs:{query:async()=>[{id:ids[Math.min(index++,ids.length-1)]}],captureVisibleTab:async()=>{captures++;return 'data:image/png;base64,known';}}}};
    vm.runInNewContext(`(function(){${branch}})()`,context);
  });
  return {result,captures};
}
assert.equal((await exercise({},[1])).captures,0);
assert.equal((await exercise({tab:{id:1,windowId:1},frameId:1},[1])).captures,0);
assert.equal((await exercise({tab:{id:1,windowId:1},frameId:0},[2])).captures,0);
assert.equal((await exercise({tab:{id:1,windowId:1},frameId:0},[1,2])).result.success,false);
assert.equal((await exercise({tab:{id:1,windowId:1},frameId:0},[1,1])).result.success,true);
console.log('PASS capture sender, frame, active-tab and tab-switch checks');
