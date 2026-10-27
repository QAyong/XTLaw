# Spec-039：没选本地文件夹的空间，其内部工作区在文件管理器中浏览

**日期：** 2026-10-22  
**状态：** 已实现（方案 A），用户已在开发预览中验收（2026-10-22）。未打包。

**相关：** [Spec-035：任务产出在文件管理器中打开](feature-035-artifact-open-in-file-manager.md)、[Spec-034：把未归属空间的任务移动到空间](../../specs/feature-034-move-task-to-space.md)、[Spec-033：文档插件契约](../../specs/feature-033-document-plugin-contract.md)

## 1. 背景

Spec-035 让“空间主目录内的产出”改走文件管理器。验收后发现一个盲区：**创建空间时没有选本地文件夹的空间**，产出卡片仍然打开独立的“产出”标签页，没有编辑和文档插件入口。

原因（已核对代码）：

- 这类空间 `primaryDirectory` 为空。智能体改在空间的内部工作区工作，路径为 `<数据目录>/spaces/<空间ID>/workspace`（`BuddyDataPaths.spaceWorkspace`，`BuddySessionBlueprintService` 用它作 `scratchRoot` 和 `cwd`）。
- 内部工作区不是登记过的目录授权：它没有 `directoryId` 和 `revision`，也不在 `space.primaryDirectory` / `additionalDirectories` 里。
- 文件管理器整条链路都按“目录 ID + 修订号”寻址：
  - 前端：`getActiveSpaceDirectories` 只返回主目录和附加目录；`fileSpaces` 要求空间至少有一个目录（`useTaskContextPanel.ts`），所以这类空间连文件管理器入口都没有；`resolveChatToolFileTarget` 也匹配不到工作区路径。
  - 服务端：`SpaceFileService.requireDirectory` 只在主目录和附加目录里找 `directoryId`。
- 结果：产出路径解析不出 `SpaceFileTarget`，`openArtifact` 回退到产出标签页（Spec-035 第 3 节“路径在主目录内”的条件不满足）。

## 2. 目标与边界

**目标：** 没选本地文件夹的空间，内部工作区作为一个可浏览目录进入文件管理器；产出卡片点开后与有文件夹的空间一致（文件收起树、文件夹展开聚焦、文档插件接手）。

**包含：**
- 空间在“没有主目录”时，向前端和文件服务暴露一个“默认文件夹”目录，对应内部工作区。
- 该目录在文件管理器里与其他目录同等：浏览、预览、编辑、新建、重命名、移到回收站、复制路径、在系统文件管理器中显示、选区引用、文档插件读写。
- 产出卡片、聊天里指向产出的文件链接等所有经 `openArtifact` 的入口，对该目录内的路径走文件管理器（沿用 Spec-035 的去向判断，不改规则，只是让这类路径能解析成目标）。

**不包含：**
- 无空间的任务：它们的工作区是 `conversations/<任务ID>/workspace`，仍走产出标签页（Spec-035 已写明）。用户评估后决定不做（2026-10-22）：文件管理器的定位方式依赖空间 ID，扩展到任务要改共享契约、文件服务、前端标签页、扩展读取通道和选区引用，改动约为本规格的 3 到 5 倍；需要编辑或文档插件时，用“移动到空间”把任务并入空间即可。
- 让用户“选择”或“更换”默认文件夹的位置，也不改变智能体的工作目录与授权（`BuddySessionBlueprintService` 不动）。
- 迁移旧文件：用户日后给空间选了主目录，旧工作区里的文件留在原处（与 Spec-034 取舍一致）。
- 取消“产出”标签页。

## 3. 方案

### 3.1 默认文件夹作为“合成目录”

不新增数据库行，也不把工作区登记成真实的主目录（那会改变 `loadDirectoryContext`、资源信任、执行上下文匹配等语义，风险大）。服务端在需要时**合成**一个目录描述：

| 字段 | 值 |
|---|---|
| `id` | 由空间 ID 稳定派生，例如 `workspace:<空间ID>`，不会与随机生成的目录 ID 冲突 |
| `revision` | 固定为 1 |
| `root` / `canonicalRoot` | `paths.spaceWorkspace(空间ID)` 的真实路径（目录不存在时先创建） |
| `revokedAt` | `null`；空间本身撤销时整个空间不可用，行为不变 |
| `createdAt` / `updatedAt` / `accessGrantedAt` | 取空间的创建时间 |

出现条件：空间未撤销，且 **`primaryDirectory` 为空**。只有附加目录而没有主目录时，智能体的工作目录仍是内部工作区，所以同样出现。

空间一旦设置了主目录，默认文件夹不再出现（主目录成为工作目录）；已打开的默认文件夹标签页随之被现有的可用性检查（`isAvailable`）清掉，旧文件留在原处。

### 3.2 数据契约

`LocalSpace` 增加一个可空字段 `workspaceDirectory`（形状复用 `spaceDirectorySchema`），不并入 `primaryDirectory` / `additionalDirectories`，避免被“目录授权管理”“空间编辑对话框”等只应看到真实授权的地方当成授权目录。

