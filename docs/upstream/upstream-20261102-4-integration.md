# 上游集成记录：2026-11-02 第四轮

这一轮移植 `6ca67989d`（浏览器执行隔离与后台打开），它是当时上游的最后一个提交。分支 `codex/upstream-20261102-4`，叠在第三轮分支 `codex/upstream-20261102-3` 之上，用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 本地提交 | 内容 | 冲突 |
| --- | --- | --- | --- |
| `6ca67989d` | `818dd93cc` | 支持浏览器执行隔离与后台打开 | 9 个文件，21 处 |

要点：

- **执行隔离：** 每次智能体运行得到自己的页面（标签 id `agent:<runId>`，归属 `owner = {runId, buddyId}`）。主进程的观察、读取、动作、截图、取得和释放控制权都先 `assertOwner`，归属不符报 `BROWSER_CONTROL_REQUIRED`。因为用户自己的页面没有 owner，按这段逻辑智能体不再操作用户当前的页面（未在运行里验证）。
- **后台打开：** `browser_open` 新增 `background`，默认 `true`，页面在后台打开、不抢焦点；`false` 才展示给用户。任务面板里智能体页面是单独的标签，不会被自动选中；渲染进程用 `listGuests` / `onGuestsChanged` 恢复可能漏掉的事件。
- **取消与超时：** 新增 RPC `host.browser.cancel`；运行被中止、超时或换了所属运行时，服务端排队器中断，主进程 `cancelExecution` 停止加载、归还人工控制、中止进行中的操作。调试器每个操作有 30 秒期限，超时算“页面无响应”，页面被隔离并销毁；5 秒内确认不了销毁就保持隔离。
- **资源：** 会话上限 4 → 16；操作进行中的会话不被淘汰；清理等页面真正销毁。

这是用户可感知的行为变化：以前智能体打开网页会直接出现在浏览器面板里并接管它，现在默认只在后台多一个标签。`background` 的默认值跟上游。

## 冲突解决

本地 Spec-017 的定制（弹窗路由 `openedFrom`、人工文件选择、人工下载放行、`showDialog` 桥接、blocked 提示、favicon、视口）上游没有，所以大多数冲突是“两边各加了东西”，处理为并存。

- `browserDesktopApi.ts`、`browserDesktopSchemas.ts`（各 1 处）：`owner` 与 `favicon`、`viewport`、`openedFrom` 并存。
- `BrowserSecurityPolicy.ts`（3 处）：路由同时有 `allowDownload` 和 `isActive`，字段同时有 `#fileChooserSubscription` 和 `#quarantined`。补了两处本地代码：下载监听里增加 `!route.isActive()`（隔离中的页面不放行下载），文件选择事件在已隔离时直接忽略（不再把请求投递给人工选择）。
- `BrowserDebugger.ts`（3 处）：本地的事件订阅 `onEvent` 与上游的 `run` / `abort`（带期限）合在一起。`ensureAttached` 在已中止时抛出原因，否则沿用本地“未附加就附加并绑定消息”；`abort` 一开始就解绑消息并清空订阅；中止后再 `onEvent` 返回空的取消函数。
- `BrowserPageSession.ts`（3 处）：导入合并；选项里 `favicon`、`viewport`、`openedFrom` 与 `owner` 并存；`onPermissionDenied` 保留本地的 `#reportBlocked`，前面加上“连接已释放或页面已换”就返回的守卫。
- `BrowserHost.ts`（5 处）：选项里 `guestPreloadPath`、`showDialog`、`openExternal`、`selectFiles` 与 `maxSessions` 并存。`#ensureSession` 和 `#createSession` 的第四个参数统一成选项对象 `BrowserSessionOrigin = { owner?, popup? }`：智能体会话传 `{ owner }`，弹窗传 `{ popup: { openedFrom, partition } }`，换隔离模式时沿用原来的 owner。guest 描述符的分区仍是 `popup?.partition ?? (默认分区或无痕分区)`，同时带上 `owner` 和 `conversationId`。
- `taskContextPanel.ts`、`useTaskContextPanel.ts`（各 1 处）：导入按本地的 `FileTarget` 命名，补 `browserAgentTabId`、`agentBrowserTab`；上游那几个本地没有的导入（`SpaceFileTarget` 别名、`LocalRunOutput`、`artifactTabId`）本地代码里用不到，没带。
- `useTaskResourcePanel.ts`（3 处）：状态变化处理分两条路：先走上游的“智能体页面”分支（有 `owner` 的状态，未匹配到标签就缓存并刷新 guest 列表）；再走本地原来的分支（已有标签就更新，否则按 `openedFrom` 把弹窗挂到来源标签旁边）。保留本地的 `revealOpenOfficeDocument` 选项和对应导入。

测试夹具：

- `revealOpenOfficeDocument.spec.ts`、`useTaskResourcePanelArtifact.spec.ts` 的 `browser` 桩补了 `onGuestsChanged`、`listGuests`。
- 上游新增的 `BrowserPageSession.spec.ts` 补了本地必填的 `onWindowOpen`。

## 验证与待办

- 品牌：新增行里没有 “Lexora”。
- WSL 本机：`pnpm type-check` 通过（`NODE_OPTIONS=--max-old-space-size=8192`）；改动的 50 个文件 eslint 通过；`electron/main/browser`、`service/src/browser`、`service/src/agent/extensions`、`src/modules/tasks`、`src/app`、`src/workbench`、`shared/browser` 共 204 个测试文件 1818 个测试通过，其中既有上游改写的用例，也有本地 Spec-017 的用例。
- 未跑：Playwright E2E、开发预览、打包。**必须在 Windows 开发预览里看：**
  - 智能体打开网页：任务面板里静默多一个 `agent:` 标签，不抢焦点、不自动选中；`background: false` 时才展示。
  - 用户点开这个标签后能接管：控制权状态正确，接管后智能体的动作被拒绝，归还后可继续。
  - 运行中途取消，页面被销毁、没有残留调试连接；两个运行同时浏览互不干扰。
  - 用户自己的标签：上传文件、下载、弹窗（需要新鲜的人工点击）、`alert/confirm` 桥接、DevTools、favicon、响应式预览都和合并前一样。
  - 弹窗从智能体页面里发起时的行为：本地弹窗要求新鲜的人工点击，智能体驱动的页面一般触发不了；如果用户接管后点击产生弹窗，弹窗标签没有 owner，按人工页面处理。这一点没有专门的测试，需要看一眼。
  - 同一会话里同时有多个智能体页面加弹窗时，会话数量到 16 的上限提示是否合理。
- 待办：更早暂缓的 `e197fc271`（插件后台安装与进度反馈）、跳过的 `095595a0e`（插件包核验与风险确认安装）和 `1057555ea`（README）状态不变。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `6ca67989d`，即当前上游的最新提交。
