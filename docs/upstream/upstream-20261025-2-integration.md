# 上游集成记录：2026-10-25（第二轮）

只有 1 个提交：`ed2d37c0f`（`feat(buddy): 完善引用流转与输入材料按需读取`）。上一轮（[第一轮](upstream-20261025-integration.md)，PR #38）只评估没有移植，这一轮在 `codex/upstream-20261025-2` 上整体 `git cherry-pick -x`，叠在第一轮分支之上。`upstream/master` 此后又前进到 `76e850d71`（插件安装审核与权限展示），不在本轮范围，没有计入基线。

## 已移植

| 上游提交 | 内容 |
| --- | --- |
| `ed2d37c0f` | 91 个文件，13 个文件 14 处内容冲突 + 1 处 modify/delete，全部在该提交内解决 |

行为变化（通俗地说）：引用和文本附件不再整段塞进给模型的提示。每条超过约 2000 字符、或一次发送里总量超过约 8KB 时，只放 256 字符的摘要并标注“已截断”，完整内容在发送时存成不可变快照，模型用新增的 `lexora_reference_list` / `lexora_reference_read` 工具分页读取。因此单条引用上限放宽到 262 144、总量 1 048 576。模型不能调用工具、或晓晓的工具设置里读不了引用时，超出预算的材料会以 `MODEL_INPUT_UNSUPPORTED` 拒绝发送，不会悄悄截断。还新增了复制引用到剪贴板（带防伪令牌）、插件工具读取用户引用（需 `permissions.references`）、插件发布产物和图片结果、`registerGeneratedFile`。

## 冲突解决

| 文件 | 处理 |
| --- | --- |
| `.playwright/.../artifact-selection-references.e2e.mjs` | 本地已删除这个 E2E，按本地删除处理 |
| `buddyUserContent.ts` | 采用上游的上限（262 144 / 1 048 576），保留本地 `buddyQuoteSnapshotLength` 对插件位置长度的计入 |
| `buddyResourceQuoteText.ts` | 上游把快照拼装抽成 `resourceQuoteSnapshot`；把本地的 xlsx 单元格范围（`cells`）和插件位置类型（`extensionKind`）搬进它，`resourceQuoteText` 与新的 `projectBuddyQuoteText` 共用 |
| `ExtensionService.ts` | import 取并集；上游多带的 `EXTENSION_CATALOG_URL` 本地没有用处，去掉 |
| `ArtifactService.ts` | import 取并集；新增的 `registerGeneratedFile` 复用本地同名的 `resolveArtifactLocation`（`create` 模式）做授权，和本地 `realpath`/`relative` 逻辑不冲突 |
| `DesktopAppProvider.vue` | `useExtensionReferences` 采用上游的完整接线（剪贴板、新任务、显示目标、提示）；`useExtensionContributions` 保留本地的 `selectionReferences` + `onQuoteResult`（插件 quote 调用的结果提示，是和上游 `notifySuccess` 并行的另一条路径） |
| `useDesktopWorkbench.ts` | 保留本地的 `documents`、`revealOpenOfficeDocument`、`autoSave`、`activeResource`；返回值加上 `prepareNewTaskInput`、`showTaskInput`、`showReferencePage` |
| `DesktopExtensionInstallReview.vue` | 采用上游行：`permissions.references` 单独显示，文案说明“任务中的插件工具可读取你已发送的本插件引用”。本地原来在同时声明 `composerReference` 时隐藏它，现在这个权限多了工具读取，隐藏会少展示授权，所以不再隐藏 |
| `DesktopChatComposer.vue` | 本地没有 `DesktopComposerSubmitActions.vue`（来自没取的 `00feaa2c5`），保留本地内联按钮，只把提示接成 `quotePasteLimitMessage ?? modelInputIssueMessage` |
| `workbenchSelectionReferences.ts` | 取并集（本地 `showSelectionReferenceResult` + 上游 `SelectionReferenceNavigate`） |
| `ipc.spec.ts`、`chatComposerEditing.spec.ts`、`ResourceReferenceUi.spec.ts` | 保留本地写法；`ipc.spec.ts` 用上游 fixture 并补上本地的 `getPendingOpenTarget`/`completeOpenTarget`；`ResourceReferenceUi.spec.ts` 本地的菜单用例原样保留 |

