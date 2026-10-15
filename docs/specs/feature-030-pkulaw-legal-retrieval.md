# Feature-030：内置北大法宝 MCP

**日期：** 2026-10-15
**状态：** 已实现，待真实环境验收
**范围：** XTLaw 桌面端（`apps/buddy`）
**参考：** [北大法宝 MCP 文档](https://mcp.pkulaw.com/docs?doc=mcp-integration)、[常见问题](https://mcp.pkulaw.com/docs?doc=faq)；公众号搜索见 [Feature-031](./feature-031-sogou-weixin-search.md)

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
- **工具：** 18 个，完整定义约 123KB。含账户类 `get_points_balance`（余额）、`list_entitlements`（各服务单价）。
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
| 内置 skill `legal-research` | 未做；教模型"先法后案、读原文确认时效、核验案号、控制条数"，放在 `service/resources/skills/legal-research/SKILL.md` |
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
