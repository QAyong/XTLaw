# Bug：插件模型调用缺少会话上下文，导致 OpenCode Go 标题生成失败

**日期**：2026-10-14  
**优先级**：中（插件后台模型调用在特定提供商下不可用，聊天仍可使用）  
**状态**：根因已确认并经真实请求验证（缺 `x-opencode-session`）；宿主修复已在工作区实现（未提交），插件保持 1.2.2 不变；自动化测试通过；应用内端到端验收未做  
**本地代码基准**：`71bdbf30d6a6ae6af9c5118d3317185d89a95fc0`  
**上游检查基准**：`useLexora/Lexora` 的 `master`，提交 `8a2b8e8f5a609cea9ebbe72c13be5a9d9e8c4494`  
**环境**：Windows，XTLaw 安装版 `0.1.1`；标题自动生成插件 `lexora.auto-title`，版本 `1.2.2`；`@earendil-works/pi-ai` 与 `@earendil-works/pi-coding-agent` 均为 `1.1.0`。

## 1. 问题与结论

用户在聊天输入框中可以正常使用 OpenCode Go，但启用标题自动生成插件后，后台生成标题报错。最初日志只能确认服务端返回 HTTP 400；后续使用本机已保存凭据进行“带／不带会话请求头”的真实请求对照，确认直接原因是缺少 `x-opencode-session`（OpenCode 会话路由请求头）。

**已确认**：

- 插件安装、宿主启动以及自动动作触发成功；失败在模型请求阶段，不是插件未加载。
- 插件调用宿主的 `models.generateText`（插件文本生成接口），宿主未向模型运行时传入 `sessionId`（稳定会话标识）。
- OpenCode 提供商适配层只有收到 `sessionId`，才会自动添加会话路由请求头。
- 相同 OpenCode Go / Claude 模型，不带该请求头返回 HTTP 400、错误类型 `MissingSessionID`；带该请求头返回 HTTP 200。
- 上游对应文件与本地内容一致，且相关依赖版本相同。这不是 XTLaw 品牌或本地定制导致的独有问题；按所检查版本和相同配置，上游存在同样的缺口。

**未确认／不得扩大结论**：

- HTTP 200 不等于标题插件完整运行成功；本次带会话头的短提示词对照输出被截断，不能登记为标题端到端验收通过。
- OAuth（浏览器登录授权）的插件调用尚未实测。代码表明认证和刷新机制已经共用，但不能据此保证所有 OAuth 提供商均无其他兼容问题。
- 不能将此次 HTTP 400 解读为模型不可用、凭据错误或输出上限不兼容。

## 2. 复现步骤

1. 在应用中配置并登录／填写凭据，启用 OpenCode Go 及 `claude-haiku-5-5`（Claude Haiku 5.5 模型）。
2. 确认聊天输入框中该提供商和模型可以正常使用。
3. 安装并启用标题自动生成插件，在插件设置中启用自动命名，并选择上述模型。
4. 新建使用默认回退标题的任务，提交具有明确任务目标的输入，触发 `task:input:committed`（输入提交后自动动作）。
5. 观察标题未自动更新，插件动作失败；检查应用日志中的模型请求与插件动作记录。

注意：排查时读取到的插件内部配置为 `enabled: false`（自动命名已关闭），这是当时的配置快照，不是此前四次已触发请求失败的根因。复现必须先打开插件内部开关。

## 3. 实际结果与预期结果

### 实际结果

2026-10-14 北京时间 22:36—22:40，两个任务共记录到四次标题生成调用失败：

```text
provider.request.failed：HTTP 400
plugins.request.finished：EXTENSION_REQUEST_FAILED，method=models.generateText
plugins.invocation.settled：EXTENSION_AGENT_FAILED
plugins.action.failed：EXTENSION_ACTION_FAILED
```

真实请求取得的服务端错误正文：

