# 2026-10-16 上游集成：主题引擎（仅引擎）

## 范围与状态

- 来源：上游主题栈 8 个提交，位于基线 `3ca97e2e` 及之前。这些提交此前在 `docs/upstream-20261016-integration.md` 与 `docs/upstream-round-4-integration.md` 中被决定跳过；本轮改为“只取引擎”。
- 工作分支：`codex/upstream-20261016-theme`，基于 `master` 的 `96a342da`，共 9 个本地提交（8 个移植 + 1 个导入整理）。未合并到 `master`，未推送。
- `docs/upstream-baseline.json` 的 `lastChecked` 不变（`3ca97e2e`）。上游此后又有 3 个新提交（到 `4a0ab562`），本轮未评估。
- 原则：引擎、设置页、IPC、主题插件与材质能力取上游；组件的原子类改写不取。本地组件已读取同名的 `--buddy-*` 变量，引擎生成同名变量后组件会直接跟着变。

## 移植清单

| 上游提交 | 本地提交 | 取舍 |
|---|---|---|
| `00feaa2c` 重构前端样式并支持主题插件 | `5749ef02` | 只取引擎：`platform/themes`、`shared/theme`、主题 IPC 与预加载、内置主题插件、设置页主题选择、材质钩子、插件样式编译。360 个文件中 241 个组件改动还原；保留 9 个与引擎相连的组件改动 |
| `0b9d252e` 完善插件更新与主题选择 | `26e1f888` | 只取主题部分；插件更新流程本地已有自己的 `applyUpdate`，不取 |
| `fd88122a` 完善主题配色与组件适配 | `8d09ab00` | 取调色板、令牌、解析与 Markdown/Naive 主题投射；推理条、画布网格、账号弹窗等组件配色不取 |
| `df0f9369` 支持系统字体与阅读设置 | `568c6c1e` | 本地已在 `5897ba17` 集成字体设置；只取向主题插件暴露字体的部分 |
| `b915b87d` 修正主题插件元数据与兼容范围 | `7ae39d9e` | 取，兼容范围保持本地的 `>=0.1.0` |
| `d4e914d5` 修复插件主题请求与错误诊断 | `2d27cc1d` | 取 |
| `cc0ac294` 修复插件媒体资源与主题图片存储 | `8a598427` | 取；保留本地的 `readBytes`/`saveBytes` 与 `commitSave` 超时 |
| `3ca97e2e` 扩展插件窗口样式与主题材质能力 | `842aab99` | 取材质控制器、材质样式、区域定义、窗口样式；`data-theme-surface` 属性与组件改写不取 |

## 与上游不同的本地处理

- **兼容范围：** 内置主题插件 `engines.lexora` 写 `>=0.1.0`。上游写 `>0.10.1`，本地应用版本是 `0.1.x`，直接带入会被判为不兼容，`b915b87d` 之后会静默不安装内置主题。
- **品牌：** 内置主题插件的名称与作者改为“XTLaw 主题”“XTLaw”，兜底主题名改为 `XTLaw`，页面标题保持 `XTLaw`。插件标识 `lexora.themes` 与主题 ID `lexora.themes.*` 保持上游写法，便于以后同步；`LICENSE` 里的上游版权声明不改。
- **材质样式：** 上游靠组件上的 `data-theme-surface` 让材质层所在元素建立层叠上下文。本地不改组件，改为在 `materials.scss` 里对任何带材质层的元素生效。
- **版本约束：** `@unocss/core` 取 `^66.10.5`，与本地 `unocss` 对齐；上游此提交里钉的是 `66.7.0`，会和本地 `unocss` 产生类型不匹配。
- **扩展上限：** 上游新增 `platform/extensions/extensionLimits.ts`（4MB/16MB）。本地已有 `shared/extensions/extensionPackageLimits`（16MB/64MB），统一用本地的，删除上游新增文件。
- **配置：** `desktop.theme` 由字符串改为 `{ id }`；旧值与 `accent_color` 在读取时迁移，已有单元测试。文件图标主题 `fileIconTheme` 与新的主题服务并存。
- 迁移：本轮无数据库迁移。

## 保留的组件改动（共 9 处）

`App.vue`、`DesktopAppProvider.vue`、`DesktopAppearanceSettings.vue`（替换主题选择行）、`DesktopThemeSettings.vue`、`DesktopExtensionInstallReview.vue`（新增主题管理权限一行）、`DesktopChatWorkspace.vue`（移除已废弃的材质钩子）、`DesktopMarkdownContent.vue`、`DesktopTaskMarkColorPicker.vue`（导入路径）、`desktopMonaco.ts`（主题联动，保留本地字体观察）。

## 未取的上游内容

- 全部组件的原子类改写与拆分（模型选择面板、输入框提交区、推荐词等新增组件）。
- 欢迎页的主题自定义（本地欢迎页实现不同）。
- 上游的 `uno.config.ts` 改动（本地保留原有配置）。
- 上游新增的 e2e 脚本 `reading`、`settingsControls`；`theme.e2e.mjs` 已带入但**未在本地运行**。

## 验证

- `pnpm type-check`：通过。
- 相关测试：`platform/themes`、`platform/extensions`、`electron/main/config`、`electron/main/extensions`、`shared/theme`、`src/workbench`、`src/modules/extensions`、`src/modules/tasks`、`service/src/plugins`、`service/src/storage` 已跑。失败项都在 `docs/known-test-failures.md` 中（Windows 符号链接权限不足与路径分隔符）：`ExtensionPackageStore`、`ExtensionResourceStore`（2）、`pluginAuthoringCapability`、`BuddyDataPaths`、`StorageSnapshots`。
- 新增并通过的测试：`ThemeService`、`resolveTheme`、`themeClient`，以及 `LexoraConfigStore` 的两个主题迁移用例。
- 开发预览（按 AGENTS.md 的桌面启动流程）：本次启动有 `runtime.ready`，诊断日志无 warn/error，无 `credential.decrypt.failed`；设置页「应用外观」显示主题选择（经典 · 浅色，XTLaw 主题）与文件图标主题。
- 主题 e2e（`theme.e2e.mjs`，隔离实例）：主题选择、跟随系统、搜索、持久化通过；“损坏的主题数据”通过；“损坏的插件注册表”失败。原因是该用例假设系统为浅色：插件注册表损坏时没有内置主题，兜底主题跟随系统，本机系统为深色，所以得到深色。属环境假设，不是移植回归（探针确认兜底来源为 `lexora.fallback.dark`，系统深色）。
- **未做：** 没有逐项人工看界面。深浅切换只靠 e2e 覆盖；材质图片显示、`DesktopThemeSettings.vue`（上游原子类名）在本地 `uno.config.ts` 下的样式细节未逐项核对。

## 后续

- 启动应用（按 AGENTS.md 的 Windows 开发预览流程）检查：设置页主题选择、切换浅色/深色、`runtime.ready` 且无 `credential.decrypt.failed`。
- 已做：XTLaw 自带主题插件 `xtlaw.themes`（纸页 · 浅色/深色，纯颜色与阴影，不改引擎），与上游的 `lexora.themes` 分开放，由 `platform/themes/xtlawThemes.ts` 单独播种。尚未做：圆角分档（`shape`）、布局密度（`layout`）、主题默认字体（`typography`）。
- 评估上游基线之后的 3 个新提交。
