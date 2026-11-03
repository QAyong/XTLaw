# 上游集成记录：2026-11-03

区间是 `6ca67989d..583b61a27` 的 8 个提交（`6ca67989d` 是上一轮的基线）。分支 `codex/upstream-20261103`，从本地 `master`（`df9b48f03`）切出，用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 内容 | 冲突 |
| --- | --- | --- |
| `7b12e2786` | 修复上下文用量跨轮次保留与压缩刷新 | 1 个文件 |
| `09bd98c57` | Codemode 支持关闭、混合调用、代码编排三种模式 | 4 个文件（测试、e2e、官网文档） |
| `35e73e8d7` | 修复生图结果判定与重复提交 | 1 个文件 |
| `62057b6d0` | 服务模型步骤支持搜索 | 1 个文件 |

要点：

- `09bd98c57`：`runtime.codemode` 从布尔值改为 `off | on | only`，`LexoraConfigStore` 读取时把旧的 `true` 转成 `on`、`false` 转成 `off`，不改写文件。旧的 `true` 原来的实际行为是 `only`，升级后变成混合调用，这是上游的取舍，也是我们提的上游 Issue #537 想要的结果。
- `35e73e8d7`：没有迁移，新增 `imageHttpDiagnostic.ts` 和 `shared/images/imageGeneration.ts`，`ImageRequestStore` 有较大改动。

## 跳过

| 上游提交 | 内容 | 原因 |
| --- | --- | --- |
| `d010816e6` | 修复侧栏动画期间插件视图与内置浏览器位置不跟随（上游 PR，作者是我们的账号） | 我确认跳过。我们的 `codex/fix-surface-layout-transitions` 分支上还有未进上游的后续提交 `cd8ab0886`（限定资源视图动画测量范围），这里一并不带 |
| `61342079e` | 支持 Markdown 预览中的相对路径图片（上游 #543） | 本地已有等价实现 `6646213a7`，并且多支持授权目录目标；试合并 8 个文件 20 处全是 add/add 冲突。上游最终版把路径解析拆到 `documentRelativePath.ts`，`markdownImage.ts` 更简，是否对齐见待办 |

## 暂缓

| 上游提交 | 内容 | 原因 |
| --- | --- | --- |
| `f472c1428` | 异步用户提问与回答续接 | 大功能，单独成轮，本轮只评估。80 个文件、+2182 行，含新迁移 `v41UserQuestions`；试合并 11 个文件 23 处冲突，集中在任务布局（`DesktopChatWorkspace.vue` 4 处、`DesktopTaskComposer.vue` 2 处）、会话扩展注册和 `schema.ts`。本地 41、42 已被占用（上游 v39→41、v40→42），上游 v41 按先例应落在本地 43，编号等我确认。`UserQuestionService.ts` 里 `?? 'Lexora'` 的兜底要换成内置智能体“晓晓” |
| `583b61a27` | 修复异常结果的消息排序 | 依赖 `f472c1428`（用到它引入的 `user-question` 时间线项），跟着一起暂缓 |

另有上游新分支 `upstream/feat/buddy-speech-controls`（`a5066cef8`，简化语音朗读控件）不在 `master` 上，没有处理。

## 冲突解决

- `DesktopNotificationService.spec.ts`（1 处）：保留本地 `run-1` 夹具，补上上游新增的 `threadId`。
- `DesktopNotificationSound.spec.ts`：本地独有的测试，同样补 `threadId: 'thread'`（`vue-tsc` 报错）。
- `LexoraConfigStore.spec.ts`（3 处）和 `settings.e2e.mjs`（4 处）：取本地版本，只套用 Codemode 相关断言（`'on'` / `'off'`、迁移用例、非法值用例、`codemode-settings` e2e）。上游同一提交里顺带改写的 e2e 断言（提示词文本、设置导航、alert 角色）本地用例已分叉，没有取。本地原有的“默认开启”用例被上游的迁移用例取代，并补了一个非法值用例。
- 官网 `settings-and-models.md`（中英文各 1 处）：本地这一页结构和上游不同，保留本地，只在“数据与授权”前加上游新增的“工具调用方式”一节。
- `BuddyChatImageToolDetails.vue`（1 处）：保留本地作用域类名，只取 `v-if="failureText || outputs.length"`。
- `DesktopProviderAddDialog.vue`（1 处）：本地是作用域样式，搜索行和空状态改用 `__model-search`、`__models-empty` 作用域类，不引入上游原子类。

## 验证与待办

- 品牌：4 个提交的新增行里没有用户可见的 “Lexora”（只有 `LexoraConfigStore` 类名）。
- WSL 本机：`pnpm type-check` 通过（需要 `NODE_OPTIONS=--max-old-space-size=8192`，默认堆会 OOM）；4 个提交改动的测试加 `DesktopNotificationSound.spec.ts` 共 28 个文件 404 个测试通过；改动文件的 eslint 通过。
- 未跑：Playwright E2E（含新增的 `codemode modes preserve concurrency preferences and survive restart`）、开发预览、打包。**必须在 Windows 开发预览里看：** 设置 → 运行时 → 工具调用方式三种模式切换、重启后保留；旧配置 `codemode = true` 升级后显示为“混合调用”；添加服务向导的模型步骤搜索框布局和无匹配状态；生图失败时详情里的失败说明。
- 待办：比较上游 #543 最终版与本地 `6646213a7`，决定是否把路径解析拆分对齐；评估 `f472c1428`（迁移编号、布局冲突）后再移植 `583b61a27`。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `583b61a27`：区间内 8 个提交都已决定（移植 4、跳过 2、暂缓 2）。暂缓的 `f472c1428` 和 `583b61a27` 在这里登记，下一轮评估时要回头看。
