/*
 * JiJian MDict Lite Reader
 * Local MDX/MDD exact-key reader for browser extensions.
 * Parsing logic follows the public MDict format documentation and the MIT-licensed
 * fengdh/mdict-js project by Feng Dihai (2015):
 * https://github.com/amikey/mdict-js
 * This file is intentionally limited to local exact lookup and resource access.
 */
(function (root) {
  "use strict";

  const UNDEFINED = void 0;
  const STRIP = {
    mdx: /[()., '/\\@_-]()/g,
    mdd: /([.][^.]*$)|[()., '/\\@_-]/g
  };

  function getExt(name, fallback) {
    const m = /(?:\.([^.]+))?$/.exec(name || "");
    return (m && m[1] ? m[1] : fallback || "mdx").toLowerCase();
  }
  function isTrue(v) {
    v = String(v || "").toLowerCase();
    return v === "yes" || v === "true";
  }
  function u32concat(a, b) {
    const out = new a.constructor(a.length + b.length);
    out.set(a); out.set(b, a.length); return out;
  }
  function rol(x, n) { return (x >>> (32 - n)) | (x << n); }

  // RIPEMD-128, adapted from the MIT-licensed helper shipped with fengdh/mdict-js.
  const RIPEMD_S = [
    [11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8],
    [7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12],
    [11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5],
    [11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12],
    [8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6],
    [9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11],
    [9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5],
    [15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8]
  ].map(x => new Uint32Array(x));
  const RIPEMD_R = [
    [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],
    [7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8],
    [3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12],
    [1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2],
    [5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12],
    [6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2],
    [15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13],
    [8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14]
  ].map(x => new Uint32Array(x));
  const RIPEMD_K = new Uint32Array([0,1518500249,1859775393,2400959708,1352829926,1548603684,1836072691,0]);
  const RIPEMD_F = [
    (x,y,z) => x ^ y ^ z,
    (x,y,z) => (x & y) | (~x & z),
    (x,y,z) => (x | ~y) ^ z,
    (x,y,z) => (x & z) | (y & ~z)
  ];
  function ripemd128(input) {
    let bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const origLen = bytes.length;
    const pad = new Uint8Array((origLen % 64 < 56 ? 56 : 120) - (origLen % 64));
    pad[0] = 0x80;
    const padded = u32concat(bytes, pad);
    const bitLen = origLen * 8;
    const finalBytes = new Uint8Array(padded.length + 8);
    finalBytes.set(padded);
    // little-endian 64-bit length, practical browser dictionaries are far below 2^32 bits here.
    new DataView(finalBytes.buffer).setUint32(finalBytes.length - 8, bitLen >>> 0, true);
    new DataView(finalBytes.buffer).setUint32(finalBytes.length - 4, Math.floor(bitLen / 0x100000000), true);
    const words = new Uint32Array(finalBytes.buffer);
    const h = new Uint32Array([1732584193,4023233417,2562383102,271733878]);
    for (let off = 0; off < words.length; off += 16) {
      let a=h[0], b=h[1], c=h[2], d=h[3];
      let aa=a, bb=b, cc=c, dd=d;
      for (let j=0;j<64;j++) {
        const phase=(j/16)|0;
        const t=rol((a + RIPEMD_F[phase](b,c,d) + words[off + RIPEMD_R[phase][j%16]] + RIPEMD_K[phase])|0, RIPEMD_S[phase][j%16]);
        a=d; d=c; c=b; b=t;
      }
      for (let j=64;j<128;j++) {
        const phase=(j/16)|0;
        const rev=((63-(j%64))/16)|0;
        const t=rol((aa + RIPEMD_F[rev](bb,cc,dd) + words[off + RIPEMD_R[phase][j%16]] + RIPEMD_K[phase])|0, RIPEMD_S[phase][j%16]);
        aa=dd; dd=cc; cc=bb; bb=t;
      }
      const t=(h[1]+c+dd)|0;
      h[1]=(h[2]+d+aa)|0;
      h[2]=(h[3]+a+bb)|0;
      h[3]=(h[0]+b+cc)|0;
      h[0]=t;
    }
    return new Uint8Array(h.buffer);
  }

  function decryptIndex(data, key) {
    key = ripemd128(key);
    const out = new Uint8Array(data.length);
    let prev = 0x36;
    for (let i=0;i<data.length;i++) {
      const src=data[i];
      let b=((src >> 4) | (src << 4)) & 0xff;
      b = b ^ prev ^ (i & 0xff) ^ key[i % key.length];
      prev = src;
      out[i]=b;
    }
    return out;
  }

  // LZO1X decompressor, adapted from the MIT-licensed minilzo helper in fengdh/mdict-js.
  function lzoDecompress(input, expectedSize) {
    const src = input instanceof Uint8Array ? input : new Uint8Array(input);
    let cap = Math.max(expectedSize || 0, 4096);
    let out = new Uint8Array(cap);
    let op=0, ip=0, t=src[ip++], m=0, state=0, copied=false;
    function need(n){ if(op+n<=out.length) return; let size=out.length; while(size<op+n) size=Math.max(size*2, size+8192); const nout=new Uint8Array(size); nout.set(out); out=nout; }
    function lit(n){ need(n); while(n-->0) out[op++]=src[ip++]; }
    function match(n){ need(n); while(n-->0) out[op++]=out[m++]; }
    if (t>17) { t-=17; if(t<4) state=5; else { lit(t); state=1; } }
    main: for(;;) {
      copied=false;
      switch(state) {
        case 0:
          t=src[ip++];
          if(t>=16){ state=2; continue; }
          if(t===0){ while(src[ip]===0){t+=255;ip++;} t+=15+src[ip++]; }
          t+=3; lit(t);
        case 1:
          t=src[ip++];
          if(t>=16){ state=2; continue main; }
          m=op-2049-(t>>2)-(src[ip++]<<2); need(3); out[op++]=out[m++]; out[op++]=out[m++]; out[op++]=out[m]; state=4; continue main;
        case 2:
          if(t>=64){ m=op-1-((t>>2)&7)-(src[ip++]<<3); t=(t>>5)-1; state=3; continue main; }
          if(t<32){
            if(t<16){ m=op-1-(t>>2)-(src[ip++]<<2); need(2); out[op++]=out[m++]; out[op++]=out[m]; state=4; continue main; }
            m=op-((t&8)<<11); t&=7;
            if(t===0){ while(src[ip]===0){t+=255;ip++;} t+=7+src[ip++]; }
            m-=(src[ip]+(src[ip+1]<<8))>>2; ip+=2;
            if(m===op) break main;
            m-=16384;
          } else {
            t&=31;
            if(t===0){ while(src[ip]===0){t+=255;ip++;} t+=31+src[ip++]; }
            m=op-1-((src[ip]+(src[ip+1]<<8))>>2); ip+=2;
          }
          if(t>=6 && op-m>=4){ copied=true; t+=2; match(t); }
        case 3:
          if(!copied){ t+=2; match(t); }
        case 4:
          t=src[ip-2]&3;
          if(t===0){ state=0; continue main; }
        case 5:
          lit(Math.min(t,3));
          t=src[ip++]; state=2; continue main;
      }
    }
    return out.subarray(0,op);
  }

  function decodeXmlEntities(value) {
    return String(value || "")
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
      .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
      .replace(/&quot;/g,'"').replace(/&apos;/g,"'")
      .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  }
  function parseAttrs(header) {
    const attrs={};
    // attributes are XML-escaped only in values; DOMParser is not available in MV3 workers.
    const tagMatch=header.match(/<(?:Dictionary|Library_Data)\b([^>]*)>/i);
    const body=tagMatch ? tagMatch[1] : header;
    const re=/([\w:-]+)\s*=\s*(["'])(.*?)\2/g;
    let m;
    while((m=re.exec(body))) attrs[m[1]]=decodeXmlEntities(m[3]);
    attrs.Encrypted=parseInt(attrs.Encrypted,10)||0;
    return attrs;
  }
  // Compact MDX records may use backtick style tokens rather than literal HTML.
  // Header StyleSheet stores triples: token number, opening markup, closing markup.
  function parseStyleSheet(source) {
    const raw=decodeXmlEntities(source || "");
    if(!raw.trim())return [];
    const styles=Array.from({length:256},()=>["",""]);
    const lines=raw.replace(/\r/g,"").split("\n");
    let any=false;
    for(let i=0;i<lines.length;){
      const tokenLine=String(lines[i++]||"").trim();
      if(!tokenLine)continue;
      const token=parseInt(tokenLine,10);
      if(!Number.isInteger(token)||token<0||token>255)continue;
      if(i>=lines.length)break; const prefix=decodeXmlEntities(lines[i++]||"");
      if(i>=lines.length)break; const suffix=decodeXmlEntities(lines[i++]||"");
      styles[token]=[prefix,suffix]; any=true;
    }
    return any?styles:[];
  }
  function expandCompactStyleSheet(source, styles) {
    if(!styles || !styles.length || !String(source||"").includes("`"))return String(source||"");
    const input=String(source||""); let out="", pos=0;
    while(pos<input.length){
      const start=input.indexOf("`",pos);
      if(start<0){out+=input.slice(pos);break;}
      out+=input.slice(pos,start);
      const close=input.indexOf("`",start+1);
      if(close<0){out+=input.slice(start);break;}
      const tokenText=input.slice(start+1,close);
      if(!/^\d{1,3}$/.test(tokenText)){out+="`";pos=start+1;continue;}
      const token=Number(tokenText); const style=styles[token];
      if(!style){out+=input.slice(start,close+1);pos=close+1;continue;}
      const contentStart=close+1; const next=input.indexOf("`",contentStart);
      const contentEnd=next<0?input.length:next;
      out+=style[0]+input.slice(contentStart,contentEnd)+style[1];
      pos=contentEnd;
    }
    return out;
  }
  function normalizeEncoding(enc) {
    const e=String(enc||'UTF-16').toLowerCase().replace(/_/g,'-');
    if(e==='utf-16'||e==='utf16'||e==='utf-16le') return 'utf-16le';
    if(e==='utf-8'||e==='utf8') return 'utf-8';
    if(e==='gbk'||e==='gb2312'||e==='gb18030') return 'gb18030';
    if(e==='big5'||e==='big-5') return 'big5';
    return e;
  }

  class Scanner {
    constructor(buf, config, len) {
      this.buf=buf instanceof ArrayBuffer ? buf : buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength);
      this.dv=new DataView(this.buf); this.pos=0; this.cfg=config; this.limit=len||this.buf.byteLength;
    }
    forward(n){this.pos+=n; return this.pos;}
    offset(){return this.pos;}
    readInt(){const v=this.dv.getUint32(this.pos,false);this.pos+=4;return v;}
    readU16(){const v=this.dv.getUint16(this.pos,false);this.pos+=2;return v;}
    readU8(){return this.dv.getUint8(this.pos++);}
    readNum(){ if(this.cfg.v2){this.pos+=4; return this.readInt();} return this.readInt(); }
    readShort(){return this.cfg.v2?this.readU16():this.readU8();}
    checksumV2(){if(this.cfg.v2)this.pos+=4;}
    readUTF16(n){const v=new TextDecoder('utf-16le').decode(new Uint8Array(this.buf,this.pos,n));this.pos+=n;return v;}
    textByteLength(){
      const start=this.pos;
      if(this.cfg.bpu===2){while(this.pos+1<this.limit && this.dv.getUint16(this.pos,false)!==0)this.pos+=2; const n=this.pos-start; this.pos=start; return n;}
      while(this.pos<this.limit&&this.dv.getUint8(this.pos)!==0)this.pos++; const n=this.pos-start;this.pos=start;return n;
    }
    readText(){const n=this.textByteLength();const s=this.cfg.decoder.decode(new Uint8Array(this.buf,this.pos,n));this.pos+=n+this.cfg.bpu;return s;}
    readTextSized(units){const n=units*this.cfg.bpu;const s=this.cfg.decoder.decode(new Uint8Array(this.buf,this.pos,n));this.pos+=n+(this.cfg.v2?this.cfg.bpu:0);return s;}
    readRaw(n){const size=n===UNDEFINED?this.limit-this.pos:n;const a=new Uint8Array(this.buf,this.pos,size);this.pos+=size;return new Uint8Array(a);}
    readBlock(totalLen, expected, decryptor){
      const compType=this.dv.getUint8(this.pos);
      if(compType===0){ if(this.cfg.v2)this.pos+=8; return this; }
      this.pos+=8; totalLen-=8;
      let data=new Uint8Array(this.buf,this.pos,totalLen);
      if(decryptor){const key=new Uint8Array(8);key.set(new Uint8Array(this.buf,this.pos-4,4));key.set([0x95,0x36,0,0],4);data=decryptor(data,key);}
      let unpacked;
      if(compType===2){ if(!root.pako||!root.pako.inflate)throw new Error('pako inflate unavailable'); unpacked=root.pako.inflate(data); }
      else if(compType===1){unpacked=lzoDecompress(data,expected);}
      else throw new Error('Unsupported MDict compression type: '+compType);
      this.pos+=totalLen;
      return new Scanner(unpacked.buffer.slice(unpacked.byteOffset,unpacked.byteOffset+unpacked.byteLength),this.cfg,unpacked.byteLength);
    }
  }

  class MDictLite {
    constructor(file, ext) {
      this.file=file; this.ext=(ext||getExt(file.name,'mdx')).toLowerCase();
      this.attrs={};this.cfg=null;this.keyIndex=[];this.keyBlockStart=0;this.recordBlocks=[];this.recordTotalDecomp=0;this.keyCache=new Map();this.description='';this.styleSheet=[];
    }
    async slice(offset,len){return await this.file.slice(offset,offset+len).arrayBuffer();}
    adapt(key){
      let s=String(key||''); const re=STRIP[this.ext]||STRIP.mdx;
      if(!isTrue(this.attrs.KeyCaseSensitive))s=s.toLowerCase();
      const strip=isTrue(this.attrs.StripKey || (this.cfg.v2?'':'yes'));
      return strip?s.replace(re,'$1'):s;
    }
    async init(){
      const first=await this.slice(0,4); const headerLen=new DataView(first).getUint32(0,false);
      const hb=await this.slice(4,headerLen); let header=new TextDecoder('utf-16le').decode(new Uint8Array(hb)).replace(/\0+$/,'');
      this.attrs=parseAttrs(header); this.description=this.attrs.Description||this.attrs.Title||this.file.name; this.styleSheet=this.ext==='mdx'?parseStyleSheet(this.attrs.StyleSheet||''):[];
      const v2=parseFloat(this.attrs.GeneratedByEngineVersion||'1')>=2;
      const enc=normalizeEncoding(this.attrs.Encoding||'UTF-16');
      this.cfg={v2,bpu:enc==='utf-16le'?2:1,decoder:new TextDecoder(enc)};
      let pos=4+headerLen+4;
      const sumMax=v2?44:28; const sumBuf=await this.slice(pos,sumMax); const ss=new Scanner(sumBuf,this.cfg);
      const summary={numBlocks:ss.readNum(),numEntries:ss.readNum(),keyIndexDecomp:v2?ss.readNum():0,keyIndexComp:ss.readNum(),keyBlocksLen:ss.readNum()}; ss.checksumV2(); summary.len=ss.offset();
      pos+=summary.len;
      const idxBuf=await this.slice(pos,summary.keyIndexComp); let sc=new Scanner(idxBuf,this.cfg);
      sc=sc.readBlock(summary.keyIndexComp,summary.keyIndexDecomp,(this.attrs.Encrypted&2)?decryptIndex:null);
      let offset=0; const arr=[];
      for(let i=0;i<summary.numBlocks;i++){
        const numEntries=sc.readNum(); let size=sc.readShort(); const firstWord=sc.readTextSized(size); size=sc.readShort(); const lastWord=sc.readTextSized(size); const compSize=sc.readNum(); const decompSize=sc.readNum();
        arr.push({numEntries,firstWord,lastWord,compSize,decompSize,offset,index:i});offset+=compSize;
      }
      this.keyIndex=arr; pos+=summary.keyIndexComp; this.keyBlockStart=pos; pos+=summary.keyBlocksLen;
      const recSumBuf=await this.slice(pos,v2?32:16); const rs=new Scanner(recSumBuf,this.cfg);
      const recSummary={numBlocks:rs.readNum(),numEntries:rs.readNum(),indexLen:rs.readNum(),blocksLen:rs.readNum(),len:rs.offset()};
      const recordBlockStart=pos+recSummary.len+recSummary.indexLen;
      const recIdxBuf=await this.slice(pos+recSummary.len,recSummary.indexLen); const ri=new Scanner(recIdxBuf,this.cfg);
      let compOff=recordBlockStart,decompOff=0; const blocks=[];
      for(let i=0;i<recSummary.numBlocks;i++) { const compSize=ri.readNum(),decompSize=ri.readNum();blocks.push({compOffset:compOff,decompOffset:decompOff,compSize,decompSize,index:i});compOff+=compSize;decompOff+=decompSize; }
      this.recordBlocks=blocks;this.recordTotalDecomp=decompOff;return this;
    }
    reduceIndex(phrase){
      if(!this.keyIndex.length)return null; let lo=0,hi=this.keyIndex.length-1;
      while(lo<hi){const mid=(lo+hi)>>1;if(phrase>this.adapt(this.keyIndex[mid].lastWord))lo=mid+1;else hi=mid;}
      return this.keyIndex[lo];
    }
    async loadKeys(kdx){
      if(this.keyCache.has(kdx.index))return this.keyCache.get(kdx.index);
      const ab=await this.slice(this.keyBlockStart+kdx.offset,kdx.compSize);let sc=new Scanner(ab,this.cfg);sc=sc.readBlock(kdx.compSize,kdx.decompSize,null);
      const list=[];
      for(let i=0;i<kdx.numEntries;i++){const off=sc.readNum();const text=sc.readText();list.push({text,offset:off});}
      this.keyCache.set(kdx.index,list); if(this.keyCache.size>4)this.keyCache.delete(this.keyCache.keys().next().value); return list;
    }
    async findKeyInfos(word){
      const phrase=this.adapt(word); const base=this.reduceIndex(phrase); if(!base)return [];
      // Real-world MDX indexes are not always perfectly ordered after the reader's
      // normalization rules (StripKey / punctuation / spaces). ODE_2024 is a good
      // example: the exact key “about” lives in the block immediately *before* the
      // binary-search result even though the key itself is present twice. Exact
      // lookup therefore scans a tiny ±2 block window. This remains an exact match,
      // not fuzzy/contains search, and fixes duplicate/boundary keys without making
      // normal lookup expensive.
      const indexes=[];
      for(const delta of [0,-1,1,-2,2]){
        const idx=base.index+delta;
        if(idx>=0&&idx<this.keyIndex.length&&!indexes.includes(idx))indexes.push(idx);
      }
      const found=[];
      for(const idx of indexes){const kdx=this.keyIndex[idx];const list=await this.loadKeys(kdx);for(let i=0;i<list.length;i++){if(this.adapt(list[i].text)===phrase)found.push({...list[i],blockIndex:kdx.index,itemIndex:i});}}
      // determine sizes for MDD/resource access.
      for(const f of found){const list=await this.loadKeys(this.keyIndex[f.blockIndex]);let next=list[f.itemIndex+1];if(!next&&f.blockIndex+1<this.keyIndex.length){const nl=await this.loadKeys(this.keyIndex[f.blockIndex+1]);next=nl[0];}f.size=(next?next.offset:this.recordTotalDecomp)-f.offset;}
      return found;
    }
    findRecordBlock(offset){
      let lo=0,hi=this.recordBlocks.length-1;while(lo<=hi){const mid=(lo+hi)>>1,b=this.recordBlocks[mid];if(offset<b.decompOffset)hi=mid-1;else if(offset>=b.decompOffset+b.decompSize)lo=mid+1;else return b;}return null;
    }
    async readRecord(info,binary=false){
      const total=Math.max(0,Number(info.size)||0);
      if(!total)return binary?new Uint8Array(0):'';
      let remain=total, absolute=info.offset;
      const chunks=[];
      while(remain>0){
        const b=this.findRecordBlock(absolute); if(!b)throw new Error('MDict record block not found');
        const ab=await this.slice(b.compOffset,b.compSize);let sc=new Scanner(ab,this.cfg);sc=sc.readBlock(b.compSize,b.decompSize,null);
        const inner=absolute-b.decompOffset; sc.forward(inner);
        const take=Math.min(remain,b.decompSize-inner); if(take<=0)break;
        chunks.push(sc.readRaw(take)); absolute+=take; remain-=take;
      }
      const raw=new Uint8Array(total-remain); let at=0; for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}
      if(binary)return raw;
      let txt=this.cfg.decoder.decode(raw); txt=txt.replace(/\0+$/,''); if(this.ext==='mdx'&&this.styleSheet.length)txt=expandCompactStyleSheet(txt,this.styleSheet); return txt;
    }
    async suggest(word, limit=8){
      const phrase=this.adapt(word); const base=this.reduceIndex(phrase); if(!base)return [];
      const out=[]; const indexes=[base.index]; if(base.index>0)indexes.unshift(base.index-1); if(base.index+1<this.keyIndex.length)indexes.push(base.index+1);
      for(const idx of indexes){const list=await this.loadKeys(this.keyIndex[idx]); for(const item of list){const a=this.adapt(item.text); if(a===phrase || a.startsWith(phrase)){out.push(item.text); if(out.length>=limit)return out;}}}
      return out;
    }
    async lookup(word,depth=0){
      const infos=await this.findKeyInfos(word); if(!infos.length)return [];
      const raws=[]; for(const info of infos) raws.push(await this.readRecord(info,false));
      // Some dictionaries contain duplicate exact keys where one record is a
      // legacy @@@LINK alias and another is the actual article. Prefer the direct
      // article; otherwise an exact lookup such as ODE_2024 “about” can incorrectly
      // redirect to the alias target even though the real “about” entry is present.
      const direct=raws.filter(txt=>!String(txt||'').trimStart().startsWith('@@@LINK='));
      if(direct.length)return direct;
      const vals=[]; for(const txt of raws){if(String(txt||'').trimStart().startsWith('@@@LINK=')&&depth<4){const target=String(txt||'').trim().slice(8).trim();const linked=await this.lookup(target,depth+1);vals.push(...linked);}else vals.push(txt);}return vals;
    }
    async resource(path){
      let key=String(path||'').replace(/^file:\/\//i,'').replace(/^\/+/, '').replace(/\//g,'\\');if(!key.startsWith('\\'))key='\\'+key;
      const infos=await this.findKeyInfos(key);if(!infos.length)return null;return await this.readRecord(infos[0],true);
    }
  }

  root.JiJianMDict={MDictLite, version:'0.3.0'};
})(typeof self!=="undefined"?self:this);
