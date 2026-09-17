# 1.0.3 阅读兼容检查 · 50 页

日期：2026-09-18。真实 Chromium 加载本地扩展，直接打开网络页面，检查正文抽样、图片、代码、标题、大纲点击与横向溢出。未截图，未调用翻译服务。

结构检查通过 43 页、无法访问正文 6 页、待人工复查 1 页。结构通过不等于视觉验收或全文完全一致；本轮共 44 页进入阅读器，其中包含 BBC 栏目聚合页。

修复：旧式表格布局及换行正文；Hacker News 回复；arXiv 摘要根容器和标题；Related projects/work 误截断；图片独占段落；引用内代码块；标题锚点和 CSS 文本污染。

重点抽查：原始文化、日本百科、阮一峰 Grid、Paul Graham、Nature。使用扩展设置中的“阅读测试台”打开页面并记录；保留 1 个此前的德意志意识形态页面，不计入本轮 50 页。

| # | 页面 | 类型 | 结果 | 说明 |
|---|---|---|---|---|
| 1 | [日本（英文）](https://en.wikipedia.org/wiki/Japan) | 百科 | 结构检查通过 | — |
| 2 | [咖啡（英文）](https://en.wikipedia.org/wiki/Coffee) | 百科 | 结构检查通过 | — |
| 3 | [人工智能（英文）](https://en.wikipedia.org/wiki/Artificial_intelligence) | 百科 | 结构检查通过 | — |
| 4 | [人类学（中文）](https://zh.wikipedia.org/wiki/人类学) | 百科 | 结构检查通过 | — |
| 5 | [民俗学（日文）](https://ja.wikipedia.org/wiki/民俗学) | 百科 | 结构检查通过 | — |
| 6 | [巴黎（法文）](https://fr.wikipedia.org/wiki/Paris) | 百科 | 结构检查通过 | — |
| 7 | [柏林（德文）](https://de.wikipedia.org/wiki/Berlin) | 百科 | 结构检查通过 | — |
| 8 | [NASA 月球](https://science.nasa.gov/moon/facts/) | 科普图文 | 结构检查通过 | — |
| 9 | [NASA 太阳](https://science.nasa.gov/sun/facts/) | 科普图文 | 结构检查通过 | — |
| 10 | [NASA 从月球了解地球](https://science.nasa.gov/solar-system/moon/10-things-what-we-learn-about-earth-by-studying-the-moon/) | 科普图文 | 结构检查通过 | — |
| 11 | [MDN JavaScript 入门](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Introduction) | 技术文档 | 结构检查通过 | — |
| 12 | [MDN CSS 网格](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts_of_grid_layout) | 技术文档 | 结构检查通过 | — |
| 13 | [MDN Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch) | 技术文档 | 结构检查通过 | — |
| 14 | [React 快速入门](https://react.dev/learn) | 技术文档 | 结构检查通过 | — |
| 15 | [React 共享状态](https://react.dev/learn/sharing-state-between-components) | 技术文档 | 结构检查通过 | — |
| 16 | [Python 数据结构](https://docs.python.org/3/tutorial/datastructures.html) | 技术文档 | 结构检查通过 | — |
| 17 | [Rust 所有权](https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html) | 技术文档 | 结构检查通过 | — |
| 18 | [Effective Go](https://go.dev/doc/effective_go) | 技术文档 | 结构检查通过 | — |
| 19 | [Kubernetes 概述](https://kubernetes.io/docs/concepts/overview/) | 技术文档 | 结构检查通过 | — |
| 20 | [Docker 简介](https://docs.docker.com/get-started/docker-overview/) | 技术文档 | 结构检查通过 | — |
| 21 | [Requests 快速入门](https://requests.readthedocs.io/en/latest/user/quickstart/) | 技术文档 | 结构检查通过 | — |
| 22 | [Django 教程](https://docs.djangoproject.com/en/5.2/intro/tutorial01/) | 技术文档 | 结构检查通过 | — |
| 23 | [VS Code 项目说明](https://github.com/microsoft/vscode) | 社区讨论 | 结构检查通过 | — |
| 24 | [Discourse 欢迎帖](https://meta.discourse.org/t/welcome-to-meta-discourse-org/1) | 社区讨论 | 无法访问正文 | 网站人机验证，本轮无法检查正文。 |
| 25 | [Stack Overflow 数组排序](https://stackoverflow.com/questions/11227809/why-is-processing-a-sorted-array-faster-than-processing-an-unsorted-array) | 社区讨论 | 无法访问正文 | HTTP 403，未验证适配；复测时浏览器访问超时。 |
| 26 | [Hacker News Dropbox](https://news.ycombinator.com/item?id=8863) | 社区讨论 | 结构检查通过 | — |
| 27 | [Reddit 阅读泰勒](https://www.reddit.com/r/AskAnthropology/comments/gys71o/) | 社区讨论 | 无法访问正文 | 网站显示 Prove your humanity，未验证正文。 |
| 28 | [京都旅行指南](https://en.wikivoyage.org/wiki/Kyoto) | 旅行 | 结构检查通过 | — |
| 29 | [原始文化](https://www.gutenberg.org/files/70458/70458-h/70458-h.htm) | 长篇书籍 | 结构检查通过 | — |
| 30 | [傲慢与偏见](https://www.gutenberg.org/files/1342/1342-h/1342-h.htm) | 长篇书籍 | 结构检查通过 | — |
| 31 | [爱丽丝梦游仙境](https://www.gutenberg.org/files/11/11-h/11-h.htm) | 长篇书籍 | 结构检查通过 | — |
| 32 | [我是猫](https://www.aozora.gr.jp/cards/000148/files/789_14547.html) | 长篇书籍 | 结构检查通过 | 原网页使用换行而非段落，自动段落抽样为 0；已核对末段文字，视觉排版仍待抽查。 |
| 33 | [维基文库原始文化](https://en.wikisource.org/wiki/Primitive_Culture/Chapter_1) | 长篇书籍 | 结构检查通过 | — |
| 34 | [共产党宣言](https://www.marxists.org/archive/marx/works/1848/communist-manifesto/ch01.htm) | 长篇书籍 | 结构检查通过 | — |
| 35 | [SEP Culture](https://plato.stanford.edu/entries/culture/) | 学术 | 结构检查通过 | — |
| 36 | [SEP Culture and Cognitive Science](https://plato.stanford.edu/entries/culture-cogsci/) | 学术 | 结构检查通过 | — |
| 37 | [Attention Is All You Need](https://arxiv.org/abs/1706.03762) | 学术 | 结构检查通过 | — |
| 38 | [PubMed 摘要](https://pubmed.ncbi.nlm.nih.gov/32939066/) | 学术 | 无法访问正文 | HTTP 403，未验证适配。 |
| 39 | [Nature AlphaFold](https://www.nature.com/articles/s41586-021-03819-2) | 学术 | 结构检查通过 | 网站 Cookie 弹窗阻挡操作；拒绝可选 Cookie 后大纲点击通过。 |
| 40 | [少数派 笔记管理](https://sspai.com/post/80781) | 中文博客 | 结构检查通过 | — |
| 41 | [少数派 阅读入门](https://sspai.com/post/68331) | 中文博客 | 结构检查通过 | — |
| 42 | [博客园 CSS Grid](https://www.cnblogs.com/adiynil/p/22570706) | 中文博客 | 结构检查通过 | — |
| 43 | [阮一峰 CSS Grid](https://www.ruanyifeng.com/blog/2019/03/grid-layout-tutorial.html) | 中文博客 | 结构检查通过 | — |
| 44 | [Paul Graham How to Do Great Work](https://paulgraham.com/greatwork.html) | 英文博客 | 结构检查通过 | 旧式表格正文已恢复，自动段落样本少，建议重点抽查。 |
| 45 | [Martin Fowler Refactoring](https://martinfowler.com/articles/refactoring-2nd-ed.html) | 英文博客 | 结构检查通过 | — |
| 46 | [Mozilla JavaScript 30 年](https://developer.mozilla.org/en-US/blog/javascript-30/) | 英文博客 | 无法访问正文 | 网址返回 404，保留失败记录。 |
| 47 | [freeCodeCamp 学习 JavaScript](https://www.freecodecamp.org/news/learn-javascript-full-course/) | 英文博客 | 待人工复查 | 抽样差异为作者介绍与课程推广；文章正文已保留，视频体验仍待人工检查。 |
| 48 | [Smashing CSS Grid](https://www.smashingmagazine.com/2017/06/building-production-ready-css-grid-layout/) | 英文博客 | 结构检查通过 | — |
| 49 | [AP 月球新陨石坑](https://apnews.com/article/80eea242ad275fda1f7a88587cdccd2f) | 新闻 | 无法访问正文 | HTTP 403，未验证适配。 |
| 50 | [BBC 旅行专题](https://www.bbc.com/travel) | 新闻 | 结构检查通过 | BBC Travel 为栏目聚合页，提取文章卡片；不是单篇正文测试。 |

附：结构检查以最多 24 段抽样为依据，引用、脚注、隐藏内容及推广信息会影响匹配率；不把访问受限视为适配成功。原始结果保存在工作区 output/reader-50。
