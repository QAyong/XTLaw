# 上游集成记录：2026-10-27（第二轮）

区间是 `46fcc9081..18f424031` 的 3 个提交（`46fcc9081` 是上一轮的基线）。分支 `codex/upstream-20261027-2`，用 `git cherry-pick -x`，基于 `codex/upstream-20261027`。至此 `upstream/master` 已全部检查。

## 已移植

| 本地提交 | 上游提交 | 内容 |
| --- | --- | --- |
| `64725505d` | `c63fb937f` | 对话模式（非画布）补充“从这里分支”：回答工具栏按钮、输入框上方的分支提示条（`DesktopFollowupContext.vue`）、查看来源与取消分支；画布节点改用统一的 `desktop.chat.followup*` 文案和 `messageBranch` 图标 |
| `d17ce7a1d` | `54bc2d73e` | 分支序号恢复为 `1 / 3`，去掉“Branch”前缀和提示（修正上一个提交） |

## 跳过

`18f424031`（优化上下文面板工具栏）：它改的是上游的 `WorkbenchResourcePanelActions.vue`（把“交换左右”收进“更多操作”菜单并新增“关闭”），本地没有这个组件，放大/还原按钮直接写在 `WorkbenchResourcePanel.vue`，左右位置由 `contextPanePlacement.ts` 管理，结构不同，不照搬。同时丢弃 `.playwright/` 下本地已删除的 E2E 脚本改动。

## 冲突解决

`c63fb937f`：
- `ConversationMessageNode.vue`：保留本地的 `Chat20Regular` 图标和 `:title`，去掉不再使用的 `Add20Regular`、`ArrowSync20Regular` 导入；操作按钮改用上游的 `NTooltip` + `messageRetry / messageBranch` 图标。
- `BuddyChatActionToolbar.vue`：分支导航容器保留本地的纯类名写法（样式在作用域 CSS 中），只加 `role="group"` 和 `aria-label`。
- `BuddyChatAgentTurn.vue`：保留本地的 `resultUsage ?? turn.usage`，加上 `following-up`。
- `BuddyChatMessageList.vue`：本地已移除 `useWorkbenchAnchor`，不带回，只加 `getChatMessageFollowupSourceId`。
- `DesktopChatWorkspace.vue`：保留本地的 `useMessage`、`useTaskEnvironment` 和 `composer-stack` 样式，删除旧的 `desktop-chat-page__followup` 模板与样式，换成 `DesktopFollowupContext`。
- `.playwright/scripts/__tests__/conversation-canvas.e2e.mjs`：本地已删除，丢弃。

`54bc2d73e`：无冲突，直接应用。

## 检查

- 迁移：无；依赖：无；Rust：无；`.github/workflows`：未改。品牌：新增代码里没有 “Lexora”。
- 样式：`DesktopFollowupContext.vue` 用到的 `accent-text`、`accent-subtle`、`accent-border` 在 `apps/buddy/uno.config.ts` 中已有映射，无需补充。
- WSL 本机：`vue-tsc -b` 通过（需 `NODE_OPTIONS=--max-old-space-size=8192`，默认堆会溢出）；`src/modules/tasks` 下 105 个测试文件、956 个用例全部通过。
- 未跑：Playwright E2E、开发预览、打包；分支按钮、提示条、画布节点按钮的真实窗口表现。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `18f424031`，即 `upstream/master` 当前最新提交。
