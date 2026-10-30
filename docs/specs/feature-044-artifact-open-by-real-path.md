# Spec-044：产出卡片在文件管理器中打开，取消“产出”标签页

**日期：** 2026-10-30

**状态：** 已实现，等待用户在开发预览中验收（2026-10-30）。第 1—6 步均已完成，见第 7 节；未在真实窗口里验证，未打包。

**相关：** [Spec-035：任务产出在文件管理器中打开](../archive/specs/feature-035-artifact-open-in-file-manager.md)、[Spec-039：没选本地文件夹的空间，其内部工作区在文件管理器中浏览](../archive/specs/feature-039-space-workspace-in-file-manager.md)、[Spec-033：文档插件契约](feature-033-document-plugin-contract.md)、[Spec-013：工作台选区引用与多分屏目标](feature-013-workbench-selection-reference.md)

## 1. 要解决的问题

聊天窗口下的“本轮产出”卡片保留。点击卡片后，不应再打开资源区里那个只读的“产出”标签页（只认文本和图片，没有文件树、不能编辑、没有文档插件），而应在**现有的文件管理器标签页**（左树右预览，可编辑）里打开。

Spec-035 / 039 已让空间主目录、附加目录和空间内部工作区的产出走文件管理器。下面这些情形仍回退到“产出”标签页：

| 回退情形 | 原因 |
|---|---|
| 任务没有绑定空间 | 文件管理器按“空间 ID + 目录 ID + 修订号”寻址，无空间就没有目录 |
| 路径不在任何空间目录里（会话授权过的目录） | 同上 |
| 文本超过 1 MiB 或图片超过 8 MiB | `fitsSpaceFilePreview` 的判断 |
| 点的是别的任务的产出 | `openInTaskSpace` 要求 `conversationId` 等于当前任务 |
| 设置选了“产出面板” | `artifactOpening: 'panel'` |

## 2. 方案

保留现有文件管理器，新增**授权目录根**：根不是空间目录，而是会话的一个有效授权目录。思路借自 ZCode 的 `temporaryExternalDirectory`（不在工作区里的目录，以它自己为根打开文件管理器），不同之处是 Lexora 每次访问都要经服务端授权校验。

### 2.1 目标与寻址

文件管理器的资源目标变成两种：

| 目标 | 形状 | 校验 |
|---|---|---|
| 空间文件（现有，不变） | `{ spaceId, directoryId, revision, path }` | `requireDirectory` + `resolveGrantedPath` |
| 授权目录文件（新增） | `{ conversationId, root, path }` | 服务端核对 `root` 的真实路径等于该会话某个有效授权的 `canonicalRoot`，再 `resolveGrantedPath` |

- `root` 是授权目录的真实绝对路径，`path` 是相对它的路径（不允许绝对路径、反斜杠和 `..`，与现有规则一致）。
- 渲染进程不自己判断根：新增 `artifacts.resolveFileRoot(artifactId)`，服务端用 `ArtifactFileAccess` 返回 `{ conversationId, root, path, kind }`。
- 授权来源沿用 `ArtifactFileAccess.grant`：空间目录、会话授权目录、`conversationWorkspace`、`spaceWorkspace`。把它抽成按 `(conversationId, root)` 查找授权的函数，供产出和授权目录目标共用，不复制校验逻辑。
- `SpaceFileService` 新增 `resolveTarget` 分派两种目标。敏感路径匹配、`realpath` 校验、etag、字节分片、保存、目录列表、媒体、插件资源读取全部复用。

### 2.2 标签页

- 文件管理器标签页的 `target` 改成联合类型，两种根共用同一套文件树和预览/编辑组件。
- `WorkspaceExplorer.vue`、`DesktopFilesContextSurface.vue`、`DesktopFilePreview.vue`、`DesktopFileEditor.vue`、`FileOperationService.ts` 等改为接收与根种类无关的“文件根”对象（根名称、目标构造、能力开关），不再直接读 `spaceId`、`directoryId`、`revision`。
- 授权目录根的标签页：文件树以 `root` 为根，展开到目标文件所在目录；标题显示目录名，悬停显示完整真实路径。
- 标签页快照记录授权目录目标，`readContextTab` 校验；旧快照仍可读。

### 2.3 点卡片的新流程（`useTaskResourcePanel.openInFileManager`）

