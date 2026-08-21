/**
 * Local MDX integration smoke test.
 * Usage: node tests/ode-smoke.mjs /path/to/ODE_2024.mdx
 * The proprietary dictionary is never bundled with Jijian Translate.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const target=process.argv[2];
if(!target || !fs.existsSync(target)){console.error('Pass a local .mdx file path.');process.exit(2);}
globalThis.self=globalThis;
const pakoModule={exports:{}};
vm.runInNewContext(fs.readFileSync(path.join(root,'vendor/pako_inflate.min.js'),'utf8'),{module:pakoModule,exports:pakoModule.exports,require:(await import('node:module')).createRequire(import.meta.url),global:globalThis,self:globalThis,window:undefined,Uint8Array,Uint16Array,Int32Array,ArrayBuffer,String,Error,Object,Math});
globalThis.pako=pakoModule.exports;
vm.runInThisContext(fs.readFileSync(path.join(root,'vendor/mdict-lite.js'),'utf8'));
const buf=fs.readFileSync(target); const f=new File([buf],path.basename(target),{type:'application/octet-stream'});
const dict=new globalThis.JiJianMDict.MDictLite(f); await dict.init();
const words=['about','improve','understand'];
let failures=0;
for(const word of words){
  const rows=await dict.lookup(word);
  const first=String(rows[0]||'');
  const ok=rows.length>0 && !first.trimStart().startsWith('@@@LINK=');
  console.log(`${ok?'PASS':'FAIL'} ${word} (${rows.length}) ${first.slice(0,70).replace(/\s+/g,' ')}`);
  if(!ok) failures++;
}
if(failures) process.exit(1);
