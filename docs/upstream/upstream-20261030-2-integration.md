# 上游集成记录：2026-10-30（第二轮）

单独移植 `c2c3978a9`（语音输入与回复朗读，137 个文件）。分支 `codex/upstream-20261030-2`，基于 `codex/upstream-20261030`（第一轮下载代理，尚未合并），用 `git cherry-pick -x`。第一轮合并后，这一轮的分支需要变基或随它一起合并。

## 已移植

| 上游提交 | 本地提交 | 内容 |
| --- | --- | --- |
| `c2c3978a9` | `955a9e853` | 输入框录音并转写（`transcription` 模型），消息朗读（系统语音或服务商 `speech` 模型），设置页新增“语音”，麦克风测试；模型有了类型 `chat` / `transcription` / `speech`，模型选择器、服务商详情、手动加模型表单按类型过滤，详情里可改类型 |

## 迁移编号

上游 v37 `ModelTypes` 登记为本地 v39（`BUDDY_SCHEMA_VERSION` 改为 39），本地 v38 空着，原因是本地的迁移编号比上游大 2（v31/v32 为本地独有），且上游 v36 `ExtensionCapabilities` 没有移植（见 `upstream-20261028-integration.md`）。迁移文件和表结构与上游一致，只改 `schema.ts` 的登记和注释。`schema.spec.ts` 里的 model-type 用例前置版本从 36 改为本地的 37；上游的 `extension_capabilities` 升级用例不移植。

## 冲突解决（12 处）

- `schema.ts`、`schema.spec.ts`：见上。
- `LexoraConfigStore.ts`：加入 `desktop.speech`。上游 `update` 每次都会写入 `speech`（空对象也写），会让现有的配置用例多出 `speech: {}`；这里改为当前值和补丁都没有 `speech` 时不写，行为更干净，用例不用改。
- `backupSettings.ts`：桌面设置备份键加入 `speech`，保留本地的 `artifact_opening`，不加上游的 `navigation_layout`（本地没有该设置）。
- `backupDatabasePolicy.ts`：`workspace_settings` 里的 `buddy.providers.speech` 归入 `providers`；不加 `extension_capabilities` 分支。
- `DesktopIntegrations.ts`、`registerExtensionIpc.ts`：接入语音后端和 IPC；`registerExtensionIpc.ts` 返回值加 `speech?: SpeechBackend`，保留本地的 `ExtensionPackageStore` 构造（没有 `processExtensionPackageInBackground`）。
- `DesktopModelPicker.vue`、`DesktopModelDetailDialog.vue`、`DesktopProviderDetail.vue`、`DesktopChatComposerFrame.vue`、`DesktopChatComposer.vue`：这些是本地作用域样式的组件，上游版本用 UnoCSS，冲突在样式写法。保留本地写法，只加功能：
  - 服务商详情：类型筛选（分段控件）、搜索框、模型类型文案、空状态；样式写成作用域样式 `desktop-provider-detail__toolbar` / `__search` / `__empty`。
  - 模型详情：类型选择，作用域样式 `desktop-model-detail-dialog__type`。
  - 输入框外框：加入 `toolbar` 插槽（录音时替换工具栏），默认内容仍是本地的 leading / actions。
  - 输入框：录音状态、转写插入、Esc 取消、草稿切换和发送时取消录音；语音播放状态条和录音错误提示。

## 没有一起移植的部分

这些在上游属于“插件贡献能力”（`80b38d769`，本地不移植，保留本地的市场能力层）：

- `DesktopProviderDetail.vue` 的“由插件管理”分支和 `managePlugin`。
- `DesktopChatComposer.vue` 里包住编辑器的 `inputSurface` 和 `useWorkbenchAnchor('composer.input')`（本地没有这个锚点）。
- 备份里的 `extension_capabilities` 分支。
- 服务端 `ProviderService`、`providerApi`、`registerProviderSpeechRpc` 等里的 `plugin:` 服务商和 `plugin-speech` 接口原样保留：本地没有任何东西会产生插件语音模型，这些路径当前不可达，等以后对齐插件能力层时再接上。`registerExtensionIpc.ts` 的 `speech` 目前恒为空。

## 品牌与样式

- “Lexora” 新增 3 处：macOS 麦克风权限说明（`electron-builder.config.cjs`）改为 “XTLaw uses the microphone…”；试听示例句中英文都改为“晓晓”（与 `desktop.chat.agentName` 一致）。其余是 `LexoraConfig` 类型名。
- `uno.config.ts`：补 `accent-on-surface` 颜色，指向 `--buddy-accent-on-surface`（语音录音条用到；原有的 `BuddySelector.vue` 也在用这个类名，之前没有生效）。其他类名本地已有。
- 打包：只有 macOS 的变化（`entitlements.plist` 加 `com.apple.security.device.audio-input`，Info.plist 麦克风说明），Windows 打包不受影响。

## 检查

- 迁移：有（v37 → 本地 v39）；依赖：无；Rust：无；`.github/workflows`：未改。
- WSL 本机：`vue-tsc -b` 通过；`vitest` 的 unit 项目 312 个文件、2344 个用例通过，runtime + platform 项目 431 个文件通过、8 个跳过，3612 个用例通过；改动文件 eslint 通过。
- 未跑：Playwright E2E、开发预览、打包（含 macOS 权限与 entitlements）；真实麦克风录音、转写和朗读；迁移在真实开发库上的运行（本地 v37 → v39）；输入框录音时工具栏切换的真实窗口表现。
- 隐私：录到的音频会发给用户在“语音”设置里选的转写服务商，朗读文本发给选的合成服务商；系统语音朗读不出本机。设置页文案沿用上游，没有额外的“音频会上传”提示，是否补由你定。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 仍是 `b31b0ed3d`（第一轮已越过 `c2c3978a9`），不用动。暂缓项只剩 `9d3fd48dd`（图像增强与 OCR），它依赖本轮的模型类型。
