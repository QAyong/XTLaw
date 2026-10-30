# Feature-043：Office 文档引用的“定位来源”

**日期：** 2026-10-30
**状态：** 方案已确认（2026-10-30）；第 0 步（重开路径统一走文件管理器）已实现并通过类型检查与单测，未在桌面应用里实测；第 0、1 步（重开路径统一走文件管理器、宿主调用插件 `onReveal`、三态结果、PDF）已实现，用户已在 Windows 开发预览里验证通过（2026-10-30）；第 2–4 步（PPTX、DOCX、XLSX）已实现，用无头 Chromium 加模拟宿主冒烟，未在桌面应用里实测
**范围：** 宿主 `apps/buddy/src/app/workbench`（文件引用的“定位来源”重开路径对**所有文件格式**生效，包括 `source`、`markdown`）；插件 `plugins/office`、`plugins/office-pptx`、`plugins/office-xlsx`、`plugins/office-pdf` 及对应的 `apps/buddy/extensions/*` 构建脚本；`apps/buddy/extensions/document-kit`
**承接：** [Feature-033 文档插件契约](feature-033-document-plugin-contract.md)、[Spec-013 工作台选区引用](feature-013-workbench-selection-reference.md)（第 15 节）、[Feature-042 Office PDF 插件](feature-042-office-pdf-plugin.md)

## 1. 背景与问题

在 Office 类插件（DOCX、PPTX、XLSX、PDF）里选中内容并“引用到聊天”，输入框里会出现引用卡片，卡片预览里有“定位来源”按钮。

**现状（读代码得出，未实机验证）：** 点击后只会把原文件重新打开，或切到已经打开的那个标签页，**不会选中、滚动或高亮原来那段内容**。

- 宿主在 `builtinSelectionReferenceProviders.ts` 的文件提供者里，对 `source`、`markdown` 格式会切换视图模式并调用 `request.reveal` 高亮；对 `docx`、`pptx`、`xlsx`、`extension` 格式只重开文件，检查视图是插件视图、插件 ID 一致后直接返回成功，不再调用任何定位。
- 引用里的位置信息（DOCX/PPTX 的 `indexes` + `from/to`，XLSX 的 `sheetIndex` + `sheet` + `range`，其他插件的 `extension.location`）只被存储，没有交还给插件。`document-kit/quote.js` 的注释也承认“重开文件时宿主还没有把 `kind`、`location` 交回视图”。
- Spec-013 第 15.2 节写的是“暂不保证重开后精确高亮原选区”，属于当时有意留下的缺口。

用户看到的是“定位来源”按钮，却回不到原来的位置，体验上等于没做完。

**第二个问题：重开文件的路径和点产出卡片不一致（2026-10-30 用户指出，读代码确认，未实机验证）。**

- 点聊天里的产出卡片时，走 Spec-035 的文件管理器路径：`useTaskResourcePanel.openArtifact` → `openInTaskSpace` → Office 文件先 `revealOpenOfficeDocument` 聚焦已开的编辑器，否则 `taskContext.previewFile(path, source, true)` 打开**文件管理器标签页**（文件树显示并展开到该文件），文件标签页再通过 `workbench.openFile(target, filesTabId)` 打开插件视图，视图带 `contextTabId`，归属这个文件管理器标签页。
- 点引用卡片的“定位来源”时，文件提供者调用的是 `options.openFile`，即 `createFile(target)`，**不带标签页 ID**，直接开一个独立的文件视图或插件视图，不经过文件管理器标签页、文件树，也不做 `revealOpenOfficeDocument` 的复用判断。同一份文档因此可能出现两个入口、两份视图，用户看到的页签也和点产出卡片时不同。
- 这与 Spec-035 的意图（“选区引用定位等所有经 `openArtifact` 的入口”都先判断能否进文件管理器）和 Spec-013 的描述（“返回原文件”）不一致，应当统一。

## 2. 上游怎么做（读 `upstream/master` c79058417，未运行）

- 上游仓库里没有 Office 插件源码，Office 是外部插件。宿主里的文件提供者只处理 `format: ['source', 'markdown']`，Office 内容不走文件定位。
- 上游用插件接口：插件调用 `context.references.add({ kind: 'content', text, locator })` 加引用，`locator` 是插件自定义的 JSON，宿主只保存并原样传回；插件用 `context.references.onReveal(handler)` 注册定位处理器，点“定位来源”时宿主把 `referenceId`、原文 `text`、`locator`、取消信号交给它，它滚动并选中，确认后返回 `true`；找不到、版本不支持、未注册、抛错都算失败（文档见 `plugin-creator/references/references.md`）。
- 宿主侧是 `useExtensionReferences.ts` 的 `resolveLocate`：先复用原视图或重新打开，再调用 `views.revealReference`。**这部分本地与上游一致，也已经就绪**；`view.js` 里的 `references.onReveal` 对所有视图无条件开放，不依赖 `references` 权限。
- 差别在于：上游 Office 的引用是 `view` 类（`provider: extension:<id>`），走上面这条通路；我们的 Office 引用是 XTLaw 自己的文件类（`composer.captureQuote` → `source.kind: 'file'`），没有接入这条通路。

