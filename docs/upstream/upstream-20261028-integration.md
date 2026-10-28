# 上游集成记录：2026-10-28

区间是 `18f424031..80b38d769` 的 4 个提交（`18f424031` 是上一轮的基线）。分支 `codex/upstream-20261028`，用 `git cherry-pick -x`，基于 `master`。

## 已移植

| 本地提交 | 上游提交 | 内容 |
| --- | --- | --- |
| `3fa75868e` | `ce8648ebd` | 消息投递与对话时间线：发送接口新增 `delivery`（只支持 `current`，校验目标运行、智能体、模型与权限一致）；智能体可用委派工具的 `forward` 原样转发用户输入，并限制同一输入再派活给同一智能体（`input_forwarded`、`forward_closed`）；新增 `executions.inputs` 分页读取用户输入；发送按钮抽成 `DesktopComposerSubmitActions.vue`；时间线投影与渲染重做 |
| `eb0c01ed9` | `be6c7485c` | 完全访问模式的权限语义：系统提示改为可用工具全部自动批准，仍受显式工具范围与拒绝规则约束 |
| `d8c28ec02` | `901d7704e` | 网页请求超过并发上限时排队：排队放在主进程侧的 `HostWebService`（网络 8、渲染 2，各排队上限 64，`BoundedSemaphore`），新增 `queued` 阶段与诊断事件。先用 `6390266cf` 撤销本地 `34416ad83` 的 service 侧 `WebConcurrencyGate`（总并发 4、渲染 2、排队等待 30 秒），再移植上游版本；两者实现不同，不是等价改动，起初把它标成“跳过”是错的 |

## 跳过

无。

## 不移植（有意不同）

`80b38d769`（插件贡献 MCP 连接器与 NPC，#469）：不移植，保留本地实现。它与本地 `6e5dae803` 起的市场能力层是同一功能的两套实现，数据格式不兼容：
- MCP 连接器：本地用 `credential` 和 `deferred`，上游用 `authentication`，没有 `deferred`。
- 子代理：本地有 `kind: 'npc'`，工具用 `tools: { mode, ids }`，可整选连接器的全部工具并引用内置的北大法宝；上游改为逐个工具引用，只能引用同包连接器，并新增 `skills` / `requiredSkills`。
- 存储：本地用 `extension-capabilities.json` 账本，上游用数据库表 `extension_capabilities`（迁移 v36），并接入备份恢复。
- 本地独有、上游没有的 `BUILTIN_CAPABILITY_IDS`、`installedExtensionKinds`、`connectorSetupState` 会随替换丢失；`xtlaw-market` 的 `legal-research-agent` 按本地格式声明，会被上游的 `.strict()` 校验拒绝。

本地账本功能尚未随任何版本发布。以后若要对齐上游，需要先决定声明格式，再单独成轮；迁移编号届时顺延为 v38。

## 冲突解决

`ce8648ebd`：
- 迁移：上游 v35 `InputDelivery`（只有 `SELECT 1;`）在本地编为 v37，`BUDDY_SCHEMA_VERSION` 改为 37，注释说明偏移；`schema.spec.ts` 保留本地的 v23 升级用例，新增的升级用例改为从本地 v36 起。
- `DesktopComposerSubmitActions.vue`：本地曾内联删除，采用上游版本；`DesktopChatComposer.vue` 改用该组件，去掉不再使用的 `NTooltip`、图标与 `DesktopIcon` 导入。
- `useTaskCapability.ts`：采用上游的 `useActorInputTarget`（`mailboxTarget`、`inputExecution`），保留本地的 `addressedActiveRun` / `presentedActiveRun`（点击停止后立即结束运行展示）。
- `useTaskComposer.ts`：采用上游的 `isRunning` / `isStopping` 计算。
- `useChatTurnExecution.spec.ts`：两侧用例都保留；夹具合并上游的 `actorInput` 与本地的 `presentation`。
- `useChatViewport.spec.ts`：保留本地的通知定位用例。

`be6c7485c`：
- `createBuddySystemPrompt.ts`：采用上游的完全访问提示，替换本地“敏感读取、MCP 调用等仍需授权”的描述。
- `toolScopeSession.spec.ts`：两侧导入都保留。
- `901d7704e`：`requestThroughHost.ts` 保留本地的 `usesSessionCookies`（搜狗微信搜索需要会话 Cookie），并接入上游新增的 `trackClose`；`WebCapabilityService.ts` 保留本地的 `sogou-weixin` 分支，改用上游的 `get`（带请求上下文）；`WebCapabilityService.spec.ts` 两侧用例都保留。

## 检查

- 迁移：有（见上）；依赖：无；Rust：无；`.github/workflows`：未改。
- 品牌：`ce8648ebd` 新增行里的 “Lexora” 都在测试夹具里（`buddyName: 'Lexora'` 等），不是用户可见文案。
- 样式：未新增 UnoCSS 类名，无需补映射。
- WSL 本机：移植 `901d7704e` 后 `vue-tsc -b` 通过，`service/src/web`、`electron/main/network`、`shared/async` 共 18 个文件、116 个用例通过；`vue-tsc -b` 通过（需 `NODE_OPTIONS=--max-old-space-size=8192`）；移植 `ce8648ebd` 后 `schema.spec.ts`、`service/src/agent/execution`、`src/modules/tasks` 共 119 个测试文件、1166 个用例通过；移植 `be6c7485c` 后 `service/src/agent` 54 个文件、535 个用例通过。
- 未跑：Playwright E2E、开发预览、打包；输入框投递按钮、转发、时间线的真实窗口表现。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `80b38d769`，`80b38d769` 记为不移植。
