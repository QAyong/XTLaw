# Spec-046：Office 插件改用工作副本，AI 在后台改文件后不再卡住

**日期：** 2026-11-01

**状态：** 已实现，未提交。WSL 里跑过相关 spec、eslint 和类型检查；插件在真实应用里的行为（重新加载、冲突对话框、引用选区）**未跑**，需要回 Windows 开发预览验证。

**相关：** [Spec-033：文档插件契约](feature-033-document-plugin-contract.md)、[Spec-038：文件编辑器自动保存](feature-038-file-editor-auto-save.md)、上游 `b9c51fd51`（`fileEditing` 与 `context.documents`，已移植为 `cb87103d4`）

## 1. 要解决的问题

四个 Office 插件（DOCX、XLSX、PPTX、PDF）打开文件时整份读入一次，宿主记下这个视图读到的版本（etag 与内容哈希）。之后 AI 在后台改了磁盘上的文件：

| 现象 | 原因 |
|---|---|
| 保存、自动保存一直报“文件已被其他程序修改” | 保存时比对的是打开时的版本，磁盘版本已变 |
| 选区引用、定位来源失败 | 引用同样要求视图持有最新版本 |
| 插件里一直是旧内容 | 没有任何通知，视图只能关掉重开 |

文本编辑器没有这个问题：它监听文件变化，没有未保存修改就自动刷新，有就走冲突选择（Spec-038）。

## 2. 方案

沿用上游为“编辑原件”设计的 `context.documents`（`fileEditing` 权限），不另起一套。

- **插件侧**：新增共用组件 `apps/buddy/extensions/document-kit/document-session.js`（用 `sync.mjs --only` 拷进各插件）。它负责打开工作副本、保存、发现外部修改、让用户选择，不管编辑器界面。
- **发现变化**：窗口获得焦点、可见时每 20 秒、保存被拒绝时，用 `documents.status` 比对磁盘文件与打开时的版本。
- **处理变化**：
  - 编辑器能报告“有无未保存修改”且没有 → 直接重新加载，状态栏提示。
  - 有，或编辑器无法判断（正在输入也算有）→ 询问“丢弃我的修改，重新加载”或“先把我的修改另存为副本，再重新加载”。两种选择都以显示磁盘上的最新文件结束；没有“保留我的版本、留在冲突里”这个中间状态（它会让自动保存每 30 秒失败一次）。选另存为但取消了保存窗口，会再问一次，不会悄悄丢修改；对话框按 Esc 等同于选另存为。弹窗期间自动保存触发也只会被拒绝，不会写盘。
- **保存被拒绝而没来得及处理**（比如弹窗时关了页面）：宿主把未保存内容留作恢复副本；下次打开时询问“另存为副本”或“放弃这些修改”，之后显示磁盘上的最新文件。恢复副本不再重新打开进编辑器（磁盘文件早已变了，写回只会再次冲突，编辑器还会把它当成没修改过）。
- **宿主侧（本体，唯一改动）**：`ExtensionService` 对“通过 `documents.open` 打开自己文件的视图”，用文档版本代替 `readVersion/readHash` 作为引用依据，引用前用 `documents.status` 判断文件是否变化（`#followDocument`）。没有它，换成 `documents` 后引用选区会被拒绝。

| 插件 | 能否判断未保存修改 | 重新加载方式 |
|---|---|---|
| DOCX | 能（`queryState().dirty`） | 在编辑器内重新打开（`openHandler`），路径带版本号以免被当成同一文档 |
| PDF | 能（`onDirty`） | 整页重新加载 |
| XLSX | 能：包住渲染层上报的 `desktopApi.notifyPendingEdits(count)`（编辑器用它驱动关闭提示），待保存数为 0 即干净 | 整页重新加载 |
| PPTX | 能：`window.slidesApi.isDirty()`（主进程会话的未保存标记） | 整页重新加载 |

XLSX、PPTX 的信号都来自已打包引擎现有的接口，不需要改引擎、不需要重新打包；钩子装不上或取不到时视为“不知道”，退回询问。正在输入的单元格、文本框（`document.activeElement` 可编辑）按有未保存修改处理，宁可多问一次也不丢字。

## 3. 权限与版本

- 四个插件的 `permissions` 去掉 `selectedResourceWrite`，加上 `fileEditing`；更新时安装审核会提示新增“编辑原件”。
- `engines.lexora` 改为 `>=0.4.9 <1.0.0`：老应用没有引用桥接，装上新插件引用会失效。**当前应用是 0.4.8，所以 `BundledExtensionCatalog.spec` 里“Office 包兼容”那条在应用升到 0.4.9 之前会失败**（把 engines 临时改回 `>=0.4.8` 已验证只因这一点）。0.4.9 是假定的下一个版本号，发版时按实际版本调整。
- 插件版本：office 0.1.15、office-xlsx 0.3.17、office-pptx 0.4.16、office-pdf 0.1.8。

## 4. 未做 / 未验证

- 未跑：Windows 开发预览。依赖运行时才能确认的几点：`location.reload()` 能否让视图重新引导；`documents.open` 在关闭后能否重新取得最新快照；DOCX 的 `openHandler` 能否在有文档时原地换成新内容；沙箱 iframe 里 `dialog.showModal()`（已有插件在用）。
- XLSX 的未保存状态依赖包住 `window.desktopApi.notifyPendingEdits`，PPTX 依赖 `window.slidesApi.isDirty`：两者都是已打包引擎的内部接口，换上游版本时要复核；这两条在真实应用里也没跑过。后续可把引擎的“写恢复副本”钩子接到 `documents.backup` 得到真正的恢复副本（需重新打包引擎）。
- 编辑过程中不做 `backup`：恢复副本只来自被拒绝的保存，崩溃恢复沿用各编辑器原有行为。
- “另存为副本”的触发方式各不相同：DOCX 用桥接里的 `saveCopy`，PDF 用 `editor.saveAs()`，PPTX 直接调 `window.slidesApi.saveAs(name)`（不经过渲染层，正在输入但未提交的文字可能不在副本里），XLSX 派发 Ctrl+Shift+S 键盘事件让引擎走它自己的另存为。这四条都没在真实应用里跑过。
- 在编辑器内用文件选择器打开的文件（DOCX/PDF 的 viewer 模式）仍是只读加导出，没有迁移。
- 未运行 `pnpm market:sync`：先在 Windows 验证，再同步到市场仓库发布；发布顺序是先发带桥接的应用，再发新版插件。
