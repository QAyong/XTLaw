# 上游集成记录：2026-10-20

分支 `codex/upstream-20261020`，从 `master`（`844bfb37`）切出。区间 `93644a07..upstream/master`（`47b16950`），共 1 个上游提交，本轮移植 1 个，区间内全部有结论。

## 已移植

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `47b16950` | `Port upstream 47b16950` | 支持写入异常恢复与保护解除（71 个文件，+3027/−372，含 Rust 原生代码、1 个迁移、1 项依赖升级）。新增 `run_mutation_evidence`、`run_mutation_executions` 两张表，任务页新增恢复提示，沙盒与受监管 shell 增加回执与 Windows 开机证据。冲突 3 处：`activity.ts` 两边的 import 都保留（本地的 `artifactOpenRequestSchema` 与上游的 `changesRecoveryRpc`）；`ownedProcessRecovery.ts` 取上游的 `bootEvidence`、可选 `bootId`，作业名前缀保持 `XTLaw`；`schema.ts` 见下 |

### 迁移编号（偏离上游，用户已确认）

上游把新迁移编为 `v31MutationRecovery`，但本地 `v31`、`v32` 已是自动化审批策略与白名单（`cfd3a992`），开发库已升到 32，不重编号。本地将上游迁移记为 **v33**：文件 `v33MutationRecovery.ts`，常量 `BUDDY_V33_MUTATION_RECOVERY_SCHEMA_SQL`，`BUDDY_SCHEMA_VERSION` 为 33。迁移 SQL 只建两张新表并引用 `run_mutation_leases`（早先迁移已有），不依赖本地 v31、v32 的内容。`mutationRecoveryDecisions.spec.ts` 里模拟“旧库”的 `PRAGMA user_version` 由 30 改为 32，否则会在已有表上重放本地 v31、v32。以后上游再用 v32 及以后的编号，需要逐个与本地编号对照，不能直接照搬。

### 偏离上游（品牌隔离）

上游新增的 `ownedProcessRecovery.ts` 里有两处 Windows 作业名前缀 `Global\Lexora.Buddy.Shell.v2.`，已改为 `Global\XTLaw.Buddy.Shell.v2.`，与本地 Rust 常量 `WINDOWS_JOB_PREFIX`（`recovery.rs`）一致，否则校验会拒绝本地创建的作业名。新增行里再无其他 `Lexora` 字样。

### 依赖

`@anthropic-ai/sandbox-runtime` 0.0.79 → 0.0.80；补丁文件改名为 `@anthropic-ai__sandbox-runtime@0.0.80.patch`；`pnpm-lock.yaml`、`pnpm-workspace.yaml` 随之变化。已执行 `pnpm install`。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 由 `93644a07` 推进到 `47b16950`。

## 检查

- `pnpm type-check`（`apps/buddy`）通过。
- 本机 Windows 跑了该提交涉及的 13 个测试文件，加 `src/modules/settings` 与 `service/src/storage`：61 个文件通过，3 个文件失败，均为环境限制：
  - `MutationRecoveryService.spec.ts`（9 个用例失败 8 个）：夹具用了 POSIX 路径 `/workspace`，本机 Windows 的路径校验报 `Windows file paths must be fully qualified`；属于“POSIX 路径语义”一类，不在 `docs/known-test-failures.md` 里（该用例是本轮新增），需要在 Linux CI 上确认。
  - `BuddyDataPaths.spec.ts`、`StorageSnapshots.spec.ts`：已在已知失败清单中。
- 未在本机跑：`cargo check` 与 Rust 测试、Playwright E2E（含 `mutation-recovery.e2e.mjs`）、`shell_sandbox.windows.mjs`、开发预览、打包。Rust 与跨平台部分依赖 PR 上的 `XTLaw CI`（含 native checks）。
- 迁移在真实开发库（`.xtlaw-dev`，当前 v32）上从 32 升到 33 的过程未验证；合并前建议先备份开发库。