`getActiveSpaceDirectories` 在末尾追加 `workspaceDirectory`。前端所有按它取目录的文件管理器路径（`fileSpaces`、`resolveChatToolFileTarget` / `resolveChatToolDirectoryTarget`、`previewFile`、`openDirectory`、`isAvailable`、`FileOperationService`、文件空间选择器）随之自动支持，无需逐处改判断。

### 3.3 服务端

- 抽出一个小函数（暂名 `resolveSpaceWorkspaceDirectory(space, paths)`），供两处共用：
  1. 空间列表的返回（`spaces.list`、`create`、`update` 的响应）在没有主目录时附上 `workspaceDirectory`。
  2. `SpaceFileService.requireDirectory`：在主目录和附加目录之外，`directoryId` 等于合成 ID 时返回合成目录；`revision` 不为 1 或空间已有主目录时同样拒绝。
- `SpaceFileService` 构造时增加对数据目录路径的依赖（`paths.spaceWorkspace`）。其余读写、原生文件引擎登记、变更广播、`revoke` 都按 `directoryId + revision` 工作，不需要改。
- 目录不存在时，列目录前创建，避免新空间打开文件管理器时因 `realpath` 失败报错。
- 敏感路径匹配（`createSensitivePathMatcher`）只拦凭据类位置，工作区位于 `spaces/<ID>/workspace`，不会被拦；但要用测试确认，数据目录由 `LEXORA_BUDDY_HOME` 指定时仍然成立。

### 3.4 隐藏内部文件

工作区里除用户和智能体的文件外，还有应用自己写的内容（已知：`.attachments`，由 `AttachmentToolWorkspace` 放置输入附件）。默认文件夹的根层列表要隐藏这类内部条目，具体名单在实现时再核对一遍所有写入 `scratchRoot` 的位置。隐藏只作用于列表，不影响路径解析：智能体仍可读写，产出若恰好在被隐藏的路径里则回退到产出标签页。

### 3.5 前端展示

- 目录显示名用“默认文件夹”（`zh-CN`、`en-US` 各一条），不显示 `workspace` 这个目录名；文件空间选择器里这一项用同一名称代替路径。
- 文件标签页的 `rootName` 取同一显示名。
- “复制完整路径”“在系统文件管理器中显示”保持可用，行为与其他目录一致。

### 3.6 产出卡片

`openArtifact` 的去向判断不变：非 HTML、属于当前任务、路径解析得到目标、大小在预览范围内。变化只是路径对默认文件夹也能解析出目标，所以满足条件的产出自动走文件管理器。

## 4. 影响与风险

| 项 | 说明 |
|---|---|
| 用户可修改智能体的工作文件 | 默认文件夹和其他目录一样可编辑、删除。删除或重命名正在使用的文件由用户负责；与有文件夹的空间一致 |
| 旧快照 | 标签页快照里没有默认文件夹的标签，旧快照无需迁移；新标签页的 `directoryId` 是合成 ID，`readContextTab` 只校验为非空字符串，应可读取，实现时用测试确认 |
| 主目录后来被设置 | 默认文件夹消失，已打开的标签页被清掉，旧产出卡片回退到产出标签页（路径不在主目录内）。属预期，不迁移 |
| 主目录后来被移除 | 合成目录重新出现，ID 与修订号不变，旧标签页可恢复 |
| 数据目录搬迁 | `relocateProfileReferences` 已改写已保存路径；合成目录每次从当前数据目录计算，不受影响 |
| 选区引用 | `SpaceFileTarget` 走同一服务，默认文件夹里的文件可被引用；旧产出引用的定位不在本期验证范围 |
| 修订号恒为 1 | 目录授权被“撤销再重建”的概念不适用；合成目录消失靠空间本身撤销或设置主目录，不会产生修订冲突 |

## 5. 实现范围（预估）

| 位置 | 改动 |
|---|---|
| `apps/buddy/shared/spaces/spaceApi.ts` | `spaceSchema` 增加可空 `workspaceDirectory`；`getActiveSpaceDirectories` 追加它 |
| `apps/buddy/service/src/spaces/`（新增小函数、`SpaceFileService.ts`、`registerSpaceRpc.ts`） | 合成目录；`requireDirectory` 识别合成 ID；列表响应附加字段；目录缺失时创建；根层隐藏内部条目 |
| `apps/buddy/service/src/BuddyService.ts` | 给 `SpaceFileService` 与空间 RPC 传入数据目录路径 |
| `apps/buddy/src/modules/tasks/widgets/context-panel/DesktopFileSpacePicker.vue`、`useTaskContextPanel.ts`（`newFilesTab`） | 默认文件夹的显示名 |
| `apps/buddy/src/i18n/locales/zh-CN`、`en-US` | “默认文件夹” |
| `docs/archive/specs/feature-035-artifact-open-in-file-manager.md` | 第 3 节和第 6 节补一句指向本规格 |

不改：`BuddySessionBlueprintService`、`spaceExecutionContext`、数据库迁移、原生文件引擎、文件管理器组件本身。

## 6. 验收标准

