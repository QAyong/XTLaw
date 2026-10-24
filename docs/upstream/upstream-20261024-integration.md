# 上游集成记录：2026-10-24

区间是 `f5aa11ed1..cffd73885` 里的 3 个提交，外加上一轮（[upstream-20261022-7-integration.md](upstream-20261022-7-integration.md)）从 `2f91fa803` 里留下的产出卡片操作。分支 `codex/upstream-20261024` 基于本地 `master`（`bc19c2f00`），用 `git cherry-pick -x`。

检查时 `upstream/master` 已前进到 `f2b2b3544`（`feat(buddy): 为插件提供受控剪贴板能力`，原来在 `upstream/feat/plugin-clipboard` 上，随后并入 master）。它在本轮范围之外，没有移植，也没有计入基线，留给下一轮。

## 已移植

| 本地提交 | 上游提交 | 内容与整合方式 |
| --- | --- | --- |
| `e24151a12` | `2f91fa803` 的卡片操作部分 | 补回上一轮留下的产出卡片操作：26 个文件，手动取用（上游提交本身不带来源行）。见下 |
| `4298bbb5f` | `e243ce221` | 统一正文文件打开与右键菜单：76 个文件，17 个文件冲突。见下 |
| `cbe068526` | `c0ff5edc9` | 修复伙伴会话续接与执行过程展示：17 个文件，**无冲突**。预评估里 `BuddyChatActorProcess.vue` 的冲突在 `e243ce221` 先落地后消失 |
| `fcf5a4193` | `cffd73885` | 支持插件创建受控私有文件：17 个文件，1 个文件冲突（`view.js`）。见下 |

后续提交 `65aad7362`（修正 `4298bbb5f` 里产出去向 spec 的 mock 类型）、`52f32eddf`（给 `e24151a12` 的 `treeTarget` 补 `useWorkspaceFilePreview` 测试）是对前面移植的修正，说明里写明了对应关系。

无新迁移、无依赖变更、无原生（Rust）代码改动、不涉及 `.github/workflows`。

## 补回的卡片操作（`e24151a12`，来自 `2f91fa803`）

只取产出卡片操作，媒体预览部分上一轮已由 `9bc3f5356` 移植，没有动。

- `createArtifactActions`、`artifactActionsContext`、`artifactFileTarget`（含 spec），`useProvideArtifactActions` 在 `DesktopTaskEditor` 和 `DesktopExecutionContribution` 两处提供。
- 新的 `BuddyArtifactCard.vue`（引用、在文件中定位、打开所在文件夹、复制路径的“更多”菜单与右键菜单）、`BuddyArtifactCollection.vue` 及 spec。
- `artifacts.revealFile` IPC（主进程、preload、`localChatApi`）。`artifacts.locate` RPC、`ArtifactService.locate`、`registerArtifactRpc` 和 `artifactApi` 上一轮已经在了，这次只把上一轮删掉的三处 `locate` 断言补回 `ArtifactService.spec.ts`。
- 文件管理器标签页的 `treeTarget`（`taskContextPanel.ts`、`readContextTab.ts`）、`locateFile`（`useTaskContextPanel.ts`、`useTaskResourcePanel.ts`）、`DesktopFilesContextSurface.vue`、`useWorkspaceFilePreview.ts`；相关 i18n（`desktop.artifacts.*`）；`.playwright/scripts/__tests__/artifact-cards.e2e.mjs`。

没有取的：

- **`BuddyChatTurnOutputs` 的折叠标题**（以及 `BuddyChatMessageBody` 里给它加的 `:key`）。它不在确认的移植清单里，本地 `BuddyChatTurnOutputs.vue` 是改写成作用域样式的本地组件，按“本地已有组件不改”保持原样。后果：上游的 `artifact-cards` e2e 里对折叠按钮（`aria-expanded`）的断言取不到，本地版本去掉了这部分，并把末尾“点卡片后看到产出页”改成先把 `artifactOpening` 设为 `panel`（默认设置下卡片会进文件管理器）。需要折叠标题时可以单独补。
- `desktop.chat.quoteToCurrent` 文案改成“引用”：属于选区引用菜单，本地选区引用 API 保持原样。
- 上游对选区引用相关 spec、e2e 的改动针对上游实现，保留本地版本（与上一轮一致）。

