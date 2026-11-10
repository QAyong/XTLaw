# 已发布：上游 Issue #561（https://github.com/useLexora/Lexora/issues/561）

目标仓库：useLexora/Lexora，模板：功能建议（feature_request.yml）
标题：`[Feature] 提问卡片在 AI 还没说完时就弹出并自动展开，希望等本轮结束后再展开`

---

### 你的建议 / Your suggestion

用 `lexora_ask_user` 提问时，卡片会在 AI 这一轮还没结束时就出现在输入框上方，而且默认展开，占掉最多半个聊天区，打断我阅读 AI 正在输出的内容。

希望卡片的展开时机和 AI 的输出对齐：

1. AI 还在运行（仍在输出文字或调用别的工具）时，提问只显示成一行折叠的“待回答”，不自动展开，不挤占聊天区。
2. 本轮结束，或运行进入 `lexora_wait_user` 等待时，再自动展开。
3. 折叠状态下仍可手动点开，不影响想先回答的人。

**一次真实会话里的体验：** 让 AI 排查本机的一个问题，它先输出了分析，然后提了 2 个问题（含单选和文本）。我还没读完它的回复，问答卡片已经弹出来了。

### 期望的体验（选填） / Desired outcome (optional)

读 AI 的回复和回答 AI 的提问是先后两件事。提问卡片应该在 AI 说完之后才抢到注意力，而不是和它的输出同时出现。

### 补充信息（选填） / Additional context (optional)

**现状（代码依据，基于 upstream/master 92cbc5bb5，未运行）**

- `askUserCapability.ts`：`lexora_ask_user` 的描述写明“Returns a request receipt immediately; the same agent can continue independent work”，所以工具调用后运行不会停，AI 可以继续输出。
- `UserQuestionService.ask()`：写入请求后立即 `#changes.fire(request)`，没有等本轮结束。
- `useUserQuestions.ts` 的 `adopt()`：新的待答请求默认 `toggle(expandedIds, id, true)`，即自动展开。
- `DesktopChatWorkspace.vue`：`hasQuestions = pending.length > 0 || loadError`，`#accessory` 里直接渲染 `BuddyUserQuestions`，卡片最大高度 `min(50cqh, 100cqh - 12rem)`；这里没有读取运行状态。

所以只要 `ask` 一执行，卡片就出现并展开，此时运行通常还在继续。

**上游已有的相关改动**

- `68c2a0ea4`（逐题作答）在提示词里加了“调用前先把背景、分析放进一条普通消息”，并要求问题写成一句话。这能减少“卡片里塞长文”，但没有改变弹出和展开的时机，仍然取决于模型是否照做。
- 选项展开过长的问题，`68c2a0ea4` / `073eda14a` 已用逐题翻页和高度上限处理，这里不再重复。

**相关但不同的 Issue：** #393（回答提问时支持附件、图片、引用），讨论的是回答内容，不是弹出时机。

**没有验证的地方**

- 没有保留那次会话的事件日志，上面“先后顺序”是读代码推断的，没有在纯上游构建上复现。
- 不确定 Pi 在同一条助手消息里是否等文字输出完才执行工具；即使等了，调用后 AI 继续输出的情况下，卡片同样会提前出现。
- 我用的是下游 XTLaw（问答部分对应上游 `ce28d9c10`），已对照 `upstream/master` 的代码确认这里没有区别。

截图里有真实对话内容，没有附上。