> 实现时的取舍（用户已确认走方案 A，2026-10-22）：第 8 节三项都按建议执行。另外明确了串台边界：同一空间内的任务共用该空间的默认文件夹；不同空间互相隔离；不属于任何空间的任务各有自己的文件夹，不在本期范围。

- [x] 单元测试：`SpaceFileService` 对合成目录可列出、读取、保存、新建文件夹；错误的 `revision`、不存在的空间、空间已设置主目录时拒绝；`../` 越界读取被拒绝。（`SpaceWorkspaceDirectories.spec.ts`）
- [x] 单元测试：空间列表在“无主目录”时带 `workspaceDirectory`，有主目录时为 `null`，且能通过响应契约校验。
- [x] 单元测试：两个没选文件夹的空间各自生成同名文件，互相读不到、不覆盖；拿一个空间的目录编号读另一个空间失败。
- [x] 单元测试：根层不列出 `.attachments`。
- [x] 单元测试：`useTaskResourcePanelArtifact.spec.ts` 里“没选文件夹的空间”的文件产出走文件管理器并收起树、文件夹产出展开聚焦；其他空间的默认文件夹路径、空间已有主目录时的旧路径回退到产出标签页。
- [ ] 未单独验证：用 `LEXORA_BUDDY_HOME` 指向自定义目录时合成目录不被敏感路径拦截（单元测试用的是临时目录，未命中敏感路径；自定义数据目录下的行为在开发预览里确认）。
- [x] 类型检查与改动相关测试通过（按 `AGENTS.md` 口径，不跑全量）。
- [x] 开发预览手动验收（用户确认没有问题，2026-10-22）：新建一个不选本地文件夹的空间，开任务让智能体写出文件和文件夹，点产出卡片：文件在文件管理器中打开并收起树、文件夹展开聚焦；docx 等文件由文档插件接手；空间设置主目录后默认文件夹消失、旧卡片回退到产出标签页；无空间的任务行为不变。
- [ ] 未验证项在实现后写进本规格第 7 节：打包产物、Windows 之外的平台。

## 7. 验证记录

- 实现：`shared/spaces/spaceApi.ts`（`workspaceDirectory`、`spaceWorkspaceDirectoryId`、`isSpaceWorkspaceDirectoryId`，`getActiveSpaceDirectories` 追加默认文件夹）、`service/src/spaces/SpaceWorkspaceDirectories.ts`（新增，按空间 ID 派生目录、同步创建并缓存真实路径，不可用时返回空而不是让空间列表失败）、`SpaceFileService.ts`（识别默认文件夹目录编号，根层隐藏 `.attachments`）、`registerSpaceRpc.ts`（`create`/`update`/`list` 响应附带 `workspaceDirectory`）、`BuddyService.ts`（装配）、`DesktopFilesContextSurface.vue`、`DesktopFileSpacePicker.vue`、两份 `tasks.ts` 多语言（“默认文件夹”）。
- `pnpm type-check`（`apps/buddy`）通过；改动文件 ESLint 通过。
- 相关测试：`service/src/spaces`、`shared/spaces`、`src/modules/tasks`、`src/modules/files`、`src/shared/ui/explorer`、`src/app/workbench` 共 117 个文件，1033 通过、6 失败。6 个失败都在 `SpaceFileRecovery.spec.ts`（Windows 上 `EBUSY`），在未改动的基线上同样失败，与本次改动无关；`docs/known-test-failures.md` 里没有记录，需要时再补。
- 补充修复（2026-10-22）：`resolveChatToolFileTarget` 的相对路径原先只按主目录解析，没选文件夹的空间里指向相对路径的文件链接打不开；现在没有主目录时回退到默认文件夹（`chatToolFileTarget.ts`，用例在 `chatToolDetails.spec.ts`）。
- 开发预览手动验收：用户确认没有问题（2026-10-22）。
- 未做：打包、Windows 之外的平台；Office 等文档插件经默认文件夹接手的完整流程没有单独验证。

## 8. 待确认

1. **空间设置主目录后，默认文件夹是否还要保留可见？** 本方案选择不保留（简单，与 Spec-034“旧文件留在原处”一致）；代价是旧产出卡片回退到产出标签页。若要保留，需要把默认文件夹作为附加项继续出现，目录授权界面与智能体执行上下文都要重新评估，建议另立规格。
2. **默认文件夹的名称**：暂定“默认文件夹”，与创建空间时的提示用语保持一致即可。
3. **内部条目的隐藏名单**：目前只确认 `.attachments`，实现前再扫一遍所有写入内部工作区的代码。

## 9. 术语

| 原名称 | 中文含义 | 用途 |
|---|---|---|
| `spaceWorkspace` | 空间内部工作区 | `<数据目录>/spaces/<空间ID>/workspace`，没选本地文件夹时智能体的工作目录 |
| `workspaceDirectory` | 默认文件夹（合成目录） | 本规格新增的可空字段，只在空间没有主目录时出现 |
| `scratchRoot` | 会话自有根目录 | 智能体会话蓝图里的自有目录，对空间任务就是内部工作区 |
| `SpaceFileTarget` | 空间文件目标 | `spaceId + directoryId + revision + path`，文件管理器所有读写的寻址 |