## 3. 目标与非目标

**目标**

1. 点击 Office 引用卡片的“定位来源”，打开原文件后，在编辑器里滚动到并选中（或高亮）原来引用的内容。
2. 复用上游已有的 `revealReference` / `references.onReveal` 通路，不新增 IPC、协议字段或权限。
3. 文件打开了但没能定位到原位置时，如实告诉用户，不暗示一定回到了准确位置（承接 Spec-013 中“来源不支持定位时，不能暗示一定能回到准确位置”的要求）。
4. 旧版保存的引用（`docx`、`pptx`、`xlsx` 格式）和已发送的历史引用继续可定位或至少不出错。
5. **（2026-10-30 已定）** 所有文件引用（`source`、`markdown`、Office 各格式）点“定位来源”时，重开文件的路径统一为文件管理器路径，与点产出卡片一致。

**非目标**

- 不改引用的存储格式、去重、长度限制和发给模型的文字。
- 不做“引用后编辑文档导致位置漂移”的精确追踪；位置对不上时按文字查找，查不到就报告失败。
- 不改浏览器元素引用、产出引用（`source.kind: 'artifact'`）的定位。`source`、`markdown` 的高亮方式（Monaco 选区、Markdown 预览高亮）不变，只改它们重开文件的路径。
- 不把 Office 引用迁移成上游的 `view` 类引用。
- 不改 `.github/workflows`，不处理上游同步。

## 4. 方案

### 4.1 宿主：文件提供者在重开文件后调用 reveal

改动点：`builtinSelectionReferenceProviders.ts` 文件提供者里 `format !== 'source' && !== 'markdown'` 的分支（现为 82–83 行）。

1. **按文件管理器的路径打开文件**（见 4.1.1），确认视图是插件视图、`extensionId` 匹配（保持现有检查）。
2. 等待插件视图就绪：`surface.ready && visible && eligible && session`，且资源 ID 与打开的文件一致。可参考 `useExtensionReferences.ts` 的 `waitForView`，超时和 `current()` 失效时返回失败。
3. 由引用来源构造 `locator`，调用 `views.revealReference(id, { referenceId: quote.id, text: quote.text, locator }, signal)`，以插件返回值为结果。
4. 文件提供者当前没有拿到 `views`，需要在选项里新增一个很窄的回调（见 4.2）。

#### 4.1.1 打开路径：走文件管理器

对所有文件引用（`source`、`markdown`、`docx`、`pptx`、`xlsx`、`extension`），重开文件的方式改为与点产出卡片一致：

1. 仍先读一次源文件（`locateFile`），确认文件在、有权限。
2. 引用的 `spaceId` 等于当前任务的活动空间、且对应目录未撤销时：
   - 已有打开的 Office 编辑器：`revealOpenOfficeDocument` 聚焦它（复用已有会话，不重载）。
   - 否则 `taskContext.previewFile(path, source, true)` 打开文件管理器标签页，文件树显示并展开到该文件；再用 `workbench.openFile(target, filesTabId)` 取得该标签页下的插件视图。`openFile` 对相同参数有去重，与文件标签页自己的监听调用不会重复打开。
   - 视图带 `contextTabId`，现有的 `acceptTab` 作用域检查可以直接沿用。
3. 引用的空间不是当前任务的活动空间、目录已撤销、或任务没有绑定空间：沿用现在的独立视图打开方式（不回退失败），仍调用插件定位。
4. `previewFile` 需要的是路径并按活动空间重新解析目标；引用里保存的 `revision` 可能已过期，以当前目录的 `revision` 为准，文件是否存在由第 1 步的读取确认。需要给 `previewFile` 或其外层加一个按 `SpaceFileTarget` 打开的入口，具体接口在实现时确认，保持在新增文件里，少动上游文件。
5. 用户设置为“产出面板”时（`artifactOpening === 'panel'`）：引用定位属于用户主动点击源文件，不受该设置影响，仍进文件管理器。已定不尊重该设置，见第 8 节问题 5。

**`source`、`markdown` 的差别（2026-10-30 已定一并改）：**

