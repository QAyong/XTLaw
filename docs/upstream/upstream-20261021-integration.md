# 上游集成记录：2026-10-21

区间 `f4f8bb07..upstream/master`（`c81bdfb5`），共 3 个上游提交，全部有结论：移植 3 个，并移除 1 个被上游取代的本地功能。

- 分支 `codex/upstream-20261021`：从 `master`（`809a0cea`，已合并 #19、#20）切出，移植 `415461be`、`c81bdfb5`。
- 分支 `codex/upstream-20261021-2`：基于上一个分支，移除 `cfd3a992` 后移植 `ff5c2916`。

## 已移植

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `415461be` | `Port upstream 415461be` | 沙盒准备时跳过无权读取的 PATH 条目（上游 PR #405，来自本地 PR，5 个文件，无迁移、无依赖、无工作流变化）。**上游版本取代本地 `f594301a`**：冲突的 `windows/createPolicy.ts` 和 `sandboxPolicy.spec.ts` 直接取上游版本；核对过这两个文件相对 `415461be^` 的差异只来自 `f594301a`，没有丢失其他本地改动。上游版比本地版多做了：重写 Windows 的 `createPolicy.ts`（必需目录仍然出错即失败，PATH 中的 EPERM/EACCES 条目跳过，其他 IO 错误照常抛出），去掉 `srt/createPolicy.ts` 里对 PATH 的 `existingSandboxPaths` 调用，新增 `sandboxPathPermissions.native.spec.ts`（真实 ACL 拒绝）和 `shellSandbox.spec.ts` 的 Linux 用例 |
| `c81bdfb5` | `Port upstream c81bdfb5` | 修复 Markdown 列表序号截断（1 个文件，仅样式）：调整 `DesktopMarkdownContent.vue` 的列表缩进，并给 `ol.list-node` 增加起始内边距。无冲突 |
| `ff5c2916` | `Port upstream ff5c2916` | 完善网络权限与空间目录授权（上游 PR #409，102 个文件，无迁移、无依赖、无原生代码、无工作流变化）：全局网络权限规则（按域名与操作 allow/ask/deny，浏览器、网页工具和沙盒命令共用）、审批卡片的 `network-permission` 类型与 `persistent` 授权范围、设置页网络权限编辑界面、空间额外目录（多目录绑定、文件管理器与任务面板按目录打开）。对当前分支试合并有 20 个冲突文件，处理见下 |

## 移除的本地功能

| 本地提交 | 处理 |
| --- | --- |
| `cfd3a992` | 自动化审批策略与免确认白名单（本地 PR #394）。#394 已被维护者关闭，由上游 #409（`ff5c2916`）取代，上游没有按自动化的审批策略和白名单。作为单独提交 `Remove per-automation approval policy and allowlist` 撤销功能代码、界面、`createAutomationTool` 的 `approvalPolicy`/`approvalAllowlist` 参数和对应测试。**保留** `v31AutomationApprovalPolicy`、`v32AutomationApprovalAllowlist` 两个迁移及 `automations.approval_policy`、`approval_allowlist_json` 两列：0.3.0 已发布，不覆盖、不重编号；列有默认值，代码不再读写。**兼容旧快照**：0.3.0 写入 `automation_occurrences.execution_snapshot_json` 的快照带有 `approvalPolicy`、`approvalAllowlist`，而共享 schema 是 `.strict()`，所以读取时先去掉这两个字段（`automationOccurrenceRecord.ts`），并新增 `automationOccurrenceRecord.spec.ts` 覆盖；`automationActorSnapshots.spec.ts` 的 v25 升级夹具继续移除这两列 |

行为变化：已设为“人工审批”或带白名单的自动化，会回到统一的无人值守规则（需要确认的操作被拒绝）；后台权限选择器恢复为不显示“人工审批”；无人值守要访问某域名需先在全局网络权限里设规则，要访问某目录需先加入空间的额外目录。幂等重放的 `automation_mutation_requests.response_json` 里可能还有 0.3.0 的旧字段，该表只按原样回放，没有额外处理。

## `ff5c2916` 的冲突处理

