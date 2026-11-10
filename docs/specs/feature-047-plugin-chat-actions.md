# Feature-047：聊天内容触发插件动作（聊天动作）

**日期：** 2026-11-02
**状态：** 草案，待确认（2026-11-02 起草；只读代码得出，未实现、未运行）
**范围：** 宿主 `apps/buddy/src/modules/tasks/widgets/transcript`（消息链接分发）、`apps/buddy/shared/extensions`（清单与能力目录）、`apps/buddy/src/app/workbench`（动作分发与视图就绪等待）、插件 SDK 类型与创作文档；首批接入 `plugins/office`（DOCX），其余 Office 插件随后
**承接：** [Feature-033 文档插件契约](feature-033-document-plugin-contract.md)、[Feature-043 Office 文档引用的“定位来源”](feature-043-office-quote-locate.md)、[Spec-013 工作台选区引用](feature-013-workbench-selection-reference.md)
**上游：** [Issue #542](https://github.com/useLexora/Lexora/issues/542)（2026-11-02 发布；正文见 `docs/drafts/upstream-issue-plugin-chat-actions.md`）

## 1. 背景与问题

**场景（合同对比）：** 律师把原版合同和修改后的合同交给 AI，让它对比并列出修改点：条款、原文、修改后的文字、影响。现在用户要自己在 Word 里按条款号翻找；希望每个修改点都能点，点击后在对应的文档里自动定位并高亮那一处文字。

**更一般的需求：** 点击 AI 输出里的内容，让插件做点什么。高亮只是其中一种；表格里定位并筛选、PDF 跳页并框选、地图飞到某处，都是同一类需求。动作应由插件定义，宿主只负责路由、校验和确认。

## 2. 现状（读代码得出，未实机验证）

- **用户引用的定位链路已有**（Feature-043）：引用卡片点“定位来源”→ 宿主重开文件 → `useExtensionDocumentReveal.ts` 等视图就绪 → `views.revealReference` → 插件 `references.onReveal` 返回 `true` / `false`。DOCX 的实现是 `plugins/office/reveal-quote.js`。
- **AI 输出里的链接只能打开文件。** `DesktopMarkdownContent.vue` 的 `handleLinkClick` 对 `http(s)` 走 `openWebLink`，其余触发 `openLink`；`BuddyChatMessageContent.vue` 的 `handleMarkdownLink`（第 87 行）只调 `previewFile(href, source)`。`shared/files/fileLink.ts` 的 `localFileLinkPath` 丢弃 `#` 和 `?` 之后的内容，非本地协议返回 `null`，所以 `合同.docx#要高亮的文字` 打开文件后，文字到不了插件。
- **引用卡片 `quote_ref` 只在用户消息的结构化内容里**，助手消息没有这种节点；`useChatQuoteNavigation` 需要已保存的 quote 对象。
- **插件已有的入口**：`commands`（含 `hidden`）、`menus`、`slash`，共用同一个处理函数（`commands.md`）。`CommandInvocation.target` 目前是 `composer.actions | task.actions | resource.actions | message.actions | view | slash`，没有“聊天内容里的链接”。
- **Skills**：`contributes.skills` 按需发现，正文不自动注入对话。上游维护者在 #389 里提到插件带的 skill 是全局的，只能在空间里禁用。
- **DOCX 处理器要求位置信息**：`reveal-quote.js` 在 `data.format !== 'docx'` 时直接返回 `false`，`locator` 为 `null`（AI 链接没有位置）时无法只按文字定位，需要放宽。
- **没有确认的两点**：① AI 现在读 DOCX 走哪条路径（`service/src` 里没有 DOCX 专用读取工具，实际走通用文件读取、shell 还是 skill 未确认）；② `markstream-vue` 渲染时是否放行自定义协议的链接（默认 markdown-it 的 `validateLink` 只拦 `javascript:`、`vbscript:`、`file:`、`data:`，实际需要实测）。

## 3. 上游怎么做（读 `upstream/master` 09bd98c57，未运行）

- 上述链接处理（`handleMarkdownLink`、`localFileLinkPath`、`handleLinkClick`）与本地一致，`DesktopMarkdownContent.vue` 只有样式差异。
- 上游已是 API 4：`references.onReveal`（`api.d.ts` 465 行）、`commands` / `menus` / `slash`（136 行含 `message.actions`）、`contributes.skills` 都有。**没有“聊天内容里的链接触发插件动作”。**
- 上游 Issue 搜索（2026-11-02，关键词：插件 链接 定位、onReveal、引用 定位 高亮、docx 合同、reveal、聊天 动作）没有相同建议。相关的只有已关闭的 #389（统一文档插件契约，已由上游 #439 等落地）。
- 所以这是对上游已有 API 4 的增量，不是 XTLaw 私有的主版本；用 `engines.lexora` 下限约束，不新增 `apiVersion`。

## 4. 目标与非目标

**目标**

1. AI 回复里可以放链接，点击后在插件内执行动作；高亮是标准动作，其余由插件定义。
2. 合同对比：每个修改点一条链接，点击后在原版或修改版里定位并高亮对应文字。
3. 复用已有命令处理函数、`onReveal` 和视图就绪等待逻辑，不新增授权模型。
4. AI 输出不可信：动作必须由插件在清单声明，参数过 schema 校验，按访问级别决定是否确认，只在用户点击时触发。
5. 宿主不支持或插件不可用时退化为可读文本或“打开文件”，不报错。

**非目标**

- 不让 AI 调用未声明的命令，不做任意脚本或任意 URL 路由。
- 不改引用卡片、Feature-043 的存储格式和行为。
- 第一期不开放写入类动作（见第 10 节问题 1）。
- 不改 `.github/workflows`，不处理上游同步。

## 5. 方案

### 5.1 概念

- **聊天动作**：一个动作 ID 加一组参数。动作 ID 以插件 ID 加 `.` 开头（沿用贡献 ID 规则），宿主据此找到所属插件，链接里不必再带插件 ID。
- **标准动作 `reveal`**：宿主预置。参数是文字（可带前后文），目标是文件；由接管该文件的视图用 `references.onReveal` 实现。它是跨插件的：AI 不需要知道每个插件的私有动作名，就能让任意文档插件定位原文。
- **自定义动作**：插件私有，在清单里声明，处理函数就是插件自己的命令。

### 5.2 链接形态

| 形态 | 写法 | 参数来源 | 用途 |
| --- | --- | --- | --- |
| 文件定位（标准 reveal） | `[标签](<文件路径>#quote=<百分号编码文字>)`，可选 `&before=…&after=…` | AI 手写 | 高亮原文；旧宿主退化为打开文件 |
| 行内动作 | `[标签](plugin-action:<动作ID>?k=v&…)` | AI 手写，仅扁平的 string / number / boolean | `ui`、`read` 动作 |
| 铸造动作 | `[标签](plugin-action:token/<令牌>)` | 插件工具创建，参数冻结 | 任何允许的动作；`write` 只能用这种 |

协议名用中性的 `plugin-action`，品牌名不进协议。具体编码在实现时确定，上表是示意。

### 5.3 清单：`contributes.chatActions`

与 `menus` 同构，引用自己已声明的命令：

```json
"commands": [{ "id": "p.xlsx.focus", "title": "定位区域", "hidden": true }],
"chatActions": [{
  "id": "p.xlsx.focus-range",
  "command": "p.xlsx.focus",
  "title": "在表格中定位",
  "access": "ui",
  "view": "p.xlsx.document",
  "params": { "type": "object", "properties": { "sheet": { "type": "string" }, "range": { "type": "string" } }, "required": ["range"], "additionalProperties": false }
}]
```

- `id` 以插件 ID 加 `.` 开头；`command` 必须是本插件已声明的命令（需要宿主 `entry`）。
- `access` 必填：`ui`、`read`、`write`。
- `params` 是封闭 schema，沿用 `agent.tools` 的子集与限额；全是扁平字段才允许行内链接。
- `view` 可选：动作需要某个视图时由宿主先确保它已打开；省略则直接调用后台命令。
- `when` 可选，沿用条件函数。最多 16 个。

### 5.4 调用

`CommandInvocation.target` 增加 `'message.link'`，附带 `instanceId` 和 `link: { source: 'inline' | 'minted', role: 'assistant' | 'user' }`。`arguments` 是通过 schema 校验后的 JSON。不传会话、历史和附件，沿用 Slash 的规则。插件在原来的处理函数里按 `invocation.target` 分支，不需要新增一套注册。

标准 `reveal` 不经过命令：宿主调用视图的 `references.onReveal`，`ReferenceReveal` 新增可选的 `origin: 'quote' | 'link'`（用户引用的文字是精确快照，AI 链接的文字可能是转述，插件可据此放宽匹配）。`locator` 为 `null`。

### 5.5 访问级别与确认

| `access` | 例 | 点击行为 |
| --- | --- | --- |
| `ui` | 高亮、跳转、展开面板、切换筛选 | 直接执行 |
| `read` | 读数据再展示 | 直接执行 |
| `write` | 改文档、写数据 | 弹确认，显示插件名、动作标题、参数摘要；只能是铸造链接 |

`access` 是插件自述，宿主无法验证插件实际做了什么。所以：确认策略严格按声明执行；安装确认页列出“可由聊天链接触发”的动作，`write` 标“高风险”，与 `selectedResourceWrite` 一致；非内置来源的插件尤其如此。

### 5.6 路由与等待

1. 点击时解析链接，校验动作已声明、插件已启用、`when` 满足、参数符合 schema、行内链接只含 `ui` / `read`。
2. 文件目标沿用 `previewFile` 现有的任务来源检查；reveal 不扩大读取权限。
3. 需要视图时，按 `accepts` 打开文件和视图，已打开则复用。
4. 等视图会话就绪，上限 10 秒并遵守 `signal`；这段逻辑复用 `useExtensionDocumentReveal.ts`。标准 reveal 不要求“生成引用的同一个插件”，改为按 `accepts` 选出的处理插件，且该视图注册了 `onReveal`。
5. 结果：成功无提示；文件已打开但没定位到，提示“已打开文件，但没能定位到原来的位置”（沿用 Feature-043 的三态）；动作不可用或校验失败，提示“该动作已不可用”，文字保留。

### 5.7 让 AI 知道怎么写

- **标准 reveal**：宿主级的一条短提示（或内置 skill），告诉 AI 引用文档原文时用文件定位链接。放在哪里见第 10 节问题 4。
- **自定义动作**：由插件自带的 skill 教。skill 是插件私有用法的载体，按需发现，不占常驻提示词，随插件启停。宿主不再另行生成“可用动作”提示。
- **铸造动作**：插件工具调用 `invocation.links.create({ action, params, label })`，宿主存下参数并返回令牌，工具结果里直接带现成链接，不依赖 skill。
- **限制**：行内链接依赖模型加载了 skill，只能尽力而为；需要保证出现的场景走铸造链接。上游插件 skill 是全局的，只能在空间里禁用，创作文档要说明。

### 5.8 渲染与失效

- 带 `plugin-action:` 的链接渲染成带插件图标的 chip；悬停显示宿主生成的“插件名 · 动作标题”，不只显示 AI 写的标签，防止冒充。
- 流式输出中（`final=false`）不解析、不可点。
- 插件停用或卸载后链接置灰，文字保留。

### 5.9 创作与工具链

- `plugin-creator/references/` 新增 `chat-actions.md`：链接写法、参数编码、访问级别、skill 写法示例。
- `tools.mjs check`：对没有被任何 skill 提及的 `chatActions` 项给警告（只警告，不阻断）。
- 能力目录登记 `chat.reveal`（标准 reveal 的文本回退）和 `chat.actions`（自定义动作），写明首次出现版本。

## 6. 合同对比场景走查

1. 用户把 `合同-v1.docx`（原版）和 `合同-v2.docx`（修改版）交给 AI，要求对比。
2. AI 读两份文件（读取路径见问题 5），整理差异。
3. AI 输出表格：条款｜原版｜修改版｜影响。原版、修改版两列的文字各是一条 reveal 链接，例如 `[违约金为合同总额的 10%](合同-v2.docx#quote=违约金为合同总额的10%25)`。整条删除的条款只在原版里有，只给原版链接。
4. 用户点击这条链接：宿主校验文件在本任务来源内 → 按 `accepts` 打开 v2 的 DOCX 视图（已打开则复用）→ 等会话就绪 → `onReveal({ text, locator: null, origin: 'link' })` → 插件在文档里按文字查找、选中并滚动 → 返回 `true`。
5. AI 引用的文字与文档对不上（转述、标点不同）：返回 `false`，文件已打开，提示“没能定位到原来的位置”。
6. 之后可扩展（自定义动作，不在本期）：DOCX 插件声明 `ui` 动作，一键并排打开 v1 和 v2，或按条款号跳转；对应的 skill 教 AI 在对比时附上这个链接。

## 7. 兼容

- Feature-043 的引用卡片行为不变；`onReveal` 签名向后兼容（`locator` 本来就可能为 `null`，新增的 `origin` 可选）。
- 不声明 `chatActions` 的旧插件不受影响；文件定位链接对不支持 reveal 的视图退化为“打开文件”。
- 旧宿主：文件定位链接仍是打开文件；`plugin-action:` 链接渲染成不可点的文字。

## 8. 风险与边界

- **标签被 AI 误导或伪造**：chip 上的动作名由宿主生成。
- **提示注入**：文档内容诱导 AI 输出恶意链接。行内链接只允许 `ui` / `read`，`write` 只能铸造且需确认；链接里不携带 `locator`，插件拿到的位置只来自宿主存的快照。
- **`access` 不可验证**：见 5.5，靠声明、安装确认和来源兜底。
- **文字匹配不准**：转述会找不到，如实提示；`before` / `after` 用来消歧；多处匹配时的取舍见问题 7。
- **URL 长度**：`quote` 暂定最多 512 字符，更长的条款用起止片段（`quote=起始&to=结束`）。
- **上游合并**：新逻辑放新文件，上游文件（`BuddyChatMessageContent.vue`、`extensionManifest.ts`）只做小范围替换，沿用 Feature-033 的原则。

## 9. 实施步骤

1. **第一期**：链接编解码；标准 reveal（文本回退，DOCX 放宽 `locator` 为 `null`）；`chatActions` 清单与校验、`ui` / `read` 行内动作；安装确认页展示；创作文档与 `check` 警告。
2. **第二期**：铸造链接（`links.create`）、`write` 动作与确认。
3. **第三期**：PPTX、XLSX、PDF 的文本回退；示例插件与 skill。

## 10. 待确认的问题

1. `write` 动作第一期是否开放？**建议不开放。**
2. 行内链接是否允许 AI 手写参数？**建议允许，限 `ui` / `read` 的扁平参数。**
3. 协议名、清单字段名、能力名是否沿用 `plugin-action`、`chatActions`、`chat.reveal` / `chat.actions`。
4. 标准 reveal 的宿主级提示放在系统提示里，还是做成内置 skill。
5. AI 读 DOCX 的实际路径（决定铸造链接何时能用上）。
6. `markstream-vue` 是否放行自定义协议链接，需要实测；不放行时通过 `validateLink` 选项放开。
7. 多处匹配时选哪一处：第一处、离 `before` 最近的一处，还是提示匹配数量。
8. 向上游：已决定先提 Issue；实现先在本地做，是否另提 PR 看上游反馈。

## 11. 验证计划

- 单测（WSL 可跑）：链接编解码、清单 schema、分发器（失效、取消、超时）、`reveal-quote.js` 的 `locator === null` 回退。
- 类型检查。
- WSL 做不了的：桌面实测、Playwright E2E、打包，回 Windows 本机验收，记录里写“未跑”。

## 12. 验收清单

- [ ] AI 回复里的文件定位链接，点击后在 DOCX 里选中并滚动到对应文字
- [ ] 原版、修改版两份合同各自的链接定位到各自的文档
- [ ] 文字对不上时文件仍然打开，提示“没能定位到原来的位置”
- [ ] 流式输出中链接不可点，完成后可点
- [ ] 未声明的动作、参数不符、行内 `write` 一律拒绝并提示
- [ ] 插件停用后链接置灰，文字保留
- [ ] 旧宿主和不支持的视图退化为打开文件，不报错
- [ ] 安装确认页列出可由聊天触发的动作，`write` 标“高风险”
- [ ] Feature-043 的引用卡片定位不受影响