- 它们目前也用 `createFile(target)` 开独立视图，再切换视图模式并 `request.reveal` 高亮（Spec-013 已验收并有 E2E）。改后文件在文件管理器标签页内联显示，视图是 `file` 类、`contextTabId` 为文件标签页 ID；`captureSource` 已支持通过 `contextTabId` 找到标签页，`request.reveal` 与模式切换（`source` / `markdown` 预览）仍对这个视图调用。
- 不适用 `revealOpenOfficeDocument`（只对 docx、xlsx、pptx）和“文件树显示”：普通文件按 Spec-035 传 `treeVisible: false`，同一文件已在标签页内则只聚焦，不重复打开。
- 文件管理器标签页里用户可能随时点别的文件，导致高亮目标视图被替换。`captureSource` 的身份已包含 `view.resource`，现有的失效检查会取消，行为应为“定位失败”，不选错文件；实现时补用例确认。
- 因为改变了已验收的 Spec-013 行为，需要更新 `selectionReferences.e2e.mjs`、`artifactSelectionReferences.e2e.mjs` 中涉及重开文件的断言，并在 Spec-013 追加变更记录。这些 E2E 在 WSL 跑不了，记录里写“未跑”，回 Windows 本机验收。

**`locator` 的形状**（宿主构造，插件解释；满足 `referenceLocatorSchema`，≤16 KiB、≤12 层）：

```jsonc
{ "version": 1, "data": {
  "format": "docx" | "pptx" | "xlsx" | "extension",
  "hash": "<引用时文件内容哈希>",
  // docx / pptx：
  "indexes": [...], "from": 0, "to": 0,
  // xlsx：
  "sheetIndex": 0, "sheet": "Sheet1", "range": "A1:B2",
  // extension：
  "kind": "pdf-page", "location": { "page": 3 }
} }
```

- 各字段原样来自 `quote.source` 的对应分支，宿主不解释。
- `extension.location` 已有 4096 字节、深度 4 的上限，包进 `data` 后仍在 locator 预算内。
- 请求里本来就带 `text`（引用时的文字快照），插件用它做校验和兜底。

### 4.2 宿主：新逻辑放新文件

遵循 Feature-033 的原则（新逻辑放新增文件，对上游已有文件只做小范围替换）。`builtinSelectionReferenceProviders.ts` 和 `useExtensionReferences.ts` 都是上游文件。

- 新增 `apps/buddy/src/app/workbench/extensionDocumentLocator.ts`：`buildDocumentLocator(source)` 和等待视图就绪的小函数（照着 `waitForView` 写一份，不修改上游文件里的私有函数）。
- `builtinSelectionReferenceProviders.ts` 只替换那一个分支，加一个可选选项（例如 `revealDocument`），未提供时保持现状，便于合并上游。

### 4.3 结果语义（已定，见第 8 节问题 1）

当前 `locate` 返回布尔值，失败时卡片显示“来源已不可用，引用内容仍保留”。新行为里“文件打开了但没定位到”和“文件打不开”是两种情况，建议区分：

| 情况 | 现象 |
|---|---|
| 文件打开并定位成功 | 无提示 |
| 文件打开但插件没能定位（未注册处理器、位置对不上、文字找不到） | 文件已打开；提示“已打开文件，但没能定位到原来的位置” |
| 文件打不开、权限失效、插件被禁用 | 沿用“来源已不可用，引用内容仍保留” |

这需要 `SelectionReferenceLocateHandler` 的结果从布尔值扩展成 `'located' | 'opened' | false`，并新增一条中英文文案。`ChatInputMaterialCard.vue` 是上游文件，改动保持在几行内。

### 4.4 插件契约

在 `document-kit` 和插件开发文档里补两点，让第三方文档插件也能用：

- 说明 `references.onReveal` 对文件引用同样适用，`locator.data` 的结构如 4.1。
- 校验责任在插件：位置信息只是提示，`text` 才是依据；`locator` 不是文件授权。

`document-kit/quote.js` 开头那条“宿主还不会交回”的注释，在宿主改完后更新。可选增加一个 `registerReveal(context, handler)` 小封装，统一取消信号处理和“等待文档加载完”的写法。

### 4.5 各插件的定位实现

每个插件在视图页里调用 `context.references.onReveal(handler)`，handler 必须先等文档加载完成（遵守 `signal`），再定位。**通用校验流程：**

1. 按 `locator.data` 的位置取出当前文档里对应的文字。
2. 与 `text` 比较（忽略首尾空白）。一致则选中并滚动到可见，返回 `true`。
3. 不一致（文档被改过）则在文档里按 `text` 搜索，唯一命中则选中；多处命中取最接近原位置的一处；找不到返回 `false`。
4. 不修改文档内容，不触发保存。

