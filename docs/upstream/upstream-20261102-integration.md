# 上游集成记录：2026-11-02

区间是 `f67ae31bf..c2d639e28` 的 4 个提交（`f67ae31bf` 是上一轮的基线）。分支 `codex/upstream-20261102`，从本地 `master`（`7137d9596`）切出，用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 内容 | 冲突 |
| --- | --- | --- |
| `a6dac1e09` | 修复发送后的输入框状态与时间线同步 | 3 个文件 |

要点：

- 服务端 `turnStartSchema` 增加 `userMessage`，`registerChatRpc` 的 `startTurn`、`executeCommand`、`editUserMessage`、`regenerateAssistant` 都把刚创建的用户消息（含附件）随返回值带回；前端 `useChatRunProjection.upsertMessage` 先把它插进时间线，不再等轮询。
- 滚动到底部改由 `submissionRevision`（提交成功后 +1）触发，不再看 `isSending`。
- 输入框发送期间不再 `setEditable(false)`，也不再用 `:key="editorKey"` 重建；改用 `composerInputGuard` 插件拦截改文档的 transaction，`editorKey` 作为 props 下传，变化时编辑器自己重置文档。

## 跳过

| 上游提交 | 上游 PR | 内容 | 原因 |
| --- | --- | --- | --- |
| `677e3b303` | #529 | 修复语音关闭时新对话里语音图标一闪而过 | 本地已有等价提交 `7137d9596`（该 PR 本来就是我们提的） |
| `56e23e072` | | 稳定版与尝鲜版更新通道 | 我确认不需要。它还改了 workflow、发布脚本和 `Lexora-Buddy-…` 产物名、`useLexora/Lexora` 发布地址，与我们的发布流程不同 |

## 暂缓

| 上游提交 | 内容 | 原因 |
| --- | --- | --- |
| `c2d639e28` | 修复命令并发阻塞与产物写入保护 | 我确认暂缓。含 Rust 改动；把 shell 命令从“工作区排他锁”改为 `observe`（并发，靠 `hasConcurrentChanges` 把变更标为 partial），与我们 #526 之后给 `lexora_wsl_shell` 补的按工作区加锁直接相关；产物写入改为暂存目录 + 原生 `writeFile`，`writeFiles` 变成必需项。后续重新评估时要一起看这几处，并注意它还改了 `SpeechButtons.spec.ts`，该 spec 来自 `677e3b303`。 |

## 冲突解决

- `useChatComposerEditor.ts`（1 处）：保留本地的 `serializeChatComposerContent` 比较方式，合入上游的 `reset` 判断（`editorKey` 或 `draftId` 变化时强制重置）。
- `chatComposerEditing.spec.ts`（4 处）：保留本地新增的 `/status`、`/new`、`/skills` 等用例和 `updates`/`root`/`unmount` 夹具；合入上游新增的发送锁定用例以及 `editorKey`、`isSending`。自动合并还丢了本地的状态面板夹具（`statusPanel` 选项和 `CONVERSATION_STATUS_PANEL_KEY` provide），已补回。
- `useChatWorkspace.spec.ts`（修改/删除）：采用上游的删除。保留它会失败，因为夹具没有 `submissionRevision`，用例也还在断言旧的 `isSending → resetToTail`。它原有的“换工作区所有者时隔离草稿与发送”用例随之没有了，需要的话以后单独补回。
- `useChatRunProjection.ts`：补上 `LocalMessage` 类型导入（自动合并后缺失，`vue-tsc` 报错）。

## 验证与待办

- 品牌：新增行里没有用户可见的 “Lexora”。
- WSL 本机：`pnpm type-check` 通过（需要 `NODE_OPTIONS=--max-old-space-size=8192`，默认堆会 OOM）；`tasks`、`prompt-input`、`speech` 目录 110 个测试文件 1014 个测试通过；`service/src/chat` 9 个文件 98 个测试通过。
- eslint 在 `BuddyArtifactCard.vue:181`（`vue/prefer-separate-static-class`）有 1 个错误，不在本次改动里，是已有问题。
- 未跑：Playwright E2E、开发预览、打包。**必须在 Windows 开发预览里看：** 发送后输入框是否保持焦点和只读、不闪烁；发送后用户消息是否立即出现在时间线且滚到底部；带附件的消息；编辑用户消息、重新生成；切换任务或草稿后输入框内容是否正确重置；录音转写在切换后不会写入错误的输入框。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `c2d639e28`：区间内 4 个提交都已决定（移植 1、跳过 2、暂缓 1）。暂缓的 `c2d639e28` 在这里登记，下一轮评估时要回头看。
