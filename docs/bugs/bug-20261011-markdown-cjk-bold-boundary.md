# Bug：中文标点紧贴闭合标记时，Markdown 强调静默失效

**日期：** 2026-10-11<br>
**优先级：** 中（不丢数据、不阻断功能；影响 AI 产出与仓库文档在应用内的可读性，失败时没有任何提示，且应用内两条渲染链路对同类写法结论不一致）<br>
**状态：** 已缓解（2026-10-12：内置系统提示词加一条写作约定；渲染层未改，根治依赖上游，见第 13 节）<br>
**代码基准：** `master` @ `dac111dc`（工作区另有与本问题无关的未跟踪文件 `docs/bugs/bug-20261010-session-reference-responses-optional-cursor.md`）<br>
**环境：** Windows；XTLaw 桌面端（`apps/buddy`）；相关依赖 `markstream-vue` 2.0.17（内含 `stream-markdown-parser` 1.2.19、`markdown-it-ts` 1.1.2）与 `marked` 18.0.13<br>
**范围：** 第 1–12 节为 2026-10-11 的初次分析；2026-10-12 的复核更正、处理结论与上游跟进见第 13 节

## 1. 现象与结论边界

用户在实际文档里看到「列表编号渲染了、加粗没有渲染」，星号原样显示。

先划清边界：**`**快。**Pi` 这类写法不渲染，是 CommonMark 规范要求的结果，不是渲染器实现的缺陷。** 本文记录的是产品侧的问题——这种失败**静默发生**，用户和 AI 都无法从界面判断原因；同一条文本在应用内的两条渲染链路上结论还不一致；仓库自身文档也已经中招。

已知触发形状只有一条：**闭合标记（`**`、`*`、`__`、`_`）左边紧贴中文标点，右边紧贴非标点、非空白字符。**（2026-10-12 更正：开标记一侧有对称的触发形状，见第 13 节。）

对照写法与结果（下一节的实测矩阵是同一批结论）：

| 写法 | 结果 |
| --- | --- |
| `**快。**Pi`（标点留在加粗内，收尾后直接接正文） | **失败，星号原样显示** |
| `**快**。Pi`（标点移到加粗外） | 正常加粗 |
| `**快。**，Pi`（收尾后跟标点） | 正常加粗 |
| `**快。** Pi`（收尾后跟空格） | 正常加粗 |
| `**快。**` 后接换行 | 正常加粗 |
| `**快。**（Pi）`（收尾后跟括号） | 正常加粗 |

## 2. 复现步骤

1. 打开桌面端工作台的文件管理器，打开任意 `.md` 文件，切到预览模式。
2. 写入一行：`1. **快。**Pi 的底层比较精简。`
3. 观察预览区域的这一行。

备用复现（AI 消息区）：让助手输出同一句 `**快。**Pi 的底层比较精简。`，观察消息正文。

## 3. 实际结果

- 预览显示 `1. **快。**Pi 的底层比较精简。`：列表编号渲染了，星号原样留着。
- 同一份文档里的其他 Markdown 语法正常：列表、引用、行内代码、链接都不受影响。
- 界面没有任何提示：没有错误标记、没有提示条，用户无法区分「渲染器坏了」「文件没被解析」「自己写错了」。
- 用户提供的截图里三行同时出现该形状：`**快。**Pi`、`**省钱。**我的…`、`**自由。**Pi 可以…`，全部字面显示。

## 4. 预期结果（两种口径，需用户选一个）

**口径 A（保持规范行为，默认）：** 渲染结果不变，但提供可诊断的反馈；同时把安全写法固化到提示词与文档写作约定里，减少继续产出命中写法。

**口径 B（放宽解析）：** 让「标点在强调内部、收尾后紧接正文」这种中文高频写法也能收尾，与部分中文 Markdown 编辑器行为一致。

两种口径的取舍见第 9、10 节。

## 5. 影响范围

**受影响界面（共用同一个渲染组件 `DesktopMarkdownContent.vue`，底层是 `markstream-vue`）：**

