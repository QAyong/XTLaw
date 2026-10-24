# Spec-035：任务产出在文件管理器中打开

**日期：** 2026-10-20  
**状态：** 已实现，用户已在开发预览中验收（2026-10-20）；2026-10-24 补回卡片菜单与“定位”，见第 8 节

**相关：** [Spec-016：资源插件接入与 Office DOCX 预览编辑](./feature-016-plugin-artifact-preview.md)、[Spec-019：文件管理器基础](./feature-019-file-manager-basics.md)、[Spec-013：工作台选区引用与多分屏目标](./feature-013-workbench-selection-reference.md)

## 1. 背景

聊天里的“本轮产出”卡片原先一律打开独立的“产出”标签页，它和文件管理器是两套预览：产出页只读，只认文本和图片，没有插件入口，也不会随文件变化刷新；同一个文件从文件管理器打开却能编辑、保存，并交给 Office 等文档插件。用户从卡片点进来，看到的能力比自己去文件管理器翻出同一个文件少。

本规格让“在任务所属空间目录里的产出”改走文件管理器，卡片只作为入口；文件管理器无法承接的产出保持原通路。

## 2. 需求边界

**包含：**
- 点击产出卡片（含聊天里指向产出的文件链接、执行详情、选区引用定位等所有经 `openArtifact` 的入口）时，先判断能否在文件管理器打开。
- 文件产出：在文件管理器标签页打开该文件，**文件树收起**，用户仍可手动展开。
- Office 文档产出（`.docx`、`.xlsx`、`.pptx`，由文档插件接手）：文件管理器标签页与插件标签页同时打开，文件管理器的**文件树显示**，并展开到该文件所在目录；文件树不收起（2026-10-23 调整，此前与其他文件一样收起）。
- 文件夹产出：在文件管理器标签页打开，文件树展开到该文件夹并高亮聚焦，等同用户在树里点了它；标签页里已打开的文件保持不变。空间根目录本身作为文件夹产出时只显示树，不展开任何子目录。

**不包含：**
- 取消产出登记或“产出”标签页：无空间任务、空间外产出仍依赖它。
- 统一产出与文件管理器的读取上限和类型判定（见第 6 节）。
- 改变 HTML 产出的去向：仍转内置浏览器。

## 3. 何时走文件管理器

同时满足下列条件才走；任一不满足，保持原“产出”标签页，不弹提示：

| 条件 | 说明 |
|---|---|
| 不是 HTML | HTML 仍走内置浏览器会话 |
| 产出属于当前任务 | `conversationId` 与当前任务一致，不把别的任务的文件塞进当前面板 |
| 路径在当前任务空间的主目录内 | 由 `resolveChatToolFileTarget` / `resolveChatToolDirectoryTarget` 判定；任务未绑定空间、空间或目录已撤销、路径在主目录之外（含附加目录）均不满足 |
| 大小在文件预览能承载的范围内 | 文本类不超过 1 MiB，图片不超过 8 MiB；其余类型（含 docx 等需交给插件的文件）不限。超出时仍用产出页，因为它能读到 2 MiB 文本 |

## 4. 行为细节

- **文件：** `previewFile(path, source, treeVisible)` 带 `treeVisible` 打开，标签页写入 `tree: { visible: treeVisible, token }`；不传则不发请求。普通文件传 `false`：同一文件已在标签页中、或标签页内已有同空间的其他文件时复用该标签页并重新发出收起请求；每次点卡片都会重新收起，即使用户之前手动展开过。
- **Office 文档：** 产出卡片和聊天里指向 Office 文件的链接传 `true`，同样每次点卡片都会重新显示文件树，即使之前被普通文件卡片收起。已在编辑器里打开的 Office 文档仍只聚焦该编辑器（`revealOpenOfficeDocument`），不动文件管理器。
- **文件夹：** `openDirectory(path, source)` 写入 `expand: { path, token }` 与 `tree: { visible: true, token }`；新开标签页时目标路径为空（不预览任何文件），已有标签页时只改这两个字段，右侧文件不变。
- **模拟点击：** 文件树组件的 `reveal` 逐层对尚未展开的文件夹执行与用户点击相同的 `activate`（展开并加载），最后聚焦目标文件夹并把焦点交给树。聚焦外框的样式只在树本身有焦点时显示，所以最后一步必须聚焦树。
- **再次请求：** 请求带 `token`，同一文件夹被用户折叠后再点卡片会重新展开；同一 token 不会重复执行，窗口切换回标签页也不会重新打开用户已折叠的文件夹。
- **持久化：** `expand`、`tree` 是标签页的可选字段，进入标签页快照并由 `readContextTab` 校验；旧快照没有这两个字段仍可读取。
- **文档插件：** 走文件管理器后，docx 等文件在打开文件这一步按扩展名匹配已启用的文档插件（`ExtensionDocumentRouter`），与用户自己在文件管理器点同一文件一致。

