# Spec-015：资源文件用外部应用打开与在文件管理器中显示

**日期：** 2026-10-02
**状态：** 方案已与用户确认，尚未实现或验收
**基线：** master（`ccfdda6c`，2026-10-02）

> 本文档只描述方案，随本分支提交；截至提交时未修改产品代码。

## 1. 方案摘要

在资源面板的「文件」标签与「制品」标签的工具条上新增“打开”按钮：单按钮 + 下拉菜单，菜单包含两项——

1. **用默认应用打开**：交给系统关联程序打开文件（目录则由资源管理器打开）。
2. **在文件管理器中显示**：文件用系统文件管理器高亮定位，目录则打开该目录。

路径一律在服务端 / 主进程按授权解析，渲染层只提交“空间文件目标”或“制品 ID”，**不新增“打开任意绝对路径”的通用接口**（用户已确认走该方案）。

已确认的取舍：

- 覆盖范围只有「文件」标签与「制品」标签；「变更」标签本期不做。
- 不做系统“打开方式”选择对话框。
- 不新增键盘快捷键或命令面板命令。

## 2. 背景与现状

用户需求原文：给资源区提供一个文件打开按钮，可以用外部应用打开，里面还可以选择在文件管理器中打开。

代码核查得到的现状：

- **「文件」标签已有“在文件管理器中显示”的内核，但没有界面入口。** 渲染层上下文 `TaskChatWorkspace['context'].files` 已经带上 `revealFile`（`apps/buddy/src/app/bootstrap/DesktopAppProvider.vue`、`apps/buddy/src/modules/tasks/state/useTaskCapability.ts`、`apps/buddy/src/modules/tasks/contracts.ts` 三处装配），但全仓库没有一处 UI 调用；i18n 也已有 `desktop.context.revealFile`（打开所在目录）与 `desktop.context.fileRevealFailed`（无法打开文件所在目录）两个键，同样未接线。目前唯一实际调用者是任务侧栏的“打开空间目录”。
- 现有 IPC `lexora:buddy:space-files:reveal`（`apps/buddy/electron/main/local-chat/spaces.ts`）的语义是：文件 → `shell.showItemInFolder`；目录 → `shell.openPath`。**没有“用默认应用打开文件”的入口。**
- **「制品」标签没有任何打开 / 定位能力。** 制品记录里的 `path` 是服务端的绝对规范路径，但渲染层要打开它必须按 ID 解析（先例：主进程通过 `artifacts.resolveBrowserEntry` 把制品解析成浏览器可打开的本地文件，只服务于浏览器会话）。
- **「变更」标签的 `path` 是授权相对路径**（由变更捕获服务按目录授权计算得出），不是绝对路径，无法直接交给系统打开，因此本期不做。
- 文件视图（`files.preview` / `files.editor`）在 `registerDesktopContributions.ts` 中只注册到 `context` 位置，因此文件工具条只出现在资源面板，符合本期范围。
- 工程安全约定：IPC 入参全部有 zod 严格校验，路径类操作都在服务端按空间目录授权 / revision 解析（`SpaceFileService.resolve` / `locate`），主进程只做 `shell.*` 调用。本方案顺着既有通路扩展。

## 3. 需求边界

**包含：**

- 「文件」标签：当前预览 / 编辑文件的工具条显示“打开”按钮，菜单两项（默认应用打开、在文件管理器中显示）。
- 「制品」标签：当前制品的工具条显示同一个按钮；制品为目录时同样适用。
- 文件与目录在两个动作下的明确语义（见第 5 节）。
- 系统调用失败时给出明确反馈（主进程返回的错误字符串 → 界面提示），中英文文案齐备。
- 新增接口一律按“空间文件目标”或“制品 ID”解析路径，渲染层不接触绝对路径。
- 组件复用：文件与制品共用一个打开按钮组件，避免两套实现。

**不包含：**

- 「变更」标签的打开 / 定位（路径体系不同，另行立项）。
- 系统“打开方式”选择器（Windows `OpenAs` 对话框）与“用其他程序打开”。
- 通用“打开任意绝对路径”的桌面 API。
- 聊天消息卡片、任务侧栏、技能列表等其他位置的打开入口。
- 保存后自动打开、双击树节点直接外部打开等联动行为。
- 改变现有文件预览 / 编辑、敏感文件脱敏与目录授权的既有策略。
- 在 macOS / Linux 上定制额外的应用选择行为（统一交给 Electron `shell`）。

## 4. 交互与文案