| 插件 | 位置 | 选中方式 | 备注 |
|---|---|---|---|
| PDF | `kind: 'pdf-page'`，`{ page }` | 翻到该页；在页内按 `text` 查找并高亮 | XTLaw 自写的选区弹窗和插件脚本，改动最自由。先做这个，用来端到端验证宿主通路 |
| PPTX | `indexes`（幻灯片号）+ `from/to` | 编辑器已有 `case "goto"`、`case "select"` 控制命令，先跳到幻灯片，再按文字范围或元素选中 | 需核对 `select` 的参数形状 |
| DOCX | `indexes`（正文块）+ `from/to` | 编辑器是 `window.__aidocs.editor`，选区读法已确认；设置选区和滚动的接口**未核对**。位置未变时用 `from/to`，否则文字查找 | 需核对能否稳定从外部设置选区 |
| XLSX | `sheetIndex`、`sheet`、`range` | 切换工作表并激活 `range`。构建时需在 `shims/control-fix.ts` 里新增一个“选中区域”控制命令，调用 Univer API | 要改构建 shim 并重编引擎；校验用 `getDisplayValues()` 对比 `text` |

DOCX、PPTX、XLSX 的编辑器和引擎来自 GenOffice 的预编译产物，改定位逻辑要动页面脚本或构建 shim。每个插件改完要升 `extension.json` 版本，按 AGENTS.md 运行 `pnpm market:sync`，再按市场仓库流程发布。

## 5. 与旧版引用的兼容

- 旧的 `docx`、`pptx`、`xlsx` 格式引用在存储里已经有 `indexes/from/to`、`cells`，宿主构造 `locator` 时直接使用，不需要迁移。
- 旧版插件（没有注册 `onReveal`）收到请求会超时或失败，按 4.3 属于“文件已打开但没能定位”，不影响现有行为（文件仍然打开）。
- 第三方文档插件的 `extension` 引用同理。
- 已发送消息里的历史引用也走同一路径，仍遵守“不重新读取内容、不改快照”。

## 6. 风险与边界

1. **位置漂移。** 引用后文档被编辑（包括自动保存后重开），`from/to` 不再对应原文。靠 `text` 校验和查找兜底，找不到就失败，不选错位置。
2. **加载时间。** 宿主现在对定位设了 10 秒总超时，`waitForView` 也是 10 秒。首次打开较大的 DOCX、XLSX（wasm 引擎）可能超时。需要在实机里测；必要时只对文档类分支放宽。
3. **插件视图就绪不等于文档就绪。** 宿主只能等到视图 session 可用，编辑器内部的文档加载由插件自己等。
4. **已打开且有未保存修改。** 定位复用原视图，不重载，所以内存里的内容与文件可能不同。插件按当前内容校验，不要读磁盘文件。
5. **上游同步冲突。** 提供者和卡片都是上游文件，目前提供者与上游已有 11 行差异。新逻辑放新文件、原文件只做小范围替换，把冲突面压到最小。
6. **文件管理器路径的作用域。** 现有 `captureTabScope` / `acceptTab` 假定打开的视图归属活动标签页；文件管理器路径下视图的 `contextTabId` 是文件标签页 ID，需要确认定位期间用户切换标签页、关闭面板时仍会取消，不误报成功。
7. **安全。** `locator` 只含引用时保存的有界 JSON，不扩大文件授权；定位仍要求文件授权和版本匹配，不能为恢复来源绕过权限。

## 7. 实施步骤

0. **宿主：重开路径统一走文件管理器**（4.1.1，所有文件格式）。不依赖任何插件改动，可单独交付和验收；先于下面各步，这样 `source`、`markdown`、Office 的“定位来源”打开方式先一致，再谈定位。需要更新 Spec-013 相关单测和 E2E 断言。
1. **宿主 + PDF**：新增 `extensionDocumentLocator.ts`、替换提供者分支、加结果语义（若确认）；PDF 插件接 `onReveal`；补宿主单测。用 PDF 把整条链路验通。
2. **PPTX**：接 `goto`/`select`。
3. **DOCX**：核对设置选区的接口后实现，位置不变用 `from/to`，否则文字查找。
4. **XLSX**：改构建 shim，重编引擎，实现切表和激活区域。
5. 更新 `document-kit` 注释、插件开发文档、各插件 README、Spec-013 第 15.2 节那句“暂不保证”。

第 1 步完成后可以单独交付，其余三个互相独立，逐个交付。

## 8. 已定的决定（2026-10-30，用户确认按建议）

1. **失败提示：** 采用 4.3 的三态（定位成功 / 已打开但没定位 / 来源不可用），新增一条中英文文案，`SelectionReferenceLocateHandler` 结果扩展为 `'located' | 'opened' | false`。
2. **超时：** 文档类定位的 10 秒先不放宽。实机测大文件（DOCX、XLSX 的 wasm 引擎）后，确有超时再调整。
3. **`registerReveal` 封装：** 写进 `document-kit` 和给第三方的插件开发文档。
4. **顺序：** 第 7 节的顺序，第 0 步宿主统一重开路径，再 PDF 验证通路，再 PPTX、DOCX、XLSX。
5. **产出面板设置：** “定位来源”不受 `artifactOpening === 'panel'` 影响，仍进文件管理器：这是回到源文件，不是打开产出。
6. **`source`、`markdown` 引用：** 一并改成走文件管理器，见 4.1.1。代价是要同步更新 Spec-013 已验收的单测和 E2E 断言，并在 Spec-013 追加变更记录。

