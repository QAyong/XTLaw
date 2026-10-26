# 上游集成记录：2026-10-26

区间是 `a84e5f203..977df5b77` 的 5 个提交（`a84e5f203` 是 10-25 第三轮后的基线，已在 `origin/master`）。分支 `codex/upstream-20261026`，用 `git cherry-pick -x`。至此 `upstream/master` 已全部检查。

开始前先把 `origin/master` 合并进本地 `master`（`ab55e5f56`）：10-25 的三轮上游移植在 `origin/master` 上，本地 `master` 没有，两边分叉。5 处文件冲突，见下。

## 已移植

| 本地提交 | 上游提交 | 内容 |
| --- | --- | --- |
| `db5c66d1c` | `3d817667f` | multi agents 工作交接与续做（42 个文件，3 处冲突）。迁移登记为本地 v35 |
| `8ce4de51b` | `728e13579` | multi agents 身份与完成反馈（53 个文件，5 处冲突）。迁移登记为本地 v36 |

`3d817667f`：默认隔离上下文的委派（`contextMode`、`contextSourceIds`、`attachmentIds`）；结构化交接单、提交与评审（`brief`、`submit`、`review`）；`history` 与 `resume` 续做；同级互通；每个根回合最多 64 次子任务尝试。新表 `execution_work_attempts`，`runs` 新增 `scheduling_lane`。

`728e13579`：执行定义带名称与描述；系统提示词告知伙伴本次执行的身份；按运行统计令牌用量（`summarizeForRuns`）；对话里伙伴头部显示完成状态。迁移内容只有 `SELECT 1;`。

## 跳过

| 上游提交 | 原因 |
| --- | --- |
| `993bc68a9` 移除 Windows ZIP 即时搬移检查 | 只改 ZIP 验证脚本里“搬移后重启”的检查；本地没有移植 ZIP 验证（10-25 移植 `57d5bec16` 时只取沙箱部分），没有可改之处 |
| `89c430df0` 发布 v0.16.1 | 只改版本号 |
| `977df5b77` 发布 v0.16.2 | 只改版本号 |

## 迁移编号

本地比上游多 v31（`AutomationApprovalPolicy`）和 v32（`AutomationApprovalAllowlist`），所以本地编号整体比上游大 2。上游新增的 v33、v34 对应本地 v35、v36：文件名和表结构与上游一致，只在 `schema.ts` 里登记为本地版本号，`BUDDY_SCHEMA_VERSION` 为 36。本地已发布的 v33、v34 不动。后续上游迁移按“上游编号 + 2”登记。

## 冲突解决

合并 `origin/master`（5 处）：

| 文件 | 处理 |
| --- | --- |
| `DesktopRuntimeHost.ts` | 本地的 `extensionCapabilitiesRpc` 与上游的 `extensionAgentRpc.resource` 两个处理器并存 |
| `registerExtensionIpc.ts` | 返回类型同时带 `capabilities` 与 `agent.readResource` |
| `BuddyService.ts` | 两个导入并存 |
| `plugin-creator/references/api.d.ts` | 保留本地的 `McpConnectorContribution`、`SubagentContribution`，`Resource` 采用上游带 `sourceId` 的定义 |
| `DesktopExtensionInstallReview.vue` | 以上游新布局（`DesktopExtensionReviewPermissions` 组件、UnoCSS 类名）为底，加回本地的市场来源标题、MCP 连接器区块、子代理区块和 `:tooltip="false"` |

`3d817667f`（3 处）：`schema.ts` 登记为 v35；`useTaskCapability.ts` 里按所选伙伴区分的 `activeRun`，内部沿用本地的原始运行列表 `executionRuns`，对外暴露的沿用对话呈现用的 `runs`（保持“停止后立即不显示”）；`ExecutionDelegationService.spec.ts` 两个导入并存。

`728e13579`（5 处）：`schema.ts` 登记为 v36；`schema.spec.ts` 保留本地 v23 升级用例，并加入上游的身份迁移用例（前置版本改为 35）；`createBuddySystemPrompt.ts` 保留 `You are XTLaw, …`；`BuddyChatAgentIdentity.vue`、`BuddyChatAgentTurn.vue` 保留本地的折叠标题，传入执行状态时由伙伴头部显示完成状态，标题不再重复显示。

## 随之做的本地调整

- `BuddySessionResources.ts` 新增的“Lexora is the host application”改为 “XTLaw is the host application”。
- `DesktopNotificationSound.spec.ts` 的执行夹具补上 `usage: null`（上游同一提交只改了 `DesktopNotificationService.spec.ts`，本地多一个夹具）。

## 检查

- 迁移：有，见上；依赖：无变更；Rust：无；`.github/workflows`：未改。品牌：新增行里的 “Lexora” 只出现在测试里的名字和 `lexora_` 工具名，提示词中的宿主名已改为 XTLaw。
- 本机类型检查（`vue-tsc -b`）通过。
- 本机 Windows 跑过的范围里，失败都来自缺少原生程序（`rg.exe`、`fd.exe`、图片转换、文件读取、私有目录）、符号链接权限或 `known-test-failures.md` 已列的用例；`schema.spec.ts`、`multiAgentUpgrade.spec.ts`、`executionWork.spec.ts`、`ExecutionDelegationService.spec.ts` 通过。
- `useTaskCapability.spec.ts` 里“按所选伙伴区分 activeRun”的用例，在最后一处修改后没有在本机重跑，以 `XTLaw CI` 为准。
- 本机没有对比合并前的基线，`skillAuthoringCapability`、`actorCapabilities` 等失败是否本来就存在，以云端 CI 为准。
- 未跑：Playwright E2E、开发预览、打包；迁移在真实开发库上的运行（v35、v36）；对话里伙伴头部完成状态的真实窗口表现。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `977df5b77`，即 `upstream/master` 当前最新提交。
