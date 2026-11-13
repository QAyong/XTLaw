# 20261113 任务归档与永久清理集成记录

- 分支：`codex/upstream-20261113-archive`
- worktree：`/home/lenovo/code/Lexora-worktrees/upstream-20261113-archive`
- 起点：`152bb2f81c51148b4e9240be3fd226abd379dd8b`（上一轮六项移植已提交，尚未合并 master）
- 本轮来源：`09e58acec8798508fce76e6829295748e09e343a`，上游任务归档与永久清理，150 个文件，预评估冲突 25 个文件。
- 本轮单独实施；后端与前端由两个子代理按目录分工，主代理统一验证和提交。未合并、未推送、未发布。

## 上游提交映射

`09e58acec8798508fce76e6829295748e09e343a` → `a3181b75b0605d5b945ebdf56454d2f8c2985dc5`

代码提交说明为英文（中文），保留完整 `cherry picked from commit` 来源行。最终代码差异为 153 个文件，包含本地交互与相关回归测试适配。独立集成记录提交的完整 SHA 见最终交付消息。

## 用户确认的本地交互

- 会话行右侧原有独立删除按钮改为归档按钮，保持当前布局与显示时机。
- 点击归档直接执行，不弹归档确认框。执行中或等待审批的会话先停止任务及子执行、撤销待处理审批，再归档，同样不增加确认框。
- 永久删除放进右键及“更多”共用菜单底部，显示红色“永久删除…”并用分隔线区分，保留永久删除确认。
- 归档隐藏正常列表中的会话，不删除任务文件；处理时禁重复点击，错误时保留任务并反馈。空闲会话归档后保留可撤销反馈，运行中会话不提供自动恢复执行的撤销。
- 已归档会话可阅读历史，输入框隐藏，显示归档提示与取消归档入口；取消归档不自动恢复执行或权限。
- 归档管理页、搜索/空间筛选、恢复、按空间批量清理及错误状态沿用上游功能。
- 自动清理提供不清理、3/7/30 天，默认不清理；启用或缩短期限保留确认。永久清理只处理任务独占数据及副本，外部目录不动。

## 本地兼容与冲突处理

### 数据库、备份及永久清理

- 用户明确批准将上游归档迁移登记为本地 **v44**；保留上游文件 `v42ConversationArchive.ts` 与来源。不覆盖已发布本地 v42（事件维护）、v43（用户问题）及更早迁移，不填用本地 v38 空位。
- 保留 `archive-v42` 作为该归档结构的 lineage 标识；本地登记版本为 44。启动时拒绝低版本带归档 lineage、实验 schema `storage_profile`、缺 lineage 的 v44 及未来版本，并校验当前表、列和触发器，避免直接接纳上游 user_version=42 的数据库。
- 备份保留 lineage，tasks 范围加入 `conversation_archive_policy` 和 `conversation_deletion_jobs`；恢复期间处理归档准入触发器。未添加对尚未移植的 `extension_capabilities` 表的要求。
- 归档与删除使用 `expectedRevision` 做比较更新，保留正在执行任务的停止流程、删除失败作业及重试、用量记录脱离已删除执行后继续累计等上游行为。
- 永久清理保留任务独占目录边界、共享资源保留及符号链接拒绝处理；不删除空间、外部授权目录及不属于目标任务的数据。

### 前端任务与扩展

- 保留本地侧栏、置顶、空间分组、标记、拖拽、等待回答状态及 navigation/footer slots；归档接入当前 TaskIndex，当前打开的归档会话仍保留状态用于只读展示。
- 保留本地已经删除的三份上游历史分页实现的删除决定：`useTaskHistory.ts`、它的 spec、`DesktopTaskHistoryList.vue`；没有把上游整套历史列表恢复回来。
- 保留插件本地安装/更新、类型筛选、技能创建、Office 引用和文件打开/审查权限。仅适配当前归档所需的 taskCleanup 和插件卡片动作，不引入推理、后台安装、安装进度或能力账本前置。
- Legacy cleanup 继续要求授权且受信任的菜单调用，冻结目标和 revision、一次批次确认、逐项 CAS；窗口失去可用状态会取消未确认批次。
- 新上游组件保留 UnoCSS 类名并在本地主题映射提供回退；已有组件保持 scoped 样式。
- 保留上一轮六项成果：上下文用量、XTLaw macOS 托盘及打包校验、默认开启的中文输入法触发符、云备份提示恢复和生图引用/结果保留。
- 上游 E2E 场景改为点击行内归档且断言没有归档确认框；永久删除菜单文案、schema v44 及 `XTLaw Test` 测试档位守卫同步适配。只做语法检查，没有运行 Windows E2E。