```json
{
  "type": "error",
  "error": {
    "type": "MissingSessionID",
    "message": "Request is missing x-opencode-session and cannot be routed efficiently. Please see https://opencode.ai/docs/go/#where-can-i-use-it"
  }
}
```

### 预期结果

插件调用应复用聊天已经使用的公共模型请求基础设施。宿主统一提供供应商所需的会话标识等公共参数，插件只负责自身输入、提示词、模型选择和输出上限，不应由每个插件手工拼接认证和供应商请求头。

## 4. 证据与验证记录

### 4.1 历史日志与动作记录

- 日志文件：`C:\Users\Lenovo\AppData\Local\XTLaw\state\logs\application.1.jsonl`（应用诊断日志）。
- 任务动作数据库：`C:\Users\Lenovo\.xtlaw\buddy\buddy.sqlite3`（本机任务数据库），只读查询 `extension_invocations`（插件动作记录表）。
- 最新失败动作：`7c3ddc3b-e7a4-4fb9-bc4b-aa981d332883`，输入提交触发，状态 `failed`，失败时间 `2026-10-14T14:40:50.380Z`。
- 该时刻日志先记录模型 HTTP 400，再记录插件请求与动作失败。历史日志没有保存服务端错误正文；具体 `MissingSessionID` 由后续对照实验取得，不应伪称来自历史日志。

### 4.2 DeepSeek 实际调用

使用本机已有 DeepSeek 凭据和项目的 `completeSimple()`（非交互式模型请求方法），保留标题插件的 `maxTokens: 256`（输出 token 上限），发送合成测试输入，不发送真实聊天历史。

| 项目 | 结果 |
|---|---|
| 模型 | `deepseek-flash`，本机显示名称为 DeepSeek V4.1 Flash |
| 接口 | `https://api.deepseek.com/chat/completions` |
| 请求 | `max_tokens: 256`、关闭思考、流式输出 |
| 响应 | HTTP 200，`stopReason: stop`（正常结束） |
| 文本 | 检查标题插件失败原因并验证DeepSeek模型调用 |

边界：该实验验证实际模型调用，不是插件自动触发、保存标题的端到端验证，也不说明 OpenCode 同样可以省略会话标识。

### 4.3 OpenCode Go 会话头对照

使用本机已有 OpenCode Go 凭据、同一 `claude-haiku-5-5` 模型、相同短提示词和输入，以及项目依赖中的同一提供商适配层。两次请求仅改变是否提供会话标识，均保留 `max_tokens: 256` 和关闭思考。

| 条件 | 请求头 | 服务端结果 | 生成结果 |
|---|---|---|---|
| 不传会话标识 | 没有 `x-opencode-session` | HTTP 400，`MissingSessionID` | 没有输出 |
| 传入测试会话标识 | 自动带 `x-opencode-session` | HTTP 200 | 有输出，但 `stopReason: length`（达到上限） |

对照足以确认 HTTP 400 的会话标识原因，但带头请求没有完成符合要求的标题，不能用它替代正式验收。后续应使用插件完整提示词和结构化输入验证标题质量、输出结束状态及保存动作。

本次临时测试脚本已删除；未在脚本或文档中保存明文凭据，未修改插件配置、应用代码或开发数据。

## 5. 调用路径与根因

### 已经共用的部分

聊天和插件均使用宿主提供的模型运行时。插件的 `completeSimple()` 最终调用 `streamSimple()`（公共流式模型调用入口），再经过公共凭据解析和提供商适配层。

`ModelRuntime.prepareRequest()`（运行时请求准备方法）共用凭据读取、认证请求头合并和认证提供的服务地址。OAuth 凭据临近过期时，公共认证代码提供带锁刷新和保存机制；插件不需要独立重新实现它。

### 尚未对齐的部分

聊天 SDK 构造请求时提供会话标识，并处理超时、重试、请求头等会话级选项。插件宿主当前仅传取消信号和输出上限：

