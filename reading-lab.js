(() => {
  const sites=[
  [
    "百科与图文",
    "日本（英文）",
    "https://en.wikipedia.org/wiki/Japan",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "百科与图文",
    "咖啡（英文）",
    "https://en.wikipedia.org/wiki/Coffee",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "百科与图文",
    "人工智能（英文）",
    "https://en.wikipedia.org/wiki/Artificial_intelligence",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "百科与图文",
    "人类学（中文）",
    "https://zh.wikipedia.org/wiki/人类学",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "百科与图文",
    "民俗学（日文）",
    "https://ja.wikipedia.org/wiki/民俗学",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "百科与图文",
    "巴黎（法文）",
    "https://fr.wikipedia.org/wiki/Paris",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "百科与图文",
    "柏林（德文）",
    "https://de.wikipedia.org/wiki/Berlin",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "NASA 月球",
    "https://science.nasa.gov/moon/facts/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "NASA 太阳",
    "https://science.nasa.gov/sun/facts/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "NASA 从月球了解地球",
    "https://science.nasa.gov/solar-system/moon/10-things-what-we-learn-about-earth-by-studying-the-moon/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "MDN JavaScript 入门",
    "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "MDN CSS 网格",
    "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "MDN Fetch",
    "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "React 快速入门",
    "https://react.dev/learn",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "React 共享状态",
    "https://react.dev/learn/sharing-state-between-components",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Python 数据结构",
    "https://docs.python.org/3/tutorial/datastructures.html",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Rust 所有权",
    "https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Effective Go",
    "https://go.dev/doc/effective_go",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Kubernetes 概述",
    "https://kubernetes.io/docs/concepts/overview/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Docker 简介",
    "https://docs.docker.com/get-started/docker-overview/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Requests 快速入门",
    "https://requests.readthedocs.io/en/latest/user/quickstart/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Django 教程",
    "https://docs.djangoproject.com/en/5.2/intro/tutorial01/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "VS Code 项目说明",
    "https://github.com/microsoft/vscode",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Discourse 欢迎帖",
    "https://meta.discourse.org/t/welcome-to-meta-discourse-org/1",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Stack Overflow 数组排序",
    "https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Hacker News Dropbox",
    "https://news.ycombinator.com/item?id=8863",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "文档与讨论",
    "Reddit 阅读泰勒",
    "https://www.reddit.com/r/AskAnthropology/comments/gys71o/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "京都旅行指南",
    "https://en.wikivoyage.org/wiki/Kyoto",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "长篇书籍",
    "原始文化",
    "https://www.gutenberg.org/files/70458/70458-h/70458-h.htm",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "长篇书籍",
    "傲慢与偏见",
    "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "长篇书籍",
    "爱丽丝梦游仙境",
    "https://www.gutenberg.org/files/11/11-h/11-h.htm",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "长篇书籍",
    "我是猫",
    "https://www.aozora.gr.jp/cards/000148/files/789_14547.html",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "长篇书籍",
    "维基文库原始文化",
    "https://en.wikisource.org/wiki/Primitive_Culture/Chapter_1",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "长篇书籍",
    "共产党宣言",
    "https://www.marxists.org/archive/marx/works/1848/communist-manifesto/ch01.htm",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "学术与社会科学",
    "SEP Culture",
    "https://plato.stanford.edu/entries/culture/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "学术与社会科学",
    "SEP Culture and Cognitive Science",
    "https://plato.stanford.edu/entries/culture-cogsci/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "学术与社会科学",
    "Attention Is All You Need",
    "https://arxiv.org/abs/1706.03762",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "学术与社会科学",
    "PubMed 摘要",
    "https://pubmed.ncbi.nlm.nih.gov/32939066/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "学术与社会科学",
    "Nature AlphaFold",
    "https://www.nature.com/articles/s41586-021-03819-2",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "少数派 笔记管理",
    "https://sspai.com/post/80781",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "少数派 阅读入门",
    "https://sspai.com/post/68331",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "博客园 CSS Grid",
    "https://www.cnblogs.com/adiynil/p/22570706",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "阮一峰 CSS Grid",
    "https://www.ruanyifeng.com/blog/2019/03/grid-layout-tutorial.html",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "Paul Graham How to Do Great Work",
    "https://paulgraham.com/greatwork.html",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "Martin Fowler Refactoring",
    "https://martinfowler.com/articles/refactoring-2nd-ed.html",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "Mozilla JavaScript 30 年",
    "https://developer.mozilla.org/en-US/blog/javascript-30/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "freeCodeCamp 学习 JavaScript",
    "https://www.freecodecamp.org/news/learn-javascript-full-course/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "Smashing CSS Grid",
    "https://www.smashingmagazine.com/2017/06/building-production-ready-css-grid-layout/",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "AP 月球新陨石坑",
    "https://apnews.com/article/80eea242ad275fda1f7a88587cdccd2f",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "日常阅读",
    "BBC 旅行专题",
    "https://www.bbc.com/travel",
    "检查正文完整性、大纲定位、代码与配图。"
  ],
  [
    "学术与社会科学",
    "《德意志意识形态》第一章",
    "https://www.marxists.org/archive/marx/works/1845/german-ideology/ch01.htm",
    "保留的历史测试页；本轮未测试。"
  ]
];
  sites.push(['百科与图文','百度百科 · 人类学','https://baike.baidu.com/item/人类学','本轮自动浏览器未取得正文，请在本机检查。']);
  const order=['百科与图文','日常阅读','文档与讨论','长篇书籍','学术与社会科学'];
  sites.sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0]));
  const automaticResults={"https://en.wikipedia.org/wiki/Japan": "结构检查通过", "https://en.wikipedia.org/wiki/Coffee": "结构检查通过", "https://en.wikipedia.org/wiki/Artificial_intelligence": "结构检查通过", "https://zh.wikipedia.org/wiki/人类学": "结构检查通过", "https://ja.wikipedia.org/wiki/民俗学": "结构检查通过", "https://fr.wikipedia.org/wiki/Paris": "结构检查通过", "https://de.wikipedia.org/wiki/Berlin": "结构检查通过", "https://science.nasa.gov/moon/facts/": "结构检查通过", "https://science.nasa.gov/sun/facts/": "结构检查通过", "https://science.nasa.gov/solar-system/moon/10-things-what-we-learn-about-earth-by-studying-the-moon/": "结构检查通过", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction": "结构检查通过", "https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout": "结构检查通过", "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch": "结构检查通过", "https://react.dev/learn": "结构检查通过", "https://react.dev/learn/sharing-state-between-components": "结构检查通过", "https://docs.python.org/3/tutorial/datastructures.html": "结构检查通过", "https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html": "结构检查通过", "https://go.dev/doc/effective_go": "结构检查通过", "https://kubernetes.io/docs/concepts/overview/": "结构检查通过", "https://docs.docker.com/get-started/docker-overview/": "结构检查通过", "https://requests.readthedocs.io/en/latest/user/quickstart/": "结构检查通过", "https://docs.djangoproject.com/en/5.2/intro/tutorial01/": "结构检查通过", "https://github.com/microsoft/vscode": "结构检查通过", "https://meta.discourse.org/t/welcome-to-meta-discourse-org/1": "无法访问正文", "https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array": "无法访问正文", "https://news.ycombinator.com/item?id=8863": "结构检查通过", "https://www.reddit.com/r/AskAnthropology/comments/gys71o/": "无法访问正文", "https://en.wikivoyage.org/wiki/Kyoto": "结构检查通过", "https://www.gutenberg.org/files/70458/70458-h/70458-h.htm": "结构检查通过", "https://www.gutenberg.org/files/1342/1342-h/1342-h.htm": "结构检查通过", "https://www.gutenberg.org/files/11/11-h/11-h.htm": "结构检查通过", "https://www.aozora.gr.jp/cards/000148/files/789_14547.html": "结构检查通过", "https://en.wikisource.org/wiki/Primitive_Culture/Chapter_1": "结构检查通过", "https://www.marxists.org/archive/marx/works/1848/communist-manifesto/ch01.htm": "结构检查通过", "https://plato.stanford.edu/entries/culture/": "结构检查通过", "https://plato.stanford.edu/entries/culture-cogsci/": "结构检查通过", "https://arxiv.org/abs/1706.03762": "结构检查通过", "https://pubmed.ncbi.nlm.nih.gov/32939066/": "无法访问正文", "https://www.nature.com/articles/s41586-021-03819-2": "结构检查通过", "https://sspai.com/post/80781": "结构检查通过", "https://sspai.com/post/68331": "结构检查通过", "https://www.cnblogs.com/adiynil/p/22570706": "结构检查通过", "https://www.ruanyifeng.com/blog/2019/03/grid-layout-tutorial.html": "结构检查通过", "https://paulgraham.com/greatwork.html": "结构检查通过", "https://martinfowler.com/articles/refactoring-2nd-ed.html": "结构检查通过", "https://developer.mozilla.org/en-US/blog/javascript-30/": "无法访问正文", "https://www.freecodecamp.org/news/learn-javascript-full-course/": "待人工复查", "https://www.smashingmagazine.com/2017/06/building-production-ready-css-grid-layout/": "结构检查通过", "https://apnews.com/article/80eea242ad275fda1f7a88587cdccd2f": "无法访问正文", "https://www.bbc.com/travel": "结构检查通过"};
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
        const detail=el('details');detail.append(el('summary','备注'),el('p',hint),note);card.append(el('small',new URL(url).hostname),el('h3',title),el('small',automaticResults[url]?'自动：'+automaticResults[url]:'待本机检查'),link,label,detail);grid.append(card);
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
