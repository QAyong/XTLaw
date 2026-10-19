# Spec-034：把未归属空间的任务移动到空间

**日期：** 2026-10-19  
**状态：** 已实现，待用户在开发预览中验收

## 1. 背景

侧栏“任务”分组里的任务不属于任何空间（`conversations.space_id` 为空）。用户先随手开了任务、后来才发现它属于某个项目时，只能在空间里重新开一个任务，原来的对话带不过去。本规格让这类任务可以并入空间，并从下一个回合起按空间运行。侧栏整体结构仍以 Spec-006 为准。

## 2. 需求边界

**包含：**
- 只支持“无空间的任务 → 某个空间”，一次性操作；已属于空间的任务不能换空间，也不能移出。
- 两个入口，效果一致：
  1. 任务行“更多”菜单 → “移动到空间” → 选择空间。在任务行上点鼠标右键，弹出的也是同一份菜单（位置跟随鼠标）；二级菜单里的空间名最宽约 14rem，超出以省略号显示，悬停可看全名。空间行（置顶区与“空间”分组）上点右键，弹出的也是该行“更多”菜单。右键菜单的位置单独保存，关闭时在原位消失。
  2. 把“任务”分组里的任务拖到“空间”分组的空间行上松手。
- 任务 ID、标题、标记、历史、分支、模型、权限策略和已有附件、产物都保留。
- 移动后的新回合在空间主目录（没有主目录时为空间自己的工作区）工作，使用该空间的技能和附加目录。
- 不弹确认框，不向对话里追加提示。

**不包含：**
- 空间之间互移、移出空间、批量移动。
- 复制或迁移旧文件：任务原来的工作区（`conversations/<任务ID>/workspace`）留在原处，不复制。智能体在新回合不再默认访问它。
- 置顶区里的任务和置顶区的空间行：任务只能用菜单移动，拖拽不接收（该区域的拖拽用于排序）。
- 数据库迁移：只更新已有的 `space_id` 列。

## 3. 行为

- **可移动条件：** 任务未删除、没有空间、没有排队或运行中的回合（含等待确认）、目标空间未撤销。菜单项在任务运行中或没有可用空间时置灰；服务端按同一条件再校验，不满足时返回通用的校验失败。
- **移动时：** 服务端在一次条件更新中把 `space_id` 从空改为目标空间（并发重复移动只有一次成功），释放该任务已打开的智能体会话，再发布会话变更通知。前端据此更新侧栏分组；若移动的是当前打开的任务，当前会话的空间随之更新。
- **旧产物：** 移动前生成的产物仍记录在任务自己的工作区。`ComposerResourceService` 里校验产物授权时，按产物记录的授权 ID（任务 ID）定位旧工作区，所以旧产物移动后仍可作为引用加入输入框；预览和外部打开本来就按产物自己记录的路径，不受影响。

## 4. 实现

| 位置 | 作用 |
|---|---|
| `apps/buddy/shared/conversation/conversationApi.ts` | 新增 `conversations.moveToSpace`（输入 `conversationId`、`spaceId`） |
| `apps/buddy/service/src/storage/conversationRepository.ts` | 新增 `setSpace()`，`WHERE space_id IS NULL AND deleted_at IS NULL` 条件更新 |
| `apps/buddy/service/src/conversations/ConversationMetadataService.ts` | 新增 `moveToSpace()`：校验、更新、发布 `space` 类变更、释放会话；注入 `spaces` |
| `apps/buddy/service/src/conversations/registerConversationRpc.ts`、`BuddyService.ts` | 注册请求并注入空间仓库 |
| `apps/buddy/electron/**`（`localChatApi.ts`、preload、main） | 新增 IPC 通道 `conversationsMoveToSpace` |
| `apps/buddy/service/src/attachments/ComposerResourceService.ts` | 产物授权校验兼容“任务移入空间前生成的产物” |
| `apps/buddy/src/modules/tasks/state/task-index/useTaskIndex.ts`、`contracts.ts` | 新增 `moveTaskToSpace` |
| `apps/buddy/src/modules/tasks/state/useTaskCapability.ts`、`conversations/useChatSession.ts` | 当前任务被移动时更新会话的空间 |
| `apps/buddy/src/modules/tasks/widgets/task-index/` 下的 `useTaskMenuActions.ts`、`DesktopTaskRow.vue`、`DesktopTaskSpaceRow.vue`、`DesktopTaskIndex.vue`，以及 `widgets/workspace/DesktopTaskIndexView.vue` | 菜单项、拖入空间行的放置目标与高亮 |
| `apps/buddy/src/i18n/locales/zh-CN`、`en-US` 的 `tasks.ts` | “移动到空间”“暂无可用空间” |

## 5. 已确认的取舍

1. 选最简方案：不弹确认、不注入上下文提示、不复制旧文件、不让智能体读取旧工作区。（用户要求“最简单快速，不需要过多设计”，2026-10-19）
2. 旧工作区文件留在原处。业界做法（Codex、Claude Code、ZCode）都不复制文件；ZCode 让会话工作目录永不变，XTLaw 的空间围绕主目录运作，因此选择“切到空间目录、旧文件留原处”。
3. 运行中不允许移动：会话打开时会校验任务空间与蓝图一致，运行中途换目录会让授权与目录对不上。

## 6. 验收标准

- [x] `ConversationMetadataService.moveToSpace()`：无空间任务可移动一次并发布 `space` 变更、释放会话；已有空间、空间已撤销、存在运行中回合时拒绝且不改数据。（单元测试 `ConversationMetadataService.spec.ts`，10 项通过）
- [ ] 真实应用中：“任务”分组里的任务，从“更多”菜单选择空间后，进入该空间的列表并从“任务”分组消失。
- [ ] 真实应用中：把“任务”分组里的任务拖到空间行（含折叠的空间行）松手，效果同上；拖动时空间行出现高亮。
- [ ] 真实应用中：任务运行中菜单项置灰；已在空间里的任务没有此菜单项。
- [ ] 真实应用中：移动后继续发消息，智能体在空间目录里工作；移动前生成的产物仍可预览，也能加入输入框引用。
- [ ] 真实应用中：移动当前打开的任务后，头部和文件面板切到新空间。

## 7. 验证记录

- `pnpm type-check`（`apps/buddy`）通过。
- 相关 spec：`service/src/conversations`、`service/src/storage/__tests__`、`service/src/attachments/__tests__/ComposerResourceService.spec.ts`、`src/modules/tasks/state`、`src/modules/tasks/widgets/task-index`、`electron` 下，20 项失败均在 `docs/known-test-failures.md` 的 Windows 基线内（符号链接 EPERM、路径分隔符、Linux 自启动、浏览器适配器、服务进程），本次改动未新增失败。
- 改动文件的 ESLint 通过。
- 未做：前端组件测试、开发预览里的手动验收、打包。拖拽依赖 `@dnd-kit/vue` 的放置目标，需要在真实窗口里确认。

## 8. 未决事项

无。如要让智能体仍能读取旧工作区里的文件、或增加确认框，再单独评估。

## 9. 文件与术语说明

| 原名称 | 中文含义 | 用途 |
|---|---|---|
| `conversations.space_id` | 任务所属空间 | 为空表示不属于任何空间；本规格只把它从空改为某个空间 |
| `workbench-task` | 任务行拖拽类型 | 空间行对它新增放置响应 |
| `moveTaskId` | 拖拽数据里的任务 ID | 只有“任务”分组里、空闲、无空间的任务携带，空间行据此决定是否接收 |
| `invalidateConversation` | 释放任务的智能体会话 | 下一回合按新空间重建 |
