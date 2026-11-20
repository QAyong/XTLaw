# 上游集成记录：2026-10-24（第二轮）

区间是 `cffd73885..f2b2b3544` 的 1 个提交：`feat(buddy): 为插件提供受控剪贴板能力`。分支 `codex/upstream-20261024-2` 叠在 `codex/upstream-20261024`（[第一轮](upstream-20261024-integration.md)，PR #34）之上，用 `git cherry-pick -x`。

## 已移植

| 本地提交 | 上游提交 | 内容与整合方式 |
| --- | --- | --- |
| `605fd00a6` | `f2b2b3544` | 49 个文件，8 个文件冲突。见下 |

内容：插件的 `clipboardRead`/`clipboardWrite` 权限与 `context.clipboard`（仅在插件视图前台可见并聚焦时可用，`ExtensionClipboard`）；`document-info` 事件，让插件页面可以给自己命名（`DesktopExtensionPage` 标题）；关闭守卫：带未保存内容的插件视图可以否决关闭标签页、窗口或路由（`ExtensionCloseGuard`、`ExtensionCloseRequests`、`beforeExtensionClose`、`closePreparation`）。插件创建器技能的参考文档同步。

## 冲突解决（8 个文件）

都是“保留本地一侧，再加上游新增”：

| 文件 | 处理 |
| --- | --- |
| `ExtensionService.ts` | 保留本地的 import 列表，加上 `extensionClipboardSchema`、`extensionClipboardWriteSchema`、`extensionDocumentInfoSchema` |
| `ExtensionPackageStore.spec.ts` | 本地的 import 加上游新增的 `extensionPackageManifest` |
| `extensionApi.ts` | 本地的 `quote-capture`、`quote-add` 事件与上游的 `document-info` 事件并存 |
| `taskContextPanel.ts` | `ContextPanelTab` 里本地的 `favicon` 和上游的 `dirty` 并存 |
| `WorkbenchController.ts` | 构造函数保留本地的 `canOpenResource` 参数，`beforeClose` 加上游的 `signal` |
| `useDesktopWorkbench.ts` | 上游的插件关闭步骤放在前面；之后的关闭准备保留本地的 `autoSave.prepareClose(...)`（自动保存），再按上游合并 `preparedView`/`validate` |
| `DesktopExtensionInstallReview.vue` | 保留 XTLaw 文案和本地的 `references && !composerReference` 条件；加上游的两个剪贴板权限说明，`sharesContent` 把 `clipboardRead` 算作可读内容 |
| `DesktopExtensionPage.vue` | 保留本地的 `extension-page` 作用域样式和返回任务按钮；加上游的 `showHeader` 判断、`document-info` 标题和离开路由前的 `prepareClose` |

`DesktopExtensionPage.spec.ts`（上游新增）的测试路由里补了本地返回按钮用到的 `desktop.tasks` 路由。

## 检查

- 迁移：无。依赖：无变更。Rust：无。不涉及 `.github/workflows`。品牌：新增行里的 `Lexora` 只有标识符，安装审查里新增的文案不含品牌名。
- 类型检查（`vue-tsc -b`）通过；改动文件 `eslint` 无问题。
- 本机 Windows，`apps/buddy` 下 `vitest run` 跑 `shared/extensions`、`platform/extensions`、`electron/main/extensions`、`rendererDraftLifecycle`、`src/app`、`src/modules/extensions`、`src/workbench`、`src/modules/tasks/model`、`src/modules/tasks/state/context-panel`：132 个文件、1093 个用例，修正 `DesktopExtensionPage.spec.ts` 的路由后只剩 3 个失败，都是符号链接 `EPERM` 且在 `docs/known-test-failures.md` 里（`ExtensionPackageStore` 1、`ExtensionResourceStore` 2）。新增的 `ExtensionClipboard`、`ExtensionCloseGuard`、`ExtensionCloseRequests`、`useDesktopLifecycle`、`useExtensionViews`、`WorkbenchTransactions`、`ExtensionService` 用例通过。
- 未跑：Playwright E2E（新增 `extension-clipboard`）、开发预览、打包；剪贴板读写和“关闭有未保存内容的插件视图”在真实窗口里的表现（特别是与本地 Office 编辑、自动保存叠加时）需要本机手测；Linux/macOS 靠 `XTLaw CI`。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `f2b2b3544a389ca9f7b380b27a30f5b0a5cf96bb`。
