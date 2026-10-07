# XTLaw

XTLaw 是基于 Lexora 二次开发的独立本地个人 AI 伙伴。它面向个人工作目录完成对话、文档与文件处理、编码和工具调用，并通过桌宠提供陪伴与任务反馈。

## 主要能力

- 连接多种模型服务商并保留本地对话历史；
- 在用户授权的目录中读取和编辑内容；
- 使用扩展能力与本机工具完成通用任务；
- 在关键操作前请求确认，并展示执行过程与结果。

XTLaw 的产品数据与授权配置保存在本机，模型请求发送给用户选择的服务商。正式版默认数据目录为 `~/.xtlaw/buddy/`，开发版为 `~/.xtlaw-dev/buddy/`；不会自动读取或导入 Lexora 的旧数据。可使用 `XTLAW_HOME` 显式指定独立数据目录，使用 `XTLAW_BUDDY_PROFILE` 选择 `stable`、`development` 或 `test` 档位。

XTLaw 自带 Office DOCX 插件，首次启动真实预装，并在插件市场与已安装页面展示；支持 DOCX 预览、编辑、受控保存和引用到聊天，不包含 PDF。市场当前使用随应用提供的本地目录，不连接上游插件市场，离线也可重新安装 Office。插件可以禁用或卸载，重启不会强行装回；既有插件版本和配置不会被预装覆盖。源码与限制见 [`plugins/office/README.md`](../../plugins/office/README.md)。

关闭窗口只会隐藏 Desktop，退出由托盘控制；双击桌宠可重新打开 Desktop。

## 开发

```bash
pnpm dev:buddy
```

构建与发布见 [`packaging/buddy/README.md`](../../packaging/buddy/README.md)。