| 界面 | 入口 |
| --- | --- |
| 文件管理器 `.md` 预览 | `apps/buddy/src/modules/files/widgets/DesktopFilePreview.vue:26`、`:74` → `apps/buddy/src/shared/ui/files/DesktopDocumentContent.vue:28` → `apps/buddy/src/shared/ui/markdown/DesktopMarkdownContent.vue:135` |
| 任务上下文面板的产出预览 | `apps/buddy/src/modules/tasks/widgets/context-panel/DesktopArtifactContextSurface.vue:83` |
| AI 助手消息正文 | `apps/buddy/src/modules/tasks/widgets/transcript/BuddyChatMessageContent.vue:248` |
| 过程叙述 | `apps/buddy/src/modules/tasks/widgets/transcript/BuddyChatNarrationBody.vue:22` |
| 技能详情 | `apps/buddy/src/modules/skills/widgets/DesktopSkillDetail.vue:105` |

**另一条链路（`marked`）：** 思考过程由 `renderChatMarkdown()` 渲染，即 `apps/buddy/src/modules/tasks/widgets/transcript/chatMarkdown.ts:10`（`marked` 18.0.13），调用点在 `.../BuddyChatReasoningBody.vue:9`。它与正文不是同一个解析器，因此同一条文本可能在「思考过程」和「消息正文」里显示不同（删除线对照见第 7 节）。

**不受影响：**

- 用户自己发出的消息：按纯文本显示（`BuddyChatMessageContent.vue:243`，且这是现有测试有意断言的行为）。
- 文件管理器的源码/编辑模式：Monaco 显示原文。
- 代码块与行内代码内的标记：设计上原样显示。

**仓库自身已受影响的文档（未修复，已实测确认渲染失败）：**

| 文件:行 | 命中片段 |
| --- | --- |
| `docs/bugs/bug-20261007-windows-recycle-bin-case-mismatch.md:35` | `**磁盘真实路径（含存储大小写）**与传入路径做` |
| `docs/specs/feature-004-skill-lazy-loading.md:26` | `不遍历附属文件。**用户没有选择技能时` |

**用户内容侧现状：** 触发本问题的视频口播稿已改为安全写法（`**快**。Pi`），该目录现在 0 处命中；同一文件另有一处 `**XTLaw 是基于 Pi 构建的。**，我这个人…`（收尾后跟逗号）当前可正常渲染，但属于同一风险写法。

**严重度判断：** 不丢内容、不损坏文件，风险集中在「AI 写出的成品在 XTLaw 里看起来像坏了」和「仓库文档在应用内不可读」。中文写作没有词间空格，`**结论。**正文` 是很自然的键盘顺序，命中概率不低。

## 6. 成因

**规则（CommonMark 定界符串的左右成对性）：** 一个 `**` 想当「收尾」，要满足：

- 左边不能是空白（空格、换行、行首）；
- 左边不是标点时，右边是什么都可以；
- **左边是标点时，右边必须也是标点（或空白、换行、右括号）。**

不满足就不能收尾，标记只能原样显示。

`**快。**Pi` 的判定过程：收尾 `**` 左边是 `。`（标点）→ 必须看右边；右边是 `P`（既不是标点也不是空白）→ 不满足 → 收尾失败，整段退化为普通文本。开头的 `**` 不受影响（左边是空格或行首），所以问题只出在收尾一侧。

**为什么中文更容易踩：** 中文没有词间空格，`。`、`，`、`、` 是全角标点，写作习惯又把标点留在强调内部，收尾后面紧接着汉字或字母，于是「左边是标点、右边是文字」同时成立。

**解析器链路（实测确认，两者都遵循该规则）：**

- 正文与预览：`markstream-vue` → `stream-markdown-parser` → `markdown-it-ts` 1.1.2
- 思考过程：`marked` 18.0.13

