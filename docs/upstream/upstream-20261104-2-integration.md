# 上游集成记录：2026-11-04（第二轮）

区间是上一轮暂缓的 `f469272f5`、`de5b6a805`、`92cbc5bb5`（虚拟列表及其后续修复），属于 `81fce6c28..92cbc5bb5` 区间的最后三个提交。分支 `codex/upstream-20261104-2`，从 `codex/upstream-20261104` 切出，所以包含第一轮（PR #74）的提交；PR #74 要先合并，之后本 PR 的差异只剩本轮的 7 个提交（6 个代码提交加这份记录）。用 `git cherry-pick -x`，按上游顺序一个提交对应一个本地提交。基线 `docs/upstream-baseline.json` 上一轮已推进到 `92cbc5bb5`，本轮不变，暂缓项清零。

## 上游为什么做这些提交，本地有没有同样的问题

| 上游提交 | 解决的问题 | 本地有没有 |
| --- | --- | --- |
| `f469272f5` | 长对话把每条消息都画在页面上，拖分隔条、缩放窗口时全部重新排版，会卡。上游改成只画屏幕附近的消息（虚拟列表），拖动每帧只更新一次，输入框工具栏缓存测量结果，长用户消息的溢出批量检测，选中文字、焦点、编辑中的行不会被回收 | 有。本地代码与上游改之前一致：消息全画、拖动每次鼠标移动都提交、每个气泡各自测量。没有量过实际有多卡 |
| `de5b6a805` | 在长对话中间点“重新生成”，旧回复和后面的内容被暂时删掉，页面变短、画面跳动，已加载的更早历史也丢一部分。上游改成重新生成期间占住位置，并保留已加载的历史范围；输入框里按空格、方向键不再被当成阅读滚动 | 有（按代码判断，与上游改之前一致；未在应用里复现） |
| `92cbc5bb5` | 关闭旁边的分屏后，留下的分屏正文空白、阅读位置丢失 | 这是上游虚拟列表自己带来的问题，没有虚拟列表的本地大概率没有；引入虚拟列表后需要它 |

## 已移植

| 上游提交 | 内容 | 冲突 |
| --- | --- | --- |
| （本地提交） | 视口组件改用已有的组合式函数 | 无，前置重构 |
| `f469272f5` | 虚拟化长对话并加快分屏拖拽 | 4 个文件 7 处 + 1 个修改/删除 |
| `de5b6a805` | 重新生成时保持滚动位置并保留已加载的历史 | 1 处 |
| `92cbc5bb5` | 关闭分屏后保持正文与位置 | 无 |
| （本地补丁） | 重新生成接管视口时上报被取消的通知定位 | — |
| （本地补丁） | 虚拟行重挂载后保留过程折叠状态 | — |

要点：

- **前置重构**：本地 `BuddyChatTranscriptViewport.vue` 把滚动逻辑内联在组件里，`useChatTranscriptViewport` 组合式函数在本地没人用（见 10-25 记录）。两者函数体逐函数一致（机械比对无差异），所以直接取上游 `f469272f5^` 的组件，行为不变；类名也跟上游用 UnoCSS 原子类（`relative h-full min-h-0`、`absolute z-3 bottom-[0.85rem] left-[50%]` 等），本地 `presetUno` 都支持且别处已在用，不需要补映射。做完这一步，`f469272f5` 在视口组件上的 4 处冲突消失，`de5b6a805` 的冲突从 8 处降到 1 处，`92cbc5bb5` 无冲突。
- **新增依赖** `@tanstack/vue-virtual@3.13.51`（纯 JS）。`pnpm-lock.yaml` 取本地版本后用 `pnpm install` 重新生成，新增 18 行，与上游一致。
- **过程折叠是本地专属功能**，上游没有（见 `docs/specs/feature-001-turn-process-folding.md`，由 2026-09-27、09-29 的 `54dedd474`、`48671afc7` 引入）。虚拟行滚出视口会被卸载，原来的 `collapsed`、`manuallyChanged`（`BuddyChatAgentTurn.vue`）和 `standaloneCollapsed`（`BuddyChatAgentTurnFlow.vue`）是普通 `shallowRef`，卸载后会回到默认折叠状态。改为上游的 `useChatTranscriptValue`，并新增 `BuddyChatAgentTurnFolding.spec.ts`（手动展开、手动折叠在重挂载后保留；未手动改过的仍按状态自动折叠；没有行状态存储时照常工作）。这个测试在不改 `BuddyChatAgentTurn.vue` 时会失败。
- **语义补丁**：`de5b6a805` 新增的分支直接把 `pendingRevealMessageId` 置空，会绕过本地的 `onRevealCancelled` 回调（通知定位的完成上报），改为走 `cancelPendingReveal()`。这类问题不会产生冲突。