## 随之做的本地调整

- `plugin-creator/references/agent-settings.md`：上游写死 `engines.lexora: ">=0.15.0"`，本地应用版本是 0.3.2，照抄会让插件装不上。改成“下限不低于首个提供这些能力的 XTLaw 应用版本，以宿主 `runtime` 能力目录为准”。
- 引用快照多了 `kind`、`referenceId` 字段，上限放宽后原来用 32 768 做“超限”的用例不再超限，更新了 `extensionQuotes.spec.ts`、`resourceQuotes.spec.ts`、`resourceQuotesProjection.spec.ts` 里的期望（含 xlsx `cells`、`extensionKind` 仍在摘要里）。

## 插件是否需要适配

- **三个 Office 插件（`office`、`office-xlsx`、`office-pptx`）不需要改。** 它们声明的是本地的 `composerReference`，走的是原来的引用路径，没有用 `references.add`。本地的 `extensionMayReference`（`composerReference` 与 `references` 视为同一授权，用于“添加引用”）原样保留。
- 新增的**工具读取引用**（`invocation.references.list/resolve`）只认显式声明的 `permissions.references`，`composerReference` 不会隐含它。Office 插件想让模型的编辑工具按选区位置精确修改，才需要另外声明 `references: true` 并在工具里调用；这是可选的后续，不影响现有功能。

## 检查

- 迁移：无。依赖：无变更。Rust：无。不涉及 `.github/workflows`。品牌：新增行里的 `lexora` 都是标识符（`lexora_reference_*` 工具名、`lexora:clipboard:write-text`、`data-lexora-reference`、`LEXORA_BUDDY_IMAGE_TRANSFORMER`、测试里的 `.lexora/config.toml`），没有可见文案。UnoCSS：`ReferenceTargetPicker.vue` 用的类名都是 `presetUno` 数值类或本地已有的 `text-muted`、`border-border`，不需要补映射。
- 类型检查（`vue-tsc -b`）通过；全部暂存文件 `eslint` 无问题。
- 本机 Windows，`vitest run` 覆盖 `shared`、`platform/extensions`、`service/src` 里的 artifacts/attachments/chat/plugins/conversations/agent、`electron/main`、`src/shared/ui/selection`、composer、prompt-input、`src/app`、`src/modules/extensions`：257 个文件，失败 27 个文件。与第一轮分支（改动前）在同一台机器上对比：除 `shared/conversation` 的 4 个用例（上面已改）外，新增失败只有 8 个用例，都是本机缺原生运行时（`lexora-buddy-file-reader.exe`、原生图片转换，`spawn ENOENT`；本机 `cargo` 编译 `libsqlite3-sys` 失败所以没构建）：`attachmentSnapshots.spec.ts`（6）、`ComposerResourceService.spec.ts`（1）、`extensionResourceCapabilities.spec.ts`（1）。这几条是新增的快照读取用例，本机没有验证，靠 `XTLaw CI` 的 Linux 全量测试（带原生测试运行时）。其余失败在改动前也失败（Windows 环境限制，见 `known-test-failures.md`）。
- 未跑：Playwright E2E、开发预览、打包；手测：超长引用、超长文本附件、Excel 大选区引用，以及用不能调用工具的模型发送超长引用时的拒绝提示。

## 基线

`lastChecked` 保持 `f0a5ed59a2ad8b9786cc50c089d4267abfd933ca`。`ed2d37c0f` 已在本轮移植，不再是待办；`76e850d71` 尚未检查，留给下一轮。
