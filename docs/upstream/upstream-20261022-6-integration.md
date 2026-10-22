# 上游集成记录：2026-10-22（第六轮）

区间是 `e7a310ffc..upstream/master`（`b74716ee6`）里剩下的两个提交：`d3616f33a`（升级依赖）和 `b74716ee6`（修复等待中的队列与即时补充）。上一轮见 [upstream-20261022-5-integration.md](upstream-20261022-5-integration.md)，其中对 `d3616f33a` 做过只读评估。分支 `codex/upstream-20261022-6` 叠在 `codex/upstream-20261022-5`（PR #27）之上，用 `git cherry-pick -x`；#27 合并后，本分支相对 master 只剩本轮的内容。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `d3616f33a` | 升级依赖：electron 44.7.0→44.9.3、electron-vite 5→6、undici 8.10.2→8.12.3、dompurify 3.4.16→3.4.17、markstream-vue 2.0.19→2.0.20（`stream-markdown-parser` 随之升到 1.2.21）、fastify 5.12.1→5.12.7；`pnpm-workspace.yaml` 新增 `follow-redirects` / `hono` / `vitepress>vite` 覆盖。`electron.vite.config.ts` 按 electron-vite 6 把 `externalizeDepsPlugin()` 改成 `externalizeDeps` 配置项。另有 `mermaidLoader.ts` 的初始化标题行匹配修复（允许出现在文本中部）和 E2E 调整 |
| `b74716ee6` | 修复等待中的队列与即时补充：21 个文件，无迁移、依赖或 Rust，无冲突。改动在 `ExecutionCoordinator`、`PiTurnExecutor`、`ChatQueueService`、`createReusableBuddySession`、`useChatQueue`，新增 `agent-queue.e2e.mjs`，并精简了 `buddyService.integration.spec.ts` 里已被新用例覆盖的约 260 行 |

### 冲突解决（`d3616f33a`，3 处）

- **`pnpm-lock.yaml`：** 取本地版本后执行 `pnpm install --no-frozen-lockfile` 重新生成。electron、electron-vite、undici、fastify、hono、dompurify、markstream-vue、follow-redirects 的解析版本与上游完全一致；另有少量传递依赖随重新解析被去重，与上游去重的数量级相同（上游移除 17 个、新增 15 个包版本）。
- **`reading.e2e.mjs`：** 本地已删除，上游有改动，保持删除。
- **`extensionAgent.e2e.mjs`：** 上游改的是 `extension-agent.e2e.mjs`，本地文件名不同且内容已分叉。保留本地文件，只补入上游新增的“关闭功能公告并断言提醒不出现”两行（两处）；上游改成 `#desktop-task-history` 作用域的“新任务”按钮和 `send(…, true)`，本地早已是这个写法。

## 检查

- 迁移：无。依赖：有变更，见上，已 `pnpm install`。品牌：新增行里没有用户可见的 “Lexora” 文案。
- 类型检查：`apps/buddy` 的 `vue-tsc -b` 通过（含 electron-vite 6 的类型）。`eslint` 对全部改动文件无问题。
- **构建：** `pnpm build:electron`（预备内置扩展、`vue-tsc`、`electron-vite build`）通过，main、preload、renderer 三个目标都产出，`electron.vite.config.ts` 的 `externalizeDeps` 迁移有效。**没有跑打包（`package:windows`）**，也没有用 electron 44.9.3 启动应用。
- vitest（本机 Windows，`service/src/agent`、`chat`，`src/modules/tasks`、`shared`、`i18n`，`platform/extensions`）：1627 通过、14 失败，没有本次引入的失败。
  - 已知 Windows 失败：符号链接 `EPERM`（`ExtensionPackageStore`、`ExtensionResourceStore`×2、`BuddyTurnLauncher`、`createBuddySession`、`inspectCommittedPiCompaction`、`mutationToolExecution`）、`toolPolicyExtension`×2、`ToolDisclosure` 的平台假设。
  - `createReusableBuddySession.spec.ts` 3 个（`EISDIR` 与 `SESSION_STORAGE_UNAVAILABLE`）在干净 `origin/master` 上同样失败；本次新增的该文件用例全部通过（13 个里 10 个通过）。
  - `BundledExtensionCatalog.spec.ts` 1 个整批运行时失败，单独运行通过，判断为负载下的超时。
- 未跑：Playwright E2E（`agent-queue.e2e.mjs`、改动后的 `extensionAgent.e2e.mjs`）、打包与安装、electron 44.9.3 的真实启动、队列在真实会话中的等待与即时补充表现、全量测试。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `b74716ee6`，即上游 master 的最新提交。`c81bdfb5` 之后的所有上游提交都已决定。