1. HTML，或用户把该类型单独指定给某个插件：保持现有。
2. 在任务空间的目录内：走现有空间根，行为不变。
3. 其余：走授权目录根，文件打开文件，目录展开并聚焦该目录。
4. 授权撤销、会话删除、文件被移走：显示明确提示，不回退到旧页签。

### 2.4 功能范围

授权目录根的功能与空间根一致，包括：

| 功能 | 说明 |
|---|---|
| 浏览、预览（文本、图片、音视频） | 超限文件显示文件名、大小和“用系统程序打开”，不再回退 |
| 编辑、保存、自动保存 | 沿用 etag 和 `expectedHash` 冲突检测 |
| 文档插件（Office、PDF 等） | 插件资源句柄扩成联合类型，仍不透明，插件拿不到真实路径 |
| 新建文件、新建文件夹、重命名、移到回收站、恢复 | 复用现有 `spaceFileMutation` 的动作 |
| 复制、移动 | **目标必须在同一个授权目录根内**，不允许跨根；跨根的需求另议 |
| 复制路径、在系统文件管理器中显示、定位、选区引用 | 与现有一致 |

### 2.5 Office 文档（docx、xlsx、pptx）

空间外和无空间的 Office 产出走与现在完全相同的路径，只是文件目标换成授权目录目标：

1. 打开授权目录根的文件管理器标签页，文件树显示并展开到该文件所在目录（与 Spec-035 对 Office 的规定一致，树不收起）。
2. 按扩展名交给已启用的文档插件（`ExtensionDocumentRouter`，`extensionDocuments.ts`），插件在自己的标签页里渲染和编辑。
3. 保存经宿主受控通路（`saveBytes`，etag 冲突检测）写回原文件。
4. 再次点同一个文件的卡片，只聚焦已打开的编辑器，不重复打开。

插件看到的接口不变，Office 插件本身不改。需要随联合目标一起改的点：

| 位置 | 改动 |
|---|---|
| `src/app/workbench/revealOpenOfficeDocument.ts` | 现在用 `spaceFileTargetSchema` 比较 `spaceId`、`directoryId`、`revision`、`path` 找已打开的编辑器；改成比较联合目标的等价字段（授权目录目标比较 `conversationId`、`root`、`path`），否则授权目录目标会被判为不匹配，重复打开 |
| 插件视图的 `view.resource.data.fileTarget` | 存储与恢复都按联合 schema 解析，否则新目标存不进去，会话恢复后视图打不开 |
| `saveBytes`、`saveDocument` 的输入 schema | 基于联合目标；服务端经 `resolveTarget` 解析。**待核实**：保存通路对没有 `revision` 的目标是否全部可用（风险 4） |
| 授权被撤销或会话被删 | 已打开的编辑器内容不丢，再保存失败并提示“无法访问该文件”，与空间目录被撤销时的现有行为一致 |

### 2.6 删除

- 标签页类型 `artifact`，以及 `DesktopArtifactContextSurface.vue`、`useArtifactPreview.ts`、`DesktopArtifactToolbar.vue`（约 345 行），调整 `DesktopTaskResourcePanel.vue`。
- `artifactOpening` 设置项（`DesktopArtifactOpeningSetting.vue`、配置字段、i18n）。已保存的旧配置里该字段按未知字段忽略，不需要迁移。
- `fitsSpaceFilePreview` 的大小判断，以及 `openInTaskSpace` 里“别的任务”的限制。
- 旧会话快照里的 `artifact` 标签页：加载时转成授权目录根标签页（产出记录还在则转，否则丢弃），转换失败不报错。

## 3. 不做的事

- 不去掉聊天卡片，不改产出登记、产出 ID、卡片菜单。
- 不改空间内现有文件管理器的行为。
- 不改 HTML 产出的去向。
- 不允许浏览任意磁盘：根只能是会话已授权的目录。
- 不解决“产出文件被移动后找不到”的旧问题，只保证提示清楚。

## 4. 风险与待核实

1. **前端改动面大。** 读 `directoryId` 的源码文件约 15 个。缓解：先抽象“文件根”，空间根迁移过去并保持现有测试通过，再接入授权目录根。
2. **写操作不能越出授权根（本版重点）。**
   - `copy`、`move` 的 `destination` 本来是一个完整目标；授权目录目标要求其 `conversationId` 和 `root` 与源一致，服务端校验，不一致返回校验失败。
   - 重命名、新建、移到回收站、符号链接都要在授权根内再校验一次；回收站的存放位置和恢复要确认不落到授权根之外。
   - 文件操作有日志和恢复机制（`prepared`、`executing`、`needs-recovery`），目前按空间目录登记，需要核实改成按授权根登记后，重启时的恢复仍然正确。
