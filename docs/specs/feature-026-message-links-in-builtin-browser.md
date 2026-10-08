# Spec-026：消息链接统一由内置浏览器承载

**日期：** 2026-10-08
**状态：** 已实现（相关单元测试通过；桌面端端到端验收待完成）
**改造前代码基线：** master（`d21b3488`）

## 1. 背景

用户在 XTLaw 桌面端发现：AI 输出消息里的链接点击没有反应。最典型的一条是某个会话末尾的 `**[查看精简版](http://127.0.0.1:4173/)**`——这是本机预览地址（`http://` 协议 + 回环地址）。

同时确认了另一件事：**能打开的链接一律交给系统默认浏览器**，用户没有任何办法让链接进内置浏览器。

### 1.1 改造前链路（基线代码事实）

```text
消息 Markdown → DesktopMarkdownContent.vue（handleLinkClick）
  ├─ 以 http/https 开头 → window.open(href, '_blank', 'noopener,noreferrer')
  └─ 其它形式（sandbox:、相对路径等） → emit('openLink')
        → BuddyChatMessageContent.vue 里 canPreviewFile() 成立才预览文件，否则无任何动作

window.open → electron/main/window.ts（setWindowOpenHandler）
  └─ isAllowedExternalUrl()（仅放行 https:）
        ├─ 通过 → shell.openExternal(url) → 系统默认浏览器
        └─ 不通过 → return { action: 'deny' }  ← 不建窗口、不提示、不打日志
```

关键落点：

- `apps/buddy/src/shared/ui/markdown/DesktopMarkdownContent.vue`（第 72–93 行 `handleLinkClick()`）
- `apps/buddy/electron/main/window.ts`（第 125–139 行：`setWindowOpenHandler` 与 `will-navigate`）
- `apps/buddy/electron/main/security/navigationPolicy.ts`（第 13–15 行 `isAllowedExternalUrl()`：`protocol === 'https:'` 才放行）

内置浏览器则完全是另一条通道：渲染层用 `browser.ensureSession()` / `browser.navigate()` 驱动（`apps/buddy/electron/preload/browser.ts`），主进程侧 `BrowserSecurityPolicy.authorizeNavigation()` 本来就放行 `http:` 与 `https:`（含回环地址），而回环地址只被判为 `security.kind = 'local'`，不是拦截。也就是说**内置浏览器打不开本机预览页这件事不成立，缺的是"从消息进入内置浏览器"这条路**。

### 1.2 历史实测记录（本次未复跑）

以下为原草案记录的临时探针结果，探针未留代码；本次确认了基线源码链路，但未独立复核这些历史实测。

- 用仓库自带的 Electron（44.4.5）复刻同一套窗口处理器：`https://` 链接触发 `setWindowOpenHandler` 并调用 `shell.openExternal`；`http://` 链接触发处理器但判定为不允许，之后既没有新窗口也没有外部打开。
- 用 Playwright 夹具启动真实客户端（临时探针，未留代码）：点击 Markdown 里的 `https://example.com/secure`，主进程 `shell.openExternal` 确实被调用。
- 结论：`http://` 链接的"点了没反应"是上面那条静默拒绝导致的；`https://` 链接能用，但只会走系统浏览器。

## 2. 需求

消息里的链接统一由**内置浏览器**承载：

- 协议为 `http://` / `https://` 的链接，点击后在当前对话的浏览器标签里打开（包含 `127.0.0.1`、`localhost` 这类本机地址）。
- 系统浏览器不再是消息链接的默认出口，而是资源面板浏览器标签上已有的显式动作（「在外部浏览器打开」）。

## 3. 需求边界

**包含：**

- 助手正文消息与旁白文本（narration）里的 Markdown 链接：`http(s)://` 一律交给内置浏览器。
- 打开动作语义：打开（或聚焦）当前对话的浏览器标签，并把目标地址交给它导航。
- 文件类链接保持原样：`sandbox:` 前缀、工作区相对路径仍走资源面板文件预览，不进入浏览器。
- 用户仍可通过资源面板浏览器标签的「在外部浏览器打开」把当前页交给系统浏览器。

