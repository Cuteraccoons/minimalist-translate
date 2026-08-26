async page => {
  await page.goto("http://127.0.0.1:8765/tests/fixtures/layout-matrix.html");
  return await page.evaluate(async () => {
    const canvas=document.createElement("canvas");canvas.width=1000;canvas.height=220;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#f7f2e8";ctx.fillRect(0,0,1000,220);
    ctx.fillStyle="#17191c";ctx.font="700 54px Arial";ctx.fillText("HELLO",52,128);ctx.fillText("SECOND CARD",610,128);
    const dataUrl=canvas.toDataURL("image/png");
    const iframe=document.createElement("iframe");iframe.src="/ocr-sandbox.html";iframe.hidden=true;document.body.appendChild(iframe);
    const id=`ocr-audit-${Date.now()}`;const progress=[];
    return await new Promise((resolve,reject) => {
      const timeout=setTimeout(()=>{cleanup();reject(new Error(`OCR 浏览器实测超时；最近状态：${progress.slice(-4).join(" / ")}`));},120000);
      const cleanup=()=>{clearTimeout(timeout);window.removeEventListener("message",onMessage);iframe.remove();};
      const onMessage=event=>{
        const msg=event.data;if(!msg||msg.source!=="jijian-ocr-sandbox")return;
        if(msg.type==="ready"){iframe.contentWindow.postMessage({source:"jijian-translate",type:"recognize",id,dataUrl,langs:["eng"]},"*");return;}
        if(msg.id!==id)return;
        if(msg.type==="progress")progress.push(`${msg.status}:${Math.round(Number(msg.progress||0)*100)}`);
        if(msg.type==="error"){cleanup();reject(new Error(msg.error||"OCR 失败"));}
        if(msg.type==="result"){
          const result={text:String(msg.text||"").trim(),lines:Array.isArray(msg.lines)?msg.lines.length:0,progress:progress.slice(-8)};
          cleanup();
          if(!/HELLO/i.test(result.text)||!/SECOND/i.test(result.text)||result.lines<2)reject(new Error(`OCR 跨栏分区不完整：${JSON.stringify(result)}`));
          else resolve(result);
        }
      };
      window.addEventListener("message",onMessage);
    });
  });
}