## 9. 验证计划

- **宿主单测**：文件提供者对 `docx/pptx/xlsx/extension` 构造正确的 `locator`；视图未就绪、会话被替换、作用域失效、超时、插件返回 `false` 各自的结果；`source`、`markdown` 改走文件管理器后仍能切换模式并高亮，非活动空间时回退到独立视图，文件标签页里切换到别的文件时定位失败而不选错。
- **插件**：用 `apps/buddy/extensions` 现有的无头 Chromium + 模拟宿主冒烟（Feature-042 的做法），覆盖位置一致、文档被改后文字查找、文字找不到、取消信号。`node extensions/tools-run.mjs check/pack` 通过。
- **未能验证的部分**：WSL 里做不了 Windows 桌面预览和 Playwright E2E，在记录里写明“未在桌面应用里实测”。宿主与真实编辑器的联动、加载超时，都需要回 Windows 本机验收。

## 10. 验收清单

- [ ] 点“定位来源”打开 Office 文件的方式与点产出卡片一致：文件管理器标签页、文件树展开到该文件，已有编辑器则聚焦复用，不出现重复的独立视图。
- [ ] `source`、`markdown` 引用点“定位来源”同样进文件管理器标签页（不展开多余文件树，已打开的文件只聚焦），并保持原有的高亮和模式切换。
- [ ] Spec-013 相关单测、E2E 断言和变更记录已更新。
- [ ] 引用来自非活动空间或目录已撤销时，仍能打开文件并尝试定位，不报错。
- [ ] 宿主：重开 Office 文件后调用插件定位，并以插件结果为准。
- [ ] 失败时文件仍然打开，提示文案与情况一致，快照不变。
- [ ] PDF：点击后翻到原页并高亮原文字。
- [ ] PPTX：点击后跳到原幻灯片并选中原文字或元素。
- [ ] DOCX：点击后滚动并选中原文字。
- [ ] XLSX：点击后切到原工作表并选中原区域。
- [ ] 文档被修改后：能按文字找到则定位，找不到则明确失败，不选错位置。
- [ ] 旧版保存的引用和历史消息里的引用不报错。
- [ ] 各插件版本号、README 和市场同步已更新；`document-kit` 注释与 Spec-013 第 15.2 节已更新。

## 11. 第 0 步实施记录（2026-10-30）

- **改动：**
  - `useTaskContextPanel.ts`：把 `previewFile` 的开标签页部分抽成 `previewTarget`，新增 `resolveSpaceFile`（按活动空间目录的当前 `revision` 重算目标，不在任务空间返回 null）和 `openSpaceFile`（返回文件标签页 ID 与该标签页自己的目标）。
  - `useTaskResourcePanel.ts`：新增 `openQuoteSourceFile(target)`。Office 文件先 `revealOpenOfficeDocument` 聚焦已开编辑器并返回其 `viewId`，否则 `openSpaceFile`；Office 显示文件树，其他文件折叠文件树，与 Spec-035 的产出卡片一致。
  - 新增 `src/app/workbench/openQuoteSourceFile.ts`：`createQuoteSourceOpener`。先 `openQuoteSourceFile`，开了标签页就让定位作用域接受这个标签页，再用有去重的 `workbench.openFile(target, tabId)` 取视图；不在任务空间则回退原来的独立视图。
  - `builtinSelectionReferenceProviders.ts`：`openFile` 选项增加第三个参数 `acceptTab`，提供者传入 `scope.acceptTab`。其余逻辑（读取检查、模式切换、`request.reveal`、Office 分支的返回值）不变。
  - `useDesktopWorkbench.ts` 一行：`openFile` 选项改用上面的 opener。
- **测试：** 新增 `openQuoteSourceFile.spec.ts`（5 项）、`useTaskResourcePanelArtifact.spec.ts` 里 9 项（普通文件、Office 显示文件树与用目录当前 revision、同目录复用标签页、聚焦已开编辑器、只对 Office 找编辑器、非本空间/无空间返回 null）、`desktopSelectionReferences.spec.ts` 里 2 项（打开器切换标签页后仍能定位，活动标签页被换走则不高亮）。`pnpm exec vitest run src/app src/shared/ui/selection src/modules/tasks src/modules/files` 152 个文件、1369 项通过；`pnpm type-check`（需 `NODE_OPTIONS=--max-old-space-size=8192`）与相关目录 eslint 通过。
- **未验证：** WSL 里跑不了桌面预览和 Playwright E2E。`selectionReferences.e2e.mjs`、`artifactSelectionReferences.e2e.mjs` 里点“定位来源”后检查高亮的断言与打开方式无关，预期不用改，但**未跑**；文件管理器内联文件视图上的高亮、Office 编辑器聚焦、文件树展开都需要回 Windows 本机验收。
- **和方案的差别：** 文件树对 Office 显示、对其他文件折叠，写进了代码；方案里“已有编辑器则聚焦”也按 `revealOpenOfficeDocument` 实现。第 6 节风险 6（定位期间切换标签页）由 `acceptTab` 加既有的 `current()` 失效检查覆盖，单测验证了活动标签页被换走时不高亮，真实切换仍需实机确认。