3. **选区引用（待核实）。** 授权目录目标下的引用能写入输入框、能在聊天里定位回来；旧会话里指向产出的引用（`BuddyArtifactQuote`）也要验证，Spec-035 第 6 节已列为未验证。
4. **Office 插件写回（待核实）。** 保存通路对授权目录目标是否全部可用，不会因没有 `revision` 被拒。
5. **授权根范围可能很大。** 用户把整个家目录授权给会话时，树根就是家目录。这是用户自己授权的范围，不放宽也不收窄，目录列表沿用现有分页。
6. **文件被移动后找不到。** 沿用旧问题，只补提示。
7. **旧快照转换失败。** 必须能安全丢弃，不能让面板启动报错。

## 5. 分步实施与估算

总计约 7–8 天，各步可单独验证。

| 步骤 | 内容 | 估算 |
|---|---|---|
| 1 | 契约与服务端：联合目标、`resolveFileRoot`、`resolveTarget`、列目录、读、预览、字节分片，单元测试 | 1.5 天 |
| 2 | 前端：抽出“文件根”抽象，空间根迁移过去，现有测试保持通过 | 1.5 天 |
| 3 | 前端：授权目录根标签页、`openInFileManager` 新流程、树展开与定位 | 1.5 天 |
| 4 | 编辑、保存、自动保存、插件句柄，核实风险 4 | 1 天 |
| 5 | 文件操作：新建、重命名、移到回收站、恢复、同根复制与移动，核实风险 2 | 1–1.5 天 |
| 6 | 删除“产出”页签与设置项，旧快照转换，选区引用验证（风险 3） | 1–1.5 天 |

## 6. 验证计划

- **自动化：**
  - 服务端：四类授权来源（空间附加目录、会话授权目录、无空间任务工作区、空间工作区）；授权撤销；会话删除；敏感文件名；`root` 与授权不匹配；文件被替换；符号链接逃逸；`copy`/`move` 跨根被拒；回收站与恢复；重启后的操作恢复。
  - 前端：“文件根”抽象下空间根的现有行为；授权目录根标签页；`openInFileManager` 分支；快照读取与旧快照转换；`useTaskResourcePanelArtifact.spec.ts` 更新。
- **类型与改动相关测试：** `pnpm type-check`，相关目录 vitest 与 eslint。
- **手动（本机开发预览）：** 无空间任务点卡片、会话授权目录的产出、docx 产出的插件编辑与保存、超大文本、目录产出、新建和重命名和删除和复制、选区引用、移动后的旧卡片、旧会话打开。WSL 里做不了的部分记录为“未跑”。

## 7. 实施记录

### 第 1 步：契约与服务端（2026-10-30，已完成）

**做了什么：**

- `shared/spaces/spaceFileApi.ts`：新增 `grantFileTargetSchema`（`{ conversationId, root, path }`）、联合类型 `FileTarget`、`isGrantFileTarget`、`fileTargetKey`、`readFileTarget`；`spaceFiles.*` 的请求 schema 全部改为空间目标或授权目录目标的联合；复制和移动的 `destination` 同样是联合；`spaceFiles.changed` 通知增加授权目录变体（带 `conversationId`、`root`，不带空间字段）。
- `service/src/spaces/ConversationFileRoots.ts`（新）：按 `(conversationId, root)` 找会话的有效授权。来源与 `ArtifactFileAccess` 相同：空间目录、会话授权目录、任务工作区、空间工作区。`resolve` 异步并核对磁盘上目录没被替换，`require` 是同步复查，供一次操作的多个步骤之间使用。
- `SpaceFileService`：多一个可选的第 4 个构造参数；`requireDirectory`、`resolve`、`root` 先 `prepare` 再分派；复制和移动要求目标在同一个授权根内（`requireSameRoot`）；变更通知按目标种类发出。
- `artifacts.resolveFileRoot(artifactId)`：新 RPC，经 `ArtifactFileAccess` 返回 `{ conversationId, root, path, kind }`，已接到 IPC 和 preload（`api.localChat.artifacts.resolveFileRoot`）。
- 媒体：新增 `lexora-file://grant-media/` 地址，`fileMediaUrl(target)` 按目标种类生成。
- 渲染进程只做了让类型通过的最小放宽：`FileOperationService` 的 `root`、`copyPath`、资源解析认识授权目录目标；变更通知处理处暂时只响应空间变体（第 3 步补授权目录变体）。