## 5. 实现

| 位置 | 作用 |
|---|---|
| `apps/buddy/src/modules/tasks/state/context-panel/useTaskResourcePanel.ts` | `openArtifact` 判断去向：文件夹 → `openDirectory`，文件 → `previewFile(..., true)`，否则 `openArtifact` |
| `apps/buddy/src/modules/tasks/state/context-panel/useTaskContextPanel.ts` | 新增 `openDirectory`、`canOpenDirectory`；`previewFile` 增加 `collapseTree`；抽出 `findSpaceFilesTab`、`newFilesTab`、`updateFilesTab` |
| `apps/buddy/src/modules/tasks/model/transcript/chatToolFileTarget.ts` | 新增 `resolveChatToolDirectoryTarget`（空间根目录也算文件夹）与 `fitsSpaceFilePreview`（大小与类型判定） |
| `apps/buddy/src/modules/tasks/model/context-panel/taskContextPanel.ts`、`readContextTab.ts` | 文件标签页新增可选字段 `expand`、`tree` 及校验 |
| `apps/buddy/src/modules/tasks/widgets/context-panel/useWorkspaceFilePreview.ts` | 响应 `tree` 请求，设置文件树面板显示或收起 |
| `apps/buddy/src/modules/tasks/widgets/context-panel/DesktopFilesContextSurface.vue`、`apps/buddy/src/modules/files/explorer/WorkspaceExplorer.vue` | 把 `expand` 作为 `reveal` 传给树 |
| `apps/buddy/src/shared/ui/explorer/ExplorerTree.vue` | 新增 `reveal` 属性与逐层展开、聚焦逻辑 |

## 6. 已知限制

- **移动过的文件会读取失败。** 产出记录保存的是实时路径，不是快照。文件被移动或删除后，两条通路都会失败（服务端 `ENOENT`）。验收时发现的一个例子：Agent 先登记了 `根目录\xxx.md`，随后把文件移进子文件夹，旧卡片打不开。本规格没有解决“找回文件”，需要的话另行设计（例如按产出文件名在授权目录内重新定位，或登记时记录快照）。已补的只是提示：文件找不到时，文件管理器预览和“产出”标签页都显示“文件已被移动或删除”，不再笼统地说“加载失败”。实现上服务端把 `ENOENT` 转成公开错误码 `FILE_NOT_FOUND`（`SpaceFileService.read`、`ArtifactService.readText`），界面据此选择文案；`readDocument`（编辑器读取）没有映射，仍显示通用失败。
- **读取上限不一致。** 产出页文本上限 2 MiB，文件管理器 1 MiB；本规格用大小判断规避，没有统一上限和类型判定。
- **选区引用的来源类型可能变化。** 产出原先引用为 `BuddyArtifactQuote`，改走文件管理器后在该文件上的引用走文件引用通路。旧会话里已存在的产出引用能否定位，没有专门验证。
- **没选本地文件夹的空间**，产出落在空间内部工作区，不在任何登记目录里，所以仍走产出标签页（验收后发现）。已由 [Spec-039](./feature-039-space-workspace-in-file-manager.md) 补上：这类空间的内部工作区作为“默认文件夹”进入文件管理器，产出同样走文件管理器。
- **附加目录里的产出**不走文件管理器，因为路径映射只覆盖空间主目录。
- 文件夹产出点击后不预览任何文件，右侧沿用标签页里已有的文件，没有则显示文件管理器原有的“选择文件”占位。

## 7. 验证