## 12. 第 1 步实施记录（2026-10-30）

- **宿主：**
  - 新增 `extensionDocumentLocator.ts`：把文件引用里保存的位置包成 `{version:1, data}`（`docx`/`pptx`、`xlsx`、`extension` 各自的字段加 `format`、`hash`），`source`/`markdown` 不适用。
  - 新增 `useExtensionDocumentReveal.ts`：跟随布局为每个插件视图注册 `references.registerReveal`；收到定位请求时等插件视图会话就绪（`current()` 失效或视图出错就放弃），再调用既有的 `views.revealReference`，请求在 `current()` 失效时取消。在 `DesktopAppProvider.vue` 里一行接入。
  - 文件提供者的插件文档分支：不再打开就返回成功，而是 `request.reveal`，插件找到位置返回 `true`，否则返回 `'opened'`。
  - 三态：`SelectionReferenceLocateResult = boolean | 'opened'`；`locate` 在 `current()` 仍有效时保留 `'opened'`。卡片预览里 `'opened'` 显示“已打开文件，但没能定位到原来的位置。”，`false` 仍显示“来源已不可用”。中英文文案各一条。
- **插件契约：** 新增 `document-kit/reveal.js`（`registerReveal`、`findTextRange`），已同步到 `plugins/office-pdf` 和 `examples/csv-viewer`；`quote.js` 的注释更新；`plugin-creator/references/document-processor.md` 新增“定位来源”一节，去掉“宿主不会交回位置”的旧说明。
- **PDF 插件 0.1.5：** `reveal-quote.js` 翻到页并在文字层里找到引用文字后用 CSS 自定义高亮标出（`pdf-overrides.css` 里 `::highlight(lexora-quote)`），点击或按键后清除；`view.js` 在文档挂载完调用 `ready(true)`，失败调用 `ready(false)`。
- **和方案的差别：** 位置对不上时不做“最近的一处”选择，PDF 只有页码，按页内文字第一处匹配；页面不存在返回未找到（设计里写的是等待超时）。`findTextRange` 忽略所有空白差异，因为文字层的片段边界不保证有空格。
- **验证：** 新增 `useExtensionDocumentReveal.spec.ts`（11 项：位置包装、等待就绪、取消、注册随布局变化）；`desktopSelectionReferences.spec.ts` 更新并新增 `'opened'` 用例；`pnpm type-check` 与相关目录 eslint 通过。PDF 用无头 Chromium + 模拟宿主冒烟，覆盖加载中到达的请求、两页的定位、空白差异、跨页引用、文字不在该页、页码超出、无位置、位置类型不对、点击清除高亮，结果符合预期。
- **未验证：** 真实宿主里的完整流程（打开文件、等待、`views.revealReference` 到插件、卡片提示）；大 PDF 里页面是否按需创建（`.pdf-page` 是否都在 DOM 里）；深色主题下高亮的可读性；Windows 桌面与 E2E。PDF 插件还没有上架市场，所以没有运行 `pnpm market:sync`。

## 13. 用户验证（2026-10-30）

- 用户在 Windows 开发预览（`D:\dev\Lexora-win`，分支 `preview/office-locate`，由 `codex/upstream-20261030-3` 合并 `codex/office-pdf-plugin` 得到）里验证：
  - 第 0 步：点引用卡片的“定位来源”按文件管理器路径打开源文件。
  - 第 1 步：Office PDF 0.1.5 点“定位来源”翻到引用页并高亮，用户回复“可以了，没有问题”。
  - 同一份预览里，插件还是 0.1.4 时点“定位来源”显示“已打开文件，但没能定位到原来的位置。”，符合三态设计；装上 0.1.5 后恢复正常。
- 验证范围：一份 PDF 的两行引用。没有记录大文件、深色主题、多个聊天目标；Windows E2E 仍未跑。

## 13. 用户验证（2026-10-30）

- 用户在 Windows 开发预览（`D:\dev\Lexora-win`，分支 `preview/office-locate`，由 `codex/upstream-20261030-3` 合并 `codex/office-pdf-plugin` 得到）里验证：
  - 第 0 步：点引用卡片的“定位来源”按文件管理器路径打开源文件。
  - 第 1 步：Office PDF 0.1.5 点“定位来源”翻到引用页并高亮，用户回复“可以了，没有问题”。
  - 同一份预览里，插件还是 0.1.4 时点“定位来源”显示“已打开文件，但没能定位到原来的位置。”，符合三态设计；装上 0.1.5 后恢复正常。
