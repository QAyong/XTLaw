# 上游集成记录：2026-10-22（第四轮）

区间是 `bbb1bb06..upstream/master`（`8ed3cf716`），只含 1 个上游提交。前三轮见 [upstream-20261022-integration.md](upstream-20261022-integration.md)、[upstream-20261022-2-integration.md](upstream-20261022-2-integration.md)、[upstream-20261022-3-integration.md](upstream-20261022-3-integration.md)。分支 `codex/upstream-20261022-4` 从 `origin/master`（`cb448541c`，已含 #24、#25）切出，用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `8ed3cf716` | 移除命令执行的全工作区扫描（46 个文件，+763/−606，无 Rust、无依赖变更）。以前每次命令前后都对整个工作区拍快照来发现改动；现在删掉 `workspaceSnapshot.ts`，由 `CapturedFileWriter` 按文件记录变更，`ChangeCaptureService` 直接捕获。变更集新增 `coverage_reasons`，调用记录新增 `captureMode`（`legacy` / `files` / `untracked`）；图片生成与图片变换经 `CapturedFileWriter` 写出，命令工具的执行阶段（`toolExecutionPhase`）经沙盒 RPC 回传 |

### 迁移编号（偏离上游，用户已确认）

上游新迁移是 `v32ChangeCapture`，本地沿用已确认的 +2 偏移，记为 **`v34ChangeCapture`**（`BUDDY_V34_CHANGE_CAPTURE_SCHEMA_SQL`），`BUDDY_SCHEMA_VERSION` 从 33 升到 34。

| 内容 | 上游 | 本地 |
| --- | --- | --- |
| 自动化审批策略 | | v31 |
| 自动化审批白名单 | | v32 |
| 写入异常恢复 | v31 | v33 |
| 变更捕获 | v32 | v34 |

迁移内容：给 `run_change_sets` 加 `coverage_reasons_json`，并把原来 `coverage = 'partial'` 的记录标为 `["legacy_partial"]`；给 `run_change_invocations` 加 `capture_mode`（默认 `legacy`）。不改历史文件快照和调用标识。

### 冲突解决（4 个文件）

- `schema.ts`：版本常量与迁移列表保留本地 v31 到 v33，追加 v34；导入按版本顺序放在 v33 之后。
- `schema.spec.ts`：保留本地 v23 升级用例，追加上游“升级捕获覆盖原因”用例，前置迁移上限改为 33、`user_version` 改为 33。
- `mutationRecoveryDecisions.spec.ts`：上游夹具建到 v30 再让 v31 重跑；本地对应 v32 到 v33，所以夹具建到迁移 ≤32，`user_version = 32`，让 v33 与 v34 重新执行。
- `BuddyChatTurnChanges.vue`：保留本地作用域样式，只补上游的 `v-if="changeSet.fileCount > 0"`。

没有冲突的部分：沙盒主进程 RPC、`shellCapability.ts`、`ShellSelection.spec.ts`（依赖已合并的多 Shell）、`ArtifactService.ts`（#24 的 `ENOTDIR` 改动与本提交互不干扰）。

### 文案

`desktop.chat.turnChanges` 由“{count} 处文件变更”改为“已记录 {count} 处文件修改”（英文 “Recorded {count} file changes”），随上游。无新增 “Lexora” 用户可见文案。

## 检查

- 类型检查：`apps/buddy` 的 `vue-tsc -b` 通过。`eslint` 对全部改动文件无问题。
- vitest（本机 Windows，跑了 `service/src/changes`、`storage`、`sandbox`、`agent/events`、`agent/extensions`、`images`、`artifacts`、`approvals`、`src/modules/tasks`、`platform/process`）：1542 通过、17 失败，没有本次移植引入的失败。
  - 上一轮已记录的 Windows 失败仍在：符号链接 `EPERM`（`SandboxDirectoryPermissions`、`mutationToolExecution`、`StorageSnapshots`）、`toolPolicyExtension`×2、`sandboxPermissions`，以及 `ToolDisclosure.spec.ts` 引用内置 `bash` 的平台假设。
  - `MutationRecoveryService.spec.ts` 8 个和 `BuddyDataPaths.spec.ts` 1 个也失败，我在干净的 `origin/master`（`cb448541c`）上单独复跑，同样失败，所以不是本次引入。它们不在 `docs/known-test-failures.md` 里，清单已过期，等 Linux CI 的结果再判断。
  - 迁移相关的新旧用例（`schema.spec.ts`、`mutationRecoveryDecisions.spec.ts`）通过。
- 未跑：Playwright E2E（上游为 `sandbox.e2e.mjs` 新增约 214 行，覆盖命令执行不再扫描工作区）、**迁移在真实开发库 `.xtlaw-dev` 上从 v33 升到 v34**、多 Shell（`lexora_shell`）路径下的变更捕获、开发预览、打包、全量测试。合并前请先备份开发库。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `8ed3cf716`。至此 `c81bdfb5` 之后的 9 个上游提交都已决定：移植 8 个，跳过 1 个（`9a8da6e6`）。
