# 上游集成记录：2026-10-31（第二轮）

单独移植 `c79058417`（输入框工具栏布局与显示，6 个文件）。分支 `codex/upstream-20261031-2`，基于本地 `master`（已含第一轮 `codex/upstream-20261031`），用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 本地提交 | 内容 |
| --- | --- | --- |
| `c79058417` | `8de79ec53` | 输入框工具栏的收缩从 CSS 容器查询改为按实际宽度测量：新增 `useComposerToolbarLayout.ts` 和 `DesktopComposerToolbar.vue`，宽度不够时按固定顺序收缩（空间名变短、隐藏思考强度、空间收成图标、模型名变短、权限收成图标、模型收成图标，最后允许横向滚动），宽度够了再展开并留 12px 余量。空间、权限、模型三个按钮加悬浮提示，模型按钮在思考强度不可用时多一个警告图标 |

## 冲突解决（4 处）

- `DesktopChatComposer.vue`（3 处）：
  - 导入：只加 `DesktopComposerToolbar`；上游的 `DesktopComposerSuggestions` 本地没有（本地用 `useChatComposerSuggestions`），不加。
  - 模板：采用上游的 `#actions` 写法（上下文用量、模型选择器），并保留语音那一轮的 `SpeechRecorderButton`；录音时 `#toolbar` 插槽仍整条替换为 `SpeechRecordingToolbar`，新工具栏在 `v-else` 里。
  - 样式：删掉三段容器查询（上下文用量、权限模式、模型选择器），保留本地仍在用的 `__send-*`、`__manage-skills`、`__accessory`、`__footer`、`__disclaimer`。
- `DesktopPermissionModeSelector.vue`：采用上游的 `NTooltip` 包裹和 UnoCSS 类名；收缩变量（`--composer-permission-*`）已随样式合入。
- `DesktopTaskSpaceSelector.vue`：删掉本地的 `@container … display: none` 样式块，根元素加上上游的 UnoCSS 类名（`inline-flex min-w-0 flex-none items-center`），替代原来的作用域样式。
- `DesktopModelTrigger.vue`：本地没有这个文件（上游在 `00feaa2c5` 的样式重构里把模型按钮拆出来，本地没有移植那次重构，按钮仍写在 `DesktopModelSelector.vue` 里），所以不新增该文件，把改动手动搬进 `DesktopModelSelector.vue`：
  - 按钮套 `NTooltip`，思考强度不可用时显示 `Warning16Regular` 警告图标；
  - `max-width` 改读 `--composer-model-max-width`（默认 22rem），去掉 `min(22rem, 44vw)` 和 680px 以下的 `50vw` 限制；
  - 紧凑样式改读 `--composer-model-*`、`--composer-effort-*`、`--composer-toolbar-font-size` 等变量，模型名字重改读 `--composer-model-font-weight`；
  - 可清除时的右内边距：紧凑模式改走变量 `--model-trigger-padding-right`，字段模式仍直接设 `padding-right: 2rem`，这样收成图标时不会被撑开。

## 检查

- 迁移：无；依赖：无；Rust：无；`.github/workflows`：未改。
- 品牌：新增行里没有 “Lexora”。
- WSL 本机：`vue-tsc -b` 通过；改动的 6 个文件 eslint 通过；`src/modules/tasks/widgets/composer`、`src/modules/models`、`src/modules/prompt-input`、`src/modules/speech` 相关 spec 通过（16 个文件、152 个用例）。
- 未跑：Playwright E2E、开发预览、打包。**窄屏收缩顺序是按实际宽度测量的，必须在 Windows 开发预览里看：** 逐步缩窄窗口，确认七步收缩和展开不抖动；录音时工具栏整条替换后恢复正常；模型选择器在设置页（字段模式）里的内边距和清除按钮没变。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 仍是 `b31b0ed3d`：`ce2707b81`（任务统计与上下文只读数据源）还没有决定，`1057555ea`（README）只是建议跳过。两者处理完后再推进到 `bb4c76c62`。
