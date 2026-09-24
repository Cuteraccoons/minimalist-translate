# 验证与复现

## 本轮完成的验证

- 原生扩展加载源码，实际打开 16 个百度百科页面；结构结果保存于同目录 JSON。
- `style-choice-layout.js`：1440/800 px 窗口 × 260/320/420 px 侧栏 × 白／黑主题，共 12 组。验证两列网格、按钮不相交、不溢出、标签容纳、至少 38 px 高；键盘聚焦绿色选项并按 Enter 验证 aria-pressed。
- 无截图，无真实或模拟翻译调用。采集成功不代表视觉审核通过，也不代表视频可播放。

本轮发布审计、翻译核心审计及 `git diff --check` 均通过。1.0.4 候选包已重新生成，并核对根目录版本与 reader.css 一致。

## 必跑静态审计

在源码根目录运行：

```sh
node tests/release-audit.mjs
node tests/translation-core-audit.mjs
git diff --check
```

## 原生浏览器采集

使用已安装 Playwright CLI 的 Chromium，启动参数必须加载源码扩展：`--load-extension=<源码绝对路径>`、`--disable-extensions-except=<源码绝对路径>`，并移除默认的 `--disable-extensions`。浏览器可执行文件依本机实际安装位置选择，不硬编码旧缓存版本。修改 content.js 后重启浏览器，避免检查旧内容脚本。

本轮会话名 `releasefix`，临时启动配置 `/tmp/jijian103-native.json`（名称旧，但加载当前源码）。临时配置可能被清理，不作为仓库依赖。若会话不存在，先按上述参数新建持久会话。

```sh
python3 tests/reader-live/run-baike-inventory.py --session releasefix --output docs/handoff/baike-inventory-new.json
```

脚本默认调用 `~/.codex/skills/playwright/scripts/playwright_cli.sh`。其他机器应替换 wrapper 路径。每页单独写入，失败记录 error，不把失败记成兼容成功。重跑用新输出文件，不覆盖历史证据。

`style-choice-layout.js` 是 CLI run-code 的函数模板，直接把全文作为一个参数传入，不能当 Node 程序执行。可使用 Python 的 subprocess 参数数组读取传递，避免 shell 转义问题。

现有 `chess-links-citations.js` 的引用翻译部分模拟服务响应，只验证界面与引用结构，不代表真实服务质量。本轮百科采集不调用该模拟。

## 统计口径

源数据先采集，进入阅读器会触发有限懒加载预热。两者媒体总数不可直接计算保留率。正文图片过滤 button 后代和 chrome-extension 资源；总 IMG 包含每段翻译图标，不能拿来报重复插图。表格包含布局表、嵌套表，需按语义核对。标题匹配不替代滚动位置验收。

## 打包

外层运行 `node scripts/build-local.mjs` 生成本地加载目录，再从生成目录压 ZIP，确保 manifest.json 在 ZIP 根目录。保持 1.0.4 候选；文档与测试不进入扩展包。商店提交与正式 Release 由维护者决定。
