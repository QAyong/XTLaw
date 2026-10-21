# 上游集成记录：2026-10-21

分支 `codex/upstream-20261021`，从 `master`（`809a0cea`，已合并 #19、#20）切出。区间 `f4f8bb07..upstream/master`（`c81bdfb5`），共 3 个上游提交，本轮移植 2 个，另 1 个已评估、留待单独成轮。

## 已移植

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `415461be` | `Port upstream 415461be` | 沙盒准备时跳过无权读取的 PATH 条目（上游 PR #405，来自本地 PR，5 个文件，无迁移、无依赖、无工作流变化）。**上游版本取代本地 `f594301a`**：冲突的 `windows/createPolicy.ts` 和 `sandboxPolicy.spec.ts` 直接取上游版本；核对过这两个文件相对 `415461be^` 的差异只来自 `f594301a`，没有丢失其他本地改动。上游版比本地版多做了：重写 Windows 的 `createPolicy.ts`（必需目录仍然出错即失败，PATH 中的 EPERM/EACCES 条目跳过，其他 IO 错误照常抛出），去掉 `srt/createPolicy.ts` 里对 PATH 的 `existingSandboxPaths` 调用，新增 `sandboxPathPermissions.native.spec.ts`（真实 ACL 拒绝）和 `shellSandbox.spec.ts` 的 Linux 用例 |
| `c81bdfb5` | `Port upstream c81bdfb5` | 修复 Markdown 列表序号截断（1 个文件，仅样式）：调整 `DesktopMarkdownContent.vue` 的列表缩进，并给 `ol.list-node` 增加起始内边距。无冲突 |

## 已评估、本轮不移植

| 上游提交 | 原因 |
| --- | --- |
| `ff5c2916` | 完善网络权限与空间目录授权（上游 PR #409，102 个文件，+3496/−296，无迁移、无依赖变化）。试合并对 `master` 有 21 处冲突，超过单独成轮的门槛。它是维护者对本地 PR #394（自动化审批策略与免确认白名单）的重做版：#394 已关闭，改由 #409 取代。**但上游没有自动化审批策略和白名单**，`cfd3a992`（含 `v31AutomationApprovalPolicy`、`v32AutomationApprovalAllowlist` 两个迁移）已随 0.3.0 发布，按“已发布迁移不覆盖、不重编号”，取代时需保留这两个迁移、去掉功能代码，具体方案待确认后单独成轮 |

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 由 `f4f8bb07` 推进到 `c81bdfb5`。**`ff5c2916` 未移植，不因基线推进而视为已处理**：它是下一轮的待办，从本记录进入，不会再出现在“上次基线..上游”的区间里。

## 检查

- 新增行品牌检查：两个移植提交的新增行里没有 `Lexora` 字样（`LEXORA_ACL_TEST_ROOT` 是测试环境变量名）。
- `pnpm type-check`（`apps/buddy`）通过。
- 本机 Windows 测试：
  - `sandboxPolicy.spec.ts`、`sandboxPathPermissions.native.spec.ts`（真实 ACL 拒绝，3 个用例）通过。
  - `shellSandbox.spec.ts` 的 16 个 Linux 用例在本机按条件跳过，需在 Linux 的 `XTLaw CI` 上确认。
  - Markdown 相关的 `fileViewIdentity.spec.ts`、`messageLinkRouting.spec.ts` 通过（9 个用例）；该提交只改样式，没有对应的专门测试。
- 未在本机跑：Linux 沙盒用例、Playwright E2E、开发预览（`c81bdfb5` 的列表缩进未做目视确认）、打包。