**不包含：**

- 不放宽主进程外链白名单，`isAllowedExternalUrl()` 与 `window.ts` 的 `will-navigate` 保持现状；本规格不依赖放宽策略达成需求。
- 不改其它 Markdown 表面的外链行为：文件预览（`DesktopDocumentContent.vue`）与技能详情（`DesktopSkillDetail.vue`）里 `https://` 链接仍交系统浏览器，`http://` 仍按现状静默丢弃（见未决事项 4）。
- 不做"默认打开方式"设置项、不做链接右键菜单、不做 `Ctrl/Cmd+点击` 快捷通道。
- 不改内置浏览器自身的策略、页面内弹窗路由与"在外部浏览器打开"实现。

## 4. 技术方案（最小实现）

### 4.1 让 Markdown 组件把外链交给宿主（开关式改动）

文件：`apps/buddy/src/shared/ui/markdown/DesktopMarkdownContent.vue`

- 已新增 prop `externalLinkMode`，取值 `'system' | 'host'`，默认 `'system'`。
- `'system'`（默认）：保持今天的行为，`http(s)` 链接自行 `window.open()`。文件预览、技能详情等表面不传这个 prop，行为完全不变。
- `'host'`：所有 `http(s)` 链接不再自行打开，统一 `emit('openLink', href)`，交给宿主决定去哪。
- 仅在 `'system'` 模式且匹配 `http(s)` 时自行打开；其余统一 `emit('openLink')`，由宿主区分网页链接与文件预览。

### 4.2 给消息表面注入「打开链接」通道

- 文件：`apps/buddy/src/modules/tasks/widgets/transcript/chatContentContext.ts`
  在 `ChatContentContext` 中增加 `openWebLink: (href: string) => void`（与 `canPreviewFile` / `previewFile` / `writeClipboardText` 平级）。
- 文件：`apps/buddy/src/modules/tasks/widgets/workspace/DesktopTaskEditor.vue`
  通过 `createMessageWebLinkOpener()` 创建并注入 `openWebLink`，接入任务浏览器 API、资源面板状态与 `useMessage()` 错误提示。
- 新增：`apps/buddy/src/modules/tasks/widgets/workspace/openMessageWebLink.ts`
  - 点击时捕获 `conversationId`，用 Promise 队列按顺序处理连续点击。
  - 排队后若活动对话已切换，跳过尚未开始的旧对话请求，避免聚焦其他任务。
  - 正常链路：`openBrowser()` → `ensureSession(conversationId)` → `retainBrowserSession(state)` → `navigate(state.sessionId, href)` → `updateBrowserState(nextState)`。
  - 显式保留会话并更新导航返回状态，避免面板订阅尚未就绪时丢失地址栏或错误状态。
  - 同时检查异常和返回状态的 `error`，失败处理见 4.4。

- 依赖已存在，无需新增 IPC：`useTaskContext()` 暴露 `resources`（`TaskResourcePanel`，见 `contracts.ts`）与 `browser`（`LexoraDesktopApi['browser']`，见 `taskContext.ts` 的 `TaskEnvironment`）；`DesktopAppProvider.vue` 第 110–128 行已经把 `api.browser` 传进资源面板，第 282–289 行也把 `browser` 与 `resources` 提供给了任务环境。

### 4.3 消费方路由

- `apps/buddy/src/modules/tasks/widgets/transcript/BuddyChatMessageContent.vue`（第 127–132 行 `handleMarkdownLink()`）
- `apps/buddy/src/modules/tasks/widgets/transcript/BuddyChatNarrationBody.vue`（第 13–16 行 `handleMarkdownLink()`）

两处逻辑一致：

```text
openLink(href):
  ^https?://  → chatContent.openWebLink(href)
  其它        → canPreviewFile(href) ? previewFile(href) : 无动作
```