- **浏览器**（`BrowserHost`、`BrowserPageSession`、`BrowserSecurityPolicy`）：保留本地的“人工手势才允许下载”和文件选择器处理，在其上叠加上游的网络授权（`authorizeNetwork`、响应头阶段的下载授权）。上游测试 `BrowserNetworkAuthorization.spec.ts` 里“文件选择器 `cancel: true`”的断言按本地行为改为 `{ enabled: true }`，并改了用例标题。
- **配置**（`LexoraConfigStore`、`desktopApiSchemas`、`DesktopRuntimeHost`）：保留本地导入并合并上游的网络权限 RPC；不引入本地没有的 `desktopNavigationLayout`。
- **功能引导**：保留本地 `npc-team` 条目与文案；新增 `additional-directories`、`network-permissions` 两个引导，版本定为 `0.3.1`（0.3.0 已发布，之前的用户升级后可见）；不移植上游的 `navigation-layout` 引导（对应功能本地没有）。`featureDiscovery.spec.ts` 里上游新增用例的版本号改为 `0.3.0`/`0.3.1`。
- **文件管理器与任务产出**（`SpaceFileService`、`useTaskContextPanel`、`chatToolFileTarget`、`DesktopFileSpacePicker`、`DesktopTaskResourcePanel`、`FileOperationService.spec`）：保留本地已有的音视频预览、文件缺失区分、任务产出打开与最大化按钮等改动，再吸收上游的多目录逻辑。`resolveChatToolDirectoryTarget`、`openDirectory`、`newFilesTab` 改为按目标目录而不是主目录解析。这一带与本地待上游合并的 PR #406、#407、#408 有交集，这些 PR 合并后需要再对一次。
- **设置页**：`DesktopBrowserSettings.vue` 沿用本地作用域样式，只加入 `DesktopNetworkPermissions`；`update` 改为返回是否保存成功，以符合新组件的 `save` 类型。
- **测试**：`requestThroughHost.spec.ts` 是双方各自新增的同名文件，合并为上游的响应体测试加本地的搜狗 cookie 测试（改用上游的 `net.request` 模拟）。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 由 `f4f8bb07` 推进到 `c81bdfb5`，区间内 3 个上游提交都已有结论。

迁移编号：本地 v31/v32 是本地独有，本地 v33 对应上游 v31（写入异常恢复）。上游之后的迁移会从 v32 起，与本地 v32/v33 冲突，下次出现上游迁移时按 AGENTS.md 先停下来确认编号，不自行分配。

## 检查

- 新增行品牌检查：`ff5c2916` 新增行里的 `Lexora` 只有 `window.lexoraDesktop`、`LexoraConfigStore`、`lexoraConfigPatchSchema` 这类标识符，没有用户可见文案。
- 样式：4 个新增设置组件没有 `<style>`，用 UnoCSS 类名；逐个类名用 `apps/buddy/uno.config.ts` 的生成器核对，都能解析，只有 `buddy-icon-button` 是本地已有的全局类，所以没有补 Uno 映射。
- `pnpm type-check`（`apps/buddy`）通过；冲突文件 `eslint --fix` 后无遗留问题。
- 本机 Windows 测试：
  - `ff5c2916` 涉及的 25 个 spec 加上新增的快照兼容 spec：21 个文件通过，其余失败均在 `docs/known-test-failures.md`：`BrowserHostClient.spec.ts`（符号链接 `EPERM`）、`ToolAuthorizationService.spec.ts` 的“替换路径”用例、`WebCapabilityService.spec.ts`（文件模式位）。
  - 更大范围（electron 浏览器/网络/配置、service 空间/网页/浏览器/权限/审批/沙盒、shared）：26 个失败，均为已记录的 Windows 限制：`BrowserAdapterServer`/`BrowserAdapterClient`（Unix 套接字私有目录）、`SandboxDirectoryPermissions`/`sandboxPermissions`、`PermissionEngine` 两个用例、上面三项，以及 `SpaceFileRecovery.spec.ts` 的 7 个用例（`EPERM`/`EBUSY`，与 2026-10-20 第二轮记录的一致，不在 10 月 13 日的清单里）。
  - 移除 `cfd3a992` 后的自动化、权限、存储相关 spec：除上述已知失败外通过；`automationActorSnapshots.spec.ts` 的 v25 升级用例因保留列而需要调整，已修复并通过。
  - 渲染层按相关 spec 运行：任务面板、产出、审批载荷等 5 个文件（77 个用例）通过。
- 未跑：整个渲染层目录的测试（本机整目录运行会无响应，只跑了相关 spec）、`network-permissions.e2e.mjs` 和其他 Playwright E2E、开发预览（多目录空间、网络权限设置页、审批卡片、浏览器下载与文件选择器未目视确认）、Linux 沙盒用例、打包。
