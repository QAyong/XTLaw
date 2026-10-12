# Bug：引用会话检索失败——Responses 可选参数语义风险与错误恢复不足

**日期：** 2026-10-10  
**优先级：** 高（建议；影响引用会话的可靠读取）  
**状态：** 已修复（2026-10-12，已在本地提交，未推送）；根因已按日志证据修订，见“修复结果”；真实模型实测与其余建议项见该节末尾  
**代码基准：** `master` @ `f04de95ecf602f7eaf60d9a3178f7d7115949cd3`；排查开始时工作区干净  
**环境：** Windows；XTLaw 安装版；安装包内应用版本字段为 `0.1.1`，Pi 依赖 `@earendil-works/pi-ai` / `@earendil-works/pi-coding-agent` 均为 `1.1.0`  
**范围：** 第 1–10 节是排查时的问题记录与证据（当时未改动实现）；修复结果、验证与业界对照见本文开头的“修复结果”一节  

## 修复结果（2026-10-12）

### 根因修订

排查后期读取本机会话日志（`~/.xtlaw/buddy` 下的 Pi 会话文件）得到比下文第 1–4 节更直接的证据，**下文“strict 被省略”不再作为根因**：

- **复现范围**：两个会话，共 18 次失败调用（`494410e1`：10-10，8 次；`38616518`：10-11，10 次），全部来自 `gpt-6-luna`（OpenCode Go 内置提供商，`openai-responses`）。
- **同接口的对照**：`gpt-6.1-sol`（OpenAI，`openai-responses`）在同一工具上 6 次调用，全部省略可选字段或使用合法游标；`deepseek-v4.1-flash`（`openai-completions`）的 2 次搜索均省略游标并成功，且在 `38616518` 里 `gpt-6-luna` 连续失败后切到它，第一次调用即成功。
- **满填习惯**：`gpt-6-luna` 的 18 次搜索调用每次都把 5 个字段全部填满（`kind: "all"`、`resourceOffset: 0` 等）。合法的中性值（`"all"`、`0`）没有造成任何错误，唯一失败的是**没有合法空值的字符串游标**，它只能编造 `"0"`、`"start"`、`" "`（满足 `minLength: 1`）、`"latest"`、会话 ID。
- **不依赖 strict**：同一模型在其他工具上同样满填（`read` 194/194、`ls` 30/30、`find` 26/26），在 `openai-codex-responses`（`strict: null`）上 `read` 也是 715/715。因此“普通 Responses 省略 strict 导致服务端规范化”不是必要条件；它仍是代码层面的差异，但不能当作本次根因。
- **设计缺陷**：一个**可选**的参数，值必须是**真实消息 ID**，且没有合法的“空”写法。对习惯满填的模型，这个契约天然无法被正确填写。

### 修复

把模型可见的消息续翻从“消息 ID 游标”改为“数字偏移”，与资源一侧已有的 `resourceOffset` 一致：

- `messageOffset`（整数，≥ 0，0 或省略表示新搜索）取代 `beforeMessageId`；结果里的 `nextBeforeMessageId` 改为 `nextMessageOffset`。页面边界只在 `searchConversationHistory` 内部使用，模型无法填出一个无效值。
- 偏移超过历史长度返回空页和 `nextMessageOffset: null`；最后一个命中恰为最旧一条时直接返回 `null`，不再多一次空翻页。
- 修改文件：`sessionReferenceToolContract.ts`、`searchConversationHistory.ts`、`sessionReferenceExtension.ts`（均在 `apps/buddy/service/src/conversations/`）。UI 自己的消息翻页（`messagePageCursor.ts`）是另一套机制，未改。
- 同时移除本地 `lexora_session_ask` 并让会话引用其余部分与上游一致，见 [第四轮集成记录](../upstream-round-4-integration.md) 的“后续调整”。

### 与上游的差异

有意偏离上游共三处，下次合并上游时这些文件保留本地版本（详见 [第四轮集成记录](../upstream-round-4-integration.md)）：

