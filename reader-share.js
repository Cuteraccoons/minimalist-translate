/* Local screenshot cards: browser capture, canvas composition and offline QR. */
(() => {
  if (globalThis.JijianReaderShare) return;
  const uiFont = '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Kaku Gothic ProN","Microsoft YaHei",sans-serif';
  const decodeImage = async src => { const image = new Image(); image.src = src; await image.decode(); return image; };
  const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const capture = () => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({action:'CAPTURE_READER_SHARE'}, response => {
      const error = chrome.runtime.lastError;
      if (error || !response?.success) reject(new Error(error?.message || response?.error || '截图失败，请重试'));
      else resolve(response.image);
    });
  });
  async function compose({image, rect, viewport, title, url, color, showTitle=true, showLink=true, showQR=true, signature=''}) {
    const shot=await decodeImage(image);
    const density=shot.naturalWidth/viewport.width;
    let width=Math.max(420,rect.width+64);const padding=32;
    const qr=showQR ? qrcode(0,'M') : null;
    if(qr){qr.addData(new URL(url).href);qr.make();}
    const count=qr?.getModuleCount()||0, cell=Math.max(2,Math.ceil(100/(count+8))),qrSize=qr?(count+8)*cell:0;
    width=Math.max(width,qrSize+64+((showTitle||showLink||signature.trim())?200:0));
    const hasFooter=showTitle||showLink||showQR||signature.trim();
    const footer=hasFooter ? Math.max(showQR?qrSize+56:0,(showTitle?66:0)+(signature.trim()?44:0)+(showLink?24:0)+40) : 0;
    const canvas=document.createElement('canvas');canvas.width=Math.round(width*density);canvas.height=Math.round((rect.height+padding*2+footer)*density);
    const ctx=canvas.getContext('2d');ctx.scale(density,density);
    const gradients={dawn:['#f5ded8','#f8eee0','#e8e4f0'],sky:['#dce8f2','#eee8f4','#faf5ef'],sand:['#efe4d5','#f8f1e8','#e7e8dc']};
    if(gradients[color]){const gradient=ctx.createLinearGradient(0,0,width,canvas.height/density);gradients[color].forEach((c,i)=>gradient.addColorStop(i/2,c));ctx.fillStyle=gradient;}
    else ctx.fillStyle=color||'#f5f3ee';
    ctx.fillRect(0,0,width,canvas.height/density);
    const x=(width-rect.width)/2;
    ctx.save();ctx.beginPath();ctx.roundRect(x,padding,rect.width,rect.height,12);ctx.clip();
    ctx.drawImage(shot,rect.x*density,rect.y*(shot.naturalHeight/viewport.height),rect.width*density,rect.height*(shot.naturalHeight/viewport.height),x,padding,rect.width,rect.height);ctx.restore();
    if(!hasFooter)return canvas;
    const qx=width-padding-qrSize,qy=rect.height+padding+28;
    if(qr){ctx.fillStyle='#fff';ctx.fillRect(qx,qy,qrSize,qrSize);ctx.fillStyle='#252a30';for(let r=0;r<count;r++)for(let c=0;c<count;c++)if(qr.isDark(r,c))ctx.fillRect(qx+(c+4)*cell,qy+(r+4)*cell,cell,cell);}
    const maxWidth=width-padding*2-(qrSize?qrSize+22:0);
    const drawLines=(text,y,size,maxLines)=>{
      ctx.font=`${size===20?600:400} ${size}px ${uiFont}`;let line='',lines=[];
      for(const char of Array.from(text)){if(ctx.measureText(line+char).width>maxWidth&&line){lines.push(line);line=char;}else line+=char;}
      if(line)lines.push(line);
      if(lines.length>maxLines){lines=lines.slice(0,maxLines);let last=lines[maxLines-1];while(last.length&&ctx.measureText(last+'…').width>maxWidth)last=last.slice(0,-1);lines[maxLines-1]=last+'…';}
      lines.forEach((value,i)=>ctx.fillText(value,padding,y+i*(size+9)));return y+lines.length*(size+9);
    };
    ctx.fillStyle='#272c33';let y=qy+24;
    if(showTitle)y=drawLines(title,y,20,2)+8;
    ctx.fillStyle='#626974';if(signature.trim())y=drawLines(signature.trim(),y,14,2)+6;
    if(showLink)drawLines(new URL(url).hostname,y,13,1);
    return canvas;
  }
  function attach(root, {title,url}) {
    const trigger=root.querySelector('#reader-share-screenshot');
    if(!trigger)return;
    let host, shadow, busy=false, artifact, objectUrl, originFocus, crop, noteCallback, updateQueued=false;
    const close = () => {
      host?.remove();host=null;shadow=null;artifact=null;
      if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;
      window.removeEventListener('keydown',keydown,true);
      window.removeEventListener('resize',resized);
      originFocus?.focus?.({preventScroll:true});
    };
    const keydown = event => {
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}
      if(event.key==='Tab' && shadow){
        const buttons=[...shadow.querySelectorAll('button,input')].filter(button=>!button.disabled&&button.checkVisibility());
        if(!buttons.length)return;
        event.preventDefault();const index=buttons.indexOf(shadow.activeElement);
        buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();
      }
    };
    const resized=()=>{if(host&&!busy)close();};
    const status = message => { const node=shadow?.querySelector('.status'); if(node)node.textContent=message; const hint=shadow?.querySelector('.hint'); if(hint)hint.textContent=message; };
    const preview = async () => {
      const color=shadow.querySelector('[data-color][aria-pressed="true"]')?.dataset.color || '#eee9df';
      const canvas=await compose({...artifact,title,url,color,
        showTitle:shadow.querySelector('[data-option="title"]').checked,
        showLink:shadow.querySelector('[data-option="link"]').checked,
        showQR:shadow.querySelector('[data-option="qr"]').checked,
        signature:shadow.querySelector('[data-signature]').value});
      if(!host)return;
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!blob)throw new Error('图片生成失败');
      if(objectUrl)URL.revokeObjectURL(objectUrl);
      objectUrl=URL.createObjectURL(blob);
      const img=shadow.querySelector('.preview img');img.src=objectUrl;
      shadow.querySelector('.preview').hidden=false;
      shadow.querySelector('.toolbar').hidden=true;
      shadow.querySelector('.hint').hidden=true;
      shadow.querySelector('.box').hidden=true;
      shadow.querySelector('.panel').focus();
      status(`原始像素 PNG · ${canvas.width} × ${canvas.height}`);
    };
    const updatePreview=async()=>{
      updateQueued=true;if(busy)return;busy=true;
      try{while(updateQueued&&host&&artifact){updateQueued=false;await preview();}}catch(error){status(error.message);}finally{busy=false;}
    };
    const take = async rect => {
      if(busy||!host)return;
      if(rect.width<80||rect.height<60){status('选区太小，请重新框选');return;}
      busy=true;const currentHost=host;
      const viewport={width:innerWidth,height:innerHeight};
      try {
        currentHost.style.visibility='hidden';
        await frame();await frame();
        if(host!==currentHost)return;
        const image=await capture();
        if(host!==currentHost)return;
        if(innerWidth!==viewport.width||innerHeight!==viewport.height)throw new Error('窗口大小已变化，请重新截图');
        artifact={image,rect,viewport};
        if(noteCallback){
          const shot=await decodeImage(image),canvas=document.createElement('canvas'),scale=shot.naturalWidth/viewport.width;
          canvas.width=Math.round(rect.width*scale);canvas.height=Math.round(rect.height*scale);
          canvas.getContext('2d').drawImage(shot,rect.x*scale,rect.y*scale,rect.width*scale,rect.height*scale,0,0,canvas.width,canvas.height);
          await noteCallback({image:canvas.toDataURL('image/png'),rect});close();
        } else await preview();
      } catch(error){status(error.message || '生成失败，请重试');}
      finally {if(host===currentHost)host.style.visibility='visible';busy=false;}
    };
    const start=(callback=null)=>{
      if(busy)return;
      close();noteCallback=typeof callback==="function"?callback:null;originFocus=document.activeElement;
      host=document.createElement('div');host.id='raccoon-reader-share';
      host.style.cssText='all:initial;position:fixed;inset:0;z-index:2147483647;display:block';
      shadow=host.attachShadow({mode:'open'});
      shadow.innerHTML=`<style>
        :host{font-family:${uiFont};color:#25312c}*{box-sizing:border-box;font-family:inherit}button{font:500 14px/1.3 ${uiFont};border:1px solid #d8ddd8;border-radius:9px;padding:10px 15px;background:#fff;color:#25312c;cursor:pointer}button:hover{background:#f3f5f2}button:focus-visible{outline:2px solid #64748b;outline-offset:3px}[hidden]{display:none!important}.selection{position:fixed;inset:0;cursor:crosshair;overflow:hidden;background:rgba(18,25,20,.12)}.toolbar{position:absolute;top:20px;left:50%;transform:translateX(-50%);width:max-content;max-width:95vw;padding:12px 16px;background:#fff;border:1px solid #dde1da;border-radius:14px;box-shadow:0 8px 40px #18261a24;display:flex;align-items:center;gap:14px;cursor:default;font-size:14px}.box{position:absolute;border:1px solid #000;background:transparent;box-shadow:0 0 0 5000px #18261a44;pointer-events:none}.preview{position:fixed;inset:0;background:#20242b88;display:grid;place-items:center;padding:24px;cursor:default}.panel{width:min(820px,100%);max-height:94vh;overflow:auto;background:#fafbf9;border-radius:18px;padding:22px;outline:none}.heading{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;font-size:18px;font-weight:600}.options{display:flex;gap:14px;flex-wrap:wrap;margin-top:16px;font-size:14px}.options label{display:flex;align-items:center;gap:6px}.options input[type=checkbox]{accent-color:#292e35;width:16px;height:16px}.options input[type=text]{border:1px solid #d8ddd8;border-radius:7px;padding:9px;font-size:14px;min-width:180px}.preview img{display:block;max-width:100%;max-height:65vh;margin:auto;object-fit:contain;border-radius:10px}.actions{display:flex;align-items:center;flex-wrap:wrap;gap:9px;margin-top:18px}.actions .download{margin-left:auto;background:#292e35;color:white;border-color:#292e35}.actions [data-color]{width:32px;height:32px;padding:0;background:var(--swatch)}.actions [aria-pressed=true]{outline:2px solid #292e35;outline-offset:2px}.status{font-size:13px;line-height:1.5;color:#68766b;margin:14px 0 0}.hint{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:9px 14px;background:#fff;border-radius:8px;font-size:14px;pointer-events:none}
      </style><div class="selection"><div class="box" hidden></div><div class="toolbar"><span>拖动框选要分享的内容</span><button data-visible>截取正文可见区</button><button data-close>取消</button></div><div class="preview" hidden><div class="panel" role="dialog" aria-modal="true" aria-label="截图分享" tabindex="-1"><div class="heading"><span>截图分享</span><button data-close>关闭</button></div><img alt="截图分享卡预览"><div class="options"><label><input type="checkbox" data-option="title" checked>标题</label><label><input type="checkbox" data-option="link" checked>链接</label><label><input type="checkbox" data-option="qr" checked>二维码</label><label>署名<input type="text" data-signature maxlength="80" placeholder="你的名字或一句话"></label></div><div class="actions"><button data-color="#eee9df" style="--swatch:#eee9df" aria-label="暖纸背景" aria-pressed="true"></button><button data-color="#e3eee7" style="--swatch:#e3eee7" aria-label="浅绿背景" aria-pressed="false"></button><button data-color="#e5eaf2" style="--swatch:#e5eaf2" aria-label="雾蓝背景" aria-pressed="false"></button><button data-color="dawn" style="--swatch:linear-gradient(135deg,#f5ded8,#f8eee0,#e8e4f0)" aria-label="晨光渐变" aria-pressed="false"></button><button data-color="sky" style="--swatch:linear-gradient(135deg,#dce8f2,#eee8f4,#faf5ef)" aria-label="云霞渐变" aria-pressed="false"></button><button data-color="sand" style="--swatch:linear-gradient(135deg,#efe4d5,#f8f1e8,#e7e8dc)" aria-label="沙丘渐变" aria-pressed="false"></button><button data-retry>重新截图</button><button class="download">保存图片</button></div><p class="status" aria-live="polite"></p></div></div><div class="hint">Esc 取消 · 仅截取当前可见页面</div></div>`;
      document.documentElement.append(host);
      window.addEventListener('keydown',keydown,true);window.addEventListener('resize',resized);
      shadow.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',close));
      shadow.querySelector('[data-retry]').addEventListener('click',()=>start(noteCallback));
      shadow.querySelectorAll('[data-option],[data-signature]').forEach(input=>input.addEventListener('change',()=>{if(artifact)void updatePreview();}));
      shadow.querySelector('[data-visible]').addEventListener('click',event=>{
        if(!event.isTrusted)return;
        const card=root.querySelector('.reader-scroll-card').getBoundingClientRect();
        const area=root.querySelector('.reader-scroll-area').getBoundingClientRect();
        const x=Math.max(0,card.left,area.left),y=Math.max(0,card.top,area.top);
        take({x,y,width:Math.max(0,Math.min(innerWidth,card.right,area.right)-x),height:Math.max(0,Math.min(innerHeight,card.bottom,area.bottom)-y)});
      });
      shadow.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',async()=>{
        shadow.querySelectorAll('[data-color]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
        await updatePreview();
      }));
      shadow.querySelector('.download').addEventListener('click',()=>{
        if(!objectUrl)return;const link=document.createElement('a');link.href=objectUrl;link.download=`${title.replace(/[\\/:*?"<>|]/g,'-').slice(0,48)||'文章'}-分享.png`;link.click();status('图片已交给浏览器保存');
      });
      const selection=shadow.querySelector('.selection'),box=shadow.querySelector('.box');let startPoint;
      selection.addEventListener('wheel',event=>event.preventDefault(),{passive:false});
      selection.addEventListener('pointerdown',event=>{
        if(!event.isTrusted||busy||event.button!==0||event.target.closest('.toolbar,.preview'))return;
        startPoint={x:event.clientX,y:event.clientY};crop=null;selection.setPointerCapture(event.pointerId);box.hidden=false;
        Object.assign(box.style,{left:`${startPoint.x}px`,top:`${startPoint.y}px`,width:'0px',height:'0px'});
      });
      selection.addEventListener('pointermove',event=>{
        if(!startPoint)return;
        const x=Math.max(0,Math.min(innerWidth,event.clientX)),y=Math.max(0,Math.min(innerHeight,event.clientY));
        crop={x:Math.min(x,startPoint.x),y:Math.min(y,startPoint.y),width:Math.abs(x-startPoint.x),height:Math.abs(y-startPoint.y)};
        Object.assign(box.style,{left:`${crop.x}px`,top:`${crop.y}px`,width:`${crop.width}px`,height:`${crop.height}px`});
      });
      selection.addEventListener('pointerup',()=>{if(!startPoint)return;startPoint=null;if(crop)take(crop);});
      selection.addEventListener('pointercancel',()=>{startPoint=null;box.hidden=true;});
      shadow.querySelector('[data-visible]').focus();
    };
    trigger.addEventListener('click',event=>{if(event.isTrusted)start();});
    root.readerCaptureNote=callback=>start(callback);
    root.cleanupReaderShare=close;
  }
  globalThis.JijianReaderShare={attach,compose};
})();
