<p align="right">
  <a href="./README.md">English</a> · <strong>简体中文</strong> · <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <img src="./assets/readme/zh-CN/hero.png" width="100%" alt="极简翻译的九项阅读与翻译功能，右侧是一只在书桌前阅读的浣熊。">
</p>

> **现已上架：** 可从 [Chrome Web Store](https://chromewebstore.google.com/detail/pbndcgchimohkkdijfafhaljldgfkhbd) 安装极简翻译，也可以通过 [Releases](https://github.com/Cuteraccoons/minimalist-translate/releases/latest) 手动安装。

极简翻译是一款面向外文网页阅读的开源 Chrome 扩展。它不会把网页变成另一份割裂的翻译文档，而是在尽量保留链接、Tab、按钮与原有排版关系的前提下，加入双语阅读、沉浸阅读、本地词典与本机图片 OCR。

## 选择适合当前网页的阅读方式

- **原网页双语**：在原文下方生成译文，同时保留页面原有结构与交互。文章链接卡片保留原文，并把译文放在同一链接内；空间受限的 Tab 可使用原地译文，悬停时查看原文。
- **替换原文**：只替换文字节点，链接、按钮、导航和 Tab 仍可正常使用。
- **沉浸阅读**：提取文章正文、过滤重复标题、保留安全链接，并提供三级文章大纲、全文朗读以及纸张、铺开、专栏、书页四种页面结构。
- **分栏对照**：在侧边建立独立双语分栏，支持原文定位、宽度调整与段落朗读。

## 不离开网页完成查词

- 接入 Free Dictionary API、Jisho / JMdict、萌典与维基百科摘要。
- 直接读取本地 MDX / MDD 词典及配套 CSS、图片和发音，不上传词典文件。
- 配置服务后可启用 AI 语境释义与连续追问。
- 生词与高亮保存在浏览器本地，支持搜索、筛选以及 Markdown / CSV 导出。

## 在本机翻译图片文字

图片 OCR 使用扩展随附的 Tesseract.js 在浏览器本机运行。首次使用某种语言时会从公开模型源下载对应语言模型，并由浏览器缓存复用。原图片不会发送给 OCR 服务；只有识别出的纯文本在用户继续翻译时才会发送给当前翻译引擎。

译图会保留在原网页的图片位置。识别行按原位置写回，并自动处理相邻行边界、文字对齐和背景对比；也可以随时切换回原图。

## 翻译引擎

Google 翻译可直接作为基础引擎使用。下列服务需要用户自行配置：

- DeepL
- DeepSeek
- OpenAI
- Claude
- Gemini
- Ollama
- 自定义兼容 API

## 本地安装

1. 从 [Releases](https://github.com/Cuteraccoons/minimalist-translate/releases/latest) 下载并解压最新发布包。
2. 在 Chrome 地址栏打开 `chrome://extensions/`。
3. 开启右上角的「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择 `Jijian-Translate` 文件夹。

Chrome 不能直接加载 ZIP 文件。更新本地安装时，用新文件覆盖原文件夹，然后在扩展管理页点击刷新即可。

## 数据边界

- API Key、自定义服务地址与模型配置仅保存在当前设备；普通界面与阅读偏好可通过 Chrome Sync 同步。
- 生词、高亮、翻译缓存与本地词典连接信息保存在当前设备。
- 本地 MDX / MDD 词典文件不会被上传。
- OCR 在本机运行；只有识别出的纯文本在继续翻译时才会发送给所选翻译服务。
- 在线翻译、在线词典与可选 AI 请求受用户所选服务商的政策约束。
- 项目没有自建账号体系或云端同步服务。

完整的服务与权限边界见 [隐私说明](PRIVACY.md)。

## 项目与赞赏

如果极简翻译对你的日常阅读有所帮助，可以通过 [爱发电](https://www.ifdian.net/a/longmaojun) 表达赞赏。赞赏是对当前开源成果的认可，不对应专属功能、更新排期或维护承诺。

## 参与贡献

欢迎提交 Bug、网页兼容案例、文档改进与边界清晰的代码贡献。提交 Pull Request 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。安全问题请按照 [SECURITY.md](SECURITY.md) 中的方式反馈，不要在公开 Issue 中披露可被利用的细节。

## 致谢

开发与代码审查过程中使用了 OpenAI Codex 作为辅助工具。

## 开源许可

极简翻译基于 [Apache License 2.0](LICENSE) 开源。第三方组件继续适用各自的许可证与声明，详见 [NOTICE](NOTICE) 与 `vendor/` 目录中的许可文件。
