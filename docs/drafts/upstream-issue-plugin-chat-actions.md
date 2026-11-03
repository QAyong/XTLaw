# 已发布：上游 Issue #542（https://github.com/useLexora/Lexora/issues/542）

目标仓库：useLexora/Lexora，模板：功能建议（feature_request.yml）
标题：`[Feature] 插件能在 AI 回复里提供可点击的动作：点击后在插件内定位、高亮或执行操作（例如合同对比）`
标签：enhancement（由模板自动加）

---

### 提交前 / Before submitting

- [x] 我已搜索现有 Issue，确认没有相同建议。（搜索“插件 链接 定位”“onReveal”“引用 定位 高亮”“docx 合同”“reveal”“聊天 动作”均无相同建议；相关的只有已关闭的 #389，主题是文档插件契约，已由 #439 等落地。）

### 影响范围 / Affected area

Desktop (Buddy)

### 使用场景与问题 / Use case and problem

**场景：对比两份合同。** 我是法律工作者。把原版合同和修改后的合同都交给 AI，让它对比并列出修改点，AI 会给出一张表：条款、原文、修改后的文字、影响。

问题在后一步：表里的每一处修改，我都要自己回到 Word 里按条款号翻找，再肉眼确认是哪一句。合同动辄几十页，修改点有十几处，这一步比对比本身还费时间。

我希望表里每个修改点都能点：点“违约金为合同总额的 10%”，就打开修改后的合同，滚动到那一句并高亮；点原版那一列，就在原版里高亮对应的原文。

**更一般的需求：** 点击 AI 输出里的内容，让插件做点什么。高亮只是其中一种。表格插件里“定位到 Sheet2 的 B3:D9 并筛选”、PDF 插件里“跳到第 12 页并框选”、地图插件里“飞到某个坐标”，都是同一类需求：AI 的回复里放一个入口，点一下，插件里就有反应。

**现在做不到的原因（读代码得出）：**

- AI 回复里的链接，点击后只会 `previewFile` 打开文件。`localFileLinkPath` 会丢掉 `#` 和 `?` 之后的内容，所以 `合同.docx#要高亮的文字` 打开文件后，文字到不了插件。
- 插件已有“定位来源”能力（`references.onReveal`），但入口只有用户消息里的引用卡片；助手消息里没有引用卡片，也没有别的入口能触发它。
- 插件的命令只能从命令面板、菜单、Slash 触发，没有“聊天内容里的链接”这个入口。

### 期望的体验 / Desired outcome

1. AI 回复里可以放可点击的链接，点击后在对应的插件里做一件事。
2. **最常见的一种由宿主统一提供：** “在文档里定位并高亮这段文字”。AI 只要引用原文，任何接管了该文件格式的插件都能响应，不需要 AI 知道每个插件的细节。
3. **其余动作由插件自己定义**：插件声明有哪些动作、各接受什么参数，点击时执行插件自己的逻辑。AI 怎么知道有这些动作，可以交给插件自带的 skill。
4. 点击才触发；动作必须是插件声明过的；会改动内容的动作要先让用户确认。宿主不支持或插件被停用时，链接退化成普通文字或“打开文件”，不报错。

### 当前做法或替代方案 / Current workaround or alternatives

- 让 AI 在表里写“第 5.2 条第 3 款”，用户自己在 Word 里翻。条款号对不上、没有编号的段落、AI 转述不准时就找不到。
- 在文档插件里选中文字“引用到聊天”可以回到原位置，但这是用户反向操作，AI 列出的修改点用不上。

### 补充材料 / Additional context

**现状（代码依据，基于 upstream/master 09bd98c57，未运行）**

- 链接分发：`DesktopMarkdownContent.vue` 的 `handleLinkClick` 对 `http(s)` 走 `openWebLink`，其余 `emit('openLink', href)`；`BuddyChatMessageContent.vue` 的 `handleMarkdownLink` 只调用 `chatContent.previewFile(href, source)`。
- 插件侧已有的零件：`references.onReveal`（`api.d.ts` 465 行，处理函数收到 `{ referenceId, text, locator }`，返回是否已定位）；`commands`、`menus`、`slash` 共用同一个处理函数，`CommandInvocation.target` 有 `message.actions`（136 行）但没有“链接”；`contributes.skills` 可以随插件分发使用说明。
- 我们在下游分支里有一个 DOCX 插件在用 `onReveal`（引用卡片点“定位来源”后选中并滚动到原文），验证到无头 Chromium 加模拟宿主的冒烟级别。所以插件侧“按文字定位并高亮”是现成的，缺的是聊天里的入口。

**一种可行的做法（供维护者取舍，不要求按此实现）**

1. **标准动作 `reveal`**：文件链接带上文字，例如 `[标签](合同-v2.docx#quote=违约金为合同总额的10%25)`。宿主点击时打开文件和对应插件视图，等会话就绪后调用 `references.onReveal`，`locator` 为 `null`，新增一个可选的 `origin: 'link'` 让插件知道文字可能是转述。不支持的宿主只会打开文件，天然退化。
2. **自定义动作**：清单新增一项（暂名 `contributes.chatActions`），形状和 `menus` 类似，引用自己已声明的命令：`{ id, command, title, access: 'ui' | 'read' | 'write', params, view? }`。`CommandInvocation.target` 增加 `'message.link'`，插件在原来的处理函数里分支即可。`params` 沿用 `agent.tools` 的封闭 schema 子集。
3. **安全边界按“声明 + 校验 + 访问级别 + 用户点击”划，而不是限制动词**：
   - 未声明的动作、参数不符 schema 一律拒绝；
   - `ui` / `read` 点击即执行，`write` 先弹确认（显示插件名、动作标题、参数摘要）；
   - AI 手写的行内链接只允许 `ui` / `read` 且参数为扁平字段，`write` 只能由插件工具生成并冻结参数的链接；
   - 链接上显示的动作名由宿主生成，防止 AI 写的标签误导；
   - 流式输出中不解析、不可点；
   - 安装确认页列出“可由聊天链接触发”的动作，`write` 标高风险。
4. **让 AI 知道怎么写**：标准 `reveal` 在宿主系统提示里补一句；自定义动作由插件自带的 skill 说明用法，不需要宿主另外生成提示。

**没有验证的地方**

- 以上全部是读代码得出的设计，没有实现、没有运行。
- 没有确认 `markstream-vue` 是否放行自定义协议的链接（默认 markdown-it 只拦 `javascript:`、`vbscript:`、`file:`、`data:`），自定义动作链接可能需要放开 `validateLink`。
- 没有确认模型读取 DOCX 的路径，所以“由插件工具生成链接”这一条什么时候能用上还不确定。
- 文字定位依赖 AI 引用的文字与文档一致；转述、标点不同会找不到，只能如实提示“已打开文件，但没能定位到原来的位置”。
- 上游插件的 skill 是全局的（只能在空间里禁用，见 #389 的讨论），自定义动作的说明放在 skill 里会受这一点影响。

合同只是例子，文件、数据和路径均不涉及真实内容。
