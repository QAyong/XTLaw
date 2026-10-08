<p align="center">
  <img src="docs/assets/xtlaw-icon.svg" width="104" height="104" alt="XTLaw 官方应用图标" />
</p>

<h1 align="center">XTLaw</h1>

<p align="center"><strong>想法即指令，执行交给我。</strong></p>

<p align="center">你的桌面 AI Agent，让文档、对话与工具一起工作。</p>

<p align="center">
  <a href="https://xtlaw.qayong.site/">官网</a> ·
  <a href="https://xtlaw.qayong.site/guide.html">使用指南</a> ·
  <a href="https://github.com/QAyong/XTLaw/releases">版本发布</a> ·
  <a href="https://github.com/QAyong/XTLaw/issues">反馈问题</a>
</p>

<p align="center">
  <a href="./LICENSE"><img alt="AGPL-3.0-only" src="https://img.shields.io/badge/license-AGPL--3.0--only-blue" /></a>
  <a href="https://github.com/QAyong/XTLaw/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/QAyong/XTLaw/ci.yml?branch=master&amp;style=flat&amp;label=CI" /></a>
</p>

XTLaw 把任务对话、文档编辑、资源面板和工具执行放进同一个桌面工作台。连接你选择的模型与工具，在授权范围内读取资料、处理文件、执行任务，并查看过程与成果。

由 [QAyong](https://github.com/QAyong) 持续开发，面向需要边看材料、边讨论、边动手处理文件的日常工作。

## 不只是对话，也是你的工作台

### 文档编辑，就在工作台

通过 Office DOCX 插件打开、编辑并保存文档。文档与聊天并排显示，阅读材料、调整内容和继续提问可以在同一个界面中完成。

[![XTLaw 文档工作台](https://xtlaw.qayong.site/assets/docx-workbench-light.png)](https://xtlaw.qayong.site/assets/docx-workbench-light.png)

### 对话有分支，思路可展开

在画布中查看问答节点与关联，从历史回答继续追问或重新生成，沿不同方向展开讨论，查看相关执行状态与产物。

[![XTLaw 对话分支画布](https://xtlaw.qayong.site/assets/conversation-canvas-light.png)](https://xtlaw.qayong.site/assets/conversation-canvas-light.png)

### 面板与聊天，连起来用

查看材料时，把支持引用的选中内容送入聊天输入区，围绕当前材料继续提问。引用由你确认，消息由你决定何时发送；工作台也支持调整资源面板与聊天的左右位置。

[![XTLaw 面板与聊天联动](https://xtlaw.qayong.site/assets/panel-quote-light.png)](https://xtlaw.qayong.site/assets/panel-quote-light.png)

## 更多能力

| 能力 | 使用方式 |
| --- | --- |
| 模型接入 | 连接自己的模型服务，按服务商要求配置 API Key 或账号授权。 |
| 文件与工具 | 选择工作目录，在授权范围内读取资料、编写文件和运行工具。 |
| Skills 与 MCP | 扩展常用工作方法，接入需要的工具与服务。 |
| 任务与产物 | 在工作台查看任务执行过程、生成文件和相关结果。 |
| 自动化 | 安排定时任务，让重复工作按计划执行；应用需在本机保持运行。 |

## 开始使用

先阅读 [使用指南](https://xtlaw.qayong.site/guide.html)，再查看 [版本发布页](https://github.com/QAyong/XTLaw/releases)。

**当前处于开发阶段，尚未发布 XTLaw 安装包。** 上面的真实截图展示本地开发版；GitHub 默认分支尚未同步全部开发改动，包括 Office DOCX 插件。实际能力以检出的源码或后续发行版为准。

后续安装包发布后，基本使用流程为：

1. 选择适合电脑系统与架构的安装包。
2. 在设置中连接模型服务。
3. 新建任务，说明目标、参考材料和期望结果。
4. 需要处理文件时选择工作目录，确认授权后执行，再打开成果核对。

无需注册 XTLaw 账号。模型服务的条件与费用由服务商决定，项目不提供内置免费模型额度。产品数据保存在本机；使用在线模型或外部工具时，相关内容可能发送给所选服务。

重要文件先备份，AI 生成的事实与结果需要核对。DOCX 插件仍在完善，不承诺完整 Office 兼容；关闭文档前请确认已经保存。

## 官网与支持

**[xtlaw.qayong.site](https://xtlaw.qayong.site/)** 提供产品截图、功能介绍、使用指南与常见问题，支持浅深色主题和手机浏览。

### QQ 交流群

欢迎加入 **阿勇妙妙屋**，交流使用体验、分享工作方法和反馈建议。

**群号：704919429** · [点击加入 QQ 群](https://qm.qq.com/q/QF9OHnzcAw)

<p>
  <a href="https://qm.qq.com/q/QF9OHnzcAw"><img src="docs/assets/xtlaw-qq-group.png" width="280" height="358" alt="阿勇妙妙屋 QQ 群二维码，群号 704919429" /></a>
</p>

也欢迎通过 [Issues](https://github.com/QAyong/XTLaw/issues) 提交问题；请附上系统、版本和复现步骤。

### 捐赠支持

如果 XTLaw 帮到了你，欢迎自愿捐赠，支持项目持续开发。

<p>
  <img src="docs/assets/xtlaw-donation-alipay.png" width="280" height="358" alt="支付宝捐赠二维码，金额 5 元" />
</p>

**支付宝扫码 · ¥5.00**。也可以通过 [官网](https://xtlaw.qayong.site/) 右上角的爱心按钮打开捐赠二维码。感谢你的支持！

## 本地开发

需要 Node.js 26+、pnpm 12.5.1+ 与 Rust 工具链。平台依赖及打包方式见 [构建说明](packaging/buddy/README.md)。

在仓库根目录运行：

```bash
pnpm --filter @uselexora/lexora --filter '@uselexora/lexora-buddy...' --filter @uselexora/lexora-website install --frozen-lockfile
pnpm dev

# 启动仓库内的网站开发服务
pnpm dev:website
```

桌面界面使用 Vue 与 Electron，本地 Agent Runtime 使用 TypeScript，原生能力由 Rust 提供。部分包名和内部标识保留既有命名。`pnpm dev:website` 运行仓库内的网站源码，与当前独立部署的官网不同。

贡献方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。反馈时请说明系统、版本、复现步骤和期望结果。

## 开源参考

XTLaw 的开发参考并沿用了以下开源项目与技术：

- **[Lexora](https://github.com/useLexora/Lexora)**：XTLaw 是其二次开发版本，桌面运行时、任务系统、模型接入和工具与插件机制等基础能力来自该项目。保留上游贡献历史与许可声明，感谢原作者及所有贡献者。
- **[Pi](https://github.com/earendil-works/pi)**：项目使用的 Agent 执行循环与相关能力。
- **[Vue](https://github.com/vuejs/core)**、**[Electron](https://github.com/electron/electron)**：桌面界面与应用运行环境。

第三方组件的来源和许可按各自声明保留。

## 许可证

[AGPL-3.0-only](LICENSE)

友情链接：[LINUX DO](https://linux.do/)
