/* Shared collection filtering; unknown historical dates remain visible unless
   the user explicitly narrows the time range. */
(() => {
  const timestamp=item=>{const raw=item.createdAt||item.created||item.date;const value=typeof raw==='number'?raw:Date.parse(raw||'');return Number.isFinite(value)?value:null;};
  const website=item=>{try{return new URL(item.sourceUrl||item.url||'').hostname;}catch{return '';}};
  function filter(items,{from='',until='',site='',sort='newest'}={}){
    const start=from?Date.parse(from):null,end=until?Date.parse(until)+59999:null;
    return items.filter(item=>{
      const time=timestamp(item);
      if(site&&(website(item)||'unknown')!==site)return false;
      if((from||until)&&time===null)return false;
      return (!from||time>=start)&&(!until||time<=end);
    }).sort((a,b)=>sort==='name'?String(a.word||a.orig||'').localeCompare(String(b.word||b.orig||'')):(timestamp(a)===timestamp(b)?0:timestamp(a)===null?1:timestamp(b)===null?-1:(timestamp(a)-timestamp(b))*(sort==='oldest'?1:-1)));
  }
  globalThis.JijianCollectionFilters={timestamp,website,filter};
})();
