# 上游集成记录：2026-10-20（第二轮）

分支 `codex/upstream-20261020-2`，从 `master`（`a59e45b9`，已含 0.3.0 版本号）切出。区间 `47b16950..upstream/master`（`f4f8bb07`），共 1 个上游提交，本轮移植 1 个，区间内全部有结论。

## 已移植

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `f4f8bb07` | `Port upstream f4f8bb07` | 避免历史异常阻塞新操作（59 个文件，+4218/−484，含 Rust 文件引擎代码，无迁移、无依赖变化、无工作流变化）。是上一轮 `47b16950`（写入异常恢复）的补丁：旧的写入异常记录不再让后续新操作被拒绝，恢复调度、文件引擎中断与日志回放一并调整，并新增恢复调度、并发与中断的测试。冲突 4 处：两个 `diagnostics.ts` 保留本地的 `fileNotFound` 文案，`taskRecoveryRequired` 取上游新文案；`MutationCoordinator.spec.ts` 两边的 import 合并；`ExecutionCoordinator.spec.ts` 取上游“旧异常记录不再挡住新获取”的断言，路径保留本地 `resolve('/workspace/…')` 写法，让本机 Windows 测试能通过路径校验 |

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 由 `47b16950` 推进到 `f4f8bb07`。

## 与沙盒准备问题的关系

本提交只改写入异常恢复，不触及 Windows 沙盒准备、PATH 处理和 EPERM。0.3.0 发布验证里“标准用户沙盒验证”的失败（沙盒准备对 PATH 中无权读取的目录做 `realpath`，遇到 EPERM 整体失败）来自上游 `6a6de765`，由单独的修复分支处理，不在本轮内。

## 检查

- 新增行品牌检查：新增行里没有 `Lexora` 字样。
- `pnpm type-check`（`apps/buddy`）通过；解决过冲突的 4 个文件 lint 通过。
- 本机 Windows 跑了该提交涉及的 19 个测试文件：12 个通过、7 个有失败（21 个用例），均为 Windows 环境限制，不是移植引入的：
  - `MutationRecoveryService.spec.ts`（8 个）：夹具用 POSIX 路径 `/workspace`，本机路径校验拒绝（上一轮已记录）。
  - `SpaceFileRecovery.spec.ts`（7 个）、`mutationToolExecution.spec.ts`（1 个）：创建符号链接需要权限（`EPERM`）或文件被占用（`EBUSY`），属于符号链接权限、Windows 文件语义一类。
  - `mutationConcurrency.integration.spec.ts`、`mutationContinuation.integration.spec.ts`、`FileResourceCoordinator.spec.ts`、`NativeFileEngine.spec.ts`：依赖真实原生文件引擎与受监管 shell 的运行环境，本机失败。
  这些都是上游新增的测试，不在 `docs/known-test-failures.md`（该清单是 10 月 13 日的基线），需要在 Linux 的 `XTLaw CI` 上确认。
- 未在本机跑：`cargo check` 与 Rust 测试、Playwright E2E（含 `mutation-recovery.e2e.mjs`）、Windows 沙盒脚本、打包。Rust 部分依赖 PR 上 `XTLaw CI` 的 native checks。