1. **数字页码**：上游契约仍是 `beforeMessageId` / `nextBeforeMessageId`，同样的问题在上游会出现。
2. **授权在同一对话内持续有效**：上游只对最新一条用户消息里附加的会话授权。
3. **引用链**：被引用会话里用户亲手附加过的会话也可读，下一层引用作为文本标记保留在结果里（对齐 ZCode）。

### 验证

- 新增/修改用例：满填所有可选字段的真实 Pi 会话调用；偏移续翻不丢不重；偏移越界；整页命中后偏移精确；`beforeMessageId` 已被契约拒绝；有界扫描后继续翻页。
- 授权放开用例：真实 Pi 会话中，后续消息（含下一次提问）不再附加引用时仍可搜索被引用会话，未引用的会话返回 `SESSION_REFERENCE_NOT_AUTHORIZED`；已放弃分支上的引用不计入；被引用会话全部删除后不再披露工具。临时去掉“沿分支收集更早引用”后这 4 个用例会失败，确认用例有效。
- 引用链用例：下一层引用以 `[SESSION:id]` 文本标记和 “Referenced tasks” 清单出现在搜索/读取结果里；深度上限（第 4 层的 ID 可见但不可读）、环路终止、用户手打的同形标记被转义且不产生授权、不相关会话与已放弃分支上的引用不被带入、携带引用的会话被删除后沿它到达的会话立即失去授权、一条消息可到达的会话数有上限；把标记渲染去掉、去掉转义、把深度上限调大或去掉“携带会话仍可读”的检查，对应用例会失败。
- 会话相关测试共 24 个文件、185 个用例：180 通过、1 跳过、4 失败；4 个失败都是 Windows 环境问题，与本次改动无关（`BuddyTurnLauncher.spec.ts` 1 个用例因创建符号链接需要权限而 `EPERM`；`toolPolicyExtension.spec.ts` 3 个用例以 `/tmp` 作工作目录，在 Windows 上被判为 `INVALID_PATH`，它们依赖的文件本次均未改动）。`vue-tsc -b` 与相关文件 ESLint 通过。未跑全量测试或打包。

### 已知边界与未做

- **未用真实模型实测**：需要用 `gpt-6-luna` 引用一个会话再试一次，确认首次搜索即成功。
- **翻页期间新增消息**：偏移从最新一条开始计数，若被引用的会话在翻页过程中又有新消息，相邻页可能出现重复，不会遗漏。
- **旧会话沿用旧参数**：模型若沿用历史里的 `beforeMessageId`，会收到参数校验错误（列出多余字段并回显参数），可自行恢复。
- **授权范围已放开（用户决定，2026-10-12）**：引用在同一会话的后续消息里继续有效，不再“撤出工具、返回 `notFound`”；只覆盖用户在当前活动分支上显式附加过的会话，不开放任意会话。因此第 3 节“新消息无显式引用时不继承旧权限”的预期不再适用，原始事故后半段（后续追问读不到会话）也随之消除。该会话的引用目前没有界面入口可以撤销，要停止授权只能新开会话或删除被引用会话。
- **引用链（用户决定，2026-10-12，对齐 ZCode）**：被引用会话的活动分支上用户亲手附加过的会话，也可以读取，最多再沿 3 层、整体不超过 24 个会话；环路和当前会话自身被忽略。下一层引用像 ZCode 那样作为文本保留在搜索/读取结果里：行内 `[SESSION:id]` 标记加一行 `Referenced tasks: [...]` 清单，搜索“Referenced tasks”即可列出这些消息；用户手打的同形标记会被转义，授权只看数据里的 `sessionReferences`，不看文本。只沿用户显式附加过的引用走，不开放无关会话，也不把其他对话里的引用带过来。
- **未做**：strict 策略未改动（不对第三方网关无差别添加字段）。

### 业界对照：引用链上的会话（2026-10-12）

