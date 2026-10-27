# 上游集成记录：2026-10-22（第五轮）

区间是 `8ed3cf716..upstream/master` 里的 `c8e72d115`、`e7a310ffc`，并只读评估 `d3616f33a`。前几轮见 [第四轮](upstream-20261022-4-integration.md) 及其链接。分支 `codex/upstream-20261022-5` 从 `origin/master`（`255fc503b`，已含 #26）切出，用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `c8e72d115` | 修复 Windows 沙箱退出延迟（6 个文件，无 Rust）。沙盒主进程 RPC、安装校验、`runWindowsSandbox`、`runSandboxCommand` 的退出等待。无冲突 |
| `e7a310ffc` | 支持把无空间任务移入空间（37 个文件，+946/−28）。这是本地提交上游的 PR（本地对应 `fda8645e`，22 个文件）经维护者改写后的最终版，按“对账”处理，见下 |

### `e7a310ffc` 与本地 `fda8645e` 的差异

上游最终版比本地多出 15 个文件，主要是：

- **服务层加固：** 新增 `ConversationMutationGuard`；`moveToSpace` 在互斥保护内执行，重复移入同一空间幂等，拒绝正在执行、终态运行仍占用执行资源（`hasActiveExecution`）、队列中有 `waiting` / `paused` 输入（`CONVERSATION_QUEUE_NOT_EMPTY`）的任务；会话失效清理失败时不提交、不发布，可安全重试；清理后重新校验目标空间未被撤销；`conversationRepository.setSpace` 的 SQL 里同样检查空间、运行和队列。新增错误码 `CONVERSATION_BUSY`、`CONVERSATION_SPACE_CONFLICT`、`CONVERSATION_QUEUE_NOT_EMPTY`，以及对应的诊断文案。
- **界面流程：** 菜单项“移入空间”改为打开确认对话框 `DesktopTaskMoveToSpaceDialog`（选目标空间、说明“后续使用该空间的工作环境和目录权限，原目录授权不再沿用；文件不搬迁；暂不支持移出空间”），取代本地的子菜单直接移动。空间行新增右键菜单。
- **其他：** 当前会话收到移入事件后同步 `applyConversation` 与空间；产物仍记录在任务自己的工作区时的授权 ID 判断；`task-space.e2e.mjs`。

冲突解决（12 个文件）：

- 服务层、仓储、i18n、测试：全部采用上游版本。保留本地的一行注释（`ComposerResourceService.ts`）。`zh-CN` 菜单文案随上游改为“移入空间”。
- 界面：菜单与对话框采用上游流程。`useTaskMenuActions.ts` 取上游的 `moveToSpaceAvailable`，同时保留本地的 `copyMarkdown`；`DesktopTaskRow.vue` 取上游事件与 `closeContextMenu`；`useTaskIndex.ts` 保留本地的 `onTaskDeleted` 异步签名，并加入 `beforeTaskMove`。
- `useTaskCapability.ts` 自动合并后出现两个同名的空间跟随监听，删除本地较早的那个，保留上游的（它同时 `applyConversation`）。
- 删除本地子菜单用的 `spaceNameStyle`。

**保留本地的拖拽移入（需要你确认是否继续保留）：** 上游最终版去掉了“把任务拖到空间行”的入口，但本地 `fda8645e` 有。我保留了它：拖拽仍然把任务拖到空间行上，只是不再走子菜单，而是经 `moveTaskToSpace` 属性调用同一个已加固的服务，失败时用与对话框相同的错误文案提示，成功后展开目标空间；拖拽源的可用条件复用 `moveToSpaceAvailable`。拖拽不经过确认对话框。如果希望完全跟随上游，删除 `DesktopTaskIndex.vue` 的 `moveDroppedTask`、`DesktopTaskRow.vue` 的 `moveTaskId` 和 `DesktopTaskSpaceRow.vue` 的拖放接收即可。

## 只读评估（未移植）

- **`d3616f33a` 升级依赖：** electron 44.7.0→44.9.3、electron-vite 5→6、undici 8.10.2→8.12.3、dompurify、markstream-vue、fastify 5.12.1→5.12.7、新增 `follow-redirects` / `hono` / `vitepress>vite` 覆盖，另有 `mermaidLoader.ts` 的标题行修复和 E2E 调整。命中依赖变更的停下条件，单独成轮。试合并有 3 处冲突：`pnpm-lock.yaml`（用 `pnpm install` 重新生成）、`extensionAgent.e2e.mjs`（上游文件名是 `extension-agent.e2e.mjs`，与本地重命名不一致）、`reading.e2e.mjs`（本地已删除，上游修改，应跳过）。`electron.vite.config.ts` 无冲突，但 electron-vite 6 把 `externalizeDepsPlugin` 改成了配置项 `externalizeDeps`，需要打包验证。
- **`b74716ee6`（上游 master 的新提交）修复等待中的队列与即时补充：** 21 个文件，+581/−462，无迁移、依赖或 Rust；对本分支试合并无冲突。改动在 `ExecutionCoordinator`、`PiTurnExecutor`、`ChatQueueService`、`createReusableBuddySession`，下一轮移植。

## 检查

- 类型检查：`apps/buddy` 的 `vue-tsc -b` 通过。`eslint` 无错误，自动修复了 `DesktopTaskIndexView.vue` 一个属性顺序警告。
- vitest（本机 Windows，`service/src/conversations`、`storage`、`attachments`、`__tests__`、`sandbox`、`rpc`，`src/modules/tasks`、`shared/lib`、`app`）：1530 通过、12 失败，没有本次引入的失败。
  - 已知 Windows 失败：`SandboxDirectoryPermissions`×2、`sandboxPermissions`、`StorageSnapshots`、`BuddyDataPaths`。
  - `attachments` 下的 6 个失败（`AttachmentOwnership`、`ComposerResourceService`×3、`ImageBlobStore`×2）在干净的 `origin/master`（`255fc503b`）上同样失败。
  - `buddyService.integration.spec.ts` 的“recovers a corrupt root…”在整批并发运行时失败，单独运行 18/18 通过，判断为负载下的超时，不是本次引入。
  - 新增的 `DesktopTaskMoveToSpaceDialog.spec.ts`、`ConversationMetadataService.spec.ts`、`useTaskCapability.spec.ts` 通过。
- 未跑：Playwright E2E（`task-space.e2e.mjs`、`sandbox.e2e.mjs` 的改动）、Windows 沙箱退出延迟在真实环境下的表现、拖拽移入的手动验证、开发预览、打包、全量测试。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `e7a310ffc`。`d3616f33a` 与 `b74716ee6` 未决定，基线不越过它们。