- 提交：`a10f931b`（空间内产出按空间文件打开）、`2e754c46`（文件夹展开与文件收起树）。
- 自动化：`pnpm exec vitest run src/shared/ui/explorer src/modules/files src/modules/tasks` 共 92 个文件、795 个用例通过；`pnpm type-check`、相关目录 `eslint` 通过。新增或扩展的用例：`useTaskResourcePanelArtifact.spec.ts`（去向判断与各回退情形）、`ExplorerTree.spec.ts`（逐层展开、聚焦树、再次请求）、`useResourcePreviews.spec.ts`（树的显示与收起请求）。
- 手动：用户在开发预览中确认文件夹展开高亮、文件卡片收起文件树（2026-10-20）。
- 2026-10-23 调整 Office 文档的树状态：`pnpm exec vitest run src/modules/tasks/state/context-panel src/modules/tasks/widgets/context-panel src/app/workbench/__tests__/revealOpenOfficeDocument.spec.ts` 19 个文件、206 个用例通过，`pnpm type-check` 通过；开发预览里点 Office 卡片的实际表现未验证。
- 未验证：Office 等文档插件经产出卡片接手的完整流程；引用定位；打包产物。

## 8. 卡片菜单与“定位”（2026-10-24）

上游 `2f91fa803` 的卡片操作补回后，卡片右上角的“更多”菜单与右键菜单提供：引用、在文件中定位、打开所在文件夹、复制路径；正文里的文件链接右键菜单（上游 `e243ce221`）是同一组操作，另有“打开”和“打开方式”。这些操作与本规格的“点击进文件管理器”并存，规则如下。

**点击与“打开”仍走第 3、4 节。** 点击卡片、卡片上的“打开”图标、右键菜单里不带提供方的“打开”、指向产出的正文文件链接、执行详情和选区引用定位，都经 `openArtifact`；在进入上游的 `openResource` 之前先判断能否走文件管理器。下列情形不走，按上游的通路（产出页、浏览器、文档插件）打开：

- `artifactOpening` 设置为 `panel`；
- 产出是 HTML（浏览器类）；
- 该类型的默认打开方式是用户单独指定的插件（`provider.renderer === 'extension' && !provider.implicit`）；
- **右键菜单“打开方式”里显式选了某个提供方**：带 `providerId`，按用户选择打开，不强行进文件管理器。

**“定位”不同于点击。** 它把标签页的 `treeTarget`（`{ path, kind }`）写进文件标签页，与 `tree`、`expand` 两种请求并存：

| | 点卡片（`tree` / `expand`） | 定位（`treeTarget`） |
|---|---|---|
| 文件树 | 文件收起，Office 与文件夹显示 | 总是显示，并逐层展开、重新读取 |
| 文件 | 文件在标签页里打开 | 文件在标签页里打开，树里高亮 |
| 文件夹 | 展开并聚焦，标签页里已打开的文件不变 | **标签页当前文件清空**（上游行为），树里高亮该文件夹 |
| 标签页 | 复用同空间的文件标签页 | 复用同一目录的当前或第一个文件标签页，并整体替换（不带旧的 `tree`、`expand`） |

**两种请求互不覆盖：**

- 用户选了别的文件、或点另一个文件的卡片时，`selectFile` 先清除 `treeTarget`，再写本次的 `tree` 请求。所以“先定位文件 A，再点普通文件 B 的卡片”会重新收起文件树；否则 `treeTarget` 停在 A，监听它的逻辑会把树重新设为显示，盖掉收起请求。
- 点文件夹卡片（`openDirectory`）清除 `treeTarget` 并写入 `expand`，高亮交给这个文件夹；清除 `treeTarget` 本身不会让监听逻辑重新展开标签页里文件所在的文件夹。
- `treeTarget` 随标签页快照保存，由 `readContextTab` 校验；旧快照没有该字段仍可读取。

**实现位置：** `useTaskResourcePanel.ts`（`openInFileManager` 在 `openResource` 之前）、`useTaskContextPanel.ts`（`locateFile`、`selectFile`、`openDirectory`）、`useWorkspaceFilePreview.ts`（响应 `treeTarget`）、`DesktopFilesContextSurface.vue`、`createArtifactActions.ts`、`createFileLinkMenu.ts`。

**验证：**`useTaskResourcePanelArtifact.spec.ts`（去向判断；链接指向已登记产出；显式提供方；定位后再点卡片重新收起）、`useTaskContextPanel.spec.ts`（`locateFile`、`selectFile`、`openDirectory` 对 `treeTarget` 的处理）、`createArtifactActions.spec.ts`、`BuddyArtifactCard.spec.ts`。点卡片进文件管理器、“定位”后再点卡片、正文链接右键菜单在真实窗口里的表现需要本机手测，尚未验证。