**附带的一致性差异：** 同一个失败形状在删除线上两个解析器结论不同——`~~快。~~Pi` 在 `markstream-vue` 渲染成删除线，在 `marked` 保持字面。即「哪里会失败」在应用内并不统一。

## 7. 证据等级与实测记录

**应用内现象（用户提供，非本次实测）：** 2026-10-11 的会话 `58178b7b-c7d0-4545-86d2-69856a707bcc` 中，用户以截图（会话内附件 `image.png`，25254 字节）加提问「为什么这个渲染加粗渲染不了？」报告；对应文档是准备用于 B 站视频的口播稿，当时已按 `**快。**Pi` 的形式写入。

**实测（本机，2026-10-11）：** 在 `apps/buddy` 下用应用实际使用的依赖做对照渲染，输入为固定短句，按「是否生成 `<strong>`」与「是否残留字面 `**`」判定。未启动桌面应用做端到端点击复现。

| 输入 | `markstream-vue`（正文/预览） | `marked`（思考过程） |
| --- | --- | --- |
| `**快。**Pi` | 字面 | 字面 |
| `*快。*Pi` | 字面 | 字面 |
| `__快。__Pi` | 字面 | 字面 |
| `_快。_Pi` | 字面 | 字面 |
| `~~快。~~Pi` | **删除线** | 字面 |
| `**快。**` 后接换行 | 加粗 | 加粗 |
| `**快。**，Pi` | 加粗 | 加粗 |

**仓库文档扫描（实测）：** 用 `markdown-it-ts` 渲染整份文档，再检查渲染结果里是否仍残留字面 `**`（跳过代码围栏，行内代码内的标记单独排除）。`docs/` 下 37 个 `.md` 文件中 2 处真实命中（见第 5 节表）；同批还扫了视频口播稿目录的 3 个文件，0 处命中。`docs/specs/feature-026-message-links-in-builtin-browser.md:9` 曾被初筛命中，但那段字面标记位于行内代码内，属于有意保留，不计入。

可复用的候选筛选命令（只读）：

```powershell
$files = (Get-ChildItem 'D:\code\Lexora\docs' -Recurse -File -Filter *.md).FullName
Select-String -LiteralPath $files -Pattern '[。，、）]\*\*[^\s。，、）]' -Encoding UTF8
```

该正则会把「开标记」也算作候选，因此只能当筛子用；是否为真实失败，以整份文档的渲染结果为准。

## 8. 为什么现有测试没有覆盖

- **消息正文用例**（`apps/buddy/src/modules/tasks/widgets/transcript/__tests__/BuddyChatMessageContent.spec.ts:23`）用的是 `参考 **说明** 和 [版本](…)`，闭合标记后面是空格；`:10` 的用户消息用例断言的是「不渲染」。没有用例出现「中文标点 + 闭合标记 + 紧跟正文」。
- **过程叙述用例**（`.../__tests__/BuddyChatActivities.spec.ts:313`）用的是 ``**Review complete** with `inline code`.``，闭合标记后面仍是空格。
- **文件预览侧没有渲染用例**：`apps/buddy/src/shared/ui/files/__tests__/fileDocumentPresentation.spec.ts` 只测扩展名识别；`apps/buddy/src/modules/files/widgets/__tests__/fileViewIdentity.spec.ts:21` 把 Markdown 组件整体 mock 掉。也就是说「文件管理器里 `.md` 预览究竟渲染成什么」目前没有断言。
- **思考过程链路没有测试**：`renderChatMarkdown`、`renderChatInlineMarkdown` 在 `*.spec.ts` 中没有命中。
- 综合：三条链路都缺少这一形状的用例；而失败是静默的（不抛错、不留日志），CI 无从发现。

## 9. 修复建议

按成本从低到高：

