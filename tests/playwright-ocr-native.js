async page => {
  const worker=page.context().serviceWorkers().find(w=>w.url().endsWith("/background.js"));
  if(!worker)throw new Error("Load the unpacked extension in a persistent browser first");
  await page.goto(worker.url().replace("background.js","welcome.html"));
  return await page.evaluate(async () => {
    const canvas=document.createElement("canvas");canvas.width=1200;canvas.height=220;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#f7f2e8";ctx.fillRect(0,0,1200,220);
    ctx.fillStyle="#17191c";ctx.font="700 54px Arial";ctx.fillText("HELLO",52,128);ctx.fillText("SECOND CARD",800,128);
    const dataUrl=canvas.toDataURL("image/png");
    const iframe=document.createElement("iframe");iframe.src=chrome.runtime.getURL("ocr-sandbox.html");iframe.hidden=true;document.body.appendChild(iframe);
    const id=`ocr-audit-${Date.now()}`;const progress=[],models=[];
    return await new Promise((resolve,reject) => {
      const timeout=setTimeout(()=>{cleanup();reject(new Error(`OCR 浏览器实测超时；最近状态：${progress.slice(-4).join(" / ")}`));},120000);
      const cleanup=()=>{clearTimeout(timeout);window.removeEventListener("message",onMessage);iframe.remove();};
      const onMessage=event=>{
        const msg=event.data;if(!msg||msg.source!=="jijian-ocr-sandbox")return;
        if(msg.type==="ready"){iframe.contentWindow.postMessage({source:"jijian-translate",type:"recognize",id,dataUrl,langs:["eng"]},"*");return;}
        if(msg.id!==id)return;
        if(msg.type==='model-request'){
          chrome.runtime.sendMessage({action:'GET_OCR_MODEL',language:msg.language},response=>{
            models.push({language:msg.language,cached:response?.cached});
            iframe.contentWindow.postMessage({source:'jijian-translate',type:'model-response',requestId:msg.requestId,...response},'*');
          });return;
        }
        if(msg.type==="progress")progress.push(`${msg.status}:${Math.round(Number(msg.progress||0)*100)}`);
        if(msg.type==="error"){cleanup();reject(new Error(msg.error||"OCR 失败"));}
        if(msg.type==="result"){
          const result={
            text:String(msg.text||"").trim(),
            lines:Array.isArray(msg.lines)?msg.lines.length:0,
            alignments:Array.isArray(msg.lines)?msg.lines.map(line=>line.alignment):[],
            preprocessing:Array.isArray(msg.preprocessing)?msg.preprocessing:[],
            models,progress:progress.slice(-8)
          };
          cleanup();
          if(!/HELLO/i.test(result.text)||!/SECOND/i.test(result.text)||result.lines<2||!result.alignments.includes("left")||!result.alignments.includes("right")||!result.preprocessing.length)reject(new Error(`OCR 跨栏分区或对齐信息不完整：${JSON.stringify(result)}`));
          else resolve(result);
        }
      };
      window.addEventListener("message",onMessage);
    });
  });
}
