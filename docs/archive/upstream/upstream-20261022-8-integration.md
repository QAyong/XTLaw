# 上游集成记录：2026-10-22（第八轮）

区间是 `5fd3e1012..upstream/master`（`f5757834e`）的 3 个提交。分支 `codex/upstream-20261022-8` 基于已合并 #28、#29 的 `master`，用 `git cherry-pick -x`。上一轮见 [upstream-20261022-7-integration.md](upstream-20261022-7-integration.md)。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `faf6f94dc` | 隔离 Windows 验收用户环境：`verify-windows-sandbox.ps1` 为受限用户设置 `HOME`、`HOMEDRIVE`、`HOMEPATH`、`CARGO_HOME`、`NPM_CONFIG_USERCONFIG`，安装验证改用 `cmd /c` 调用；`run-gui-smoke.mjs` 改为等 `close` 再收尾并读空 stdout；`verify-windows-install.mjs` 失败时输出应用诊断日志 |
| `7b196c351` | `nativeCommand.ts` 保留原生命令的退出错误：子进程失败退出后又遇到 stdin 管道关闭时，不再用 `EPIPE` 覆盖原错误；新增 2 个用例和 `ignored-input` 夹具。无冲突 |
| `f5757834e` | 把 `EOF` 也当作输入管道关闭处理（Windows）；`ci.yml` 里 `windows-acl-checks` 改名 `windows-platform-checks` 并新增 `nativeCommand.spec.ts` 步骤，`ci-gate` 同步 |

### 冲突解决（2 处）

- **`verify-windows-sandbox.ps1`（`faf6f94dc`）：** 上游改的命令行紧挨着本地的品牌改动。保留本地的 `Programs\XTLaw` 安装路径，换成上游的 `cmd /c` 调用。
- **`ci.yml`（`f5757834e`）：** `ci-gate` 的 `needs` 用上游的 `windows-platform-checks`，`if` 保持本地的 `always() && …`，没有换成上游的 `!cancelled()`（同上一轮）。

## 检查

- 迁移：无。依赖：无变更。Rust：无。品牌：新增行里没有用户可见的 “Lexora” 文案；`lexoraHome` 是本地变量名，本地早已用它承载 `XTLAW_HOME`。
- `nativeCommand.spec.ts` 15 个全部通过（本机 Windows）；`vue-tsc -b` 通过；`packaging/buddy/ci`、`apps/buddy/platform/native` 的 eslint 无问题；`ci.yml` 能被 YAML 解析；`verify-windows-sandbox.ps1` 的 PowerShell 语法无错误。
- 未跑：`verify-windows-sandbox.ps1` 和安装验证的真实运行、新增的 `Test native command transport` 步骤，只能靠 CI 验证。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `f5757834e`，即上游 master 的最新提交，本轮之前的所有上游提交都已决定。