- 验证范围：一份 PDF 的两行引用。没有记录大文件、深色主题、多个聊天目标；Windows E2E 仍未跑。

## 14. 上游怎么做（2026-10-30，读 `useLexora/plugins` 的 `plugins/office`，提交 `c476e90`，未运行）

- 上游 Lexora Office 1.1.0 对 DOCX、PPTX、XLSX、PDF 都实现了选区定位，入口同样是 `context.references.onReveal`（`office-view-agent.ts`），再交给各格式编辑器适配层的 `assistant.reveal(reference)`。
- DOCX：ProseMirror `TextSelection.create(doc, from, to)` 加 `scrollIntoView`。PPTX：切到幻灯片、选中元素、进入文字编辑后按文字摘要建 DOM 选区。XLSX：`setActiveSheet` 后高亮区域。PDF：桥接层按矩形区域。定位前都先校验文字或摘要。
- 上游是自己的 TypeScript 源码和编辑器适配层，我们的 DOCX、PPTX、XLSX 是 GenOffice 预编译产物加 shim，只能借方法，不能搬代码。

## 15. 第 2–4 步实施记录（2026-10-30）

三个 GenOffice 移植插件都在视图页里注册 `references.onReveal`（`document-kit/reveal.js` 的 `registerReveal`，等编辑器加载完才处理请求），各自一个 `reveal-quote.js`。**没有重编任何编辑器或引擎**，只用了编辑器已有的接口。

| 插件 | 版本 | 做法 | 返回 `true` 的条件 |
|---|---|---|---|
| PPTX | 0.4.12 | 用 `__genofficeControl({cmd:'goto', target:{slide}})` 跳到幻灯片，`getRenderSlides()` 里找包含引用文字（忽略空白）的最小元素（同长时取内层），再 `{cmd:'select', target:{slide, el}}` 选中 | 找到单个元素并选中。引用只存了幻灯片号和文字，没有元素标识；引用跨多个元素或文字已不在该页时只显示幻灯片，返回 `false`。不进入文字编辑，不高亮元素内的具体文字 |
| DOCX | 0.1.10 | tiptap 编辑器 `window.__aidocs.editor`：引用时保存的 ProseMirror 位置上文字仍一致就 `commands.setTextSelection`，否则在文档里按文字找离原位置最近的一处，再 `scrollIntoView` | 选区设置成功。文字已不在文档里返回 `false` |
| XLSX | 0.3.14 | 上游已有的控制钩子 `target:{sheet, range}` 切到工作表并选中区域；之后用 `lexora-selection-text` 读出显示值与引用文字比较。工作表改名时按引用时的工作表序号兜底；大表单元格没加载好会等 | 显示值与引用文字一致。单元格变了、区域超出数据、区域格式不对返回 `false`，区域保持选中 |

- **文档工具包：** `reveal.js` 本身没有再改；`sync.mjs` 新增 `--only=a.js,b.js`，三个插件只拷了 `reveal.js`，不带 `quote.js` 等用不到的文件。
- **测试：** 新增 `__tests__/officeReveal.spec.mjs`（18 项，jsdom；`registerReveal`、`findTextRange` 以及四个插件的定位逻辑）；`documentKit.spec.mjs` 新增“只拷指定文件”和四个插件 `reveal.js` 无漂移。全量 `vitest` 740 个文件、5983 项通过。
- **冒烟：** 用 python-pptx、python-docx、openpyxl 生成样例文件，在无头 Chromium + 模拟宿主里加载真实的插件和编辑器：PPTX 7 项（含两页、空白差异、别页文字、越界、无位置、格式不对）、DOCX 8 项（位置不变、位置过期按文字找、空白差异、多处匹配取最近、文字已删、取消）、XLSX 9 项（两个工作表、改名兜底、单元格已改、区域越界、格式错误）都符合预期；DOCX 选区滚动到了可见位置。
- **未验证：** 真实宿主里这三个插件的完整流程；深色主题；大文档、大工作表、很多页的 PPTX；PPTX 在只读预览回退时（`preview.js`）不支持定位，返回未找到；Windows E2E。
- **市场：** 三个插件已升版本，没有运行 `pnpm market:sync`：`pnpm market:check` 显示市场仓库本来就有多个插件不一致（含 `legal-research`、`office-pdf`），需要和发布一起处理。

## 16. 附带修复：DOCX 右键同时弹出两个菜单（2026-10-30）

