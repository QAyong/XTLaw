# 上游集成记录：2026-10-23 插件三连

区间是 `f5757834e..upstream/master`（`a378eb8ae`，v0.15.0）里上一轮暂缓的三个提交。分支 `codex/upstream-20261023-plugins` 基于 `origin/master`，用 `git cherry-pick -x`，一个上游提交一个本地提交。上一轮见 [upstream-20261023-integration.md](upstream-20261023-integration.md)。

三个提交互相依赖，一起移植。无新迁移、无依赖变更（`package.json`、`pnpm-lock.yaml` 未动）、无 Rust、未改 `.github/workflows`。

## 已移植

| 上游提交 | 本地提交 | 方式 |
| --- | --- | --- |
| `b6896babc` 文件打开方式与插件启动入口 | `Port upstream b6896bab` | cherry-pick，冲突 21 处在提交内解决 |
| `16777975e` 插件引用与来源定位 | `Port upstream 16777975` | cherry-pick，冲突 11 处 |
| `a378eb8ae` 插件 WASM 与 Worker | `Port upstream a378eb8a` | cherry-pick，冲突 11 处 |

本地适配另有四个提交：隐式文件处理器、产出卡片打开位置、引用授权合并、Worker 门槛与文档。

## 冲突解决

### `b6896babc`

- **`.playwright/scripts/__tests__/settings-controls.e2e.mjs`：** 本地已删、上游改了，保持删除。
- **`extensionManifest.ts`：** 导入取本地（保留 `documentCapabilityIssues` 等），加上 `fileOpening`；`views` 用上游的 `optional-file`，同时保留本地 `accepts`；`fileHandlers`、`fileOpeners`（旧写法转 `fileHandlers`）、`launchers` 取上游。导入保持本地的无 `.ts` 后缀写法。
- **`extensionApi.ts`：** 三处都是并集：本地的 `openFile`、引用输入/捕获 schema 与上游的 `fileOpeners`/`setFileOpener`/`prepareFileOpening`。
- **`ExtensionProtocol.ts`：** CSP 保持本地的按声明开放（`wasm-unsafe-eval` 与 Worker 只按 `permissions.webAssembly` 开放，后台页与视图页一致），加上上游的 `__selected/`（`connect-src` 与 `readSelected`）。
- **`ExtensionPackageStore.ts`：** 导入并集。
- **`ExtensionService.ts`：** `resources.readText/readBytes/getUrl` 采用上游的“所选资源”实现（支持产物来源、编辑器快照）。普通空间文件的 `readBytes` 仍走本地带版本与哈希的读取，用于后面的引用和写回校验；新增 `#spaceResource`，引用与写回只作用于未改动的空间文件。`bootstrap` 增加 `webAssembly`。
- **`registerDesktopContributions.ts`、`useDesktopWorkbench.ts`：** 并集；关闭视图时先走本地自动保存，再关联内联子视图。
- **`useExtensionContributions.spec.ts`：** 取上游。
- **`DesktopExtensionInstallReview.vue`：** 以本地版本（作用域样式、高风险提示、可信来源）为底，只加上游的功能：打开方式关联表、`install(applyUpdate, choices)`、弹窗加宽到 660px。对应 spec 合并两边的用例。
- **`DesktopExtensionManager.vue`：** 取上游导入。
- **`DesktopFileEditor.vue`、`DesktopFilePreview.vue`、`DesktopDocumentContent.vue`：** 保留本地自动保存、选区引用菜单和作用域样式；预览改由上游的 `fileOpeningHandler`、`filePreviewRenderer` 与 `preview` 插槽决定。
- **`useTaskResourcePanel.ts`：** 采用上游的打开方式分发；本地“空间内产出在文件管理器打开”抽成 `openInTaskSpace`，由钩子决定是否先走它（见 A 项）。
- **`DesktopArtifactContextSurface.vue`、`DesktopTaskContextPanel.vue`、`DesktopTaskResourcePanel.vue`、`WorkbenchResourcePanel.vue`（及 spec）：** 采用上游的启动器 `actions` 与按钮禁用状态，保留本地的最大化、图标 favicon、`headerActions`（打开方式菜单）和作用域样式。

### `16777975e`

- **`registerExtensionIpc.ts`：** 引用事件不设 10 秒超时；保留本地 `finish(value, data)`。
- **`ExtensionService.ts`：** `references.add` 与本地 `composer.captureQuote/addQuote` 并存。
- **`buddyUserContent.ts`：** `buddyQuoteSnapshotLength` 同时计入 `locator` 与本地扩展位置。
- **`extensionApi.ts`、`DesktopAppProvider.vue`、`useExtensionContributions.ts`：** 事件类型、`receiveReference` 与本地 `selectionReferences`/`onQuoteResult` 并存；保留 `showSelectionReferenceResult`。
- **`workbenchSelectionReferences.ts`：** 取上游提供者注册版，补回 `showSelectionReferenceResult`。
- **`createDesktopSelectionReferences.ts`：** 取上游，本地的文件/插件文档/产出/浏览器来源与定位并入 `builtinSelectionReferenceProviders.ts`（插件文档来源要求 `documents.isQuotable`，旧格式引用在原插件里重开）。
- **测试：** 本地的选区引用菜单测试改用 `registerProvider`。

### `a378eb8ae`