## 冲突解决

`f469272f5`：

- `BuddyChatAgentTurnFlow.vue`（4 处）：保留本地的折叠按钮、`topToggle`、`effectiveCollapsed`、`useChatActivityNavigation` 和作用域样式；`openEntries` 改为 `useChatTranscriptValue`，`@open-entry` 改用 `setEntry`；`standaloneCollapsed` 同样接入行状态存储；去掉不再用的 `shallowReactive`、`shallowRef`。
- `BuddyChatMessageList.vue`（1 处）：只取 `provideChatTranscriptPresentation(...)`；上游上下文里的 `historyElement`、`useWorkbenchAnchor('task.history')` 本地没有，不带。
- `useChatViewport.ts`（1 处）：上游删除了“前插历史时保持阅读位置”的监听（虚拟列表自己处理）。保留本地的 `isLoadingOlderMessages` 监听，`timelineItems` 的监听只留“有待定位消息时尝试继续定位”。
- `pnpm-lock.yaml`（1 处）：见上。
- `reading.e2e.mjs`（修改/删除）：本地没有这个文件，直接带入上游 `f469272f5` 的版本，供 Windows 验证用；它只依赖 `../fixtures/electron.mjs`，本地已有。

`de5b6a805`：`DesktopChatWorkspace.vue`（1 处）：保留本地传给 `useChatWorkspace` 的第三个参数（通知定位的三个回调），再把 `regenerateAssistant` 加进解构。

品牌：新增行里没有 `Lexora` 命中（排除标识符）。

## 验证与待办

- WSL 本机：`pnpm type-check` 通过；本分支 39 个改动文件的 eslint 通过。
- 测试：`vitest run --changed 9903ed1a9`。因为 `pnpm-lock.yaml` 变了，vitest 把全部 815 个测试文件都算作相关。首次运行 54 个文件失败，全部在 `electron/`、`platform/`、`service/` 下，没有一个在前端 `src/` 下，原因是新 worktree 没有 Linux 原生辅助程序。把第一轮编好的原生程序（Rust 没改，可直接复用）拷过来重跑这 54 个文件，49 个通过；剩 5 个文件（23 个用例）仍失败：`sandboxDependencies`、`buddyPiSearchDependencies`、`piSearchContract`、`shellPrograms`、`shellSandbox`，错误是 “Bundled tool is missing”（`.output/build/search-tools` 下的 `rg`、`fd`，`.output/build/shell-sandbox` 下的 `bwrap`，这些捆绑工具没有构建），本分支没有改动任何沙箱或搜索相关文件。这 5 个文件没有单独在 `master` 上对照跑过。
- 上游新增的单测在 WSL 通过：视口、行保留、行状态、DOM 索引、`useChatViewport`、`chatScroll`、`useWorkbenchResize`、工具栏布局、用户气泡。
- 未跑：Playwright E2E（含带入的 `reading.e2e.mjs` 和 `welcome.e2e.mjs` 的改动）、开发预览、打包。**必须在 Windows 开发预览里看：**
  - 长对话（几百条消息）滚动、拖滚动条、回到最新、流式输出时跟随。
  - 向上翻出更早的历史，位置不跳。
  - 在长对话中间点“重新生成”，页面不跳，已加载的历史还在。
  - 关闭旁边的分屏，留下的正文不空白、位置保持。
  - 拖分隔条、缩放窗口是否流畅，输入框工具栏收缩是否正常。
  - **过程折叠**：手动展开或折叠后滚走再滚回来，状态保持；运行中自动展开、完成后自动收起；头像栏摘要。
  - 大纲点击定位、通知点击定位（含被取消的情况）、任务切换后恢复阅读位置。
  - 跨多条消息选中文字再滚动、编辑消息时该行不被回收、用户长消息展开状态保持。
  - 选区引用（在单条正文里选文字）仍可用。
- 待办（可选）：`BuddyChatTurnOutputs.vue` 的 `open`、`BuddyChatActorProcess.vue` 的 `localExpanded`、`BuddyChatTokenUsage.vue` 的 `showDetails` 也是普通状态，滚出再回来会回到默认值。这三个组件上游也有，上游同样没接行状态存储，所以与上游一致，本轮没改；觉得影响体验再单独接。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 保持 `92cbc5bb5`（上一轮已推进）。至此 `81fce6c28..92cbc5bb5` 区间 10 个提交：机器人移植 2、手动移植 4（第一轮）、手动移植 3（本轮）、跳过 1（`b2bae6a13`），没有遗留暂缓项。
