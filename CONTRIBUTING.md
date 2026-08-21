# 参与贡献

感谢你愿意帮助改进极简翻译。项目欢迎 Bug 修复、网页兼容性改进、排版优化、文档修正与可复现的功能建议。

## 开始之前

- 不要提交 API Key、Cookie、访问令牌、本地词典文件或包含私人内容的测试页面。
- 不要提交商业 MDX / MDD 词典及其资源文件。
- 新增在线服务时，应说明会发送哪些数据，并同步更新隐私说明。
- 新功能应保持 Manifest V3 兼容，不引入远程可执行代码。

## 本地检查

修改后至少运行：

```bash
node --check background.js
node --check content.js
node --check popup.js
node --check options.js
node tests/release-audit.mjs
node tests/translation-core-audit.mjs
```

涉及网页排版时，请尽量提供：

- 可公开访问的复现网址。
- 使用的翻译模式与译文样式。
- 原网页语言、目标语言和浏览器版本。
- 预期结果与实际结果。

请避免提交含账号、聊天记录、付费文章正文或其他私人信息的截图。

## Pull Request

- 一个 Pull Request 尽量只解决一类问题。
- 说明修改原因、影响范围和验证方式。
- 保留已有用户设置的兼容迁移，不要无条件覆盖用户选择。
- UI 修改应同时检查 Popup、设置页、普通网页、深色背景与窄窗口。
- 依赖第三方代码时，补充许可证与 NOTICE 信息。

提交的贡献默认按照项目的 Apache License 2.0 许可证发布。