- 形态：工具条上一个“打开”按钮（图标 `Open20Regular`），点击展开下拉菜单；菜单两项（第一项“用默认应用打开”，第二项“在文件管理器中显示”），选择后菜单关闭并执行。
- 菜单实现沿用工程既有做法（参考资源面板头部的“新建标签”菜单与浏览器工具条的菜单）。
- 按钮位置：与现有工具条动作并排；文件标签放在 `DesktopDocumentToolbar` 的 `actions` 插槽内（与插件菜单 `resource.actions` 并列），制品标签复用同一位置。
- 文案：

| 键 | 中文 | 英文 | 状态 |
|---|---|---|---|
| `desktop.context.openExternal` | 用默认应用打开 | Open with default app | 新增 |
| `desktop.context.revealFile` | 打开所在目录 | Open containing folder | 复用（已存在） |
| `desktop.context.openFailed` | 无法用外部应用打开该文件 | Could not open this file externally | 新增 |
| `desktop.context.fileRevealFailed` | 无法打开文件所在目录 | Could not reveal this file | 复用（已存在） |

- 无障碍：按钮与菜单项提供可访问名称；菜单支持键盘上下移动与 Esc 关闭。

## 5. 行为与系统调用

| 动作 | 文件 | 目录 |
|---|---|---|
| 用默认应用打开 | `shell.openPath(绝对路径)`：交给系统关联程序 | `shell.openPath(目录)`：资源管理器打开该目录 |
| 在文件管理器中显示 | `shell.showItemInFolder(绝对路径)`：打开所在目录并高亮选中 | `shell.openPath(目录)`：打开该目录（与现有 reveal 语义一致） |

- `shell.openPath` 返回非空字符串即为失败，主进程把该字符串作为错误抛出，界面按第 4 节文案提示。
- 外部打开不受内置预览限制：二进制、超大文件、被预览策略脱敏的敏感文件，只要用户主动点击都允许交给系统程序处理；本差异需要在实现与验收中记录。

## 6. 接口设计

### 6.1 文件标签（空间文件，走既有授权通路）

- 渲染层新增：`api.localChat.spaces.openFile(target: SpaceFileTarget): Promise<void>`。
- 新增 IPC 通道：`lexora:buddy:space-files:open`（与现有 `…:reveal` 并列）。
- 主进程实现：`electron/main/local-chat/spaces.ts` 中新增 handler，复用 `spaceFilesRpc.locate`（服务端按空间目录授权与 revision 解析）→ `shell.openPath(path)`；失败抛出。
- 入参 schema 复用 `spaceFileTargetSchema`，不新增路径类入参。
- 现有 `spaces.revealFile` 语义与实现保持不变，只作为菜单第二项。

### 6.2 制品标签（按制品 ID 解析）

- 渲染层新增：`api.localChat.artifacts.openExternal(input)` 与 `api.localChat.artifacts.reveal(input)`。
- 新增 IPC 通道：`lexora:buddy:artifacts:open`、`lexora:buddy:artifacts:reveal`，输入 `{ conversationId, artifactId }`（严格 schema）。
- 主进程：在 `electron/main/local-chat/activity.ts`（制品 `read-text` 已在此注册）新增 handler；路径解析经服务端完成——扩展现有“按制品解析本地条目”的能力（先例 `resolveArtifactEntry`，装配点在 `electron/main/app/DesktopIntegrations.ts`）为通用解析入口，返回 `{ path, kind }` 后由主进程调用 `shell.openPath` / `shell.showItemInFolder`。
- 渲染层无法提交任意路径，只能提交制品 ID，保持现有 IPC 安全边界。

### 6.3 渲染层装配（三处同步）

| 文件 | 本次职责 |
|---|---|
| `apps/buddy/src/modules/tasks/contracts.ts` | `TaskChatWorkspace['context']` 增加 `openFile`、制品打开 / 定位两项 |
| `apps/buddy/src/app/bootstrap/DesktopAppProvider.vue` | 同步 files / artifacts 装配 |
| `apps/buddy/src/modules/tasks/state/useTaskCapability.ts` | 同步 files / artifacts 装配 |

## 7. 实现要点

