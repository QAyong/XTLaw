# 上游集成记录：2026-11-03（第二轮）

区间是上一轮暂缓的 `f472c1428`、`583b61a27`，加上 `583b61a27..81fce6c28` 的 4 个新提交，共 6 个。分支 `codex/upstream-20261103-2`，从本地 `master`（`3286a6017`）切出，用 `git cherry-pick -x`，按上游顺序一个提交对应一个本地提交。

## 已移植

| 上游提交 | 内容 | 冲突 |
| --- | --- | --- |
| `f472c1428` | 异步用户提问与回答续接 | 11 个文件 23 处 |
| `583b61a27` | 修复异常结果的消息排序 | 无 |
| `4596d1ce3` | 简化语音朗读控件与状态反馈 | 1 个文件 1 处 |
| `ce28d9c10` | 优化问答面板层级与交互状态 | 无 |
| `81fce6c28` | 修复补充消息延迟显示 | 无 |

要点：

- `f472c1428`：新增 `user_questions` 表。上游迁移 `v41UserQuestions` 在本地登记为 **v43**（`BUDDY_SCHEMA_VERSION` 由 42 改为 43），接在本地 v42 事件维护迁移之后，沿用 v39→41、v40→42 的先例；文件名保留 `v41UserQuestions.ts`，表结构不变。这个编号经我确认。`backupDatabasePolicy.ts` 的 `tasks` 域加入了 `user_questions`。
- `ce28d9c10`：纯前端改版（`NRadio` / `NCheckbox`、多问题“问题 N / M”、历史记录摘要），没有逻辑改动。上游用了 `rounded-control`、`rounded-icon` 两个类名，本地 `uno.config.ts` 的 `borderRadius` 补了映射，分别指向 `--buddy-composer-control-radius` 和 `--buddy-icon-button-radius`。
- `4596d1ce3`：对应上一轮记录里提到的上游分支 `feat/buddy-speech-controls`，现在已经在上游 `master` 上。删除 `SpeechPlaybackStatus` 组件，朗读状态改由 `SpeechReadAloud` 自身显示。

## 跳过

| 上游提交 | 内容 | 原因 |
| --- | --- | --- |
| `f652e7dc1` | 发布 v0.19.0 | 只改版本号和 `sourceDateEpoch`（`package.json`、`buddy.version.json`、`Cargo.lock` 等 5 个文件），不照搬上游版本号。后面的提交都不依赖它 |

## 冲突解决

`f472c1428`：

- `schema.ts`（3 处）：保留本地的迁移列表和编号映射，追加 v43，版本常量改为 43。
- `createBuddySessionExtensions.ts`（2 处）：两边都留，`createWslShellCapability` 之后注册 `createAskUserCapability`。
- `SessionToolScope.ts`（1 处）：`CONTROL_TOOLS` 加入 `lexora_ask_user`、`lexora_wait_user`；`READ_ONLY_EXCLUDED_TOOLS` 保留本地的 `lexora_wsl_shell`。
- `contracts.ts`（1 处）：两个类型导入都留。
- `DesktopChatWorkspace.vue`（4 处）：本地没有欢迎页伙伴（`decoration` 插槽、`hasNotice`）和 `welcome-layout` 属性，这些不带（它们属于被跳过的 `6c89a8c95` 陪伴贴纸），只取问答相关的计算属性、`openQuestionInChat`、`#tail` 里的 `BuddyUserQuestions` 和 `#accessory` 里的紧凑版问答；底栏保留本地作用域类名。
- `inline-materials`：这个属性也是 `6c89a8c95` 引入的，本地没有。问答出现时上游让附件条改成行内，避免悬浮的附件条盖住底部的紧凑问答，这部分我确认跟随上游：`DesktopChatComposerProps` 和 `TaskComposerHostProps` 各加 `inlineMaterials`，`DesktopChatComposer` 里 `is-floating` 改为 `!inlineMaterials && !hasQueuedMessages`，工作区传 `:inline-materials="hasQuestions"`，并在 `chatComposerProps.spec.ts` 补了用例。上游表达式里的 `isEmpty && viewMode !== 'canvas'` 只服务于贴纸欢迎布局，没有带，空会话时附件条行为不变。
- `DesktopTaskComposer.vue`（2 处）、`DesktopChatComposer.vue`（1 处）：只加 `accessory` 插槽；`composer.accessory` 的最大高度本地已在作用域样式里，不加上游原子类。
- `DesktopChatComposerFrame.vue`（1 处）：保留本地 `editor-wrap` 类名，作用域样式补 `min-width: 0`，对应上游的 `min-w-0`。
- `BuddyChatRunActivity.vue`（1 处）：取上游新的 `waitingFor === 'user_answer'` 条件；`buddy-chat-run-activity` 的间距本地在作用域样式里，保留。
- `BuddyChatTranscriptViewport.vue`（1 处）：只取 `has-tail` 类，`min-height: 100%` 本地样式里已有。
- `instantTaskSwitch.spec.ts`（1 处）：本地没有 `@/modules/tasks` 的整体 mock，取本地版本。上游改成 `importOriginal` 的同类修法落在本地拆出来的 `instantTaskSwitchRecovery.spec.ts` 上，否则 `TaskWorkspacePool` 拿不到 `createUserQuestionInteractionState`。

`4596d1ce3`：`DesktopChatComposer.vue`（1 处）：本地编辑器区域没有 `inputSurface` 包裹层，保留本地的 `EditorContent`，只去掉 `<SpeechPlaybackStatus>`。

品牌：`UserQuestionService.ts` 里 `?? 'Lexora'` 的兜底改为内置智能体“晓晓”；本轮新增的两处测试夹具 `buddyName` 同样改为“晓晓”。`lexora:buddy:questions:*` 通道名和 `lexora_ask_user`、`lexora_wait_user` 工具名是标识符，保留。

## 验证与待办

- WSL 本机：`pnpm type-check` 通过（`NODE_OPTIONS=--max-old-space-size=8192`）；改动相关的目录（存储、问答、聊天队列、执行、会话扩展、任务模块、语音、i18n、工作台、提示输入）共 218 个测试文件，首次运行 217 个通过，失败的是 `instantTaskSwitchRecovery.spec.ts`（上面的 mock 问题），修复后 `src/app/workbench` 18 个文件 179 个测试通过；90 个改动文件的 eslint 通过。type-check 在这个测试修复之前跑过，修复只改了一个 mock 写法。
- 未跑：Playwright E2E（含新增的 `speech-playback.e2e.mjs`）、开发预览、打包。**必须在 Windows 开发预览里看：**
  - 数据库从 v42 升到 v43 后正常启动、`user_questions` 表可用。
  - 智能体用 `lexora_ask_user` 提问：任务页底部紧凑问答、展开到对话流里的问答面板、回答后续接、多问题的“问题 N / M”、历史记录摘要。
  - 问答面板的浅色、深色主题，单选、多选、自定义输入、禁用态。
  - **附件与问答**：有待答问题时，附件条应该在输入框里按行内显示，不盖住底部的紧凑问答；问题答完后附件条恢复悬浮。
  - 朗读控件和朗读状态反馈。
  - 补充消息发送后立即出现在时间线里。
- 待办：比较上游 #543 最终版与本地 `6646213a7`（上一轮遗留）。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `81fce6c28`：区间内 6 个提交都已决定（移植 5、跳过 1），上一轮暂缓的 `f472c1428` 和 `583b61a27` 已在本轮移植，没有遗留暂缓项。
