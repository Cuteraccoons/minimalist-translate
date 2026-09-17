/* Data-only models. Cache under the extension origin, not an opaque sandbox
   origin; this lets the sandbox work offline after the first download. */
(() => {
  const languages=new Set('eng chi_sim chi_tra jpn kor fra deu spa ita por rus nld pol tur ukr ara vie tha ind'.split(' '));
  const sources=[
    'https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_best_int',
    'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0_best_int',
    'https://tessdata.projectnaptha.com/4.0.0'
  ];
  const pending=new Map();
  const MAX_BYTES=25*1024*1024;
  function encode(bytes){let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);}
  globalThis.loadJijianOcrModel=async language=>{
    if(!languages.has(language))throw new Error('不支持此 OCR 语言');
    if(pending.has(language))return pending.get(language);
    const task=(async()=>{
      const cache=await caches.open('jijian-ocr-models-v1').catch(()=>null);
      const key=`${sources[0]}/${language}.traineddata.gz`;
      const cached=await cache?.match(key).catch(()=>null);
      if(cached){
        const bytes=new Uint8Array(await cached.arrayBuffer());
        if(bytes.length<=MAX_BYTES&&bytes[0]===31&&bytes[1]===139)return {data:encode(bytes),cached:true};
        await cache.delete(key);
      }
      let lastError;
      for(const source of sources){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
        try{
          const response=await fetch(`${source}/${language}.traineddata.gz`,{signal:controller.signal,credentials:'omit'});
          if(!response.ok)throw new Error(`HTTP ${response.status}`);
          if(Number(response.headers.get('content-length'))>MAX_BYTES)throw new Error('模型文件过大');
          const reader=response.body.getReader(),chunks=[];let size=0;
          while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BYTES){await reader.cancel();throw new Error('模型文件过大');}chunks.push(value);}
          const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
          if(bytes[0]!==31||bytes[1]!==139)throw new Error('下载内容不是有效的语言模型');
          try{await cache?.put(key,new Response(bytes,{headers:{'Content-Type':'application/gzip'}}));}catch(_){/* A full disk must not prevent this recognition. */}
          return {data:encode(bytes),cached:false};
        }catch(error){lastError=error;}finally{clearTimeout(timer);}
      }
      throw new Error(`语言模型下载失败（${language}），已尝试三个下载源；请检查网络后重试。${lastError?.name==='AbortError'?'下载超时。':''}`);
    })();
    pending.set(language,task);try{return await task;}finally{pending.delete(language);}
  };
})();