**验证：** `pnpm type-check` 通过；新增 `service/src/spaces/__tests__/GrantedFileTargets.spec.ts` 共 10 个用例（任务工作区浏览、预览、编辑、保存、冲突；媒体 URL；新建、重命名、复制、移动；跨根、跨会话、跨空间目录的复制和移动被拒；未授权根（含授权根的父目录）被拒；越界路径与受保护目录被拒；授权撤销后被拒；授权目录被符号链接替换后被拒；变更通知形状；没有授权查找时被拒），`ArtifactService.spec.ts` 补了 `resolveFileRoot` 的断言。`vitest` 跑了 `src/app/workbench`、`src/modules/files`、`src/modules/tasks`、`electron/main`、`shared`、`service/src/spaces|artifacts|files`，319 个文件通过。

**还没做：** 回收站与恢复在授权目录目标下没有测试（测试环境里原生回收站不一定可用）；操作日志的重启恢复（第 4 节风险 2）要在第 5 步核实；插件句柄仍只认空间目标（第 4 步）。

### 第 2 步：前端“文件根”抽象（2026-10-30，已完成）

**做法：** 没有新造“文件根对象”，而是把前端所有只做“传递和比较目标”的地方改为联合类型 `FileTarget`，比较和标识用共享函数完成。这样空间根的行为和资源 id 不变，授权目录目标走同一套组件。

**共享函数（`shared/spaces/spaceFileApi.ts`）：** `fileTargetKey`（资源 id，空间目标与原格式完全一致，已保存的布局仍能匹配）、`readFileTarget`、`requireFileTarget`、`sameFileRoot`、`sameFileDirectory`（忽略修订号）、`sameFileTarget`、`fileChangeKey`、`fileChangeAffects`（变更通知与目标的匹配）、`spaceFileTargetOnly`（给仍只认空间目标的插件接口用）。

**改动：**

- 标签页模型：`readContextTab` 和 `TaskFilesContextTab.target` 接受联合目标；`useTaskContextPanel` 里按“同一根”比较；已保存的授权目录标签页恢复时保留（由服务端在读取时校验），格式不对的丢弃。
- 文件管理器组件：`WorkspaceExplorer`、`DesktopFilesContextSurface`、`useWorkspaceFilePreview`、`DesktopFileEditor`、`DesktopFilePreview`、`useDesktopWorkbench`（工作副本读写、资源 id、变更刷新）、`FileOperationService`、`revealOpenOfficeDocument`、`resourceOpenTarget`、选区引用提供方。授权目录的变更通知现在会刷新对应的文件树、工作副本和恢复列表。
- 选区引用：引用来源 `source.file` 的 schema 放宽为联合目标，比较用 `sameFileTarget`。授权目录里的文件现在可以被引用，定位回来的流程在第 3 步接入。
- 仍只认空间目标、第 4 步才放开的地方，各自用 `spaceFileTargetOnly` 或判断挡住，不会出错，只是少一项功能：文档插件（`api.extensions.openFile`、插件命令、菜单的 `resource`、内嵌的插件预览渲染器）。授权目录里的 docx 目前按普通预览打开。

**验证：** `pnpm type-check`、`eslint` 通过；`vitest` 跑了 `src`、`shared`、`electron`、`service/src/spaces|artifacts|files`，678 个文件、5338 个用例通过。新增测试：`shared/spaces/__tests__/fileTarget.spec.ts`（7 个）、`FileOperationService.spec.ts`（授权目录工作副本重命名、复制路径）、`resourceOpenTarget.spec.ts`（授权目录标签页和视图）、`useTaskContextPanel.spec.ts`（授权目录标签页恢复）、`revealOpenOfficeDocument.spec.ts`（授权目录文档聚焦）。

**还没做：** 点卡片后真正打开授权目录标签页的流程（第 3 步）；`isAvailable` 对授权目录标签页目前一律视为可用，撤销后的表现要在第 3 步配合“无法访问该目录”的提示；没有在真实窗口里验证（WSL 里做不了）。

### 第 3 步：授权目录根标签页与点卡片流程（已完成）

