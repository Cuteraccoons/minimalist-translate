(() => {
  const sites=[
    ['长篇书籍','《原始文化》卷一','https://www.gutenberg.org/files/70458/70458-h/70458-h.htm','完整章节、页码、长段落和脚注。'],
    ['长篇书籍','《傲慢与偏见》','https://www.gutenberg.org/files/1342/1342-h/1342-h.htm','整本小说：章节目录、连续阅读和插图。'],
    ['长篇书籍','《原始文化》第一章','https://en.wikisource.org/wiki/Primitive_Culture/Chapter_1','维基文库：页码、脚注，以及与整本书页面的区别。'],
    ['长篇书籍','《我是猫》','https://www.aozora.gr.jp/cards/000148/files/789_14547.html','青空文库：日文长篇、注音与用换行组织的段落。'],
    ['学术与社会科学','《共产党宣言》第一章','https://www.marxists.org/archive/marx/works/1848/communist-manifesto/ch01.htm','旧式网页：段落、引用、脚注和两侧留白。'],
    ['学术与社会科学','《德意志意识形态》第一章','https://www.marxists.org/archive/marx/works/1845/german-ideology/ch01.htm','长篇社会科学文本：多层标题与连续段落。'],
    ['学术与社会科学','Culture','https://plato.stanford.edu/entries/culture/','斯坦福哲学百科：多层大纲、引文与参考文献。'],
    ['学术与社会科学','Culture and Cognitive Science','https://plato.stanford.edu/entries/culture-cogsci/','长篇学术文章：大纲定位、列表和参考文献。'],
    ['百科与图文','Japan','https://en.wikipedia.org/wiki/Japan','资料卡、地图、小图标、表格与杂志双栏。'],
    ['百科与图文','民俗学','https://ja.wikipedia.org/wiki/民俗学','日文百科：语言字体、编辑标记与图文混排。'],
    ['文档与讨论','JavaScript Introduction','https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction','MDN：代码块、列表与正文提取边界。'],
    ['文档与讨论','Should I read E. B. Tylor?','https://www.reddit.com/r/AskAnthropology/comments/gys71o/','Reddit：主帖和层级回复；可能要求登录或限制访问。']
  ];
  // Familiar everyday pages come first; keep existing book records available below.
  sites.push(
    ['日常阅读','NASA · 太阳','https://science.nasa.gov/sun/facts/','科普 · 图文与小标题'],
    ['日常阅读','京都旅行指南','https://en.wikivoyage.org/wiki/Kyoto','旅行 · 地图与地点列表'],
    ['文档与讨论','Visual Studio Code','https://github.com/microsoft/vscode','项目说明 · 列表与图片']
  );
  const order=['百科与图文','日常阅读','文档与讨论','长篇书籍','学术与社会科学'];
  sites.sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
  const key='readingLabResults';let records={};
  const storage=globalThis.chrome?.storage?.local;
  const read=async()=>{try{return storage?(await storage.get(key))[key]||{}:JSON.parse(localStorage.getItem(key)||'{}');}catch{return {};}};
  const save=async()=>{try{if(storage)await storage.set({[key]:records});else localStorage.setItem(key,JSON.stringify(records));}catch{document.querySelector('#lab-message').textContent='记录保存失败，请及时导出检查记录。';}};
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  function render(){
    const host=document.querySelector('#lab-groups');host.replaceChildren();const filter=document.querySelector('#lab-filter').value;
    for(const group of [...new Set(sites.map(site=>site[0]))]){
      const matching=sites.filter(site=>site[0]===group&&(filter==='all'||(records[site[2]]?.status||'pending')===filter));if(!matching.length)continue;
      const extra=['长篇书籍','学术与社会科学'].includes(group);const section=el(extra?'details':'section'),grid=el('div');grid.className='lab-grid';section.append(el(extra?'summary':'h2',group),grid);if(extra&&filter!=='all')section.open=true;host.append(section);
      matching.forEach(([category,title,url,hint])=>{
        const record=records[url]||{status:'pending',note:''},card=el('article');card.className='lab-card';card.dataset.status=record.status;
        const link=el('a','打开文章 ↗');link.href=url;link.target='_blank';link.rel='noopener noreferrer';
        const label=el('label','检查结果'),select=el('select');[['pending','尚未检查'],['ok','正常'],['issue','有问题']].forEach(([value,text])=>{const option=el('option',text);option.value=value;select.append(option);});select.value=record.status;label.append(select);
        const note=el('textarea');note.placeholder='记录遇到的问题…';note.setAttribute('aria-label',`${title}的检查备注`);note.value=record.note||'';
        const update=()=>{records[url]={status:select.value,note:note.value,updated:new Date().toISOString()};card.dataset.status=select.value;void save();updateCount();};select.addEventListener('change',()=>{update();if(document.querySelector('#lab-filter').value!=='all')render();});note.addEventListener('input',update);
        const detail=el('details');detail.append(el('summary','备注'),el('p',hint),note);card.append(el('small',new URL(url).hostname),el('h3',title),link,label,detail);grid.append(card);
      });
    }updateCount();
  }
  function updateCount(){const count=sites.filter(site=>records[site[2]]?.status&&records[site[2]].status!=='pending').length;document.querySelector('#lab-count').textContent=`已检查 ${count} / ${sites.length}`;}
  document.querySelector('#lab-filter').addEventListener('change',render);
  document.querySelector('#export-results').addEventListener('click',()=>{
    const report=['# 极简翻译 · 阅读检查记录',`导出时间：${new Date().toLocaleString()}`,...sites.map(([group,title,url])=>{const r=records[url]||{};return `## ${title}\n类型：${group}\n网址：${url}\n结果：${{ok:'正常',issue:'有问题',pending:'尚未检查'}[r.status]||'尚未检查'}\n备注：${r.note||'—'}\n检查时间：${r.updated||'—'}`;})].join('\n\n');
    const url=URL.createObjectURL(new Blob([report],{type:'text/markdown;charset=utf-8'})),a=el('a');a.href=url;a.download=`阅读检查-${new Date().toISOString().slice(0,10)}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  read().then(data=>{records=data;render();});
})();
