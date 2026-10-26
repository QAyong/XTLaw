# 随插件提供 MCP 连接与子代理

API 4 的 `contributes.mcpConnectors` 与 `contributes.subagents` 让一个纯声明包（无 `entry`、无权限）向应用添加 MCP 连接记录和 NPC 子代理；技能沿用 `contributes.skills`（见 [插件 Skills](skills.md)）。三者可以放在同一个包里。

```json
{
  "apiVersion": 4,
  "contributes": {
    "mcpConnectors": [
      { "id": "legal-search", "name": "法规检索", "transport": "streamable-http", "url": "https://legal.example.com/mcp", "credential": "bearer" }
    ],
    "subagents": [
      {
        "id": "law-finder",
        "kind": "npc",
        "name": "法规检索员",
        "description": "按问题检索并核对法规条文",
        "instructions": "先检索法规原文，再返回条文编号与出处；不要改动用户文件。",
        "tools": { "mode": "selected", "ids": ["[\"mcp\",\"legal-search\",\"legal__search\"]"] },
        "fileAccess": "read_only"
      }
    ]
  }
}
```

## MCP 连接

- 只允许 `streamable-http` 与不带账号密码的 HTTPS 地址；不支持本机命令启动（`stdio`）。
- 安装只添加一条连接记录：不下载或运行任何代码，默认关闭，不含凭据。`credential` 为 `bearer` 或 `oauth` 时，用户需在设置中填写 Token 或登录后才能启用；包永远不携带凭据。
- `deferred`（默认 `true`）决定工具按需发现还是直接提供给模型。
- 连接 `id` 为小写字母、数字、`-`、`_`，直接作为连接器 ID，不加插件 ID 前缀。若用户已有同 ID 的连接，宿主不会接管它。
- 最多 16 个。

## 子代理

- 只允许 `kind: "npc"`。`id` 同样不带插件 ID 前缀，宿主会存为 `ext.<插件 ID>.<id>`，以免与用户自建或内置子代理重名。不要使用内置 ID（`npc-explorer`、`npc-researcher`、`npc-executor`、`npc-reviewer`）。
- 安装后自动加入默认伙伴的可委派列表；卸载时移除。
- `tools`：`all`、`none` 或 `selected`。`selected` 的工具 ID 是 JSON 字符串 `["来源","分组","名称"]`；来源为 `mcp` 的工具必须指向同一个包 `mcpConnectors` 里声明的连接，否则清单无效，保证被引用的 MCP 随包一起安装。
- `fileAccess` 默认 `read_only`；`inherit` 表示与当前任务的文件权限一致，不会高于用户授权。
- 最多 16 个。

## 启停、卸载与用户修改

- 插件被停用时，它添加的连接和子代理一并关闭；重新启用后恢复。
- 卸载包会删除没被用户改过的连接记录和子代理。用户改过的内容（子代理的名称、说明、提示词、工具或文件权限；连接的名称、地址、暴露方式，或已填写的凭据）会保留，成为用户自己的；卸载对话框会提前列出。
- 包升级只更新没被改过的记录。
- 用户在安装后自己删除的连接或子代理，不会在下次同步时被装回，直到重新安装整个插件。