同时这两处的 `DesktopMarkdownContent` 传 `externalLinkMode="host"`。

### 4.4 失败与兜底

已按第 8 节决策实现：无活动会话、创建会话失败、导航抛异常或返回错误状态时，显示现有 `desktop.context.browserPageFailed` 提示（「页面加载失败，可重试。」）。HTTPS 同时回退 `window.open(href, '_blank', 'noopener,noreferrer')`；HTTP 不尝试主进程必然拒绝的系统出口，只显示错误提示。已有浏览器错误状态仍保留在面板中。不新增「改用系统浏览器」入口。

## 5. 桌面端验收标准（待验证）

以下为真实桌面端验收项，单元测试通过不等于实际页面加载或窗口行为已完成验收。本次按用户要求只做精简单元验证，不运行 `pnpm check:buddy` 或端到端测试。

- [ ] 助手消息里的 `https://` 链接点击后，在**内置浏览器**打开该地址，系统浏览器不被唤起。
- [ ] `http://127.0.0.1:4173/` 这类本机地址点击后能在内置浏览器加载，不再"点了没反应"。
- [ ] 连续点击不同链接时复用同一浏览器标签导航，不新增标签、不新增窗口。
- [ ] 旁白文本里的链接与正文消息行为一致。
- [ ] `sandbox:/workspace/...`、工作区相对路径链接仍走资源面板文件预览。
- [ ] 文件预览、技能详情里的 `https://` 链接行为与改动前一致（仍由系统浏览器打开）。
- [ ] 资源面板浏览器标签的「在外部浏览器打开」仍能把当前页交给系统浏览器。
- [ ] 无活动会话时的行为符合第 8 节已确认决策 1，且不会静默失败。
- [ ] `pnpm check:buddy` 通过。

## 6. 场景描述

**正常流程：**

1. 用户在对话里看到助手输出的链接，左键单击。
2. 资源面板切到当前任务的浏览器标签（若尚未打开则打开）。
3. 浏览器标签加载目标地址；面板工具栏显示该地址与安全状态（`secure` / `insecure` / `local`）。

**异常流程：**

1. 用户点击的地址不可达（例如本机预览服务已停止）。
2. 显示加载失败提示；HTTPS 自动尝试回退系统浏览器，HTTP 保留提示，用户可修正地址或恢复本机服务后重试。
3. 当前没有活动会话（欢迎页/未落地的草稿）：显示失败提示，HTTPS 回退系统浏览器，HTTP 不调用系统出口。

## 7. 相关测试与验证记录

已更新或新增：

- `apps/buddy/src/modules/tasks/widgets/transcript/__tests__/BuddyChatMessageContent.spec.ts`：验证正文 HTTP/HTTPS 调用 `openWebLink`，不调用 `window.open`；文件链接仍预览。
- `apps/buddy/src/modules/tasks/widgets/transcript/__tests__/messageLinkRouting.spec.ts`：验证 Markdown 默认 system、host 和旁白三个路由，包括嵌套元素点击与文件链接。
- `apps/buddy/src/modules/tasks/widgets/workspace/__tests__/openMessageWebLink.spec.ts`：验证连续导航调用顺序、面板状态更新、无会话、会话创建失败、导航异常、返回错误状态、HTTPS 回退及 HTTP 可见提示。
- `apps/buddy/src/modules/tasks/widgets/transcript/__tests__/BuddyChatActivities.spec.ts`：仅补齐上下文夹具的 `openWebLink`；本次未运行此文件。

本次执行的最小范围命令：

```powershell
pnpm --filter @uselexora/lexora-buddy exec vitest run src/modules/tasks/widgets/transcript/__tests__/BuddyChatMessageContent.spec.ts src/modules/tasks/widgets/transcript/__tests__/messageLinkRouting.spec.ts src/modules/tasks/widgets/workspace/__tests__/openMessageWebLink.spec.ts --maxWorkers=2
```