**与本地 192px 卡片的关系：** 本地 `bc0a70ad6` 把旧的竖向卡片缩到 192px（`grid-auto-columns: 12rem`）。新卡片是 88px 高的横向卡片，上游把条带列宽定为 `15rem`，12rem 放不下“打开/更多”两个按钮和详情。按清单取了上游的 `BuddyArtifactCard.vue`/`BuddyArtifactCollection.vue`，本地 192px 样式随旧卡片布局一起被取代；`BuddyArtifactCollection.spec.ts` 改成新卡片的结构（`.buddy-artifact-collection__type`、`.is-preview` 图标已不存在）。这是清单没有明说的取舍，需要小卡片时在 `BuddyArtifactCollection.vue` 里调列宽。

**样式：** 新卡片用 UnoCSS 类名，保留原样。逐个对照本地 `uno.config.ts`，只有 `accent-subtle`（`hover:bg-accent-subtle`）解析不了，补成 `--buddy-accent-surface-subtle`（该变量在 `buddyTheme.ts` 里已有，不需要回退值）。用 UnoCSS 生成器对所有改动的 `.vue` 逐个检查类名，其余新增类名都能解析；新增行里引用的 `--buddy-*` 变量（`--buddy-chat-meta-font-size`、`--buddy-chat-caption-font-size`、`--buddy-surface-raised`）本地主题都有。

## `e243ce221`：正文文件统一打开与右键菜单（`4298bbb5f`）

上游内容照单全收：正文文件链接的统一打开（`taskFiles.*` RPC、`localFileLinkPath`、`lexora-file://task-media/`、`task-file` 资源视图）、正文链接右键菜单（打开、打开方式、引用、定位、在文件管理器中显示、复制路径）、卡片菜单、`createFileLinkMenu`、`DesktopMarkdownContent` 的 `openWebLink`/`fileLinkMenu`/`onLinkError`。

### 冲突解决（17 个文件）

| 文件 | 处理 |
| --- | --- |
| `registerBrowserDesktopIpc.ts`、`preload/browser.ts`、`browserDesktopApi.ts` | 两边都留：本地的 `openDevTools` 与上游的 `openFile`（`browserOpenFile`） |
| `browserDesktopSchemas.ts`、`registerExtensionIpc.ts`、`chatToolFileTarget.ts` | 合并 import（本地的 `DESKTOP_BROWSER_BLOCKED_ACTIONS`、字节读写，加上上游的 `taskFileTargetSchema`、`TaskFileTarget`、`localFileLinkPath`） |
| `shared/files/fileOpening.ts` | 保留本地对 `implicit` 提供方的选择，返回值里加上上游的 `candidates` |
| `DesktopFilePreview.vue` | 采用上游的 `task-file` 目标、文件夹视图和 `taskFiles.read`；选区引用保留本地的 `useSelectionReferences`/`ResourceSelectionQuoteMenu`（不引入上游的 `useResourceSelectionQuote`），任务文件没有空间目标时不提供引用 |
| `readContextTab.ts` | 保留本地 `expand`、`tree`、`treeTarget`，加上上游的 `providerId` |
| `useTaskContextPanel.ts` | 保留本地 `canPreviewFile`/`previewFile`/`openDirectory`/`canOpenDirectory`/`findSpaceFilesTab`/`newFilesTab`（上游把它们移走了，但“点卡片进文件管理器”要用）；采用 `openArtifact(target, providerId?)`。对外的 `previewFile`/`canPreviewFile` 仍是资源面板里上游的版本（后者展开在前者之后，覆盖同名字段） |
| `useTaskResourcePanel.ts` | 采用上游的 `openResource`/`previewFile`/`FileOpeningResource`/`files`/`openFile`；加回本地的 `artifactOpening`、`revealOpenOfficeDocument` 选项和 `openInTaskSpace`；在 `openArtifact` 里加本地路由，见下 |
| `DesktopMarkdownContent.vue`、`BuddyChatMessageContent.vue`、`BuddyChatNarrationBody.vue` | 采用上游；删掉本地的 `externalLinkMode` 属性（上游的 `openWebLink` 取代它），`messageLinkRouting.spec.ts` 同步改成新的路由 |
| `registerBrowserDesktopIpc.spec.ts` | 保留本地全部用例（含“打开本地文件与远程页面”“元素拾取”），再加上游新增的 `browserOpenFile` 用例；不采用上游对这两个本地用例的删除 |
| `useTaskContextPanel.spec.ts` | 保留本地版本（本地仍有 `previewFile`），上游把这些用例改成 `locateFile` 的部分不采用 |
| `useTaskResourcePanel.spec.ts` | 取上游版本，加回本地的“切换链接打开方式”“在任务会话里打开网页”两个用例和 jsdom 环境 |