- **`ExtensionProtocol.ts`：** 保留本地按声明开放的 CSP，不照搬上游对所有插件、所有页面开放 `wasm-unsafe-eval`、`blob:` Worker。
- **包预算：** 本地 `shared/extensions/extensionPackageLimits.ts` 及其测试删除，改用上游的 `extensionPackageBudget.ts`（单文件 64 MiB、压缩包 128 MiB、展开合计 256 MiB）；`themeAssets.ts`、文件图标测试改引用它。`extensionCatalog.ts` 保留 `bundled` 条目，大小上限改为压缩包限额。
- **`extensions/tools.mjs`：** 采用上游的 `extensionPackageAuthoring`，保留本地的文档处理器契约报告。`sdk/authoring.ts`、`sdk/plugin.mjs`、`extensionFiles.ts`、`extensionAuthoring.ts`、`protocol.md` 取上游；`README.md` 合并两边。
- **`ExtensionPackageStore.spec.ts`：** 取上游。

## 三项整合

**A 文件打开方式。** 采用上游 `fileHandlers`/`launchers`/`optional-file`/设置页/`DesktopRegisteredFilePreview`。

- `accepts.extensions` 保留：每个带 `accepts` 的上下文视图登记一个隐式的“单独打开”处理器（ID 为 `<视图 ID>.files`，`requestDefault: false`，不进安装审查的关联表）。文件打开方式解析时，唯一的隐式候选在没有保存选择时接管其扩展名，保存的选择优先，多个隐式候选回到内置查看器。因此内置 Office 插件默认接管 docx/xlsx/pptx，不弹询问，清单不改。
- 文件管理器的 `ExtensionDocumentRouter` 改为按这一选择判断，并把提供者 ID 传给 `openFile`，宿主打开的就是被选中的那个插件视图。
- 产出卡片：新设置 `desktop.artifactOpening`（`file-manager` 默认 / `panel`，TOML 键 `artifact_opening`，进入可移植设置备份），在打开方式页面上方。钩子在上游分发前执行：空间内文件、文件夹仍进文件管理器（收起目录树、文件夹展开、`revealOpenOfficeDocument`）；选“产出面板”，或不在空间内、其他任务、超大文件、HTML（浏览器）、用户指定某个非隐式插件单独打开该类型，则走上游分发。

**B 插件引用。** 采用上游 `references.add`/`onReveal`/`locator`/`view` 类型引用与 `registerProvider`。`composerReference` 与 `references` 视为同一授权（`extensionMayReference`），本地 `composer.*` 与 `references.add` 都认；安装审查只显示一项。DOCX/PPTX/XLSX 旧格式与通用扩展引用的 schema、去重、显示和重开路径保留，测试覆盖已存引用与视图引用并存。

**C WASM 与 Worker。** 采用 `context.workers.create()`、`ExtensionPackageTransfer`、包预算、`extensionPackageAuthoring`。

- 保留 `permissions.webAssembly` 门槛：CSP 只对声明了的插件开放 `wasm-unsafe-eval` 和 Worker。范围与上游一致，插件后台页（extension.js）和视图页都开放（原本地只开放视图页，经确认改为对接上游）；未声明的插件两处都关闭。
- `workers.create()` 未声明时抛 `EXTENSION_WORKER_DENIED`；视图在 `bootstrap` 里得知授权，后台页从清单读取。
- 第三方插件仍受 4 个 `.wasm`、合计 24 MiB 与高风险安装审查约束；`documents.webAssembly` 描述同步；`.wasm` 仍以 `application/wasm` 提供。`plugins/office-xlsx` 已声明该权限，不受影响。
- `workers.md`、`capabilities.md`、`document-processor.md`、`README.md` 的包预算与 Worker 说明已与上游新增文档合并。

## 样式与品牌

- 上游新增和改动的模板里共 88 个类名，除组件自带的类名外都已被现有 `uno.config.ts` 生成（用本地配置跑了一遍匹配），所以没有新增映射。
- 品牌：新增行里没有需要改的用户可见 “Lexora”（仅 `lexora-extension` 协议、`lexora.*` 提供者 ID 等标识符，以及 README 里延续本地写法的一处）。

## 验证

用户要求以云端为准，不做本地测试。本机只做了不运行产品的静态检查：对 159 个改动的 TS/Vue 文件做语法解析（0 个问题）。

- 云端：PR #32 上的 `XTLaw CI` 在 `75175f02d` 全部通过（lint、`vue-tsc -b`、Linux 全量测试 5235 个，以及各平台原生检查）。第一次推送时红了，按顺序修了三轮：
  - lint：14 处未使用或重复排序的导入，以及 `tools.mjs` 里被误写成真实换行的转义。
  - 类型：上游的产出资源读取需要 `artifacts.locate`，本地补上了 `ArtifactService.locate`、RPC 契约和注册；一个选区引用测试夹具还在用已删除的 `source`/`locate` 选项。
  - 测试：上游新增的 `extensionPackageTools.spec.ts` 直接用 `node` 运行 `tools.mjs`，本仓库的无后缀导入 Node 解析不了，改走 `tools-run.mjs`；`WorkbenchResourcePanel.spec.ts` 两个本地用例要给面板一个启动器，因为上游在没有可添加项时隐藏“添加标签”按钮。
- 新增或调整的测试：隐式文件处理器与解析、文档路由跟随打开方式选择、产出卡片位置设置（含用户指定插件）、`composerReference` 即 `references`、旧格式引用与视图引用并存、`workers.create` 门槛、配置存储字段。
- **未跑：** Windows 本机测试、Playwright E2E（含上游新增的 `file-opening`、`extension-workers`）、开发预览、打包与发布流程。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `a378eb8aecfd729151bb5c5254b94793f014eb3b`。