结果：**3 个测试文件、17 个用例全部通过**；`git diff --check` 通过。未运行全量检查、类型检查、桌面端端到端测试或打包。测试中的浏览器 API 为 mock，不能证明真实 HTTP 服务可达、会话幂等或 Electron 窗口行为。后续可复用 `browserPopupNavigation.e2e.mjs` 验证实际地址栏与页面加载。

## 8. 已确认决策与未决事项

**已确认（2026-10-08）：**

1. **失败兜底：HTTPS 回退系统浏览器，HTTP 提供可见提示。** `activeConversationId` 为空、`ensureSession()` 失败、`navigate()` 抛异常或返回错误状态时，都显示失败提示；仅 HTTPS 调用 `window.open(href, '_blank', 'noopener,noreferrer')`。这是对原草案回退规则的完善，避免 HTTP 再次静默失败。
2. **内置浏览器导航失败：复用现有提示文案及面板错误状态**，不额外提供"改用系统浏览器"入口。

**未决（本期不做）：**

3. 是否需要给 `https://` 保留 `Ctrl/Cmd+点击` 直达系统浏览器的快捷通道。
4. 是否把文件预览、技能详情等其它 Markdown 表面也切到内置浏览器（`http://` 在这些表面仍会被静默丢弃）。
5. 是否需要"复制链接地址"等其它链接动作。

## 9. 风险

- **标签归属**：浏览器标签以 `conversationId` 为键（`browserTabId()`），`openBrowser()` 打开的是当前任务标签。切任务后点击链接应落到该任务自己的标签，不会串会话；实现时需确认 `spaceTaskBrowserTab()` 与 `openBrowser(source)` 的语义。
- **会话幂等**：`browser.ensureSession(conversationId)` 在被驱动的浏览器表面已挂载时会被调用两次，需要确认同一对话返回同一 `sessionId`，避免重复会话或抢导航。
- **地址栏与时序**：内置浏览器初始为 `about:blank`，`navigate()` 的返回值需要进入面板状态（`useBrowserContextSurface.ts` 已有该路径），否则地址栏与页面可能不一致。
- **登录态差异**：内置浏览器使用自己的浏览数据分区，链接从系统浏览器切到内置浏览器后，站点登录态不再复用，属于预期行为但需在体验上可解释。
- **影响面**：`DesktopMarkdownContent.vue` 被多处复用，默认值必须保持 `'system'`，否则会改变文件预览与技能详情的行为。

## 10. 文件与术语说明

| 原名称 | 中文含义 | 用途 |
|---|---|---|
| `DesktopMarkdownContent.vue` | 桌面端 Markdown 渲染组件 | 消息、文件预览、技能详情共用的渲染入口，含链接点击处理 |
| `handleLinkClick()` | 链接点击处理函数 | 判定链接类型并决定由谁打开 |
| `windowOpenHandler` / `setWindowOpenHandler` | 新窗口打开处理器 | 主进程拦截 `window.open` 的唯一入口 |
| `isAllowedExternalUrl()` | 外链白名单判断 | 目前只放行 `https:`，是 `http://` 静默丢弃的原因 |
| `shell.openExternal()` | 交系统默认浏览器打开 | 系统外链出口；消息正常打开链路不再经过它 |
| `ensureSession()` | 取（或创建）浏览器会话 | 以 `conversationId` 为键，返回含 `sessionId` 的状态 |
| `navigate()` | 在会话中导航 | 把目标地址交给内置浏览器加载 |
| `openBrowser()` | 打开浏览器标签 | 资源面板动作，切到当前任务自己的浏览器标签 |
| `TaskResourcePanel` / `TaskEnvironment` | 任务资源面板 / 任务环境 | 消息组件取 `resources` 与 `browser` 的上下文来源 |
| `createMessageWebLinkOpener()` | 消息网页链接打开器 | 串行导航、面板状态同步及失败兜底 |