读了开源项目 [zai-org/ZCode](https://github.com/zai-org/ZCode) 的源码，并核对 Amp、Claude、Cursor、Zed 的官方资料，关注点是“被引用的会话里又引用了别的会话时，别人怎么处理”。

| 产品 | 怎么处理被引用会话里的引用 | 授权依据 |
|---|---|---|
| ZCode | **没有链路专用代码**。输入里选的会话写成 `[#标题](#sess_id)`，消息文本原样保存；读取工具返回的转录会保留这些标记（`session-context/parts.ts` 只过滤系统提醒和内部合成内容）。模型看到下一层 ID 后再调一次 `ReadSessionContext` 即可，没有深度或数量上限 | 读取处理函数不校验“是否被引用过”，边界是“同一个本地会话库”；子代理的工具集里去掉该工具（注释写的是“越界读父会话”） |
| Amp | `read_thread` 按线程 URL/ID 读取；官方资料里没有找到链路专用逻辑 | 以“你是否有权访问该线程”为准（自己的、工作区、公开） |
| Claude | 不存在“沿链读取”：AI 在项目范围内自行搜索过去对话 | 项目外搜全部对话，项目内只限该项目；设置里可关闭 |
| Cursor、Zed | 不存在“沿链读取”：只附加用户主动选的会话或摘要 | 只含用户主动附加的 |

结论：业界**没有“引用链授权”这个机制**。工具读取不绑定“某条引用”，下一层 ID 只要出现在文本里就能被读取，因此不需要单独定义链路。本项目的读取绑定用户显式引用，所以必须自己规定链路规则：沿用户亲手附加的引用往下找（最多 3 层 / 24 个会话），并像 ZCode 那样把下一层引用作为文本留在结果里，让下一层 ID 可被发现。

可借鉴但未做：按关键词找会话的工具（Amp `find_thread`、Claude 的过去对话搜索）；`handoff` 式交接摘要（ZCode 用小模型抽取而不是原样返回）；用户级开关；对子代理和自动化默认不开放。

## 1. 背景与结论边界

用户引用一段刚停止的历史会话，要求在新会话中继续任务。助手提示“引用会话的正文检索没有成功”，随后多次检索仍失败。另一次正确调用可以读取原会话。

不能仅凭“模型传错参数”认定全部责任在模型，也不能把服务端拒绝无效游标视为数据库缺陷。本次检查得到三个需要分开处理的现象：

1. **已确认的直接原因：** 模型连续传入不存在的分页边界，检索接口返回无效游标错误。
2. **已确认的客户端兼容性缺口：** 普通 Responses 适配路径默认可能省略 `strict`（工具参数严格模式开关），而省略并不等价于明确发送 `strict: false`。本地工具定义中的“可选”语义可能在服务端规范化时发生变化。
3. **独立的后续现象：** 用户后续消息没有再次携带显式会话引用，读取工具按本轮授权规则撤出可用列表。这不是原会话正文消失；但现有提示未清楚区分引用授权失效与工具不存在。

**尚未确认：** 当时使用的兼容服务是否真的把游标变成必填。历史日志没有保存该服务处理后的参数定义，不能把这种合理解释写成已证实根因。

## 2. 原始会话与历史操作步骤

| 材料 | 会话 ID | 用途 |
|---|---|---|
| 被引用会话 | `461f8267-eae7-45f6-afd9-387681a1dc99` | 官网下载计数任务的原始上下文 |
| 读取失败的会话 | `494410e1-04c6-46cd-9d5a-906cebb8ebd4` | 标题为“继续上面的任务：”，包含失败调用与后续解释 |

历史场景：

1. 停止被引用会话。
2. 在新会话显式附加该会话引用，发送“继续上面的任务：”。
3. 助手发现 `lexora_session_search`（搜索引用会话的工具）和 `lexora_session_read`（读取返回来源的工具）。
4. 首次检索即传入 `beforeMessageId: "0"`，随后更换猜测值反复调用。
5. 助手未取得消息来源，转而依据标题和当前可见摘要回答。
6. 用户不重新附加引用，继续追问读取失败原因；后续查找读取工具得到 `notFound`（工具未在当前可用范围内找到）。

以上是历史发生过程，不保证所有模型、接口或新会话都必然输出同样的错误参数。

## 3. 实际结果与预期结果

### 实际结果

- 首轮检索报错：`XTLaw conversation message cursor is invalid`（会话消息分页边界无效）。
- 8 次检索均传入 `beforeMessageId`（向更早消息翻页的边界 ID），没有一次真正省略该参数。
- 猜测值包括 `"0"`、`"start"`、空格、`"latest"` 和会话 ID。
- 助手声称尝试“不带游标”的调用，但对应实际参数仍包含 `"0"`；恢复说明与执行不一致。
- 后续新消息未携带引用时，工具发现结果为 `notFound`，助手未准确说明本轮引用授权已经失效。

### 预期结果

- 首次检索不提供分页边界；需要翻页时，只使用工具返回的 `nextBeforeMessageId`（下一页边界 ID）。
- 客户端选择明确的参数严格模式策略，不依赖 Responses 服务端对省略字段的默认行为来维持可选参数语义。
- 收到无效边界时，错误结果提供可执行的纠正指引，而不是诱导模型继续猜值。
- 本轮没有显式引用时，明确说明需要在新消息重新附加引用；不得静默继承历史授权。
- 未取得正文时，明确区分“根据标题/摘要回答”和“基于原文回答”。

## 4. 已确认的技术证据

### 4.1 原始工具定义没有把游标设为必填

`sessionReferenceToolContract.ts`（引用工具参数契约文件）使用 `Type.Optional(...)` 定义游标。历史会话保存的工具定义同样只要求 `sessionId`（目标会话 ID）：

```json
{
  "required": ["sessionId"],
  "properties": {
    "beforeMessageId": {
      "type": "string",
      "minLength": 1,
      "maxLength": 128,
      "description": "nextBeforeMessageId from the previous message search."
    }
  }
}
```

以上为省略其他字段后的摘录，不是完整工具定义。没有发现工具注册阶段直接把游标改为必填的情况。

### 4.2 模型适配层省略了 strict 字段

历史助手消息记录的接口为 `openai-responses`（普通 Responses 接口），模型为 `gpt-6-luna`。排查时保存的该模型配置没有声明 `supportsStrictMode`（是否支持发送严格模式字段），请求目标不是 OpenAI 官方直连地址。

Pi 适配代码路径：

- `openai-responses.js`（普通 Responses 请求适配器）的默认能力值为 `model.compat?.supportsStrictMode ?? false`。
- `openai-responses-shared.js`（Responses 工具转换逻辑）只有在能力值为真时，才把 `strict` 写入函数工具定义。
- 没有启用严格 schema 的情况下，转换器本可发送 `strict: false`；但能力值为假时，字段被整体省略。

使用历史工具定义与排查时保存的模型配置做离线请求检查，截获请求参数后主动终止，未向模型服务发送诊断请求：

| 检查配置 | 出站 strict 字段 | 必填列表 | 游标的空值语义 |
|---|---|---|---|
| 保存的原配置 | **省略** | 仅 `sessionId` | 字符串，不接受 `null` |
| 显式声明支持 strict 字段 | `false` | 仅 `sessionId` | 仍可省略 |
| 显式要求严格 schema | `true` | 全部属性列入必填 | 游标转换为字符串或 `null` |

**证据限制：** 离线结果重建的是本地请求生成行为，不是对历史网络请求的抓包；排查时模型配置的快照也不能证明服务端当时的所有设置。历史工具定义、调用参数和接口类型则来自实际会话日志。

### 4.3 Responses 的默认行为与省略字段的风险

OpenAI 官方函数调用文档说明：

- `strict: true`（严格模式）要求对象禁用额外属性，所有属性列入必填；可选字段可用 `null`（空值）表达。
- Responses 省略 `strict` 时，会尝试把参数定义规范化成严格模式；不兼容时可回退到非严格模式。
- 明确退出该默认行为应发送 `strict: false`。
- Chat Completions 默认仍为非严格模式。

来源：<https://developers.openai.com/api/docs/guides/function-calling#strict-mode>，2026-10-10 查阅。

因此，“本地声明为可选”不能直接证明“模型最终接收到的定义允许省略”。但当时兼容服务的处理过程尚未取得，不能断言它一定强制模型补齐游标。

### 4.4 本地校验与分页行为

离线检查 `validateToolArguments()`（Pi 工具参数验证函数）得到：

| 输入 | 本地验证结果 |
|---|---|
| 仅提供目标会话 ID | 通过，游标仍省略 |
| 可选游标及资源偏移为 `null` | 删除不接受空值的可选字段，按省略处理 |
| 游标为 `"0"` | 通过字符串结构校验；不会自动变成省略 |

`conversationHistoryRepository.ts`（会话历史仓储）随后验证分页边界是否为该会话可见分支中的真实消息。`"0"` 等无效值在这一层被拒绝，属于正确的边界保护，不能为了恢复而放宽成“任意 ID 都能读取”。

### 4.5 停止会话与第一次检索的时序

下列时间来自日志，均为 UTC：

| 时间 | 事件 |
|---|---|
| `2026-10-10T04:25:58.127Z` | 被引用会话记录了一条完成的助手消息 |
| `2026-10-10T04:26:02.925Z` | 记录停止前的最后一次消息完成事件 |
| `2026-10-10T04:26:02.939Z` | 运行取消完成，错误码为 `RUN_CANCELLED`（用户取消运行） |
| `2026-10-10T04:26:41.736Z` | 新会话第一次检索，传入 `"0"` |

停止完成到第一次检索约 39 秒。结合明确的无效游标错误，本次不应优先归因为停止瞬间保存竞态。这不证明其他停止场景完全不存在时序问题。

### 4.6 后续工具不可用符合当前本轮引用规则

`createSessionReferenceCapability()`（建立引用检索能力的函数）从最新用户消息读取 `sessionReferences`（显式引用元数据）；有引用时才披露工具，也只授权列表中的会话。

历史记录中：首次“继续上面的任务”含有引用；后续“你为什么读取不到这个会话的内容？”和“那你不能基于原文”均没有再次携带引用。后续工具发现失败与这项规则一致。

这属于独立的可用性提示问题，不应通过让历史引用无限继承来解决。

## 5. 影响范围与接口对照

应按实际接口协议、客户端适配与中转服务分类，不按模型品牌简单分类。

| 接口路径 | 当前检查结论 | 尚未完成的验证 |
|---|---|---|
| `openai-responses`（普通 Responses） | 已确认默认可能省略 `strict`，存在可选参数语义风险 | 历史兼容服务是否规范化字段、真实服务端回归 |
| `openai-completions`（Chat Completions） | 官方默认非严格；未发现相同默认严格化问题 | 不同中转服务是否改写参数 |
| `anthropic-messages`（Anthropic 原生） | 当前引用工具不主动启用严格转换，保留原始必填列表 | 各真实服务与模型的端到端表现 |
| Google/Gemini 原生接口 | 当前引用工具不主动启用严格 schema 转换 | 不同模型版本与真实服务表现 |
| `azure-openai-responses`（Azure Responses） | 默认支持发送 strict 字段，当前普通工具转换可明确发送 `false` | 能力配置覆盖后的行为与真实服务回归 |
| `openai-codex-responses`（Codex/ChatGPT 登录） | 当前默认发送 `strict: null`，不是明确的 `false` | 服务端对空值的解释及可选参数行为 |

“未发现同类问题”只代表本次代码检查结果，不等于保证这些模型不会误用工具。其他品牌模型若经中转转换成 Responses，也可能受到同类风险影响。

通用影响还包括：无效游标恢复指引不足、无法区分本轮缺少引用和工具不存在，以及未读取原文时解释不准确。

## 6. 验证记录

以下是 2026-10-10 排查时执行的已有定向测试，不是新增回归用例，也不是修复后验收。

测试文件均位于 `apps/buddy/`（桌面应用目录）下：

| 测试文件 | 用途 | 结果 |
|---|---|---|
| `service/src/conversations/__tests__/sessionSearch.spec.ts` | 会话授权、活动分支、搜索与续页 | 6 通过 |
| `service/src/conversations/__tests__/messagePageCursor.spec.ts` | 分页游标范围校验 | 2 通过 |
| `service/src/providers/__tests__/ToolCallArguments.spec.ts` | 完整工具参数解析及调用安全性 | 9 通过 |
| `service/src/providers/__tests__/BuiltinProviderInstances.spec.ts` | Provider 实例与原始接口身份转换 | 9 通过 |
| `service/src/conversations/__tests__/sessionMaterials.spec.ts` | 消息、附件与交付物读取 | 6 通过、1 跳过 |

合计：**32 通过、1 跳过**；未运行全量测试、类型检查或打包。

执行命令（从仓库根目录运行；`vitest run` 是定向测试命令）：

```powershell
pnpm --filter @uselexora/lexora-buddy exec vitest run --project=runtime service/src/conversations/__tests__/sessionSearch.spec.ts service/src/conversations/__tests__/messagePageCursor.spec.ts --maxWorkers=2
pnpm --filter @uselexora/lexora-buddy exec vitest run --project=runtime service/src/providers/__tests__/ToolCallArguments.spec.ts service/src/providers/__tests__/BuiltinProviderInstances.spec.ts --maxWorkers=2
pnpm --filter @uselexora/lexora-buddy exec vitest run --project=runtime service/src/conversations/__tests__/sessionMaterials.spec.ts --maxWorkers=2
```

额外检查：

- 已检查安装包中引用工具契约、检索、权限范围及应用请求补充逻辑，与本次检查的源码逻辑一致。
- 安装包中 Pi 的普通 Responses 适配器、共享转换器、严格 schema 转换器与参数验证文件，均与工作区已安装依赖做字节比对，结果一致。
- 离线请求检查确认省略 `strict` 的行为；没有读取或输出认证密钥，也没有向兼容服务发送真实诊断请求。

现有测试通过不能覆盖本次缺口：已执行的用例验证本地契约、检索和参数安全性，没有证明缺少 `strict` 的请求经服务端处理后仍保留省略语义。

## 7. 初步判断与处理建议

### 已确认的问题

1. 模型输出无效分页边界，且连续猜测参数，没有按返回的边界续页。
2. 普通 Responses 适配层未明确表达非严格策略，存在接口默认行为导致语义变化的兼容性缺口。
3. 错误文案只有通用无效游标信息，缺少首次调用与续页的纠正指引。
4. 本轮引用失效时的工具可用性解释不足。

### 待确认的诱因

- 兼容服务是否把原本可省略的游标转成了必填非空字符串。
- 若服务端确实允许省略，错误补参是否主要来自模型自身行为。
- Codex 的 `strict: null` 与其他兼容服务的省略/空值行为是否存在同类风险。

### 修复顺序建议（尚未实施）

1. **优先处理出站参数语义。** 对支持相应字段的 Responses 服务明确选择 `strict: false`，或选择正确的严格 schema 并把可选字段变成可为 `null` 的参数。不要对不支持 strict 字段的全部第三方服务无差别添加字段。
2. **补请求层回归。** 从实际工具契约经过 Provider 转换后检查最终请求；覆盖初次加载与动态发现后的工具定义，防止只验证本地声明、不验证出站语义。
3. **补明确的恢复指引。** 无效游标错误说明：首次搜索省略 `beforeMessageId`；续页只使用上次返回的 `nextBeforeMessageId`；禁止把 `"0"`、`"start"`、`"latest"` 或会话 ID 作为占位值。
4. **区分引用失效与来源不存在。** 不继承旧授权；在当前可用性提示中说明本轮缺少显式引用，以及安全的重新附加方式。
5. **为服务端验证设清晰边界。** 若需要真实链路验证，使用无敏感内容的测试会话与工具；诊断只记录接口类型、严格策略、必填字段与调用结果，不记录令牌、完整历史正文或未脱敏请求。

不建议把所有无效游标默默当作第一页。这会掩盖分支变化、错误边界或错误调用，导致重复读取、漏读或错误恢复。

## 8. 验收与回归清单

- [x] 首次只传目标会话 ID 能成功检索；模型可见的续翻参数是数字偏移，没有需要伪造的字符串游标。
- [ ] Responses 出站严格策略明确；选择严格 schema 时，可选字段有可为 `null` 的合法表示。
- [x] 可选空值经验证后按省略处理；所有可选字段填满中性值（`kind: "all"`、两个偏移为 0）时调用成功（自动化覆盖，未用真实模型）。
- [ ] 首次发现工具和动态加载工具后的出站定义都保留同一策略。
- [x] 真实返回的 `nextMessageOffset` 可连续读取，不丢消息、不重复返回同一页（静态历史下）。
- [x] 旧的 `beforeMessageId` 被契约拒绝；模型已无法提交无效边界。UI 翻页的游标校验保持不变。
- [ ] 发生来源删除、活动分支变化和取消时仍保持现有拒绝或撤销行为。
- [x] 授权范围按用户决定放开：引用在同一会话的后续消息中继续有效，仅限显式附加过的会话与当前活动分支，未引用的会话与已放弃分支上的引用仍被拒绝（自动化覆盖）。原“不继承旧权限”的验收项已被该决定取代。
- [ ] Anthropic、Google、Chat Completions、Azure、Codex 路径分别验证；不因普通 Responses 修复而引入统一字段不兼容。
- [ ] 取得兼容服务处理后的证据或安全测试结果，再决定是否把“服务端强制补参”升级为已确认根因。
- [ ] 模型未取得原文时，不再声称已基于完整原文回答，也不声称省略了实际上仍传入的参数。

## 9. 文件与术语说明

| 原名称 | 中文含义 | 用途 |
|---|---|---|
| `apps/buddy/service/src/conversations/sessionReferenceToolContract.ts` | 引用工具参数契约 | 定义搜索、读取的参数及描述 |
| `apps/buddy/service/src/conversations/sessionReferenceExtension.ts` | 引用工具注册与本轮授权 | 控制工具披露、来源访问和执行 |
| `apps/buddy/service/src/conversations/searchConversationHistory.ts` | 历史搜索与消息分页 | 使用返回边界继续搜索 |
| `apps/buddy/service/src/conversations/SessionReferenceService.ts` | 引用来源读取服务 | 读取消息与材料，验证活动分支 |
| `apps/buddy/service/src/storage/conversationHistoryRepository.ts` | 会话历史仓储 | 验证分页边界与可见消息 |
| `apps/buddy/service/src/agent/extensions/discovery/toolDiscoveryExtension.ts` | 按需工具发现 | 根据当前可用范围加载工具 |
| `apps/buddy/service/src/providers/createBuiltinProviderInstance.ts` | 内建 Provider 实例包装 | 转换实例身份，不负责修正 schema |
| `apps/buddy/node_modules/@earendil-works/pi-ai/dist/api/openai-responses.js` | 当前依赖的 Responses 适配器 | 决定默认接口能力并生成请求 |
| `apps/buddy/node_modules/@earendil-works/pi-ai/dist/api/openai-responses-shared.js` | 当前依赖的 Responses 工具转换 | 控制 strict 字段及参数定义 |
| `apps/buddy/node_modules/@earendil-works/pi-ai/dist/api/constrained-sampling.js` | 当前依赖的严格参数转换 | 为可选字段添加合法空值表示 |
| `apps/buddy/node_modules/@earendil-works/pi-ai/dist/utils/validation.js` | 当前依赖的参数验证 | 处理空值、类型与结构校验 |
| `strict` / `supportsStrictMode` | 严格模式开关 / 字段支持能力 | 两者不是同一个概念，字段支持不等于启用严格模式 |
| `beforeMessageId` / `nextBeforeMessageId` | 当前翻页边界 / 返回的续页边界 | 只能使用合法消息来源，不能猜值 |

依赖文件路径用于定位排查基准，不建议直接修改 `node_modules`（已安装依赖目录）；实施时应通过项目受控适配、能力配置或依赖补丁维护。

## 10. 后续处理方式

本次只建立问题记录。依据文档技能的“先记录问题”流程，在新会话中推进：需求与边界确认 → 接口策略设计 → 实现 → 定向验证 → 更新验收记录。Git 暂存、提交、推送和发布需另外明确授权。

相关功能背景：[引用历史会话并按需检索](../specs/feature-003-session-reference.md)。该规格中的本轮显式引用约束仍应保留；本文不把旧版本或已有测试通过等同于本次问题已修复。
