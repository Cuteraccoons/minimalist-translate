(() => {
  const steps = [
    {key:'start', title:'欢迎使用极简翻译！', description:'下一页，读懂一个更大的世界。'},
    {key:'translate', title:'网页翻译', description:'点一下翻译胶囊，让译文出现在原文身旁。', action:'translate', button:'翻译这篇文章'},
    {key:'sidebar', title:'分栏对照', description:'两种语言，并排阅读。点击译文段落，回到对应原文。', action:'sidebar', button:'试试分栏对照'},
    {key:'reader', title:'沉浸阅读', description:'把页面里的干扰收起来，留下文章、大纲和配图。', action:'reader', button:'进入阅读模式'},
    {key:'notes', title:'高亮与笔记', description:'划选一句话，留下高亮，也写下自己的想法。', action:'reader', button:'进入文章做笔记'},
    {key:'lookup', title:'双击查词', description:'双击 curiosity，看看词义；点星标就能加入生词本。'},
    {key:'image', title:'图片也能翻译', description:'试试把这张英文卡片变成中文。'},
    {key:'extras', title:'更多功能', description:''}
  ];
  const q = selector => document.querySelector(selector);
  const dispatch = action => document.dispatchEvent(new CustomEvent('jijian-welcome-action', {detail:action}));
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const completed = new Set();
  let current = 0, moving = false, mountedArticle = '', observerFrame = 0;
  const article = q('#welcome-article');
  const make = (tag, text) => { const el=document.createElement(tag); if(text)el.textContent=text; return el; };

  function renderArticle(kind) {
    if(mountedArticle === kind) return;
    article.replaceChildren();
    const samples=globalThis.JijianGuideArticles;
    const rows=kind==='alice'?samples.alice:kind==='pride-short'?samples.pride.slice(0,6):samples.pride;
    const headings=new Set(['Down the Rabbit-Hole','Pride and Prejudice','Chapter I','Chapter II','Chapter III']);
    for(const [text] of rows) {
      if(['Reading Jane’s Letters','A new neighbour'].includes(text)) continue;
      article.append(make(headings.has(text)?'h2':'p',text));
      if(kind==='pride-full' && text==='Chapter I')addImage('welcome-pride.jpg','A new neighbour','guide-small-figure');
      if(kind==='pride-full' && text==='Chapter II')addImage('welcome-letters.jpg','Reading Jane’s Letters','guide-tall-figure');
    }
    article.dataset.title=kind==='alice'?'Alice’s Adventures in Wonderland':'Pride and Prejudice';
    mountedArticle=kind;
  }
  function addImage(file,caption,cls) {
    const figure=make('figure');figure.className=cls;
    const img=make('img');img.src=`assets/${file}`;img.alt=caption;
    figure.append(img,make('figcaption',caption));article.append(figure);
  }
  function setSource(index) {
    const source=q('#guide-source');source.replaceChildren();
    if(index<1||index>4)return;
    const alice=index===1;
    const link=make('a',alice?'Lewis Carroll · Alice’s Adventures in Wonderland':'Jane Austen · Pride and Prejudice');
    link.href=alice?'https://www.gutenberg.org/files/11/11-h/11-h.htm':'https://www.gutenberg.org/files/1342/1342-h/1342-h.htm';
    link.target='_blank';link.rel='noopener noreferrer';
    source.append(link,document.createTextNode(' · 公版节选'));
  }
  function celebrate() {
    if(completed.has(current)||current===0||current===7)return;
    completed.add(current);q('#guide-next').classList.add('is-ready');
    const status=q('#guide-complete');status.textContent='体验成功，下一步 →';status.hidden=false;
    q('#guide-pill-hint').hidden=true;
    if(reduced())return;
    const host=q('#guide-confetti');host.replaceChildren();
    for(let i=0;i<28;i++) {
      const dot=make('i');host.append(dot);
      const angle=(i/28)*Math.PI*2, distance=65+Math.random()*125;
      dot.style.background=['#e4b54b','#769985','#b98ba7','#7494b4'][i%4];
      dot.animate([{transform:'translate(0,0) rotate(0)',opacity:1},{transform:`translate(${Math.cos(angle)*distance}px,${Math.sin(angle)*distance}px) rotate(${i*47}deg)`,opacity:0}],{duration:850+Math.random()*350,easing:'cubic-bezier(.15,.7,.3,1)'}).finished.then(()=>dot.remove());
    }
  }
  function observeExperience() {
    cancelAnimationFrame(observerFrame);
    observerFrame=requestAnimationFrame(()=>{
      const key=steps[current].key;
      const reader=!!q('#raccoon-reader-root');
      q('#guide-reader-tip').hidden=!(key==='notes'&&reader);
      if(key==='translate'&&q('#welcome-article .raccoon-translated-block,#welcome-article .raccoon-translated-inline'))celebrate();
      if(key==='sidebar'&&q('.sidebar-item-trans')?.textContent.trim()&&!q('.sidebar-item-trans .loading')) {
        const text=q('.sidebar-item-trans').textContent;
        if(/[\u4e00-\u9fff]/.test(text)&&!text.includes('翻译中'))celebrate();
      }
      if(key==='reader'&&reader)celebrate();
      if(key==='image'&&q('#raccoon-image-translate-overlay.is-ready'))celebrate();
      positionPillHint();
    });
  }
  function positionPillHint() {
    const hint=q('#guide-pill-hint'),pill=q('#raccoon-pill-main');
    hint.hidden=steps[current].key!=='translate'||completed.has(current)||!pill;
    if(hint.hidden)return;
    const rect=pill.getBoundingClientRect();
    hint.style.left=`${Math.max(10,Math.min(innerWidth-110,rect.left+rect.width/2-66))}px`;
    hint.style.top=`${Math.max(90,rect.top-116)}px`;
  }
  function render(index, preserveReader=false) {
    current=index;const step=steps[index];
    document.body.dataset.guideStep=index;document.body.dataset.guideKey=step.key;
    q('#step-title').textContent=step.title;q('#step-description').textContent=step.description;q('#step-description').hidden=!step.description;
    q('#welcome-start').hidden=index!==0;q('#welcome-extras').hidden=index!==7;
    q('#guide-reading-layout').hidden=index<1||index>4;article.hidden=index<1||index>4;
    q('#guide-page-noise').hidden=index!==3;
    q('#guide-lookup').hidden=index!==5;q('#guide-image').hidden=index!==6;
    q('#demo-disclosure').hidden=index===0||index===7;
    q('#demo-disclosure').textContent=index===6?'图片经过真实本地 OCR 识别；示例译文内置。':index===5?'示例词义内置；日常查词无需配置本地词典。':'公版原文 · 内置示例译文';
    q('#guide-reader-tip').hidden=!(index===4&&preserveReader);
    if(index>=1&&index<=4)renderArticle(index===1?'alice':index===2?'pride-short':'pride-full');
    setSource(index);q('#step-actions').replaceChildren();
    if(step.action){const button=make('button',step.button);button.addEventListener('click',()=>dispatch(step.action));q('#step-actions').append(button);}
    q('#guide-prev').disabled=index===0;q('#guide-next').hidden=false;
    q('#guide-next').setAttribute('aria-label',index===7?'完成指南':'下一步');q('#guide-next').title=index===7?'完成指南':'下一步';
    q('#guide-progress').textContent=`${index+1} / ${steps.length}`;
    q('#guide-next').classList.toggle('is-ready',completed.has(index));
    q('#guide-complete').hidden=!completed.has(index);
    chrome.storage.local.set({welcomeProgress:index}).catch(()=>{});
    positionPillHint();
  }
  async function show(index, initial=false) {
    if(moving)return;moving=true;
    const direction=index>=current?1:-1;
    const preserveReader=[3,4].includes(current)&&[3,4].includes(index)&&!!q('#raccoon-reader-root');
    const stage=q('.welcome-stage');
    try {
      if(!initial&&!preserveReader&&!reduced())await stage.animate([{transform:'perspective(1400px) translateX(0) rotateY(0)'},{transform:`perspective(1400px) translateX(${-direction*90}px) rotateY(${direction*5}deg)`,opacity:0}],{duration:170,easing:'ease-in',fill:'none'}).finished;
      if(!preserveReader){dispatch('reset');mountedArticle='';window.scrollTo(0,0);}
      render(index,preserveReader);
      if(!initial&&!preserveReader&&!reduced())await stage.animate([{transform:`perspective(1400px) translateX(${direction*110}px) rotateY(${-direction*5}deg)`,opacity:.3},{transform:'perspective(1400px) translateX(0) rotateY(0)',opacity:1}],{duration:330,easing:'cubic-bezier(.18,.7,.25,1)'}).finished;
    } finally {moving=false;}
  }
  async function finish() {
    if(moving)return;
    dispatch('reset');render(7);q('#step-title').textContent='准备好了，开始阅读吧！';
    q('#guide-next').hidden=true;q('#guide-complete').hidden=true;
    await chrome.storage.local.set({welcomeCompleted:true,welcomeProgress:0});
  }
  function drawOcrSample() {
    const canvas=make('canvas');canvas.width=1200;canvas.height=640;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#f3eddf';ctx.fillRect(0,0,1200,640);
    ctx.fillStyle='#252823';ctx.font='700 94px Arial';ctx.fillText('READ MORE',90,210);ctx.fillText('WONDER MORE',90,325);
    ctx.font='36px Arial';ctx.fillText('A page can open a new world.',94,465);
    q('#guide-ocr-image').src=canvas.toDataURL('image/png');
  }
  q('#guide-prev').addEventListener('click',()=>show(Math.max(0,current-1)));
  q('#guide-next').addEventListener('click',()=>current===7?finish():show(current+1));
  q('#skip-guide').addEventListener('click',finish);
  q('.brand').addEventListener('click',event=>{event.preventDefault();show(0);});
  document.querySelectorAll('[data-settings]').forEach(button=>button.addEventListener('click',()=>chrome.runtime.sendMessage({action:'OPEN_OPTIONS_PAGE',tab:button.dataset.settings})));
  document.addEventListener('jijian-welcome-success',event=>{if(event.detail===steps[current].key)celebrate();});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&current===4&&Object.keys(changes).some(key=>key.startsWith('readerNotes:')||key==='raccoonHighlightSentences'))celebrate();});
  new MutationObserver(observeExperience).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  window.addEventListener('resize',positionPillHint);window.addEventListener('scroll',positionPillHint,{passive:true});
  drawOcrSample();
  chrome.storage.local.get('welcomeProgress').then(data=>show(Math.max(0,Math.min(7,Number(data.welcomeProgress)||0)),true));
})();
