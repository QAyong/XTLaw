# 插件伙伴

当前仅支持贡献 NPC，暂不支持通过插件注册主角。

## NPC

API 4 的 `contributes.subagents` 独立声明专业 NPC，不需要 MCP、Skills、`entry` 或额外插件权限。界面名称为 **NPC**，清单键仍为 `subagents`；不要改名或声明 `kind`。安装不会自动把 NPC 绑定到伙伴。

通过 `engines.lexora` 限定实际支持此字段的宿主版本，不能仅凭 `apiVersion: 4` 宣称兼容所有 API 4 宿主。以下片段并入[插件清单](protocol.md)；保留插件身份，兼容范围填写目标宿主已确认的支持版本，不照搬其他能力的示例版本。

```json
{
  "apiVersion": 4,
  "contributes": {
    "subagents": [
      {
        "id": "reader",
        "name": "材料阅读员",
        "instructions": "阅读用户指定的材料，返回摘要与原文依据。",
        "tools": [{ "source": "builtin", "name": "read" }],
        "fileAccess": "read_only"
      }
    ]
  }
}
```

该例只选择内置读取工具，不获得额外目录权限；也可以省略 `tools`，声明不使用工具的 NPC。

### 声明约束

- 必填 `id`、`name`、`instructions`、`fileAccess`，最多 16 个 NPC。`id` 为 1–64 个小写字母、数字、`-`、`_`，首字符只能是字母或数字，同包的 NPC 内不得重复，不能使用内置 ID：`npc-explorer`、`npc-researcher`、`npc-executor`、`npc-reviewer`。
- `id` 是包内局部 ID，**不加插件 ID 前缀**。命令、视图、Skills 等贡献的前缀规则不适用于 NPC；不同贡献种类的同名局部 ID 不表示依赖或关联。
- `name` 为 1–80 字符，`instructions` 为 1–16000 字符；`description` 默认空字符串，最长 500 字符。`skills`、`requiredSkills`、`tools` 默认空数组；空数组不表示继承全部能力。
- `tools` 最多 256 项且不得重复。内置工具使用 `{ "source": "builtin", "name": "read" }`，仅允许 `read`、`find`、`grep`、`ls`。不支持全选、JSON 编码工具 ID、任意宿主管理工具、命令执行或插件工具引用。
- `fileAccess` 必须显式指定：`inherit` 继承当前任务已有的文件权限上限，不增加授权；`read_only` 限制文件访问为只读。含 MCP 工具引用时必须为 `inherit`，因为远端工具的名称或提示词不能保证没有写入副作用。

### 可选依赖

只有显式引用才产生依赖；同包交付不代表自动组合：

- 使用 [插件 Skills](skills.md) 时，`skills` 与 `requiredSkills` 各最多 32 项且不重复，引用本包 `contributes.skills[].id` 的**完整贡献 ID**（如 `<plugin-id>.research`），不是 Skill frontmatter 名或调用名。`requiredSkills` 必须是 `skills` 的子集；必需 Skill 不可用时 NPC 不就绪。
- 使用 [MCP 连接](mcp-connectors.md) 时，工具引用为 `{ "source": "mcp", "connector": "legal-search", "name": "search_statutes" }`。`connector` 必须是本包已声明连接的局部 ID，不能引用用户连接或其他包的连接；`name` 为服务真实提供的原始工具名，1–256 字符，不使用宿主生成的调用名。该引用须搭配 `fileAccess: "inherit"`，不能照搬上方只读示例。

### 配置、副本与生命周期

NPC 的名称、说明、指令和能力声明由插件来源管理，更新跟随来源。用户在宿主中选择启用状态、模型和伙伴绑定；清单不包含这些配置，也不分发模型凭据。未指定 NPC 模型时继承调用者实际使用的模型。可委派范围由伙伴中的 NPC 配置决定，不由插件安装编排；实际执行继续受工具策略、目录权限和用户审批约束。

需要修改来源定义时，用户可复制为独立 NPC 后编辑。副本不跟随原定义更新，但不是依赖备份：仍引用的插件 Skills 或 MCP 连接在来源停用、卸载或声明被移除后仍会失效。不会自动复制连接、凭据或 Skill 依赖。

停用或卸载插件会使其 NPC 不可用。普通卸载保留用户配置，不自动把来源定义转成自建 NPC；清理配置须由用户显式选择，不能默认删除用户副本。

不要输出旧的 `kind: "npc"` 或 `tools: {mode, ids}`。验收应覆盖独立 NPC 的模型与绑定、只读限制、所选依赖缺失、来源启停、复制与卸载；清单解析成功不代表已具备执行条件。
