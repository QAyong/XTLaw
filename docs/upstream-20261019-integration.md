# 上游集成记录：2026-10-19（A 清单）

分支 `codex/upstream-20261019`，从 `master`（`a90029d6`）切出。区间 `702e9933..upstream/master`（`6c636187`，v0.14.0），共 12 个上游提交；本轮只处理 A 清单的 6 个，其余推迟，等待确认。

## 已移植

按上游顺序逐个 `git cherry-pick -x`，提交说明为“英文（中文）”并保留来源行；冲突在对应提交内解决。

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `1bf1f90b` | `ea56ee47` | 分屏新任务交互。`DesktopWorkbenchArea.vue` 冲突：保留本地的侧栏底部 `DesktopSidebarFooter` 插槽，仅把 `@new-task` 改为上游的 `spaceId => newTask({ spaceId })` 调用形式 |
| `32d1a0d7` | `5ced4f50` | NPC 小队协作开关。`buddyLabels.ts` 冲突：本地已把“NPC”改称“协作助手”，保留本地文案，新增 `npcTeamEnabled`、`npcTeamEnabledHint`、`npcTeamDisabledHint`（中英文），措辞改用本地的“助手”叫法 |
| `9b59f22b` | `10788d3f` | 子任务交接与收尾延迟，无冲突 |
| `f5ce6387` | `4098f56b` | 任务执行信息展示顺序，无冲突 |
| `4fad9d03` | `f78041dd` | GitHub 项目链接。`productLinks.ts` 冲突：同时保留 `REPOSITORY_URL` 和本地的 `xtlaw-v` 发布标签函数；链接来自 `package.json` 的 `repository`（`QAyong/XTLaw`） |
| `8ac7bac1` | `808649c4` | 插件源码链接。`DesktopExtensionCatalog.vue` 冲突：保留本地网格类名，仅补上 `:repository="item.repository"` |

## 推迟（未处理，基线不推进）

| 上游提交 | 原因 |
| --- | --- |
| `f6d666ef` | 改 Rust（12 个文件，+1642 行）；新增 Windows 作业对象名前缀 `Global\Lexora.Buddy.Shell.v2.`，需定是照搬还是改为 XTLaw 命名；是 `dcbd103d` 的前置 |
| `cb013dd1` | 新迁移 v30（本地现为 v29，编号与上游一致，可直接续上）；按 `32d1a0d7` 之后试合并仍有 `schema.spec.ts` 1 个冲突 |
| `dcbd103d` | 59 个文件、改 Rust 文件引擎、9 个冲突；依赖 `f6d666ef`。单独成轮，先只做评估 |
| `cfd76fce` | 11 个冲突；上游修改的 `DesktopAppSidebar.vue` 在本地已删除；侧栏标题硬编码 “Lexora”。单独成轮，先只做评估 |
| `b68e89d6` | 50 个文件、10 个冲突、改 `package.json` 与 `pnpm-lock.yaml`；依赖 `32d1a0d7`（已移植）和 `cfd76fce`（未处理） |
| `6c636187` | 发版提交，只改版本号，计划跳过；等推迟的提交处理完再一起推进基线 |

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 保持 `702e9933` 不变：区间中间有推迟的提交，现在推进会漏掉它们。下一轮预评估时，已移植的 6 个提交按来源行（`cherry picked from commit`）排除。

## 检查

- 新增行品牌检查：没有需要改的 `Lexora` 展示文案。唯一的字面量是 `buddies.e2e.mjs` 里按窗口标题 `Lexora` 查找窗口，与 `desktop.e2e.mjs` 里测试应用名 `Lexora Buddy Test` 一致，保留。
- 本区间无迁移和 Rust 变更，没有依赖变更，未执行 `pnpm install`。
- `pnpm type-check`（`apps/buddy`）通过。
- 改动相关目录的 spec（`shared/buddies`、`service/src/buddies`、`service/src/agent/execution`、`executionRepository`、`turnRequestRepository`、composer、buddies、extensions、`electron`）：842 通过，17 失败。
  - 16 个已在 `docs/known-test-failures.md`：`BrowserAdapterServer` 7、`buddyServiceProcess` 4、`buddyServiceEnvironmentPaths` 2、`linuxAutostart` 1、`rendererProtocol` 1、`BuddyTurnLauncher` 1。
  - 1 个不在清单：`buddiesExtension.spec.ts`（头像符号链接），在夹具里 `symlink` 报 `EPERM`，属于 Windows 符号链接权限限制；没有在干净基线上复现确认，也未写入清单。
- 未跑全量测试、Playwright E2E、开发预览或打包，未目测分屏新任务、小队协作开关、GitHub 项目链接和插件源码链接的界面。
