import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8');
const branch=source.slice(source.indexOf('  if (action === "GET_READER_NOTES"'),source.indexOf('  if (action === "CAPTURE_READER_SHARE"'));
async function exercise(action,sender,items){
 let write;
 const response=await new Promise(resolve=>vm.runInNewContext(`(function(){${branch}})()`,{URL,action,sender,request:{items,url:'https://other.example/private'},sendResponse:resolve,chrome:{storage:{local:{get:async()=>({raccoonHighlightSentences:[{sourceUrl:'https://example.com/article#one',orig:'own'},{sourceUrl:'https://other.example/private',orig:'other'}]}),set:async data=>{write=data;}}}}}));
 return {response,write};
}
const sender={tab:{id:1,url:'https://example.com/article'},url:'https://example.com/article#one',frameId:0};
assert.equal((await exercise('GET_READER_NOTES',{},[])).response.success,false);
assert.equal((await exercise('SAVE_READER_NOTES',{...sender,frameId:1},[])).response.success,false);
const read=await exercise('GET_READER_NOTES',sender);assert.equal(read.response.legacy.length,1);assert.equal(read.response.legacy[0].orig,'own');
const write=await exercise('SAVE_READER_NOTES',sender,[{id:'one',anchors:[],note:'text'}]);assert.equal(write.response.success,true);assert.deepEqual(Object.keys(write.write),['readerNotes:https://example.com/article']);
assert.equal((await exercise('SAVE_READER_NOTES',sender,[{id:'bad',anchors:[],image:'https://example.com/track'}])).response.success,false);
assert.equal((await exercise('SAVE_READER_NOTES',sender,Array(1001).fill({id:'one',anchors:[]}))).response.success,false);
console.log('PASS notes sender, article isolation, legacy scope, image validation and size limit');
