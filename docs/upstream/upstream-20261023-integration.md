# 上游集成记录：2026-10-23

区间是 `f5757834e..upstream/master`（`a378eb8ae`，v0.15.0）的 5 个提交。分支 `codex/upstream-20261023` 基于本地 `master`，用 `git cherry-pick -x`。上一轮见 [upstream-20261022-8-integration.md](upstream-20261022-8-integration.md)。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `404429eb8` | 发布流程的“Attest release assets”步骤补上 `macos/*.zip`（XTLaw 发布流程会产出 macOS ZIP）。手动合入 |
| `bfb0bb696` | 优化域名权限表格：`DesktopNetworkPermissions.vue` 调整，新增 `DesktopNetworkRuleActions.vue`。无冲突 |

### 冲突解决（1 处）

- **`release.yml`（`404429eb8`）：** 上游同时带了 `artifacts/**/*.sha256` 这一行，本地发布流程（`05fff925c`）的该步骤没有它，保持不变，只加 `macos/*.zip`。

## 暂缓：插件三连（单独成轮，本轮只评估）

| 上游提交 | 规模 | 试合并冲突 |
| --- | --- | --- |
| `b6896babc` 支持文件打开方式与插件启动入口 | 78 个文件 | 21 处 |
| `16777975e` 支持插件引用与来源定位 | 50 个文件 | 11 处（接在前一个之后） |
| `a378eb8ae` 支持插件 WASM 与 Worker | 38 个文件 | 11 处（接在前两个之后） |

三个提交互相依赖（`b6896babc` 与 `16777975e` 有 12 个共同文件），要么一起移植，要么一起跳过。冲突集中在扩展系统（`ExtensionService`、`ExtensionPackageStore`、`extensionApi`、`extensionManifest`）、选区引用和任务上下文面板。无新迁移、无依赖变更、无 Rust；新增行里的 `Lexora` 都是标识符（`lexoraDesktop`、`lexora-extension:` 协议）。

## 检查

- 迁移：无。依赖：无变更。Rust：无。品牌：新增行里没有用户可见的 “Lexora” 文案。
- `vue-tsc -b` 通过；`DesktopNetworkPermissions.spec.ts` 7 个全部通过（本机 Windows）；`release.yml` 能被 YAML 解析。
- 未跑：发布流程的真实运行，只能在下次发版时验证。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `bfb0bb696`。插件三连（`b6896babc` 之后）尚未决定，下一轮从它们开始。
