# 已发布：上游 Issue #397（https://github.com/useLexora/Lexora/issues/397）

目标仓库：useLexora/Lexora，模板：缺陷报告（bug_report.yml）
标题：`[Bug] 多个代理并行时，Codemode 脚本因全局只允许 2 个 worker 被直接拒绝`
标签：bug（由模板自动加）

---

### 影响范围 / Affected area

Desktop (Buddy)

### Lexora 版本 / Lexora version

下游 XTLaw 0.2.2（基于上游 v0.14.0 基线；子智能体调度和 Codemode 相关代码都是从上游移植的）。Pi 依赖：`@earendil-works/pi-coding-agent` 1.3.0。没有在纯上游构建上单独验证，下面的代码位置请维护者对照上游确认。

### 运行环境 / Environment

Windows 11 x64，开发预览（development 档位）。

### 复现步骤 / Steps to reproduce

1. 在「设置 → 运行时」打开 Codemode 工具编排。
2. 新建一个专业助手（NPC），给它若干工具（例如一个 MCP 连接器加网页读取工具）。助手并发数保持默认（5）。
3. 让主助手通过 `lexora_agents` 的 `delegate`，同时给这个专业助手派 3 到 4 个任务，每个任务都需要反复调用工具。
4. 观察各个专业助手的工具调用记录。

### 实际结果 / Actual behavior

专业助手和主助手的 `codemode` 脚本会互相抢位置，抢不到的脚本立即失败，没有发出任何工具请求：

```
Script failed
Script error: Script sandbox failed: Codemode worker limit reached (2 workers are still running or shutting down). Retry after they exit. No tool calls were made.
```

一次 4 个专业助手加主助手的实测（约 2 分钟内）：

| 角色 | 脚本数 | 因 worker 上限未执行 |
|---|---|---|
| 专业助手 1 | 29 | 5 |
| 专业助手 2 | 32 | 9 |
| 专业助手 3 | 29 | 7 |
| 专业助手 4 | 12 | 4 |
| 主助手 | 21 | 1 |
| 合计 | 123 | 26（约 21%） |

后果：模型把"脚本没有执行"当成"没查到"，换一组检索词重试，浪费回合和调用；而且错误里只说"retry after they exit"，没有等待机制，也没有办法知道什么时候能重试。

### 预期结果 / Expected behavior

助手并发数默认是 5，但同一时刻只有 2 个 Codemode 脚本能运行，两个设置对不上。希望多代理并行时：

- 脚本在上限处排队等待（可带超时），而不是立即失败；或
- 上限能随会话或助手扩展，或可配置。

### 上次正常版本 / Last working version

不是回归，是现有设计与多代理并行的组合问题。

### 模型与工具信息 / Model and tool details

模型：DeepSeek（`deepseek-flash`），认证方式：【待你填写：API Key 或 OAuth】。工具：一个 MCP 连接器（延迟暴露）、`lexora_web_search`、`lexora_web_fetch`、`lexora_tool_search`。

### 补充材料 / Additional context

**原因（代码位置）**

Pi 的 `dist/extensions/codemode/execute.js` 里是模块级常量和计数：

```js
// Shared across calls and sessions. Allow one replacement while a cancelled worker is still exiting.
const MAX_CONCURRENT_CODEMODE_WORKERS = 2;
let activeCodemodeWorkers = 0;
```

`acquireWorker` 超过上限时直接抛错，不排队。Pi 的 `docs/codemode.md`「Limits」一节写的是 "At most two codemode workers may be alive across all sessions in one pi process."，仓库里的 `codemode.spec.ts`（"preserves global admission across three sessions"）也在断言这个行为，说明这个上限是有意设计的。

Lexora 把主助手、所有专业助手（`execution_kind = npc_child`）、其他对话和自动化任务都放在**同一个服务进程**里，日志里的 `sourcePid` 全部相同，所以它们共用这一个计数。设置里的 Codemode 是全局开关（`runtimePreferences.codemode`），没有按助手区分的选项。

**对照**

Pi 官方的子代理示例（`examples/extensions/subagent`）和多个社区扩展，每个子代理是一个独立的 `pi` 进程（`spawn("pi", ["--mode", "json", "-p", "--no-session", ...])`），各有各的计数，不会遇到这个问题；官方示例并行上限是 4 个并发，超出的排队。

**我们试过的本地做法，供参考**

在会话工厂里让 `npc_child` 不启用 Codemode，确实避免了拒绝，但有副作用：MCP 连接器单次返回可达 100 到 470 KB（一次 20 篇完整判决），直接调用时只有约 15 KB 的预览进入上下文，完整结果落到工作区文件，而专业助手没有读文件的工具，召回结果基本看不到。所以"按助手关闭 Codemode"本身不够，需要配套方案。我们已把这个改动撤回。

**建议（按改动大小排序，供维护者取舍）**

1. 脚本在上限处排队等待（带超时），超时才报错；错误里区分"没有执行"和"执行失败"。
2. 上限可配置，或按会话 / 助手计数；真正需要保护的是内存（每个脚本 256 MB），可以按总量限制。
3. 专业助手的设置里增加 Codemode 的按助手覆盖（继承 / 关闭），并在助手并发数的说明里提示与脚本上限的关系。
4. 文档补充：Codemode 的 worker 上限是进程内全局共享的，多代理并行时会互相影响。

这个上限的实现在 Pi（`earendil-works/pi`），多代理共用同一进程是 Lexora 的做法，所以不确定该落在哪边；如果更适合提到 Pi 仓库，请告诉我，我可以另提一份。

日志已移除个人路径和对话内容，只保留错误文本和数量。
