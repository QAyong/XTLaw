# Spec-029：空间折叠时显示任务状态提示

**日期：** 2026-10-09  
**状态：** 已验收（用户在开发预览中确认验收通过，2026-10-09）

## 1. 背景

任务侧栏的空间行（`DesktopTaskSpaceRow.vue`，空间行组件）可以折叠。展开时，任务行会显示自身的活动状态：运行中的任务显示转圈，等待确认（`awaiting_approval`）的任务显示确认图标。折叠后这些任务被隐藏，用户只能逐个展开空间，才知道里面有没有任务在运行，或有没有任务在等自己确认。

本规格让折叠的空间行也显示同样的状态提示。空间行的基础交互（悬停操作、菜单等）仍以 Spec-006（`feature-006-fixed-primary-navigation.md`）为准，本规格只补充折叠时的状态提示。

## 2. 需求边界

**包含：**
- 空间行折叠时，汇总其中属于该空间的任务状态，在行右侧显示一个图标：
  - 有任务等待确认：显示与任务行相同的确认图标（`ApprovalsApp20Regular`），颜色为 `--buddy-status-warning-text`（警告文字颜色变量），不转动。
  - 否则有任务运行中：显示转圈图标（`SpinnerIos20Regular`），颜色为 `--buddy-text-muted`（次要文字颜色变量），每秒匀速转一圈。
  - 其余情况不显示。
- 同时有运行中与等待确认的任务时，只显示确认图标。
- 属于某空间、但被单独置顶的任务同样计入所属空间；置顶区里的任务仍在置顶区显示。
- 置顶区与“空间”区的空间行使用同一规则。
- 图标约 16px。系统开启“减少动态效果”时，转圈静止。
- 图标以绝对定位叠在“更多”“新任务”按钮所在的右侧区域，不占宽度：名称不会被挤短，行宽不变。
- 鼠标悬停或键盘聚焦到该行时，图标隐藏，“更多”“新任务”按钮显示，与任务行一致。
- 图标不拦截鼠标点击，带 `role="status"`（状态角色）。无障碍名称：等待确认时为 `activity.approval`，运行中时为 `run.status.running`（对应的国际化文案键）。
- 图标出现和隐藏时没有淡入淡出过渡，与任务行一致。

**不包含：**
- 展开的空间行不显示状态图标，由其中的任务行各自显示。
- 不显示数量，也不区分有几个任务在运行或等待确认。
- 不新增任务状态字段、后端接口或数据库迁移，不改动任务行自身的状态显示。

## 3. 实现

| 文件 | 作用 |
|---|---|
| `apps/buddy/src/modules/tasks/widgets/task-index/taskPinnedItems.ts` | 新增 `resolveSpaceActivities()`，从全部任务汇总每个空间的状态，等待确认优先于运行中 |
| `apps/buddy/src/modules/tasks/widgets/task-index/useTaskIndexController.ts` | 计算 `spaceActivities`（空间 ID 到状态的映射）并交给侧栏模板 |
| `apps/buddy/src/modules/tasks/widgets/task-index/DesktopTaskIndex.vue` | 置顶区与空间区的 `DesktopTaskSpaceRow` 传入 `activity` |
| `apps/buddy/src/modules/tasks/widgets/task-index/DesktopTaskSpaceRow.vue` | 接收 `activity`，仅在“折叠且有状态”时渲染对应图标（`v-if`） |
| `apps/buddy/src/modules/tasks/widgets/task-index/__tests__/taskPinnedItems.spec.ts` | `resolveSpaceActivities()` 的单元测试 |

判断依据是全部任务，而不是当前展开列表中可见的任务，因此折叠时同样能得到结果。

## 4. 已确认的取舍

1. 等待确认也在折叠的空间行上提示，图标与任务行一致。（已确认）
2. 属于某空间、但被单独置顶的运行中任务，所属空间折叠时仍转圈。（已确认）
3. 空间行展开时不显示状态图标。（已确认）
4. 同时有运行中与等待确认的任务时，只显示确认图标，因为它需要用户处理。（实现时的默认选择，如需两者都显示可再调整）

## 5. 验收标准

- [x] `resolveSpaceActivities()` 每个空间只给出一个状态：有等待确认则为 `awaiting_approval`，否则有运行中则为 `running`；空闲任务与不属于任何空间的任务不计入（单元测试覆盖，包括“先运行后等待确认”和“先等待确认后运行”两种顺序）。
- [x] `apps/buddy` 下 `task-index` 目录的 spec 通过（见第 6 节）。
- [x] 真实应用中：空间折叠且其中任务运行时，空间行出现转圈；任务结束后转圈消失。
- [x] 真实应用中：空间折叠且其中任务等待确认时，空间行出现与任务行相同的警告色确认图标。
- [x] 真实应用中：同时有运行中与等待确认的任务时，空间行只显示确认图标。
- [x] 真实应用中：展开空间时，空间行无图标，子任务行图标正常。
- [x] 真实应用中：悬停或键盘聚焦空间行时，图标隐藏，“更多”“新任务”按钮出现。
- [x] 真实应用中：置顶区的空间行与空间区表现一致。
- [x] 真实应用中：开启“减少动态效果”后转圈静止；图标出现前后名称与行宽不变。

## 6. 验证记录

- 在 `apps/buddy` 下运行 `vitest run src/modules/tasks/widgets/task-index`：4 个文件、28 个用例通过。
- 未运行类型检查、lint 和全量测试。
- 开发预览：使用 `pnpm --filter @uselexora/lexora-buddy dev` 启动，渲染层为 `http://localhost:1420/`，独立窗口为 `XTLaw Dev`，使用开发版数据目录；启动日志无错误行，正式版未关闭。
- 验收结论：用户在开发预览中确认“验收通过”（2026-10-09）。未留存逐项录屏或截图，第 5 节勾选项以该结论为准。
- 代码与文档提交到 XTLaw 仓库 `master` 并推送至 `origin`；上游 PR 使用独立分支，不包含本文档。

## 7. 未决事项

无。

## 8. 文件与术语说明

| 原名称 | 中文含义 | 用途 |
|---|---|---|
| `activity` | 任务的活动状态字段 | 取值为 `idle`（空闲）、`running`（运行中）、`awaiting_approval`（等待确认） |
| `running` | 运行中 | 空间行显示转圈的条件 |
| `awaiting_approval` | 等待确认 | 空间行显示确认图标的条件，优先级高于运行中 |
| `SpinnerIos20Regular` | 转圈图标 | 来自 `@vicons/fluent` 的图标 |
| `ApprovalsApp20Regular` | 确认图标 | 与任务行相同的等待确认图标 |
| `resolveSpaceActivities()` | 汇总空间状态的函数 | 纯函数，便于单元测试 |