| 文件 | 中文说明 | 本次职责 |
|---|---|---|
| `apps/buddy/shared/spaces/spaceFileApi.ts` | 空间文件协议 | 如需新增打开语义的 RPC / 类型在此扩展（默认复用 `locate`） |
| `apps/buddy/shared/artifacts/artifactApi.ts` | 制品协议 | 新增打开 / 定位的请求 schema（`{ conversationId, artifactId }`） |
| `apps/buddy/electron/shared/localChatApi.ts` | 渲染层本地 API 契约 | 新增通道常量与 `spaces.openFile`、`artifacts.openExternal` / `artifacts.reveal` 类型 |
| `apps/buddy/electron/preload/local-chat/spaces.ts`、`…/activity.ts` | 预加载桥 | 暴露两个新 API |
| `apps/buddy/electron/main/local-chat/spaces.ts` | 主进程空间文件 IPC | 新增“用默认应用打开”handler（`locate` → `shell.openPath`） |
| `apps/buddy/electron/main/local-chat/activity.ts` | 主进程活动 IPC | 新增制品打开 / 定位 handler |
| `apps/buddy/electron/main/app/DesktopIntegrations.ts` | 主进程服务装配 | 提供按制品 ID 解析本地路径的入口 |
| `apps/buddy/service/src/artifacts/ArtifactService.ts`（或等价服务层） | 制品服务 | 如现有解析入口不足以覆盖“目录 + 文件”，在此补一个只返回路径与类型的解析方法 |
| `apps/buddy/src/shared/ui/files/DesktopFileOpenButton.vue`（新增） | 打开按钮组件 | 单按钮 + 菜单，接收打开 / 定位两个动作 |
| `apps/buddy/src/modules/files/widgets/DesktopFilePreview.vue`、`DesktopFileEditor.vue` | 文件视图 | 在 `DesktopDocumentToolbar` 的 `actions` 插槽接入打开按钮 |
| `apps/buddy/src/modules/tasks/widgets/context-panel/DesktopArtifactToolbar.vue`、`DesktopArtifactContextSurface.vue` | 制品工具条 | 接入同一个打开按钮，接线制品动作 |
| `apps/buddy/src/modules/tasks/widgets/context-panel/DesktopTaskResourcePanel.vue` | 任务资源面板装配 | 把文件与制品的打开 / 定位动作传给各 surface |
| `apps/buddy/src/i18n/locales/zh-CN/tasks.ts`、`en-US/tasks.ts` | 文案 | 第 4 节新增键 |

范围说明：文件视图只注册在资源面板（`locations: ['context']`），因此按钮天然只出现在资源面板；若后续文件视图被允许出现在主区，该按钮会随工具条一起出现，属于同一能力。

## 8. 测试与验收

### 自动化测试

- 主进程单测（参考现有 `apps/buddy/electron/main/__tests__/localChatIpc.spec.ts` 的写法，mock `electron.shell`）：
  - 空间文件：合法目标调用 `shell.openPath`；非法入参被 schema 拒绝；`openPath` 返回错误字符串时抛出。
  - 制品：合法 `{ conversationId, artifactId }` 调用 `shell.openPath` 或 `shell.showItemInFolder`；未授权 / 不存在的制品被拒绝。
- 组件测试：打开按钮渲染菜单两项、点击触发对应回调；文件与制品工具条接入后按钮存在。
- 类型检查与 lint：`pnpm check:buddy` 对应子项通过。

### 手工验收（Windows 为主，macOS / Linux 抽查）

- [ ] 文件标签选中一个文本文件：菜单“用默认应用打开”能用关联程序打开；菜单“在文件管理器中显示”能在资源管理器中高亮该文件。
- [ ] 文件标签选中一个目录节点：两个动作都能打开该目录。
- [ ] 制品标签（文件）：两个动作按第 5 节语义生效。
- [ ] 制品标签（目录）：两个动作都能打开该目录。
- [ ] 二进制 / 超大 / 未知类型文件可被外部打开，不受内置预览限制。
- [ ] 文件被删除或路径失效时给出明确失败提示，不静默。
- [ ] 菜单键盘操作与 Esc 关闭正常，中英文文案正确。
- [ ] 插件菜单（`resource.actions`）、预览 / 源码切换、目录树等既有功能无回归。

## 9. 文件与术语说明

| 名称 | 中文含义 | 说明 |
|---|---|---|
| `spaceFilesReveal` | 空间文件“在文件管理器中显示”通道 | 已有实现：文件高亮定位，目录打开 |
| `spaceFilesOpen` | 空间文件“用默认应用打开”通道 | 本方案新增 |
| `artifactsOpen` / `artifactsReveal` | 制品打开 / 定位通道 | 本方案新增，按制品 ID 解析 |
| 制品 ID 解析 | 服务端按 `{ conversationId, artifactId }` 求本地规范路径 | 先例为浏览器打开的制品解析入口 |
| 授权相对路径 | 变更记录里相对目录授权的路径 | 本期不处理，属「变更」标签后续方案 |

## 10. 未决事项与风险

- 「变更」标签的打开 / 定位需要“授权 + 相对路径”的另一套解析，单独立项；本方案不预留半成品接口。
- 主进程错误文案目前计划复用固定提示；是否需要按错误类型细分（无关联程序 / 文件不存在 / 权限）在实现时确认，先用统一提示保证可发布。
- 若后续需要在 macOS 上区分“用默认应用打开”和“用其他应用打开”，应另开方案，不在本期扩展。
