# Bug：聊天正文含超长链接时，助手消息被撑宽并溢出阅读宽度

**日期**：2026-10-30  
**优先级**：低（P3，影响版面，不丢数据）  
**状态**：未修复，仅定位原因；已提交上游 Issue [useLexora/Lexora#497](https://github.com/useLexora/Lexora/issues/497)（2026-10-30）  
**上游基线**：`1057555ea`（2026-10-30，`buddy` 0.17.0）。上游三处相关代码与本地一致，同样存在此问题；上游历史中只有状态弹窗、引用菜单的溢出修复，没有聊天正文这一处。  
**范围**：聊天转录里助手消息的 Markdown 正文；不涉及用户气泡、工具行和代码块。

## 现象

每周五的自动化任务（任务 ID `86f590c4-d3cc-47e7-a40f-82bd2781dc73`）生成《国内法律 × AI 每周简报》后，正文里的标题、分割线和段落都比用户气泡、输入框宽，右侧超出 768px 阅读宽度，最宽处约 1074px。代理的页头与分割线仍在阅读宽度内。

## 触发内容

简报“第四栏”的 4 条微信文章条目含这样的列表项：

```
- **链接**：https://mp.weixin.qq.com/s?src=11&timestamp=1793365341&ver=7058&signature=H*-D1jiCpBe…
```

每条 208 个字符，全是英文、数字和符号，没有可断开的位置。搜狗微信跳转链接带签名参数，天然很长，其他输出也可能出现；日志、哈希、无空格的路径同理。

## 原因

三层条件叠加，缺一不会溢出：

- **文本不能折行进入最小宽度**：`markstream-vue` 的 `.markstream-vue .text-node` 设为 `overflow-wrap: break-word`，只在放不下时折行，不降低最小内容宽度。`BuddyChatMessageContent.vue` 的 `.buddy-chat-message-content__text` 虽写了 `overflow-wrap: anywhere`，但被 `.text-node` 自己的声明覆盖，没有传到文本。于是整条链接成为一个不可分割的长词。
- **网格列没有封顶**：`BuddyChatMessageRow.vue` 的 `.buddy-chat-message` 是 `display: grid`，没有 `grid-template-columns`，列是隐式的 `auto`，会随子项的最小内容宽度增长。
- **网格子项没有 `min-width: 0`**：`BuddyChatMessageContent.vue` 的 `.is-assistant` 只有 `width: 100%; max-width: 100%`，百分比在 `auto` 列里不起封顶作用，子项的最小宽度仍取内容的最小宽度。

结果是整列被长链接撑宽，同列的标题、分割线、段落一起变宽。`BuddyChatAgentTurn.vue`、`BuddyChatAgentTurnFlow.vue` 里同样是无列宽网格，但子项已设 `min-width: 0`，暂时不受影响。

数据来源：任务的最终消息取自本机 `~/.xtlaw/buddy/buddy.sqlite3` 的快照，4 条长链接的长度已核对；排版机制来自读代码，未在运行的应用里用开发者工具核对实际宽度。页头未被撑宽的原因也未确认。

## 修复方案（未实施）

两处都改，互相兜底：

- **布局**：`.buddy-chat-message` 加 `grid-template-columns: minmax(0, 1fr)`（`BuddyChatMessageRow.vue` 用 Tailwind 类，对应 `grid-cols-[minmax(0,1fr)]`），`.buddy-chat-message-content` 加 `min-width: 0`。任何不可断内容都不能再撑宽列。
- **文本**：`DesktopMarkdownContent.vue` 中对 `.text-node` 和链接设 `overflow-wrap: anywhere`，让长链接在阅读宽度内折行。表格内已有 `.table-node .text-node { overflow-wrap: inherit }` 的专门处理，不要破坏它。

## 验收

- 含 200 字符以上无空格链接的 Markdown，在助手消息中不超出阅读宽度，链接折行显示。
- 同样的内容放在列表项、引用块、段落里都不撑宽；表格仍按原有规则横向滚动。
- 普通中文段落、代码块、表格的排版不变。

## 未验证

- 未在运行的应用里复现或截图对比；未改任何代码，也未跑测试。
- 未确认是否还有其他会撑宽该列的内容（宽表格、Mermaid 图、超宽图片）。
- 是否向上游提 PR 尚未决定；提交时需用中文提交信息和标题。
