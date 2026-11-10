# 已发布：上游 Issue #537（https://github.com/useLexora/Lexora/issues/537）

目标仓库：useLexora/Lexora，模板：缺陷报告（bug_report.yml）
标题：`[Bug] Codemode 默认 only 模式下，写文件也必须经过脚本，弱模型频繁失败且报错没有替代指引`

---

### 提交前 / Before submitting

- [x] 我已搜索现有 Issue，确认没有相同报告。（搜索 `codemode` 只有已关闭的 #397、#441，主题不同）

### 影响范围 / Affected area

Desktop (Buddy)

### Lexora 版本 / Lexora version

下游 XTLaw 0.5.1（基于上游移植）。Pi 依赖：`@earendil-works/pi-coding-agent` 1.4.0。`apps/buddy/service/src/agent/extensions/codemodeExtension.ts` 里 `mode: 'only'` 在本地 `upstream/master` 上同样存在，请维护者对照上游最新代码确认。

### 运行环境 / Environment

Windows 11 x64，开发预览。

### 复现步骤 / Steps to reproduce

不是稳定复现，是一次真实会话里观察到的，和所选模型强相关。

1. 保持默认设置（Codemode 开启，即 `mode: 'only'`）。
2. 选用一个偏小、偏快的模型（这次是自定义 Provider 的 `glm-5.3-flash`）。
3. 让它读几个文件后生成一份较长的 Markdown 文档并写入工作目录。
4. 观察它的 `codemode` 调用。

### 实际结果 / Actual behavior

`only` 模式下请求里没有单独的 `read` / `write` 声明，模型只能把文件操作写进 `codemode` 脚本。一次会话里 6 次左右 `codemode` 调用，其中 3 次失败：

1. 脚本里 `import 'fs'` / `require('fs')`：

```
Script failed
Script error:
ReferenceError: could not load module 'fs'

No tool calls were made.
```

2. 同样的写法换成 `node:fs`，报错相同。
3. 把整段 Markdown 塞进脚本字符串写文件：

```
Script error:
SyntaxError: Unexpected token ';'
    at codemode.js:97:2

No tool calls were made.
```

codemode 的工具说明里已经写了 `No Node, file system, network, or timers`，模型仍然违反。报错只说模块加载失败，没有告诉它该改用 `tools.read` / `tools.write`，所以又多试了一次才换写法。

### 预期结果 / Expected behavior

- 沙箱里 `import` / `require` 失败时，报错带上替代指引，例如"沙箱没有 Node 或文件系统，请用 `tools.<name>()` 调用工具"。
- 写一个文件这类单步操作，不必依赖模型先写出一段语法正确、转义正确的脚本。

### 上次正常版本 / Last working version

不是回归。`only` 来自上游 `c249ed7c`（优化工具探索与编排），在此之前是 `mode: 'on'`。

### 模型与工具信息 / Model and tool details

自定义 Provider，模型 `glm-5.3-flash`；认证方式未记录。工具：`codemode` 以及它里面列出的 `read`、`write`、`grep` 等内置工具。

### 补充材料 / Additional context

**现状（代码依据）**

- `codemodeExtension.ts` 用 `createCodemodeExtension({ mode: 'only', ... })`。Pi 的 `prepareCodemodeLoadout` 在 `only` 下列出所有可调用工具，并让请求省略 direct 工具的声明。
- 本地测试 `codemode.spec.ts` 断言开启 codemode 时请求里没有 `read`，关闭后才有。
- 同一个上游提交还新增了"两个以上独立查询用一次 `codemode` 加 `Promise.allSettled`"的提示，所以我理解 `only` 是为批量检索设计的，不是疏漏。

**对照：pi-web 的做法**

[agegr/pi-web](https://github.com/agegr/pi-web) 没有让 `only` 成为默认：

- Code mode 默认 Automatic：`codemode` 注册后处于未激活，连上暴露策略为 `codemode` 的 MCP 服务时才激活；也可设为 Always on。
- 启用后的 `codemode.mode` 默认 `on`（Pi 默认值），`only` 是设置里单独的一行，由用户选。

（来源：其仓库 `lib/codemode-settings.ts`、`docs/agents/mcp-settings.md`、`docs/adr/0006-mcp-and-code-mode.md`。）

**建议（按改动大小排序，供维护者取舍）**

1. 沙箱的 `could not load module` 报错追加替代指引。这条文案可能来自 Pi 的运行时（`earendil-works/pi`），如果更适合提到那边，请告诉我，我可以另提一份。
2. 把 `codemode.mode`（`on` / `only`）做成设置项，默认保持 `only`，不改变现有批量检索的行为。参考 `codemodeWorkerLimit` 的设置路径。
3. 在 `only` 模式的系统提示里补一句：沙箱没有 Node，文件读写用 `tools.read` / `tools.write`，长文本直接传字符串参数。

**没有验证的地方**

- 只有一次会话的日志，不能据此判断强模型下是否也有问题。
- 没有量化过 `only` 比 `on` 每次请求少多少 token，所以无法评估改成 `on` 的代价。
- 未在纯上游构建上复现。

日志已移除个人路径、会话 ID 和对话内容，只保留错误文本。