- `useTaskResourcePanel.openInFileManager`：先走原来的空间路径（行为不变）；不在任务空间内的产出，调 `artifacts.resolveFileRoot`，再打开以产出所在目录为根的文件管理器标签页（`useTaskContextPanel` 新增 `openGrantedFile`、`openGrantedDirectory`、`openGrantedSourceFile`，与空间标签页共用 `showFile`）。文件产出树折叠、Office 显示树，目录产出展开到该目录，目录根本身不展开任何东西；同一目录的下一个产出复用同一个标签页，不同目录各自一个。
- 产出不可达（授权撤销、任务删除、文件被移走）时调用 `onError` 提示，不回退到旧页签。已打开的授权目录标签页里，读取失败显示文件树已有的“目录加载失败”和预览错误状态。
- “别的任务的产出”改用它自己所属任务的授权目录打开，标签页归属那个任务。
- 选区引用定位：授权目录里的文件走同一条路，不再单独打开。
- 去掉 `fitsSpaceFilePreview` 大小判断：超限文件在文件管理器里显示它自己的超限状态。

### 第 4 步：编辑、保存与插件句柄（已完成）

- 插件接口的资源目标放宽为联合类型：`extensionApi.ts` 的 `resource`、`openFile`、`execute`，`extensionFileOpening` 的 `space` 来源，`ExtensionPackageStore` 的授权句柄，`ExtensionService` 与 `registerExtensionIpc` 的读写端口。句柄仍不透明，插件拿不到真实路径。
- 插件“引用到输入框”对授权目录文件不用“空间绑定引用”的捷径，而是读出文件内容作为文件附加。
- 去掉第 2 步的临时限制：授权目录里的 docx、xlsx、pptx 现在交给文档插件，插件命令、菜单和内嵌预览都收到授权目录目标。
- 服务端测试：二进制分片读取、`saveBytes` 的 etag 与 `expectedHash` 冲突检测在授权目录目标下与空间目标一致；`ExtensionService` 测试确认插件句柄不含根路径。

### 第 5 步：文件操作（已完成）

- 新建、重命名、移到回收站、恢复、复制、移动在授权目录根下全部可用：前端的操作都是对 `{ ...目标, path }` 的展开，不需要新入口。
- 粘贴限制：授权目录根只接受在同一个根里复制或剪切的内容（`canPaste`），空间文件与授权目录之间也不能互相粘贴；服务端也会拒绝，前端先置灰。
- 回收站与恢复在授权目录里可用（测试中通过）。操作日志的重启恢复：中断的操作按授权根登记，重启后能列出并确认；授权已撤销时不暴露也不改动。

### 第 6 步：删除旧“产出”页签与设置（已完成）

- 删除：`DesktopArtifactContextSurface.vue`、`DesktopArtifactToolbar.vue`、`useArtifactPreview.ts`、`artifactContextPresentation.ts`、`DesktopArtifactOpeningSetting.vue` 及对应测试；标签页类型 `artifact`、`ArtifactViewMode`、`spaceTaskArtifactTabs`、`isBrowserArtifact`；配置项 `desktop.artifactOpening`（TOML 里的 `artifact_opening` 因 desktop 段允许未知键而被忽略，备份键表里也已去掉）。
- 与第 4.6 节计划的差别：旧会话快照里保存的 `artifact` 标签页**直接丢弃**，不转换成授权目录标签页。转换需要异步查询产出所在目录，而恢复是同步的；这类标签页只是预览，用户再点一次卡片即可。
- “右键打开方式”选了内置的文本类打开方式时，现在也在文件管理器里打开（以前是产出页）；浏览器和插件的打开方式不变。HTML 默认仍转浏览器，由默认打开方式决定。
- 旧的产出引用（`BuddyArtifactQuote`）：定位时在文件管理器里打开该产出，返回“已打开”，不再还原到文件内的具体位置；产出页不存在后，也不会再产生新的产出引用。授权目录文件的引用走文件引用，能定位回具体位置。

### 验证（第 3—6 步）

`pnpm type-check`、`eslint` 通过；全仓库 `vitest`：新增和改写的测试涵盖点卡片的各条路径（无空间任务、空间外、别的任务、目录、Office、插件聚焦、不可达提示、右键打开方式）、插件句柄、粘贴限制、回收站与恢复、重启恢复、旧快照丢弃、旧产出引用定位。

**未验证：** 真实窗口里的表现（WSL 里做不了，需要在 Windows 本机开发预览里手测）：无空间任务点卡片、会话授权目录的产出、docx 产出的插件编辑与保存、超大文本、目录产出、新建和重命名和删除和复制、选区引用、旧会话打开；打包产物。授权被撤销后已打开的标签页只靠读取失败时的现有错误状态提示，没有专门的“无法访问该目录”文案。
