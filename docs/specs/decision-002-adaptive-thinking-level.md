# Decision-002：自适应思考等级（会话层 Auto 模式）

- Status: Accepted for implementation / 已接受，进入实施
- 日期：2026-09-16
- 决策人：PI-Desktop 核心
- 修订：ADR 0114（模型绑定与思考配置）、ADR 0144（用户自定义思考等级覆盖）、
  ADR 0221（思考等级原始值渲染）
- 关联：ADR 0194（子代理思考覆盖）· ADR 0215（agent 扩展作为插件贡献）·
  ADR 0237（官方插件承载面）· 上游 pi issue #509（ExtensionAPI 的
  `pi.setThinkingLevel`）· 社区先例 `pi-adaptive-thinking`
  （源自 opencode-adaptive-thinking）

## 背景

思考等级阶梯是冻结的协议枚举
（`off` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`；ADR 0114）。
用户目前只能在 Composer 里手动选档：简单提问也在烧 `high` 的 token，
复杂重构却可能起步档位太低，第一轮产出质量打折。

用户希望"有效强度跟着任务形态走"。上游已有两个经过验证的设计：

- pi 内核（≥ 0.84.1，本项目锁定 0.85.1）已通过上游 issue #509 向 agent
  扩展暴露 `pi.getThinkingLevel()` / `pi.setThinkingLevel()`，
  agent 自己就能按任务重新调档；
- 社区扩展 `pi-adaptive-thinking` 完整实现了这套做法：两个 agent 工具
  （`get_thinking_level`、`set_thinking_level`）、注入 base prompt 的静态
  工具指引、轮内生效与会话持久两种变更、项目/全局两级配置文件。
  它刻意不改每轮系统提示词，因此提示词缓存前缀不受影响。

任何设计都不能改动 wire 枚举、持久化绑定语义或 provider 适配器。

## 决策

`auto` 只做会话层模式，绝不新增枚举成员。

1. **虚拟档位，且取代 `off` 成为默认。** Composer 思考菜单新增 `auto`
   （自动档位）选项，按 ADR 0221 的规则以原始小写值渲染（与其他档位
   一致）。**`auto` 取代 `off` 成为默认选中项：新会话/新绑定默认进入
   自动模式**；用户仍可随时手动切回 `off` 或任意具体档位。`auto` 只
   存在于渲染器/会话层；`THINKING_LEVELS` 和所有 wire/存储类型保持
   不变。发给 `pi-agent-core` 和 provider 的永远是具体档位。

2. **解析点。** 会话层 resolver 在每轮派发前把 `auto` 解析为模型支持的
   具体档位。`auto` 的基线默认档位是 `off`（无思考）：简单轮次零思考
   开销，只有 agent（见决策 3）或用户主动调高时才消耗思考 token。
   无推理能力的模型同样解析为 `off`，其菜单里不出现 `auto` 选项，
   默认回退为具体档位。

3. **模型自调档。** 由于基线是 `off`，agent 的升档判断是 `auto` 模式
   的核心机制。agent 可通过 `get_thinking_level` 和 `set_thinking_level`
   两个工具查看和修改生效档位，契约与 pi-adaptive-thinking 一致：
   - `persist: false`（默认）：只改当前轮，轮结束时恢复基线档位；
   - `persist: true`：修改会话基线，直到 agent 或用户再次修改。
   工具指引是每会话注入 base prompt 一次的静态文本（"遇到歧义、调试、
   高风险改动、多步综合时主动升档；例行琐碎操作保持低档"）。运行时
   状态永不进入系统提示词，保住缓存前缀。

4. **配置面。**
   - 会话配置新增**可选字段** `thinkingLevelMode: "manual" | "auto"`，
     新会话/新绑定的默认值为 `"auto"`；已持久化的既有会话保持原状
     （视为 `"manual"`），语义不变。该字段是附加字段，不拓宽现有
     `thinkingLevel` 字段——IPC 消费方和插件兼容。发布档位为空
     （无推理）的绑定忽略 `auto`。
   - 设置中提供开关可关闭"默认自动档位"（关闭后新会话回归 `off` 默认）。
   - 工具名、描述和 guidance 文本支持项目级（`.pi/adaptive-thinking.json`）
     和全局配置覆盖，分层方式沿用社区扩展的做法。

5. **交付面。** resolver 与 mode 字段留在会话层；agent 工具按 ADR 0215
   以内置（bundled）agent 扩展交付，而非第三方插件，与 ADR 0237 的
   官方插件先例一致。渲染器只需已有的生效档位投影（ADR 0202 风格）
   即可展示解析结果。

6. **展示。** Composer 芯片显示模式 + 实际生效档（如 `auto · medium`），
   用户随时能看到真正发上线的是什么。agent 调用 `set_thinking_level`
   与普通工具调用一样呈现在 transcript 中，保留审计线索。

## 后果

- 简单轮次默认零思考开销，复杂任务由 agent 按需升档，无需手动换档。
  `auto` 成为默认后，成本行为对所有用户生效：默认更省，复杂任务
  按需多花。
- wire 枚举、绑定 schema、clamp 规则、provider 适配器全部不动；
  既有会话保持 manual 语义，插件继续工作。唯一新增的 IPC/会话字段
  双向向后兼容。
- 轮内调档自动恢复基线，一次性的 `high` 突发不会悄悄抬高后续成本。
- guidance 为静态文本，提示词缓存前缀得以保留。
- agent 调档频率可能高于用户手动操作；guidance 文本（可覆盖）是抑制
  振荡的主要手段。
- 想要固定思考强度的用户可手动切到具体档位；完全不想要自动调档的
  用户可在设置中关闭默认自动档位（新会话回归 `off`）。

## 被否决的替代方案

- 把 `auto` 加进 `THINKING_LEVELS`：否决——会改动冻结的公共枚举、所有
  clamp 映射、provider 适配器和持久化语义，而且 provider 侧并没有
  "auto" 这个推理参数可发。
- 纯启发式逐轮分类（路由器式）：暂缓——额外延迟加误判风险；由 agent
  判断任务形态天然信息更充分。resolver 接口为将来引入该方案留了口子。
- 只做成第三方插件：否决作为默认体验——会话层反正要加 mode 字段；
  工具以内置扩展交付既保持核心精简，又不割裂发现入口。
- 保持 `off` 为默认、`auto` 仅作可选项：否决——需求方明确要求 auto
  直接成为默认档位，让"按任务形态自动调档"开箱即用。

## 验证

- 单元：resolver 在各模型已发布阶梯上映射 `auto`（基线为 `off`；
  轮内变更在轮末恢复基线）。
- 单元：新会话/新绑定的默认档位解析为 `auto`；无推理绑定不出现
  `auto`，默认回退为具体档位。
- 单元：会话配置对 `thinkingLevelMode` 的读写回环；既有会话缺省视为
  `"manual"`。
- E2E：`E2E-SESSION-auto-thinking-resolves-per-turn` ——新会话默认
  `auto`，琐碎轮解析为 `off`（零思考）；agent 轮中 `set_thinking_level`
  被执行且轮末回滚；`persist: true` 持久生效；Composer 芯片反映解析后
  的档位。
- E2E：既有思考等级场景（E2E-219 委派展示、Composer 思考菜单）保持通过。
