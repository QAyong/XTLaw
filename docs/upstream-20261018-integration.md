# 上游集成记录：2026-10-18

分支：`codex/upstream-20261018`，基于本地 `master` 的 `b4416e4c`。

检查范围：`da16402e..702e9933`，共 6 个提交。[Issue #7](https://github.com/QAyong/XTLaw/issues/7) 机器人报告的是 `..b4b05e69` 的 4 个提交，并停在 `3d5a5116`；其后上游又新增 `b9b70d26`、`702e9933`。本轮经预评估并由用户确认后移植前 3 个，其余按下表处理。

## 已移植

按上游顺序逐个 `cherry-pick -x`，提交说明使用英文（中文）并保留来源行；冲突修复已归入对应移植提交。

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `3d5a5116` | `3c5ba2d5` | 任务「更多」菜单新增标记和复制。菜单项改由上游 `useTaskMenuActions` 提供，新增共享的 `buddy-spaced-submenus` 子菜单样式，窗格操作菜单支持 `label`。冲突的三个组件保留本地作用域样式，只取上游的类名和行为；本地行内的“置顶”仍放在「更多」菜单中（上游改为行内按钮，本地保留删除按钮布局），因此在 `taskActions` 之后补回置顶项 |
| `afed476c` | `e673e7d0` | 统一编辑与重命名图标：新增 `edit` / `editFilled` 图标并删除 `message-edit`，各处 `messageEdit` 改为 `edit`。本地聊天与画布组件保留作用域样式和已有导入；本地任务行没有上游的删除菜单项，保留行内删除按钮 |
| `0e2b5c2f` | `4e7bf827` | 升级 Pi 至 1.3.0（含补丁文件和工作区配置）。`pnpm-lock.yaml` 取本地版本后执行 `pnpm install` 重新生成 |

## 跳过与推迟

- `b9b70d26`（复制文件写入绝对路径）：跳过。来自用户自己的上游 PR #367，本地已有 `2225cf7f`。上游合并版额外改了 `spaces.ts`、`localChatApi.ts` 等适配上游架构的文件，本地实现用 `FileOperationService`，两者不等同但功能一致，没有逐行比对维护者是否追加改动。
- `702e9933`（稳定选区引用与文件菜单定位）：跳过。来自用户自己的上游 PR #366，本地已有 `b143165e`。与 `b4b05e69` 共改 4 个测试文件，评估 `b4b05e69` 时以本地版本为准。
- `b4b05e69`（统一输入材料与引用展示）：已在同日第二段 `codex/upstream-20261018-2` 移植，见下文。

## 第二段：`b4b05e69`

分支 `codex/upstream-20261018-2`，本地提交说明保留来源行。采用上游的新组件：`ChatInputMaterialStrip`、`ChatInputMaterialCard`，统一输入材料模型 `buddyInputMaterial`、`inputMaterialView`，以及消息正文中的 `quote_ref` 节点。删除本地旧的 `ComposerResourceStrip`、`ChatSessionReferenceStrip`、`ResourceQuoteStrip`、`ReferenceCard`，`chatQuoteEditing.ts` 由 `chatComposerQuoteEditing.ts` 取代。

- 冲突文件取上游版本；本地作用域样式改写只是写法差异，不再保留。保留的本地行为：`external-link-mode="host"` 与 http(s) 链接走 `openWebLink`、“所选助手”文案、`docx` 选区字段、输入框 `accessory` 插槽。
- 本地选区引用（`b143165e`）接入 `quote_ref`：新增资源引用会在正文末尾追加 `quote_ref` 节点，`resourceQuotesProjection.spec.ts` 的断言按此更新；`BuddyChatMessageContent.spec.ts` 改查 `[data-material-key]`。
- 跳过的 `b9b70d26`、`702e9933` 排在它之后，基线因此推进到 `702e9933`。

## 依赖与基线

- 基线 `docs/upstream-baseline.json` 现为 `702e9933`：区间内 6 个提交 4 个移植、2 个跳过。第一段结束时 `b4b05e69` 未处理，基线曾停在 `0e2b5c2f`。
- 本区间无数据库迁移和 Rust 变更；`0e2b5c2f` 有依赖和补丁变更，已执行 `pnpm install`。
- 新增行品牌检查：无 `Lexora` 字样。

## 验证

- `pnpm --filter @uselexora/lexora-buddy type-check` 通过（修复一处 `pinLabel` 未使用）。
- 跑了改动相关目录的 spec（任务索引、窗格、画布、转录、工作区、agent 扩展与会话、providers、MCP），721 个用例通过，9 个失败：
  - 7 个已在 `docs/known-test-failures.md`（`toolPolicyExtension` 3 个、`createReusableBuddySession` 3 个、`inspectCommittedPiCompaction` 1 个）。
  - 另 2 个（`mutationToolExecution`、`createBuddySession` 的技能元数据）失败原因都是 Windows 下 `symlink` 报 `EPERM`，与本轮改动无关，但没有在干净基线上复现确认，也未写入已知失败清单。
- 未跑全量测试、Playwright E2E、开发预览或打包，未验证菜单和图标的实际显示。

第二段验证：类型检查通过；输入框、引用、转录、上下文面板、选区引用、`shared/conversation` 相关 spec 416 通过，另 3 个因断言旧结构失败，已按新结构更新后通过。未跑 Playwright E2E 和界面实际显示检查，`ChatInputMaterialStrip` 的视觉与交互尚未目测。