## 验证

统一使用新 worktree 的依赖和 WSL 测试副本；没有在真实用户数据库运行迁移或清理。

- `pnpm install --frozen-lockfile` 成功，依赖与锁文件不变。
- 本轮没有 Rust 源码改动；测试所需 file-reader/image-transform 复用上一轮同一代码基线已构建的 Linux helper，放在本 worktree 的忽略构建目录，不作为交付文件。
- 所有 Vitest 命令按项目串行执行，使用 `pnpm --filter @uselexora/lexora-buddy exec vitest run --project=<runtime|platform|unit> --maxWorkers=2 <相关 spec 路径>`。

| 相关检查组 | 文件数 | 最终通过测试数 |
| --- | ---: | ---: |
| 数据库迁移、备份、归档存储、旧任务清理、事务、用量 | 7 | 101 |
| 归档/RPC、元数据、实际 BuddyService 接线、执行协调、事件维护、清理宿主 | 12 | 131 |
| 自动化、任务标记、引用授权 | 4 | 18 |
| 插件清理与扩展服务（platform） | 6 | 87 |
| 任务归档前端、任务索引、会话状态与扩展前端 | 16 | 92 |
| 扩展 frame 宿主与工作区恢复 | 2 | 24 |
| 共享扩展请求生命周期 | 1 | 4 |
| **合计（不重复统计重跑）** | **48** | **457** |

重点 spec：

- 存储：`archiveSchemaMigration`、`archiveBackup`、`conversationArchiveRepository`、`legacyConversationPurge`、`schema`、`usageAnalyticsRepository`、`databaseTransaction`。
- 运行时：`ConversationArchiveService`、`ConversationCleanupService`、`ConversationMetadataService`、`registerConversationArchiveRpc`、`registerConversationRpc`、`buddyService.integration`、`ExecutionCoordinator`、`ExtensionActionDrain`、`RunEventLog`、`RunEventMaintenance`、Electron `ExtensionTaskCleanup` / `ExtensionTaskCleanupRuntime`、`AutomationOccurrenceLifecycleService`、`registerAutomationRpc`、`sessionReferenceAuthorization`、`taskMarkRepository`。
- 平台：`ExtensionTaskCleanup`、`ExtensionTaskCleanupBatch`、`ExtensionTaskCleanupController`、`createExtensionTaskCleanup`、`ExtensionCardActions`、`ExtensionService`。
- 前端：`DesktopTaskArchiveAction`、`DesktopTaskArchiveNotice`、`DesktopTaskRow`、`DesktopTaskArchiveManager`、`DesktopTaskArchivePolicy`、`useTaskArchiveManager`、`createTaskArchiveActions`、`useTaskIndex`、`useChatConversations`、`useTaskIndexManagement`、`useExtensionState`、`extensionCardActions`、`DesktopExtensionInstallReview`、`DesktopExtensionTaskCleanupHost`、`DesktopExtensionManager`、`DesktopExtensionInstalled`、`DesktopExtensionFrameHost`、`useTaskWorkspacePersistence`。
- 共享：`extensionRequestLifecycle`。

`NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @uselexora/lexora-buddy type-check` 最终通过。

首次前端验证发现新增 spec 的括号、测试上下文和模板 Ref 自动解包问题，以及撤销后 DOM 断言时机问题；均已修复并定向重跑受影响 spec。最终没有未处理异常。部分插件测试的简化布局 stub 仍打印 Vue 的额外属性继承提示，测试通过。

`node --check .playwright/scripts/__tests__/task-archive.e2e.mjs`、`node --check .playwright/scripts/fixtures/task-archive.mjs` 和代码差异空白/冲突标记检查通过。

未运行 Windows 开发预览、Playwright E2E、安装包、实际打包或 macOS 实机验证；未对真实用户数据执行归档、迁移或清理。

## 其他提交与状态

- 本轮不自动带入 `740e0bb27`（后续插件清理交互调整）、`cbe1cf393`（新功能引导）、插件推理或产物授权重构等未批准提交。
- `docs/upstream-baseline.json` 的 lastChecked 仍是 `1c8f1a2648b1ce2a11cec2959e2e619e94020442`；本轮处理的是该已检查区间内的一个待办，不推进也不倒退基线。
- 本轮分支基于上一轮六项移植分支，因此后续合并本轮分支会包含前六项；目前两轮都尚未合并 master，也未推送。
- 完成后保留关联 worktree，待维护者明确确认合并后再清理。最终 HEAD、工作区状态及主目录状态见交付消息。
