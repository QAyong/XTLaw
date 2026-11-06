# Feature-030：内置北大法宝 MCP

**日期：** 2026-10-15
**状态：** 已实现，待真实环境验收
**范围：** XTLaw 桌面端（`apps/buddy`）
**参考：** [北大法宝 MCP 文档](https://mcp.pkulaw.com/docs?doc=mcp-integration)、[常见问题](https://mcp.pkulaw.com/docs?doc=faq)；公众号搜索见 [Feature-031](feature-031-sogou-weixin-search.md)

## 1. 目标与做法

把北大法宝（聚合服务）作为**内置 MCP 连接器**接入，用户在"设置 → 网络 → 服务配置"里和 Tavily 一样填一个 Token 即可使用。模型直接使用官方 MCP 工具，不再包一层自有工具；其余全部沿用现有 MCP 连接器机制（凭据存储、重连、按需发现）。

## 2. 实现

| 内容 | 位置 |
|---|---|
| 预设连接器 `pkulaw`：`streamable-http`，`deferred`，默认关闭；每次启动缺失则补建，已存在的不改 | `service/src/connectors/mcp/builtinPresets.ts`，在 `BuddyService.ts` 的 `runtime.connectors` 里调用 |
| 受信判断 `isBuiltinPreset`：`id`、传输方式、地址三者都与预设一致才算 | 同上 |
| 放宽审批：受信预设的工具分类为 `network` 且不带 `requireApproval`，是否询问由权限引擎按策略决定，待遇同网页搜索；其他连接器仍强制询问 | `createMcpTools.ts`（`trusted`），`McpConnectorService.getTools` |
| 服务端错误原文转给模型：仅受信预设，仅服务端协议错误，最长 300 字 | `createMcpTools.ts` 的 `serverErrorMessage` |
| Token 规范化：去掉粘贴带来的 `Bearer ` 前缀，保存与发送时都处理 | `shared/connectors/bearerToken.ts`，`createMcpTransport.ts`，`useLegalSettings.ts` |
| 重复 `Content-Type` 修正：同一媒体类型重复时合并，其余不动 | `createMcpTransport.ts` 的 `repairDuplicateContentType` |
| 设置界面："服务配置"下与 Tavily 同款（标题、说明、密钥框、保存）；保存 Token 即启用，清除即关闭，没有单独开关 | `DesktopLegalSettings.vue`、`DesktopWebSettings.vue`（`services` 插槽）、`DesktopWebSettingsView.vue`、`state/useLegalSettings.ts`、`useMcpSettingsCapability.ts`（`setCredential`） |
| 连接器 id 常量 | `shared/connectors/builtinConnectors.ts` |

预设同时出现在通用的连接器列表里，不隐藏。

## 3. 实测记录（2026-10-15，真实 Token）

- **端点：** `https://apim-gateway.pkulaw.com/mcp-law-agg/1.0.0/mcp`。官方接入文档的通用配置是 9 个独立服务，**不含**这个聚合端点；它实测可用，但文档未写明，官方可能调整。
- **工具：** 18 个，完整定义约 123KB。（2026-11-05 官方升级后为 22 个，名称与字段大改，见 §9。）含账户类 `get_points_balance`（余额）、`list_entitlements`（各服务单价）。
- **计费按底层服务：** 法条读取、案例列表 25 分；语义检索 125 分；账户类 0 分。账本更新有延迟。
- **返回大小：** `get_case_list` 一次 20 条约 4 万字且无条数参数；`search_case` 有 `size` 参数。超过 64KB 的返回被连接器转成文件，只给模型前 32KB 预览。
- **协议：** 客户端与服务端协商到 `2026-07-28`，响应为普通 JSON；直接发请求则返回 SSE。

## 4. 踩过的坑

| 问题 | 原因 | 处理 |
|---|---|---|
| 计费工具一律失败，提示"成员Token额度不足"，账户查询却正常 | Token 带 `Bearer ` 前缀被原样保存，发出去是 `Bearer Bearer …`；服务端对这种凭据放行账户类工具、拒绝计费工具 | 保存和发送时规范化前缀 |
| 所有失败都变成"内容类型非法" | 服务端错误响应里 `Content-Type` 重复成 `application/json,application/json; charset=UTF-8`，MCP SDK（1.32.1 及 2.x）拒绝，1.29.0 能读出 | `repairDuplicateContentType` |
| 所有需要主机权限的工具被 `MUTATION_RESOURCE_UNSAFE` 拦截 | 强制结束预览时有一条主机 shell 调用未结算，重启后被当作危险标记；应用没有自动恢复孤儿租约的途径 | 手工备份后清理；**缺口仍在**，见 §6 |
| 模型只看到 `MCP_TOOL_FAILED` | 工具层吞掉了服务端错误原文 | `serverErrorMessage`（仅受信预设） |

## 5. 测试

- `builtinPresets.spec.ts`：预设合法；缺失才补建；已存在不改（含凭据）；删除后补建。
- `builtinApproval.spec.ts`：受信预设不强制审批但保留网络分类；其他连接器仍强制；`isBuiltinPreset` 三项都匹配才为真。
- `bearerToken.spec.ts`、`repairDuplicateContentType.spec.ts`、`serverErrorMessage.spec.ts`。
- `useLegalSettings.spec.ts`：保存即启用、清除先关闭再删凭据、失败不启用、前缀去除。
- 仓库里 `useWebSettingsCapability.spec.ts` 因搜狗微信来源（`b6139b74`）未同步期望值而失败，与本功能无关。

## 6. 未做与待办

| 项 | 说明 |
|---|---|
| skill `legal-research` | 已做，规则见 §8；2026-10-27 起不再内置，由市场仓库 `xtlaw-market` 维护；2026-10-17 的修改尚未实测 |
| 返回内容控制 | 靠模型自己限制条数和 `codemode`；过大时再给连接器加通用的工具白名单、参数限幅、输出字段白名单 |
| 孤儿租约自动恢复 | 应用本身的缺口：异常结束后遗留的主机租约没有恢复途径 |
| 已保存 Token 回显 | 凭据无法读回，输入框只显示掩码 |
| 网络出口 | `McpClientSession` 用 Node 的 `fetch` 直连（连接器现状），不经宿主网络层；代理、企业网络下的表现未测 |
| 免费额度 | 官方 FAQ 写"新用户一次性赠送 10,000 分"，第三方文章写"每日赠送"，文案不写具体额度 |
| 缓存与条款 | 未做结果缓存；缓存或落盘是否被使用条款允许未确认 |
| 其他来源 | 元典等，按同样模式再加一个预设和一块设置 |

## 7. 验收

用真实 Token：

1. 保存 Token 后连接器启用，工具列表可见；清除后关闭。
2. 《民法典》第 1077 条：返回原文和"现行有效"。
3. 非手动策略下连续调用不逐次弹审批；手动策略下和网页搜索一样会询问。
4. 故意让服务端报错（如额度不足）：模型能看到 `Server message:` 原文。
5. 伪造案号：说明"未找到"，不说"已验证"。
6. 回归场景（2026-10-17 修改后**尚未跑**）：问一个带地域的"法院是否支持"类问题（如贵州某地承包地上的坟墓能否要求迁出）。预期：首轮无贴合结果时去掉地域改搜全国；网页和微信两个渠道都完成检索并读取关键正文；已检得多为不予支持时补搜相反结果；能引用未披露案号的法院官方案例报道，并标注"官方案例报道，未披露案号"。

## 8. `legal-research` 检索规则

**日期：** 2026-10-17。起因是一次实测中检索执行不充分：把"各发起一次"做成了完成调用次数，首轮带地域条件没有贴合结果就停了，也没有读取微信渠道的正文，还因为"必须有案号"漏掉了法院官方公众号的案例报道。修改方向从"搜了哪些渠道"改为"关键线索是否核验、相反裁判是否检查、结论边界是否说明"。

| 规则 | 要点 |
|---|---|
| 检索完成的含义 | 网页和微信两个渠道都要完成"检索—筛查—必要时读取"，发起搜索不等于完成 |
| 关键词 | 以关键事实和法律问题为核心，不同时堆叠地域、法院、律师、典型案例；首轮无贴合结果时先去掉地域搜全国，再扩展同义词 |
| 停止条件 | **不设检索次数或读取篇数上限**。检索要全面，设预算会牺牲准确度；改为以收敛为止：新检索不再带来新的贴合结果，也不改变已有判断。每轮必须换关键词或角度，防止空转 |
| 关键线索必须读 | 影响结论、与关键事实贴合、方向相反的结果必须读正文；按相关度从高到低读，直到新读的几篇不再改变判断；摘要只作线索 |
| 反向核查 | "是否支持"类问题，案例集中一方时补搜相反结果，比较差异来自同意、时间、权属证据、实际妨害、程序路径；未检得不等于不存在，不为平衡引用不相似案件 |
| 渠道受阻 | 微信遇 `WEB_CHALLENGE` 立即停、不绕过，记为未完成并在"注意"写明；正文读不出来同样记为未核验 |
| 案号门槛 | 裁判文书列案号、法院、日期；官方案例报道未披露案号的可引用，标注"官方案例报道，未披露案号"；区分判决、裁定、调解和执行结果；报道中的旧法条另行核对 |
| 证据强度 | 只有报道或律师观点时，结论写成"有报道显示……，尚无裁判文书印证" |
| 案例地域 | 标明法院所在地域，与用户所在地不同时说明口径可能不同 |
| 作答前自检 | 关键线索已读、反向核查已做、两个渠道已完成、边界已体现；缺项先补，补不了如实写明 |

**取舍：** 不设预算意味着搜索量可能变大。搜狗的触发频率阈值至今未测（见 [Feature-031](feature-031-sogou-weixin-search.md) §11），被拦截时按上表"渠道受阻"处理，不重试。

## 9. 2026-11-05 官方升级：工具改名与字段统一

**日期：** 2026-11-05。官方公告（2026-11-04 发出）：当天 17:30 上线新版，工具名规范化、字段由驼峰统一为下划线、文献类结果统一返回加密 `gid`、部分工具描述优化。公告没有逐项列出，下表来自升级后连接器重新拉取的工具目录（22 个工具，读自本机 XTLaw 的 `connector_tool_catalogs`，不是凭记忆或文档页）。

| 旧名 | 新名 | 说明 |
|---|---|---|
| `get_law_item_content` | `get_law_article` | 参数 `law_title`、`article_number`；条号可传 232 或“第二百三十二条”，之一写 120.1；标题对不上时报错并给候选 |
| `get_article` | （下线） | 法规语义服务的同类工具，公告确认下线 |
| `search_article` | `search_law_articles` + `search_laws` | 法条级、法规标题级两个语义检索；参数 `query_text`、`library`（旧 `text`、`lib`）；`size` 默认 10，最小 5、最大 20 |
| `get_law_list` | `search_laws_by_keyword` | 字段全部下划线；`page_size` 默认 10、最大 50，最多翻 5 页 |
| `get_case_list` | `search_cases_by_keyword` | 同上；新增 `case_number`；返回里有 `next_cursor`、`has_more` |
| `search_case` | `search_cases` | 参数不变（本来就是下划线）；`size` 默认 10、最大 20 |
| `get_article_history` | `get_law_article_history` | `as_of`、`include_unchanged` |
| `diff_article_versions` | `diff_law_article_versions` | `from_version`、`to_version` |
| `list_related_statutes` | `list_related_legal_materials` | `law_title`、`relation` |
| `anhao_recognition` | `recognize_case_numbers` | 参数仍是 `text` |
| `law_recognition` | `recognize_law_citations` | 参数仍是 `text` |
| `get_linked_content` | `add_law_links` | 参数仍是 `message` |
| `adjust_provisions` | `verify_law_citations` | `user_law`、`answer_law`（旧 `userlaw`、`answerlaw`） |
| `search_enforcement`、`search_procuratorate` | 不变 | 参数改下划线；日期筛选的参数名也变了（如 `start_formation_date`、`procuratorate_level`） |
| `list_law_versions`、`get_points_balance`、`list_entitlements` | 不变 | `law_title` 等参数改下划线 |
| （新增） | `get_law_articles_by_range`、`search_law_articles_by_keyword`、`get_points_usage`、`submit_feedback` | 连续取条文（一次最多跨 10 个条号）、条文用词关键词检索、近 30 天用量、提交反馈 |

**返回字段：** 输出字段全部下划线。原文链接是 `url`，或 `citation.url`（`citation` 还带 `format_chinese` 引注），旧的 `Url` 不再有；官方说明“引用只使用 citation.url，不要自己拼”。`gid` 只出现在返回里，22 个工具没有一个把它当入参。

**发现的问题：**

- `search_cases_by_keyword` 的说明让模型去用“获取案例正文”（`get_case_content`），但这个聚合连接器没有该工具。案例正文以关键词检索返回的拆分字段（本院查明、本院认为等）为准。官方是否之后补上、`gid` 是否为它而设，待确认。
- 上线后，已改名和下线的旧工具名失效（`search_enforcement`、`search_procuratorate`、`list_law_versions`、两个余额类工具名没变）；任何按名字勾选了旧名的角色（如开发用的 `setup-dev-npc.mjs`）会被标成“目录里已没有”。按连接器勾选（`["mcp","pkulaw","*"]`）的不受影响，法律检索员子代理就是这样配的。

**本仓库的改动：**

- `plugins/legal-research`（1.0.5 → 1.0.6）、`plugins/legal-research-agent`（1.0.2 → 1.0.3）：只改原文链接字段（`Url` → `url` 或 `citation.url`）和条数控制的说法；其余本来不写具体工具名。
- `docs/drafts/legal-research-template/`：工具名、参数名、条数限制、新增工具按上表更新。
- 未动：应用代码（按名字判断的逻辑一个都没有）、测试夹具里借用的旧名（`search_case`、`get_article` 等，只是假名字）。

**未核对：** 各服务的单价（§3 的 25 分、125 分）没有重新调用 `list_entitlements` 确认；`search_laws` 与 `search_law_articles` 的实际返回没有用真实 Token 跑过，只核对了输出结构；上述两个插件还没有同步到市场仓库、也没有发布。

**读取方法：** 升级后重启 XTLaw，连接器会重新拉取工具目录并写入本机 `buddy.sqlite3` 的 `connector_tool_catalogs`（`tools_json`）。数据库在 `/mnt/c` 上直接打开会报 `disk I/O error`，要把 `.sqlite3` 和 `-wal` 复制到临时目录再读。