- **现象（用户在开发预览里发现）：** 在 DOCX 正文右键，编辑器自己的菜单上叠着一个小的原生菜单（Undo、Redo、Cut、Copy、Paste、Select All）。
- **原因：** 宿主主窗口对所有可编辑区域注册了原生编辑菜单（`electron/main/window.ts` 的 `context-menu` 处理）。DOCX 编辑器弹自己的菜单时没有取消浏览器的右键事件，浏览器默认菜单照样触发。无头浏览器里旧版（本 Spec 之前）和新版插件都是右键事件未被取消，所以不是定位功能引入的。原生菜单本身在无头浏览器里不出现，该结论由事件状态和宿主代码推出，未在 Electron 里直接观察。
- **修复（DOCX 0.1.11）：** 新增 `native-context-menu.js`，在 `document` 的捕获阶段对 `.ProseMirror` 内的 `contextmenu` 调 `preventDefault()`，不停止传播。无头浏览器里验证：事件被取消，编辑器菜单照常打开，“Quote to chat”仍在。其他区域（输入框等）保留原生菜单。
- **没查：** PPTX、XLSX 的文字编辑区是否有同样现象。

## 17. 附带修复：没有幻灯片的新建 PPTX 一直停在“正在打开…”（2026-10-30）

- **现象（用户在开发预览里发现）：** 在 Windows 上新建的演示文稿（文件名形如“新建 PPTX 演示文稿.pptx”，像是 WPS 的“新建”模板），在文件管理器里打开，PPTX 插件停在“正在打开…”。
- **复现：** 用户把原始文件（38,441 字节）放在空间目录里。包是合法的 zip，有一个母版和 11 个版式，但**没有任何幻灯片**（没有 `ppt/slides/`，`presentation.xml` 里没有 `sldIdLst`）。编辑器加载后 `getRenderSlides()` 为 0，界面停在“Opening…”，没有任何控制台错误。**旧版（本 Spec 之前）插件表现完全一样**，不是定位功能引入的。用户之前保存过的版本（31,576 字节，有幻灯片）能正常打开，所以一开始复现不出来。
- **修复（PPTX 0.4.13）：** 新增 `empty-deck.js` 的 `withFirstSlide`：读完文件后，若 `presentation.xml` 没有幻灯片，就补一张空白幻灯片（空白版式，没有就用第一个版式）：补 `slide1.xml`、它的关系、`presentation.xml` 的 `sldIdLst`、`presentation.xml.rels` 和 `[Content_Types].xml`。已有幻灯片、没有版式、读不出来都原样返回。磁盘上的文件只有保存时才会变。
- **验证：** 4 项单测（补页、选空白版式、无空白版式用第一个、已有幻灯片/无版式/非包不动、重复调用不变）；用真实文件：补页后 `validatePptx` 通过，python-pptx 打开是 1 张幻灯片、版式“空白”，编辑器加载后显示 1 张空白幻灯片（`Slide 1 of 1`）。**没有在 Electron 里验证。**
- **同类问题：** 0 字节的新建文件见第 18 节。

## 18. 附带修复：0 字节的新建 DOCX 打不开（2026-10-30）

- **现象：** 在 Windows 上新建的 `新建 DOCX 文档.docx` 是 0 字节，插件报“文件不是受支持的 DOCX，或超出安全限制”，编辑器里能输入但没法保存。旧版插件完全一样，不是定位功能引入的。用户确认表格（XLSX）没有这个问题，只有 DOCX 和 PPTX（PPTX 见第 17 节，是没有幻灯片，不是空文件）。
- **修复（DOCX 0.1.12）：** `bridge.js` 的 `readResource` 遇到大小为 0 的 `.docx`，先 `readBytes(offset 0, length 1)` 读一次，再把 `blank-docx.js` 生成的空白文档（5 个部件：内容类型、关系、`document.xml` 含一个空段落和 A4 页面、样式）交给编辑器。读一次是为了让宿主记下这个空文件的版本和内容哈希：宿主的 `readBytes` 在偏移 0、读到文件尾时记录 `readVersion`、`readHash`，之后 `saveBytes` 才认为视图持有当前版本。非空但不是 Word 包的文件仍报不支持。
- **验证：** 无头浏览器 + 模拟宿主，0 字节 docx：编辑器正常加载，没有错误提示；输入文字后 Ctrl+S，插件带 `resource` 调用 `saveFile`（写回，不是另存为），写出 2,112 字节；python-docx 打开保存的文件，段落文字是输入的内容。新增 3 项单测（空白包合法、空文件走空白文档并只读一次、非空非 Word 包仍报错）。
- **没验证：** Electron 里真实的 0 字节文件：宿主对空文件的 `readBytes` 和保存（`saveBytes` 的版本、哈希检查）我只读了代码，没有实际跑。如果保存失败，先看这一步。
- **没做：** 0 字节的 PPTX、XLSX（用户确认 XLSX 没遇到，PPTX 遇到的是没有幻灯片的合法包）。