### 自动合并后手工修正

- 上游把 `isBrowserArtifact` 从 `taskContextPanel.ts` 删了（它的浏览器去向改在提供方处理里），本地路由还要用，加回。
- `ArtifactService.spec.ts`：采用上游重写后的版本，本地的 `resolveExternalEntry`、HTML 入口两个用例保留。
- 测试夹具：`useTaskResourcePanel` 现在要求 `files`、`openFile` 和浏览器的 `openFile`，补进 `revealOpenOfficeDocument.spec.ts`、`useTaskResourcePanelArtifact.spec.ts`、`registerBrowserDesktopIpcDialog.spec.ts`（`resolveFileEntry`）；上游新增的 `BuddyChatFileLinks.spec.ts` 用了上游才有的 `appSidebarCollapsed`，改为本地的 `sidebarCollapsed`；`BuddyChatMessageContent.spec.ts` 里不再断言 `canPreviewFile`（上游的点击处理不再先判断它）。
- `BuddyChatTurnOutputs.vue` 只取 `emit` 签名一行（`LocalArtifact` 对象），不带折叠标题。

## 特殊改动：点击产出卡片仍然进文件管理器

**原因：** 上游的 `openArtifact` 经 `openResource` 直接打开“产出”标签页；本地 Spec-035 要求任务空间里的产出走文件管理器（见 [Spec-035](../specs/feature-035-artifact-open-in-file-manager.md)，其第 8 节记录了这次与卡片菜单、“定位”共存的规则）。

**做法：** `useTaskResourcePanel.ts` 的 `openArtifact(target, providerId?)` 在进入 `openResource` 之前先调 `openInFileManager`：

- 没有 `providerId`，`artifactOpening` 设置不是 `panel`，产出不是浏览器类（`isBrowserArtifact`），该类型的默认提供方不是用户单独指定的插件（`renderer === 'extension' && !implicit`）时，走 `openInTaskSpace`：
  - 文件：在文件管理器打开，文件树收起；
  - Office 文档：文件树显示并展开到所在目录，已在编辑器打开的 Office 文档只聚焦（`revealOpenOfficeDocument`）；
  - 文件夹：文件管理器展开并高亮，标签里已打开的文件不变。
- 不走的情形（无空间、空间外、超出预览上限、其他任务的产出等）仍交给 `openResource`，与以前的回退一致。
- 右键菜单“打开方式”里显式选了某个提供方时带 `providerId`，按用户选择打开；无提供方的“打开”仍走本地路由。
- 所有经 `openArtifact` 的入口都保持这个行为：点卡片、聊天里指向已登记产出的文件链接、执行详情（`DesktopExecutionContribution`）、选区引用定位（`builtinSelectionReferenceProviders`）。事件参数统一为上游的 `LocalArtifact` 对象，`openArtifact` 仍接受 `string | LocalArtifact`。
- 本地 `artifactOpening` 设置继续有效。

**与“定位”共存：** `locateFile` 写 `treeTarget`，与本地的 `tree{visible, token}`、`expand{path, token}` 并存。`selectFile` 补上清除 `treeTarget`（上游已有），所以先“定位”文件 A、再点普通文件 B 的卡片时，B 的收起请求不会被 A 的 `treeTarget` 盖掉。`openDirectory` 也清除 `treeTarget`，让高亮交给被点的文件夹；`useWorkspaceFilePreview` 里只清除 `treeTarget`（文件和 id 没变）时不会重新展开标签页里文件所在的文件夹。

