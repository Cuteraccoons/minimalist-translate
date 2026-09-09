/* Article-local annotations. Text anchors survive reopening and preserve inline markup. */
(() => {
  if(globalThis.JijianReaderNotes)return;
  const esc=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const trash='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg>';
  const request=message=>new Promise((resolve,reject)=>chrome.runtime.sendMessage(message,response=>{const error=chrome.runtime.lastError;if(error||!response?.success)reject(new Error(error?.message||response?.error||'笔记操作失败'));else resolve(response);}));
  function attach(root,{title,url}){
    const panel=root.querySelector('#reader-notes-panel');if(!panel)return;
    const canonical=new URL(url);canonical.hash='';
    const key=`readerNotes:${canonical.href}`,blocks=()=>[...root.querySelectorAll('.reader-orig-p,.reader-trans-p')];
    let items=[],closed=false,writeQueue=Promise.resolve(),editor;
    panel.innerHTML='<div class="reader-notes-heading"><b>文章笔记</b><span data-note-count>0</span></div><button type="button" data-note-capture>截图笔记</button><p class="reader-notes-status" role="status">选中文字即可高亮或添加笔记；双击高亮可编辑。</p><div class="reader-notes-list"></div><div class="reader-notes-export"><span>导出 PDF</span><button type="button" data-note-print="notes">仅笔记</button><button type="button" data-note-print="article">文章与旁注</button></div>';
    const status=message=>{panel.querySelector('.reader-notes-status').textContent=message;};
    const persist=()=>{
      const snapshot=structuredClone(items);
      writeQueue=writeQueue.catch(()=>{}).then(async()=>{try{await request({action:'SAVE_READER_NOTES',items:snapshot,title});if(!closed)status('已保存在本机');}catch(error){if(!closed)status('保存失败：'+error.message);throw error;}});
      return writeQueue;
    };
    const blockFor=anchor=>{
      const all=blocks(),candidate=all[anchor.block];
      if(candidate&&(!anchor.blockText||candidate.textContent===anchor.blockText||candidate.textContent.includes(anchor.quote)))return candidate;
      return all.find(node=>anchor.blockText&&node.textContent===anchor.blockText)||all.find(node=>anchor.quote&&node.textContent.includes(anchor.quote));
    };
    const rangeFor=(node,start,end)=>{
      const walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);let offset=0,first,last,current;
      while(current=walker.nextNode()){const len=current.length;if(!first&&start>=offset&&start<offset+len)first=[current,start-offset];if(end>offset&&end<=offset+len){last=[current,end-offset];break;}offset+=len;}
      if(!first||!last)return null;const range=document.createRange();range.setStart(...first);range.setEnd(...last);return range;
    };
    const clearMarks=id=>root.querySelectorAll(`[data-reader-note-id="${CSS.escape(id)}"]`).forEach(mark=>{if(mark.tagName==='MARK'){const parent=mark.parentNode;mark.replaceWith(...mark.childNodes);parent?.normalize();}else mark.remove();});
    const paint=item=>{
      clearMarks(item.id);
      (item.anchors||[]).forEach(anchor=>{
        const block=blockFor(anchor);if(!block)return;
        if(item.image)return;
        let start=anchor.start,end=anchor.end;
        if(block.textContent.slice(start,end)!==anchor.quote){start=block.textContent.indexOf(anchor.quote);end=start+anchor.quote.length;}
        if(start<0)return;const range=rangeFor(block,start,end);if(!range)return;
        const walker=document.createTreeWalker(block,NodeFilter.SHOW_TEXT);const nodes=[];let n;while(n=walker.nextNode())if(range.intersectsNode(n))nodes.push(n);
        nodes.reverse().forEach(node=>{let a=node===range.startContainer?range.startOffset:0,b=node===range.endContainer?range.endOffset:node.length;if(b<=a)return;const piece=document.createRange();piece.setStart(node,a);piece.setEnd(node,b);const mark=document.createElement('mark');mark.className='minimal-text-highlight reader-note-highlight';mark.dataset.highlightId=item.id;mark.dataset.readerNoteId=item.id;mark.title=item.note||'双击添加笔记';piece.surroundContents(mark);});
      });
    };
    const render=()=>{
      panel.querySelector('[data-note-count]').textContent=items.length;
      const list=panel.querySelector('.reader-notes-list');list.replaceChildren();
      if(!items.length){const empty=document.createElement('p');empty.className='reader-notes-empty';empty.textContent='把想留下的句子和想法，放在这里。';list.append(empty);}
      items.forEach((item,index)=>{
        const card=document.createElement('article');card.className='reader-note-card';card.innerHTML=`<div class="reader-note-card-head"><span>${String(index+1).padStart(2,'0')} · ${item.image?'截图':'高亮'}</span><button type="button" data-delete aria-label="删除笔记">${trash}</button></div><button type="button" class="reader-note-quote">${item.image?`<img src="${esc(item.image)}" alt="截图笔记">`:esc(item.quote)}</button><p>${esc(item.note||'还没有笔记')}</p><button type="button" data-edit>${item.note?'编辑笔记':'添加笔记'}</button>`;
        card.querySelector('[data-delete]').addEventListener('click',()=>remove(item.id));
        card.querySelector('[data-edit]').addEventListener('click',()=>edit(item));
        card.querySelector('.reader-note-quote').addEventListener('click',()=>{const target=root.querySelector(`[data-reader-note-id="${CSS.escape(item.id)}"]`)||blockFor(item.anchors?.[0]||{});if(target){target.closest('details')?.setAttribute('open','');target.scrollIntoView({block:'center',behavior:'smooth'});}else status('原文已变化，未找到对应位置；笔记仍已保留。');});list.append(card);
      });
    };
    const remove=async id=>{const previous=items;items=items.filter(item=>item.id!==id);try{await persist();clearMarks(id);render();}catch{items=previous;}};
    const closeEditor=()=>{editor?.remove();editor=null;};
    const edit=item=>{
      closeEditor();
      editor=document.createElement('div');editor.className='reader-note-editor';editor.setAttribute('role','dialog');editor.setAttribute('aria-label','编辑笔记');editor.innerHTML=`<div class="reader-note-editor-source">${item.image?`<img src="${esc(item.image)}" alt="截图笔记">`:`<blockquote>${esc(item.quote)}</blockquote>`}</div><label>笔记<textarea rows="5" maxlength="20000" placeholder="记下你的想法…">${esc(item.note)}</textarea></label><div><button type="button" data-cancel>取消</button><button type="button" data-save>保存笔记</button></div>`;root.append(editor);const anchor=root.querySelector(`[data-reader-note-id="${CSS.escape(item.id)}"]`)||blockFor(item.anchors?.[0]||{});const rect=anchor?.getBoundingClientRect();editor.style.setProperty('--note-left',`${Math.max(16,Math.min(rect?.left||innerWidth/2-180,innerWidth-376))}px`);editor.style.setProperty('--note-top',`${Math.max(16,Math.min(rect?.bottom+8||innerHeight/2-120,innerHeight-290))}px`);editor.querySelector('textarea').focus();
      editor.addEventListener('keydown',event=>{if(event.key==='Escape'){event.stopPropagation();closeEditor();}if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();editor.querySelector('[data-save]').click();}});
      editor.querySelector('[data-cancel]').addEventListener('click',closeEditor);
      editor.querySelector('[data-save]').addEventListener('click',async()=>{const previous=item.note;item.note=editor.querySelector('textarea').value;try{await persist();paint(item);render();closeEditor();}catch{item.note=previous;if(editor)editor.querySelector('[data-save]').textContent='保存失败，重试';}});
    };
    const addText=async(range,text,openEditor=false)=>{
      const anchors=[];blocks().forEach((block,index)=>{
        if(!range.intersectsNode(block))return;
        const partial=document.createRange();partial.selectNodeContents(block);
        if(block.contains(range.startContainer))partial.setStart(range.startContainer,range.startOffset);
        if(block.contains(range.endContainer))partial.setEnd(range.endContainer,range.endOffset);
        const quote=partial.toString();if(!quote.trim())return;
        const prefix=document.createRange();prefix.selectNodeContents(block);prefix.setEnd(partial.startContainer,partial.startOffset);
        const start=prefix.toString().length;anchors.push({block:index,blockText:block.textContent,quote,start,end:start+quote.length});
      });
      if(!anchors.length)return;
      const existing=items.find(item=>!item.image&&JSON.stringify(item.anchors)===JSON.stringify(anchors));if(existing){if(openEditor)edit(existing);return;}
      const item={id:crypto.randomUUID(),quote:text,anchors,note:'',created:new Date().toISOString()};items.push(item);
      try{await persist();paint(item);render();if(openEditor)edit(item);}catch{items=items.filter(other=>other!==item);}
    };
    panel.querySelector('[data-note-capture]').addEventListener('click',event=>{if(!event.isTrusted)return;root.readerCaptureNote?.(async({image,rect})=>{
      const all=blocks(),block=all.find(node=>{const r=node.getBoundingClientRect();return r.bottom>=rect.y&&r.top<=rect.y+rect.height&&r.right>=rect.x&&r.left<=rect.x+rect.width;});
      const br=block?.getBoundingClientRect();
      const item={id:crypto.randomUUID(),quote:'截图笔记',note:'',image,region:br?{x:rect.x-br.left,y:rect.y-br.top,width:rect.width,height:rect.height,sourceWidth:br.width}:null,anchors:block?[{block:all.indexOf(block),blockText:block.textContent}]:[],created:new Date().toISOString()};items.push(item);
      try{await persist();paint(item);render();setTimeout(()=>edit(item),0);}catch(error){items=items.filter(other=>other!==item);throw error;}
    });});
    const printNotes=async mode=>{
      if(!items.length){status('先添加一条高亮或笔记');return;}
      const noteHtml=item=>`<aside class="note">${item.image?`<img src="${esc(item.image)}">`:`<blockquote>${esc(item.quote)}</blockquote>`}<p>${esc(item.note)}</p></aside>`;
      let body='';
      if(mode==='notes')body=items.map(noteHtml).join('');
      else {
        const placed=new Set();
        const article=root.querySelector('#reader-content');
        body=[...article.children].map(original=>{const node=original.cloneNode(true);node.querySelectorAll('button,script,style,.reader-image-note-marker,.reader-capture-note-region').forEach(child=>child.remove());node.querySelectorAll('details').forEach(child=>child.open=true);if(node.tagName==='DETAILS')node.open=true;const notes=items.filter(item=>(item.anchors||[]).some(anchor=>{const block=blockFor(anchor);return block&&original.contains(block);}));notes.forEach(item=>placed.add(item.id));return `<section class="row"><div class="article">${node.outerHTML}</div><div>${notes.map(noteHtml).join('')}</div></section>`;}).join('');
        body+=items.filter(item=>!placed.has(item.id)).map(noteHtml).join('');
      }
      const iframe=document.createElement('iframe');iframe.className='reader-notes-print-frame';iframe.style.cssText='position:fixed;width:1px;height:1px;left:-10000px;border:0';
      iframe.srcdoc=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)} · 笔记</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font:14px/1.7 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#20242a}h1{font-size:24px}a{color:inherit;word-break:break-all}img{max-width:100%;height:auto}p{white-space:pre-wrap}.row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:24px;border-top:1px solid #e4e5e7;padding:16px 0}.note{break-inside:avoid;margin:0 0 16px;padding:12px;border:1px solid #dedfe2;border-radius:8px}.note blockquote{margin:0 0 10px;padding-left:10px;border-left:3px solid #eed273}.article{min-width:0}.article table{max-width:100%;font-size:13px;border-collapse:collapse}.article td,.article th{border:1px solid #ddd;padding:4px}.article .reader-trans-p:not([data-loaded="true"]){display:none}mark{background:#f6df87;color:inherit}.reader-chart{display:none}.reader-table-heading{display:flex;gap:8px;align-items:center}button,svg{display:none}</style></head><body><h1>${esc(title)}</h1><p>${esc(canonical.href)}</p>${body}</body></html>`;
      iframe.onload=async()=>{await Promise.all([...iframe.contentDocument.images].map(img=>img.decode().catch(()=>{})));iframe.contentWindow.focus();iframe.contentWindow.print();};document.body.append(iframe);iframe.contentWindow?.addEventListener('afterprint',()=>iframe.remove(),{once:true});
      status('已打开打印窗口，可选择“另存为 PDF”');
    };
    panel.querySelectorAll('[data-note-print]').forEach(button=>button.addEventListener('click',()=>printNotes(button.dataset.notePrint)));
    const doubleClick=event=>{const mark=event.target.closest?.('[data-reader-note-id]');if(!mark)return;const item=items.find(item=>item.id===mark.dataset.readerNoteId);if(item){event.preventDefault();event.stopPropagation();edit(item);}};
    root.addEventListener('dblclick',doubleClick);
    root.readerNotes={addText,removeRange:range=>{const ids=new Set([...root.querySelectorAll('[data-reader-note-id]')].filter(mark=>range.intersectsNode(mark)).map(mark=>mark.dataset.readerNoteId));ids.forEach(remove);},print:printNotes};
    const translationObserver=new MutationObserver(()=>{items.filter(item=>!root.querySelector(`[data-reader-note-id="${CSS.escape(item.id)}"]`)).forEach(paint);});
    translationObserver.observe(root.querySelector('#reader-content'),{subtree:true,attributes:true,attributeFilter:['data-loaded']});
    root.cleanupReaderNotes=()=>{translationObserver.disconnect();closed=true;closeEditor();root.removeEventListener('dblclick',doubleClick);};
    (async()=>{try{const data=await request({action:'GET_READER_NOTES'});if(closed)return;items=Array.isArray(data.items)?data.items:[];
      if(data.items===null){const legacy=(data.legacy||[]).filter(item=>{try{const u=new URL(item.sourceUrl);u.hash='';return u.href===canonical.href;}catch{return false;}});legacy.forEach(item=>{const index=blocks().findIndex(node=>node.textContent.includes(item.orig));if(index>=0){const block=blocks()[index],start=block.textContent.indexOf(item.orig);items.push({id:item.id||crypto.randomUUID(),quote:item.orig,note:'',anchors:[{block:index,blockText:block.textContent,quote:item.orig,start,end:start+item.orig.length}]});}});}
      items.forEach(paint);render();
    }catch{status('笔记读取失败，请重新加载扩展后刷新页面。');}})();
  }
  globalThis.JijianReaderNotes={attach};
})();