1. **写作约定（成本最低）。** 在要求模型输出 Markdown 的位置补一条中文标点约定：强调的收尾标记后面必须跟标点、空格或行尾，不要把标点留在强调内部。相关位置：`apps/agent/src/core/skills/direct-invocations/document-assistant/prompt.ts:14`（已要求用 Markdown 表达富文本结构）、`packages/contracts/src/agent/skill.ts:407`；也可在本仓库 `AGENTS.md` 的文档写作提示里补一条。
2. **清理已受影响的文档。** 第 5 节表中 2 处改成安全写法（标点移到标记外），并把上面的候选筛选命令留作复查手段。
3. **补回归用例（防回归必需）。** 至少覆盖 `**文字。**文字`（当前字面显示）与 `**文字**。文字`（加粗）两种形状，落在消息正文与文件预览两条链路。
4. **统一两条链路的解析结论。** 正文用 `markstream-vue`、思考过程用 `marked`，删除线类写法结论不一致。可选方案：思考过程改用同一渲染组件，或在 `chatMarkdown.ts` 对齐解析配置。
5. **可选：放宽解析（需先定口径）。** `DesktopMarkdownContent.vue:139` 已把 `customMarkdownIt` 钩子接到 `markstream-vue`（现用于 `allowImages: false` 时 `md.disable('image')`），可以在同一钩子里插入插件，对「收尾左边是标点、右边是文字」的情况放宽成对性判断。代价是偏离 CommonMark，会与 GitHub、VS Code 等外部预览结果不一致。
6. **可选：让失败可见。** 在 `html-policy="escape"`（`DesktopMarkdownContent.vue:143`）这条路径上，对「疑似未渲染的强调标记」给出可见提示（例如加 `title` 或轻微高亮）。这条只解决「用户无法判断原因」，不改变渲染结果。

## 10. 未决事项

- [ ] 采用哪种口径：保持规范行为 + 提示与约定（A），还是放宽解析（B）？这决定第 9 节第 4、5、6 条是否实施。
- [ ] 仓库现有 2 处文档是立即改写，还是留到下次编辑时顺手改？
- [ ] 是否把候选筛选做成脚本或测试用例（例如放进 `packaging/` 或某个 spec）。
- [ ] 「用户消息按纯文本显示」当前是有意设计，本次不动；是否需要单独立项讨论。

## 11. 术语与文件说明

| 原名称 | 中文含义 | 用途 |
| --- | --- | --- |
| `markstream-vue` | 流式 Markdown 渲染组件（2.0.17） | 文件预览、AI 消息正文、过程叙述的渲染 |
| `stream-markdown-parser` | 流式 Markdown 解析包（1.2.19） | 组合 `markdown-it-ts` 与其插件，供 `markstream-vue` 使用 |
| `markdown-it-ts` | `markdown-it` 的 TypeScript 移植（1.1.2） | `markstream-vue` 实际使用的解析器 |
| `marked` | 另一个 Markdown 解析库（18.0.13） | 思考过程 `renderChatMarkdown()` 使用 |
| `DesktopMarkdownContent.vue` | 桌面端统一 Markdown 组件 | 上述受影响界面的共同入口 |
| `customMarkdownIt` | 组件对外暴露的解析器定制钩子 | 现有 `allowImages: false` 用它禁用图片 |
| 右成对性（right-flanking） | CommonMark 判定标记串能否「收尾」的规则 | 本问题的直接成因 |
| 字面显示 | 标记未参与渲染、被当成普通文字输出 | 本问题在界面上的表现 |

## 12. 交付检查

- 只新增本文档；未修改代码、依赖、配置或提示词，未提交 Git。
- 结论区分「本机实测」「用户提供的应用内现象」「未验证（未做端到端点击复现）」。
- 未把规范行为写成渲染器缺陷；产品侧问题（静默失败、链路不一致、无提示）与规范行为分开记录。

## 13. 2026-10-12 复核与处理结论

### 13.1 更正

- **开标记一侧同样会触发。** 开标记左边是文字、右边是标点时（如 `这是**“重点”**内容`、`依据**《民法典》**第五条`、`说明**「A」**。`），CommonMark 也不承认它能开始强调。第 1、6 节"只有收尾一侧"的说法不完整。
- **第 7 节的对照表是直接用底层解析器跑的，不等于应用内结果。** `markstream-vue` 在解析结果上还有自己的补救逻辑。用桌面端实际组件 `DesktopMarkdownContent.vue` 做服务端渲染（`final` 为 true 与 false 都测了）的结果如下：