**“定位”文件夹时标签页当前文件被清空**（`target.path` 变成空串，右侧回到“选择文件”占位）：这是上游行为，保持不变。

**随之改变的行为（上游的正文链接统一打开）：** 不指向已登记产出的正文文件链接（例如产出卡片还没登记时模型就写出的 Office 路径）现在由 `taskFiles.resolve` 解析后，经 `openFile` 以 `task-file` 视图或文档插件打开，不再进文件管理器。本地原有的用例“Office 路径在产出卡片登记前显示文件树”因此改写为“用任务文件打开器打开，不进文件管理器”。指向已登记产出的链接仍经 `openArtifact` 进文件管理器。

## `cffd73885`：插件创建受控私有文件（`fcf5a4193`）

新增 `resources.createFile`（`resources.beginCreate`）、`ExtensionResourceUpload`、资源配额（单文件 256 MiB、总计 1 GiB、4096 项）和 `waitsForExtensionIo`，插件创建器技能的参考文档同步。

### 冲突解决（1 处）：`electron/main/extensions/runtime/view.js`

本地的 `saveFile` 带 `resource` 参数（Office DOCX 编辑，`109394bc5`），把已打开的文件写回；上游把 `saveFile` 的函数体换成统一的 `writeExtensionResource`。处理：

- 采用上游的 `saveFile: options => writeExtensionResource(request, 'resources.beginSave', options)`。
- `writeExtensionResource` 的选项加上 `resource`，仅在 `resources.beginSave` 时作为 `resourceId` 发出；`resources.beginCreate` 忽略它。
- 核对 `ExtensionService.ts` 自动合并的结果：新增的 `resources.beginCreate` 分支，以及 `writeChunk`/`commitSave`/`cancelSave` 里 id 属于 `#uploads` 的那一支，排在原有 `beginSave` 分支之前，但只认自己 `beginCreate` 发出的 id；`beginSave` 发出的写入 id 在 `view.writers` 里，不在 `#uploads`，所以继续走原分支。本地的 `selectedResourceWrite` 校验（`apiVersion >= 4`、`contribution.resource === 'selected-file'`、`resourceId` 必须是视图打开的资源、需要 `readVersion`/`readHash`）原样在 `beginSave` 里，没有被覆盖。
- 新增 `extensionResourceClient.spec.ts` 锁定 `resource` → `resourceId` 的传递、无 `resource` 时的原有请求，以及中途失败会 `cancelSave`。

## 检查

- 迁移：无。依赖：无变更。Rust：无改动。品牌：新增行里的 `Lexora` 只有协议名（`lexora-file`、`lexora-artifact`）、IPC 通道名（`lexora:buddy:artifacts:reveal-file`、`lexora:browser:open-file`）和包名，没有用户可见文案；`XTLaw` 品牌和数据隔离未动，没有带入上游版本号。
- 类型检查（`apps/buddy`，`vue-tsc -b`）：通过。
- `eslint`：对全部改动文件无问题（合并后修正了 2 处：`useTaskResourcePanel.ts` 的 import 顺序、`revealOpenOfficeDocument.spec.ts` 的单行多语句）。
- 本机 Windows 上的 vitest：见下方“测试结果”。

### 测试结果

本机 Windows，`apps/buddy` 下 `pnpm exec vitest run --maxWorkers=4` 跑改动相关目录：`src/modules/tasks`、`src/shared/ui/markdown`、`src/app/workbench`、`src/modules/files`、`src/i18n`、`shared/files`、`shared/extensions`、`shared/browser`、`service/src/files`、`service/src/artifacts`、`service/src/storage`、`electron/main/browser`、`electron/main/extensions`、`electron/main/__tests__/mediaProtocol.spec.ts`、`platform/extensions`。为运行时测试先用 `node packaging/buddy/release/native-host.mjs` 在本机构建了 `lexora-buddy-file-reader.exe`（在被忽略的 `.output` 下）。