```ts
await runtime.completeSimple(
  model,
  { systemPrompt: input.system, messages: [{ role: 'user', content: input.prompt, timestamp: Date.now() }] },
  { signal: context.signal, maxTokens: input.maxTokens },
)
```

OpenCode 适配函数 `withOpenCodeSessionHeader()`（添加会话路由头的包装函数）的逻辑是：仅在存在会话标识且调用方未显式设置该请求头时，自动添加 `x-opencode-session`。插件没有提供标识，适配层因此无法补齐。

**根因**：底层认证和发送链路虽已共用，但插件请求的公共上下文构造独立且不完整；缺少统一的参数入口与回归测试约束。

## 6. 与上游的对比

只读获取并对比上游当前代码，未合并、移植或修改上游引用。

- [上游插件模型能力文件](https://github.com/useLexora/Lexora/blob/8a2b8e8f5a609cea9ebbe72c13be5a9d9e8c4494/apps/buddy/service/src/providers/extensionModelCapabilities.ts)：与本地内容一致，调用选项没有会话标识。
- [上游内置提供商转发层](https://github.com/useLexora/Lexora/blob/8a2b8e8f5a609cea9ebbe72c13be5a9d9e8c4494/apps/buddy/service/src/providers/createBuiltinProviderInstance.ts)：转发既有选项，没有为插件补会话标识。
- [上游依赖声明](https://github.com/useLexora/Lexora/blob/8a2b8e8f5a609cea9ebbe72c13be5a9d9e8c4494/apps/buddy/package.json)：相关 Pi 依赖版本均为 `1.1.0`，与本地一致。

结论：上游源码同样存在缺口；这是源码与依赖行为对比结论，不是已经启动上游安装版进行端到端实测的结论。尚未提交上游 Issue 或 PR；本私有文档不进入上游 PR。

## 7. 修复方向与范围

用户认可的方向：**不是仅针对 OpenCode 硬编码一个请求头，而是让聊天与插件复用相同的公共模型请求路径和公共参数构造**。

建议在后续修复中：

1. 找到聊天与插件均经过的宿主请求层，复用或下沉公共请求上下文构造，避免复制另一套参数拼装逻辑；不直接修改 `node_modules/`（已安装依赖目录）。
2. 宿主提供稳定、非敏感的会话标识；不要每次调用随机生成导致同任务失去路由稳定性，也不要使用标题或用户正文作为标识。
3. 继续通过公共模型运行时解析模型、认证、刷新凭据和适配提供商；不向插件暴露 token，也不另写直连 HTTP 请求。
4. 明确统一会话标识、公共请求头、超时与重试规则。保留插件自身的提示词、输入、输出上限，以及既有调用次数、总时限、取消与任务有效性边界。
5. 对思考级别、服务档位、缓存和会话标识隔离策略作明确选择，不应无差别复制聊天的全部参数。插件选择了另一模型时，不能套用原聊天模型不支持的选项。
6. 不搬入聊天历史、工具集合、完整 Agent 循环或交互事件副作用；这些不是标题插件必须继承的请求基础设施。
7. 保留可诊断且脱敏的失败类型，避免用户只看到通用插件错误而无法区分缺少上下文、认证失效、额度不足和输出截断。

预计属于小到中等范围的宿主调用调整，无需数据库迁移或界面改造；具体文件数和实现方式待修复设计确认。仅补会话标识是小改动，但不等价于完成公共请求构造统一。

## 8. 验收标准

- [ ] 聊天和插件共用公共请求上下文构造，而非两处复制相同代码。
- [ ] 同一任务／分支的插件重复调用使用稳定的会话标识；不同任务按选定策略隔离，标识不包含正文或秘密。
- [ ] OpenCode Go 的真实插件请求带所需会话头，不再返回 `MissingSessionID`。
- [ ] 使用完整标题插件流程验收：输入提交后触发、模型正常结束、标题合法并成功保存。
- [ ] 手动标题不被覆盖；已有自动标题及目标变化更新规则不回归。
- [ ] DeepSeek 插件调用仍正常；聊天输入框原有模型调用不受影响。
- [ ] 至少一个现有 OAuth 模型完成插件实际调用；另用自动化测试覆盖过期刷新、并发刷新和认证失败，不人为修改用户真实凭据制造故障。
- [ ] 取消信号、调用上限、总时限、任务切换和插件指定不同模型等边界仍生效。
- [ ] 测试检查最终请求头和认证适配行为，不仅断言向函数传了一个字段；补充插件与聊天公共参数一致性回归用例。
- [ ] 类型检查与改动相关测试通过；上游 PR 验证按仓库约定交由 CI，除非用户明确要求本地验证。

## 9. 后续处理与当前边界

- 本次仅记录问题，没有实施修复、运行新的修复测试、提交 Git 或创建上游 PR。
- 在后续修复会话中按“范围确认 → 公共请求层设计 → 实现 → 相关测试与真实模型验收”推进，再更新本文状态与结果。
- 未决事项：会话标识是否沿用聊天的精确标识或采用稳定的插件子会话标识；哪些公共策略下沉至宿主；OAuth 验收选择哪个已配置模型。这些属于实现设计，尚未落地。

### 9.1 实现记录（2026-10-14／15）

**设计结论**：聊天的请求选项由 Pi 的 `createAgentSession` 内部闭包构造，无法直接复用，且插件调用处没有会话句柄。Pi 自己对一次性辅助调用（压缩、分支摘要的 `completeSummarization`）的做法是：经同一运行时发请求，保证带路由 `sessionId`（缺省生成 `uuidv7()`），并设置 `cacheRetention: 'none'`。该函数未对外导出，因此在插件调用处照同样的两个选项手写，不引入自定义标识规则。

**对照 ZCode**（`zai-org/ZCode`，Apache-2.0，提交 `aac47556`，只读源码）：其标题 sidecar 的做法是：提示词明确“这是起标题任务，不是对话，禁止回答”；只发首条用户消息（≤1200 字符）；辅助调用用最低思考档位和 5000 token 输出预算；输出被截断不判失败，而是清洗后使用（去思考标签、解析 JSON、取首行、超长加省略号）；失败只写日志并保留原标题；每次请求记录 `stopReason` 与用量。其代码注释直接指出：弱约束时模型会把原始请求当成对话来回答。

**宿主改动（Lexora）**：

- `apps/buddy/service/src/providers/extensionModelCapabilities.ts`：`completeSimple` 增加 `sessionId: uuidv7()` 与 `cacheRetention: 'none'`；`stopReason === 'length'` 抛 `EXTENSION_MODEL_TRUNCATED`，与请求出错 `EXTENSION_MODEL_FAILED` 分开。仍不返回被截断的文本。
- `apps/buddy/service/src/plugins/ExtensionAgentRuntime.ts`、`ExtensionAgentEvents.ts`、`observeExtensionAgentDiagnostics.ts`：处理函数失败时，仅当错误消息是固定格式的 `EXTENSION_*` 错误码才带入诊断日志的 `errorCode`，否则仍记 `EXTENSION_REQUEST_FAILED`，避免用户内容进入日志。
- 测试：`providers/__tests__/extensionModelCapabilities.spec.ts`（新增）用真实运行时与 OpenCode Go 适配层，断言插件请求带 `x-opencode-session`，并覆盖不传／传入聊天式 `sessionId` 的对照、截断与请求出错两条分支（会话头测试在修复前失败，请求头为空）；`plugins/__tests__/ExtensionAgentRuntime.spec.ts` 新增错误码上报与脱敏用例。

**插件改动（已回退，仅作记录）**：2026-10-15 真实验收（见 9.2）后决定不保留，独立仓库 `xtlaw-plugins` 的工作区已还原为未改动的 1.2.2。曾经的 1.3.0 改动（与上游分叉）如下：

- 提示词改为“起标题任务，不是对话”结构，输出固定 JSON `{"title":"..."}`；提示词中标题上限 30 字符，代码兜底 80（宿主 `task.rename` 上限）。
- 只发用户消息：首次命名发首条用户消息（≤1200 字符）；目标变化判断发首条与最近一条（各 ≤600 字符）及当前标题。
- 首条输入少于 10 个字符不调用模型；`maxTokens` 256 → 1024。
- 输出清洗与可用性判断下沉到代码；不可用（空、非标题、超 80 字符）为 `skipped` 并保留现有标题，不再抛 `TITLE_INVALID`；请求失败、取消、截断仍为失败。
- “目标变化更新”保留（默认仍关闭）：模型只回 `{"changed":false}` 或 `{"changed":true,"title":"..."}`，格式不对或不确定一律保留现有标题。
- 用户手动“重新生成标题”改为按首条消息重命名，不再带“除非目标变化否则保留”的条件（行为变化）。
- 新增 `tests/auto-title.test.mjs`（`pnpm test`，17 项）；插件 README 与仓库 README 已注明分叉。

**与第 7 节建议的差异**（有意为之）：

- 第 2 条要求“同任务使用稳定标识”，本次每次调用使用新标识，与 Pi 压缩／摘要一致；插件的一次性标题请求没有需要保持的路由连续性。若后续要求稳定标识，需自行定义派生规则。
- 不搬运超时与重试：提供商层默认 `maxRetries` 为 0（`provider-retry.js`：`options.maxRetries ?? 0`），与聊天配置一致；插件已有调用次数、总时限与取消边界。
- 宿主对 `length` 保持严格（不返回半截文本），未采用 ZCode 的“截断后继续使用”：ZCode 的提示词、调用与清洗在同一代码库内，而这里宿主无法替插件判断半截文本是否可用。

**验证**：Lexora `vue-tsc -b` 类型检查通过；改动文件 ESLint 无告警；`extensionModelCapabilities.spec.ts`、`ExtensionAgentRuntime.spec.ts`、`ExtensionActionService.spec.ts` 共 14 项通过。插件 1.3.0 曾有 17 项测试通过并成功构建，该改动已回退，此结果仅作记录。

**尚未完成**：

- 应用内端到端验证（真实界面触发、标题保存）；模型请求层面的真实验收见 9.2。
- 插件保持 1.2.2，未发布新版本，市场目录未改动。
- `stopReason: length` 的原因：见 9.2，原提示词在 `claude-haiku-5-5` 上实测未被截断，此前“原提示词让模型回答任务”的假设未得到支持。
- OAuth 提供商的插件调用。

### 9.2 真实模型验收（2026-10-15）

**方法**：用本机已保存的 OpenCode Go 凭据（实例 `builtin-08ae83de-…`，模型 `claude-haiku-5-5`，`anthropic-messages`，`forceAdaptiveThinking`）在隔离的临时目录里解密（只读你的数据；`Local State` 取自 `%LOCALAPPDATA%\XTLaw\cache\chromium` 的副本，`Roaming\XTLaw` 下 9 月 21 日的那份与现有凭据不匹配，解密失败），密钥只经标准输入传递，不打印、不落盘；脚本与副本事后已删除。请求全部为合成输入，不含真实聊天。分别运行本机已安装的 1.2.2 与 1.3.0 源码，共 7 个场景；请求选项与宿主处理函数一致（每次新 `sessionId`、`cacheRetention: 'none'`、被截断或出错视为失败）。

**脚本自身的一次错误（已纠正）**：第一轮脚本直接调用了提供商，绕过了 `ModelRuntime` 内部的 `normalizeContext`，导致系统提示词根本没发出去，该轮对比结果作废；已改为与运行时相同的转换后重跑。以下结论全部来自重跑。系统提示词生效的验证：控制请求要求“只回复 OK”，返回 `OK`。

**结果**：

| 项目 | 结果 |
|---|---|
| 不带 `sessionId` | HTTP 400 `MissingSessionID`（今天仍可复现） |
| 带 `sessionId` | 正常，`stopReason: stop` |
| 1.2.2（原提示词，`maxTokens 256`） | 7 个场景中 6 个 `stop`，输出 2–21 token，标题合理；1 个（S1）返回上游 403 “Endpoint is unavailable” |
| 1.3.0（新提示词，`maxTokens 1024`） | 7 个场景全部 `stop`，输出 9–29 token，标题合理；短输入 `hi` 不调用模型 |
| 目标变化判断 | 1.3.0 对“改为起草保密协议”返回 `changed:true`，对“押金再详细说明”返回 `changed:false`，均符合预期 |
| 思考 | 所有请求 `thinking` 块为 0（未传 `reasoning` 时请求为 `thinking: disabled`） |

**结论**：

1. **根因确认**：缺 `x-opencode-session` 是插件调用失败的原因，且补上会话标识后请求即成功。宿主修复是必要的，也是充分的一步。
2. **此前的假设被数据否定**：原提示词在这个模型上没有被截断（输出仅 2–21 token，远低于 256）。文档 4.3 节里 `stopReason: length` 更可能来自那次对照所用的临时短提示词，而不是插件的真实提示词；“提示词让模型去回答任务”的猜测没有得到支持。1.3.0 的提示词重写、输入裁剪、`maxTokens` 提高不是修复本缺陷所必需。
3. **1.3.0 的价值是加固而非修复**：短输入不调用模型（少一次请求）、固定格式输出便于校验、不可用结果降级为 `skipped`、目标变化判断不确定时保留标题。是否保留这些与上游分叉的改动，取决于维护成本与对其他模型的预期。

**决定（2026-10-15）**：不保留 1.3.0，插件回退到 1.2.2，只保留宿主修复。理由：实测没有证明 1.3.0 优于 1.2.2，而分叉的维护成本是确定的。若日后在其他模型上复现“输出过长被截断”，再评估提示词与输入裁剪。
4. **未解释的现象**：两轮共 28 次请求中，1.2.2 的两次请求（第一轮 S4、第二轮 S1）收到上游 `403 Endpoint is unavailable`，1.3.0 的 12 次均成功。样本太小，不能归因于版本；宿主会如实以 `EXTENSION_MODEL_FAILED` 失败该动作。

**仍未验证**：应用内端到端（真实界面触发、标题保存、任务历史显示）；其他提供商与模型；OAuth 提供商。

## 文件与术语说明

| 原名称 | 中文含义 | 用途 |
|---|---|---|
| `apps/buddy/service/src/providers/extensionModelCapabilities.ts` | 插件宿主模型能力文件 | 本次缺少会话标识的调用位置 |
| `apps/buddy/service/src/providers/ProviderExecutionModelResolver.ts` | 模型执行解析器 | 聊天与插件获取模型和运行时的公共入口 |
| `apps/buddy/service/src/providers/createBuiltinProviderInstance.ts` | 内置提供商实例转发层 | 保留供应商适配和认证机制，转发请求选项 |
| `apps/buddy/service/src/conversations/ExtensionTaskContext.ts` | 插件任务上下文 | 已提供任务和分支标识，可作为稳定上下文的来源 |
| `sessionId` / `x-opencode-session` | 会话选项／会话路由请求头 | 由宿主提供标识，供应商适配层转为请求头 |
| `OAuth` | 浏览器登录授权 | 使用公共凭据读取与刷新路径，仍待插件实测 |
| `stopReason` | 模型输出结束原因 | 区分正常完成、错误、取消及达到输出上限 |
