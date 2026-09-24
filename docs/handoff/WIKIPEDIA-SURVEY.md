# 维基百科模块调查

调查日期：2026-09-24。实际访问 16 个页面，覆盖英语、中文、日语、德语。使用当前 1.0.4 源码扩展开启阅读模式，采集 DOM；没有截图，没有请求翻译服务。本轮调查不修改产品提取逻辑。

按 31 类预定义结构选择器统计，其中 27 类在样本中出现。类别会重叠，不是 Wikipedia 模板的完整目录；节点数不能相加成“模块总数”。此外 16 页均有页面外壳目录，单独记录。

执行步骤见 [详细实施计划](IMPLEMENTATION-PLAN.md) 的 W01–W07。维基模块不应直接套用百度的哈希类名或作品卡规则。

## 1. 样本与原生阅读器结果

章节为源 h2–h6 数；表格为全部源 TABLE → 阅读器语义表，不包含已转成资料卡的表；原生表格总数也包含布局表、嵌套表和导航表。不能凭表格数差认定丢失。

| 样本 | 语言 | 章节 | 源表 → 输出语义表 | 公式节点 | 音频 源→输出 | 覆盖重点 |
|---|---|---:|---:|---:|---:|---|
| [Queen's Pawn Game](https://en.wikipedia.org/wiki/Queen%27s_Pawn_Game) | en | 8 | 9 → 3 | 0 | 0 → 0 | 棋盘、Further reading、导航框 |
| [Germany](https://en.wikipedia.org/wiki/Germany) | en | 38 | 15 → 5 | 0 | 2 → 0 | 旗帜、地图、国歌、资料卡 |
| [Climate of London](https://en.wikipedia.org/wiki/Climate_of_London) | en | 14 | 12 → 3 | 0 | 0 → 0 | 多站点气候表、数据色彩 |
| [Anthropology](https://en.wikipedia.org/wiki/Anthropology) | en | 67 | 18 → 5 | 0 | 0 → 0 | 主题分支、定义列表、参考资料 |
| [Solar System](https://en.wikipedia.org/wiki/Solar_System) | en | 37 | 22 → 8 | 7 | 1 → 0 | 天文图、公式、数值表 |
| [Pythagorean theorem](https://en.wikipedia.org/wiki/Pythagorean_theorem) | en | 42 | 11 → 2 | 99 | 0 → 0 | 独立和行内公式、证明图 |
| [Water](https://en.wikipedia.org/wiki/Water) | en | 61 | 12 → 4 | 4 | 0 → 0 | 化学式、图集、视频 |
| [Python (programming language)](https://en.wikipedia.org/wiki/Python_(programming_language)) | en | 29 | 14 → 9 | 0 | 0 → 0 | 代码、信息框、引用 |
| [Symphony No. 5 (Beethoven)](https://en.wikipedia.org/wiki/Symphony_No._5_(Beethoven)) | en | 26 | 7 → 3 | 0 | 15 → 7 | 乐谱、音频、乐章 |
| [Timeline of the French Revolution](https://en.wikipedia.org/wiki/Timeline_of_the_French_Revolution) | en | 44 | 12 → 2 | 0 | 0 → 0 | 年份/月份章节、日期列表、图集 |
| [List of countries and dependencies by population](https://en.wikipedia.org/wiki/List_of_countries_and_dependencies_by_population) | en | 5 | 3 → 2 | 0 | 0 → 0 | 242 行主数据表 |
| [Periodic table](https://en.wikipedia.org/wiki/Periodic_table) | en | 32 | 29 → 16 | 12 | 0 → 0 | 密集彩色表格、元素、公式 |
| [北京市](https://zh.wikipedia.org/wiki/%E5%8C%97%E4%BA%AC) | zh-Hans-CN | 66 | 92 → 25 | 0 | 0 → 0 | 中文、坐标、多资料表 |
| [日本語](https://ja.wikipedia.org/wiki/%E6%97%A5%E6%9C%AC%E8%AA%9E) | ja | 124 | 47 → 19 | 0 | 0 → 0 | 注音、例句、语言表格 |
| [Berlin](https://de.wikipedia.org/wiki/Berlin) | de | 65 | 41 → 5 | 0 | 2 → 0 | 德文、地图、图集、视频 |
| [Heart](https://en.wikipedia.org/wiki/Human_heart) | en | 57 | 12 → 3 | 0 | 4 → 0 | 人体解剖图、音视频 |

所有样本的已采集章节标题均能在阅读器中找到，大纲目标不存在数均为 0。**这只验证标题与目标存在，不证明滚动位置、正文、公式、媒体完整。** 外壳目录统计中可能包括“序言”项，因此比正文标题多一项属于可解释差异。

## 2. 类型统计（模块可能互相包含）

| 类型 | 出现页数 / 16 | 匹配节点数 | 查询规则 | 后续任务 |
|---|---:|---:|---|---|
| 资料卡 | 13 | 17 | `.infobox` | B01 对照 / W01 |
| 数据表 | 9 | 52 | `table.wikitable` | W01 |
| 可排序数据表 | 5 | 7 | `table.sortable` | W01 |
| 合并单元格 | 16 | 516 | `td[rowspan],th[rowspan],td[colspan],th[colspan]` | W01 |
| 缩略图／语义配图 | 16 | 448 | `.thumb,figure[typeof*="mw:File"]` | W05 |
| 图集 | 6 | 29 | `.gallery` | W05 |
| 图像热点 | 0 | 0 | `.imagemap` | 待补真实样本 |
| 棋盘 | 1 | 1 | `.chessboard` | W05 |
| 定位图候选容器 | 6 | 22 | `.locmap,.noresize` | W05 |
| 数学公式 | 4 | 122 | `.mwe-math-element` | W02 |
| 化学式 | 1 | 13 | `.chemf` | W02 |
| 代码高亮相关节点 | 1 | 66 | `pre,.mw-highlight` | W07b |
| 引用块 | 6 | 23 | `blockquote` | W07 |
| 定义列表 | 7 | 74 | `dl` | W07 |
| 嵌套列表 | 15 | 466 | `li ul,li ol` | W07a |
| 上标引用 | 16 | 3962 | `sup.reference` | W04 |
| 参考文献列表 | 16 | 34 | `.reflist,ol.references` | W04 |
| 引文条目 | 15 | 2473 | `cite.citation` | W04 |
| 底部导航框 | 14 | 72 | `.navbox` | W04 |
| 侧边主题导航 | 5 | 12 | `.sidebar` | W04 |
| 姊妹项目入口 | 10 | 12 | `.sistersitebox` | W04 |
| 音频 | 5 | 24 | `audio` | W06 |
| 视频 | 3 | 6 | `video` | W06 |
| 交互地图 | 0 | 0 | `.mw-kartographer-map,.mw-kartographer-container` | 待补真实样本 / W05 |
| 专用时间轴容器 | 0 | 0 | `.timeline` | W07a，不能仅靠类名 |
| 乐谱 | 1 | 10 | `.mw-ext-score` | W06 |
| 注音 | 1 | 3 | `ruby` | W07c |
| 坐标表示 | 4 | 38 | `.geo,.geo-dec,.geo-dms` | W05 |
| 消歧／主条目提示 | 14 | 216 | `.hatnote` | W04 分类处理 |
| 维护提示 | 3 | 7 | `.ambox,.tmbox` | 维持清理并防误伤 |
| 正文内目录 | 0 | 0 | `#toc,.toc` | W03；外壳另计 |

解释：

- `.navbox` 可能嵌套，代码相关查询同时匹配包装器与 PRE，合并格按单元格计；不把这些数当独立内容块。
- `.locmap,.noresize` 仅为定位图候选，有的只是尺寸容器，必须确认内部定位关系后才能整体保留。
- 时间轴、交互地图、图像热点选择器为 0 只表示此样本未匹配，不能推断 Wikipedia 不支持这些模块。
- 法国大革命年表确有时间内容，但用年份/月度标题、普通列表、图集组织，不能以 `.timeline` 为 0 报提取失败。
- 正文内 TOC 为 0；16 页外层均找到 `#vector-toc` 或 `#toc`。目录应由正文章节映射，不复制页面导航外壳。
- 数字来源与字段说明：[完整结构记录](wiki-inventory-2026-09-24.json)。专项证据：[公式、长表、气候表、媒体及代码](wiki-detail-audit-2026-09-24.json)。

## 3. 已确认的问题与优先级

### P0：主数据表缺失（W01）

人口列表源主表 242 行；输出只剩补充导航表，中段 Norway 及人口数字、末段 Pitcairn Islands 记录未找到。代码对普通 TABLE 设置最大 80 行和 12000 字；这与该主表的遗漏吻合。不能把“正文还有 World 或 35”当该记录已保留，必须比较组合记录。

已知入口：`collectReaderContentNodes` 的 TABLE 分支。后续需逐阶段断点确认，不以提高一个魔法数字作为最终策略。要求完整数据有可访问路径，且不一次启动大量翻译。

### P0：数学表达丢失（W02）

勾股定理源 99 个公式容器，输出公式图片 0；专项抽查前三个公式没有 MathML/SVG，含公式及原始注解的完整文本也没有保留。源同时有隐藏的无障碍 MathML 和 `aria-hidden` 的可见图片；通用 `readerInlineHtml` 对两者都做删除，独立 IMG 收集也跳过 aria-hidden。

不能只取消全站 aria-hidden 过滤，那会恢复不该显示的导航/装饰。需要在数学语义容器内选择唯一安全表示，保留 inline/block 和替代文本。

### P1：气候页多个站点表缺失线索（W01）

源匹配 9 个 wikitable，输出 3 个语义表。若干记录的独有气温/日照抽样未找到；部分表位于折叠或隐藏容器。保留下来的彩色格有 37 个，说明颜色规则已有作用，但不能据此称整页热力表已适配。

表格数、源 innerText 与折叠状态有关。下一步逐表确认站点/统计周期、显隐及归属，再区分主动折叠与提取丢失；完整差异需要 W01 继续核对。

### P1：媒体所在父容器影响保留（W06）

Germany 源音频 2、输出 0；Beethoven 第五交响曲同时有乐谱图和多条音频，源 15 个 audio，输出 7 个播放器与 10 个媒体链接（彼此可能重叠）。专项记录包含源地址与父容器，以及阅读器媒体链接数。链接降级也算可访问内容的一种，不能仅按播放器数直接认定全部缺失。

需要检查 TABLE/FIGURE 父容器收走子媒体之后，父渲染器是否保留 audio/video；同时验证谱例与播放入口对应，而非将所有音频堆到末尾。

## 4. 已有能力与待核对边界

- Queen’s Pawn Game 输出 1 个组合棋盘、1 个资料卡、4 个补充分组；前轮已有棋子相对坐标回归，本轮仅统计存在，不重复宣称视觉验收。
- 标准资料卡、配图、数据色彩、参考上标和中文/日文标题可以提取；还需逐字段、逐锚点核对。
- 日本語原文 ruby 3、输出 ruby 3；这不等于读音基线/行距已通过人工检查。
- Python 代码必须查询 `.reader-code-block`，不能只查询 PRE；源码使用包装块输出。专项检查源 PRE 为 4 个、输出代码块为 3 个，仍需 W07b 逐块解释差异。66 个高亮相关节点包含行内代码与包装器，不等于遗漏了几十段代码。
- 嵌套 navbox 可能合并为一个补充分组；需要检查链接和组名是否完整，而不是强求节点数量相等。
- 资料卡的原始语义与 sidebar 导航应区分，后者可省略/折叠；不要为了保留分支导航污染文章开头。
- 地图、交互图、乐谱、音视频的真正可用性需要操作与网络验证；当前 DOM 调查没有自动播放或外部交互。

## 5. 调查不足与追加策略

本次样本不覆盖所有 Wikipedia 模板、皮肤和移动布局。优先追加带明确图像热点、可交互地图、专用时间轴的精确页面；每种至少一个可访问样本及一个最小 fixture。不要为填满类别而把普通定位图记成交互地图。

新增样本先登记模块位置、源/输出对应及失效阶段，随后再扩选择器。凡没有真实样本支撑的类型，保持“待调查”。调查与修复分开记录，不把本轮 16 页调查写成 16 页已全面适配。