**结果：215 个文件，1913 个用例：1864 通过、46 失败、3 跳过。** `src` 下的前端用例（`unit` 项目）全部通过，包括 `useTaskResourcePanelArtifact.spec.ts`（去向判断与各回退情形，另加 3 个新用例）、`useTaskContextPanel.spec.ts`、`useTaskResourcePanel.spec.ts`、`useResourcePreviews.spec.ts`、`createArtifactActions.spec.ts`、`BuddyArtifactCard.spec.ts`、`BuddyArtifactCollection.spec.ts`、`DesktopMarkdownContent.spec.ts`、`BuddyChatFileLinks.spec.ts`、`messageLinkRouting.spec.ts`；服务与平台层的 `SandboxedExtensionHost`、`ExtensionService`、`ExtensionFileOpening`、`extensionResourceClient`、`registerBrowserDesktopIpc`、`ArtifactService`（除下表）和 `TaskFileService`（除下表，其余 9 个用例通过，含 `mediaProtocol` 的 `task-media` 流式读取）都通过。

46 个失败全部是本机环境问题，没有一个是这次移植引入的。`docs/known-test-failures.md` 生成于 2026-10-13，已经过期，它没有覆盖的部分我在干净基线 `bc19c2f00` 上重跑同样的文件来确认：

| 来源 | 数量 | 说明 |
| --- | --- | --- |
| 在 `known-test-failures.md` 里 | 12 | `BrowserAdapterServer` 7、`ExtensionResourceStore` 2、`ExtensionPackageStore` 1、`StorageSnapshots` 1（符号链接 `EPERM`）、`BuddyDataPaths` 1（POSIX 路径） |
| 不在清单里，**基线上同样失败，数量一致** | 31 | `StorageMigration` 10 与 `selectiveBackup` 8（`PrivateDirectoryError: Buddy application data directories could not be prepared`，Windows 私有目录 ACL）、`NativeFileEngine` 10 与 `FileResourceCoordinator` 1（真实原生助手的恢复用例）、`ArtifactService`“任务工作区”1（符号链接 `EPERM`）、`mediaProtocol`“符号链接逃逸”1（符号链接 `EPERM`） |
| 不在清单里，**基线上同样间歇失败** | 1 | `mediaProtocol`“closes playback streams…”：用例末尾 `rm` 取消后的视频文件时 `EBUSY`。本分支重跑 3 次 2 次失败，基线重跑 4 次 2 次失败；这次移植在 `mediaProtocol.ts` 只加了 `task-media` 一个分支，不碰流的关闭 |
| 新增文件，同一类环境限制 | 2 | `TaskFileService.spec.ts` 的两个符号链接用例（`EPERM`），上游新增，Linux CI 上应通过 |

这些要在 Linux 的 `XTLaw CI` 上确认；`known-test-failures.md` 需要在干净基线上重新生成，本 PR 不动它。

### 未跑

- Playwright E2E：包括新增和改动的 `artifact-cards`、`task-file-links`，以及已有的 `artifactSelectionReferences`、`file-explorer`、`file-opening`。`artifact-cards` 的本地改写（去掉折叠断言、末尾设 `artifactOpening: 'panel'`）没有实际运行。
- 开发预览和打包。
- 点卡片进文件管理器、“定位”后再点卡片、“定位”文件夹后右侧回到占位、正文链接右键菜单（打开、打开方式、引用、定位、在文件管理器中显示、复制路径）在真实窗口里的表现，需要本机手测。
- 迁移在真实开发库上的运行（本轮无迁移）。
- Rust 测试和 Linux/macOS 的 native checks：本轮不改 Rust，只在本机为运行时测试构建了 `lexora-buddy-file-reader`（Windows）；Linux/macOS 靠 `XTLaw CI`。
- PR 上的 `XTLaw CI`（Linux/macOS/Windows 的类型检查、测试与 native checks）：等推送后的结果。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `cffd7388581bbd1ef4670f919e24dc72c76a48bf`。`f5aa11ed1` 之后的 3 个提交都已移植；`f2b2b3544`（插件剪贴板）还没有检查，留给下一轮。
