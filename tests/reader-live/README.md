# 阅读器真实页面回归

`cases.json` 保存 50 个真实网址；不保存网页全文或截图。
`run-template.js` 是供 Playwright CLI `run-code` 使用的函数模板：将 `__CASES__` 替换成选定用例的 JSON 数组，再交给已加载本扩展的 Chromium 会话运行。建议每批 3 页。

浏览器必须通过 `--load-extension`、`--disable-extensions-except` 加载源码，并在修改内容脚本后重启，避免缓存旧代码。通过扩展 service worker 给真实标签页发送 `TOGGLE_READER_MODE`；不模拟 Chrome API，不调用翻译服务。

检查 HTTP 状态、访问拦截、正文抽样保留率、标题/图像/代码/表格、大纲目标、横向溢出和大纲点击。`checked` 仅表示结构检查通过，不保证视觉排版或全文无遗漏；`inspect` 需要检查差异，可能包含被主动清理的导航、作者介绍或隐藏文本；`unavailable` 不计为适配成功。

`regression.js` 是两组自有文本的确定性浏览器回归，通过请求路由提供测试页面，仍使用真实扩展。验证旧式表格正文、后半章节、图片段落、引用中的代码、数据表格与标题锚点清理。