| 输入 | 应用内实际结果 |
| --- | --- |
| `说明**「A」**。`（单独一处） | 能加粗，靠的是 markstream 的补救逻辑 |
| `说明**「A」**。和**「B」**。` | **加粗错位**：加粗了 `「A」`、`。和`、`。` |
| `依据**《民法典》**第五条和**《合同法》**第六条` | **加粗错位**：加粗了 `《民法典》`、`第五条和`、`第六条` |
| `**快。**Pi 的底层` | 星号原样显示 |

加粗错位比原样显示星号更隐蔽：页面看起来正常，只是加粗了错误的字。

### 13.2 渲染层方案调研（未采用）

- 业界方案是 [markdown-cjk-friendly](https://github.com/tats-u/markdown-cjk-friendly) 规范：把中日韩标点当作普通文字参与判定，不含中日韩字符的文本结果不变。ZCode（`zai-org/ZCode`）在 `packages/ui/src/components/ai-elements/message.tsx` 中通过 Streamdown 的 `@streamdown/cjk` 与 `remark-cjk-friendly-gfm-strikethrough` 接入，属于 remark 体系，不能直接搬到 XTLaw。
- markdown-it 版插件 `markdown-it-cjk-friendly` 3.0.0 靠替换 `md.inline.State` 接入；`markdown-it-ts` 1.1.2（以及打包它的 `stream-markdown-parser` 1.2.19，`dist/index.js:4444`）写死了 `new StateInline(...)`，插件装上会被静默忽略。截至 2026-10-12，三个包（作者均为 Simon He）的最新版都没有改动这一点；`markstream-vue` 2.0.18 仍依赖解析层 1.2.19。
- 本地验证过两种可行做法：手写同一规范的判定（约 100 行），或给插件一个空基类、把它的 `scanDelims` 装到每个解析状态上（约 10 行）。两者都要通过 `customMarkdownIt` 接入，这会让 `markstream-vue` 在流式输出时关闭增量复用；而且都依赖解析器内部细节。权衡后不采用，相关代码均已撤回。

### 13.3 采用的缓解措施

在桌面端基础系统提示词 `LEXORA_BUDDY_BASE_SYSTEM_PROMPT`（`apps/buddy/service/src/agent/resources/createBuddySystemPrompt.ts`）末尾加了一行：

```text
In Chinese Markdown, put punctuation outside emphasis markers: write `**结论**。` and `“**重点**”`, not `**结论。**` or `**“重点”**`.
```

推荐写法用 `markdown-it-ts` 1.1.2 验证过，均能正常加粗：`先说**结论**。正文`、`这是“**重点**”内容`、`依据《**民法典**》第五条`、`说明「**A**」。和「**B**」。`。

局限：

- 只约束 AI 之后的输出，不修复已有内容，模型也可能偶尔不遵守。
- 思考过程链路（`marked`）、网页端文档助手提示词（`apps/agent/.../document-assistant/prompt.ts`）以及第 5 节列出的 2 处仓库文档，本次都未处理。

### 13.4 上游跟进

- 已向渲染组件作者提交 issue：[Simon-He95/markstream-vue#786](https://github.com/Simon-He95/markstream-vue/issues/786)。内容包括错位实例，以及建议 `markdown-it-ts` 像原版 markdown-it 一样改用 `new this.State(...)`，让 `markdown-it-cjk-friendly` 能直接接入。
- 同一行提示词以 PR 形式提交给上游 useLexora，并说明这只是缓解措施，根治要等渲染层修复。
- 上游支持插件接入后，渲染层只需在 `DesktopMarkdownContent.vue` 的 `customMarkdownIt` 里加 `md.use(markdownItCjkFriendly)`；届时再评估是否保留这行提示词。
