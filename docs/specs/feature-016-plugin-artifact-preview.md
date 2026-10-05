# Spec-016：产出预览的插件接入（设计草案）

**日期：** 2026-10-03

**状态：** 仅设计草案，**尚未实现**。本文只记录现状核查、方案选项与验收计划；未经用户确认不进入实施，也不代表任何能力已经可用。

**相关：** [Spec-013：工作台选区引用与多分屏目标](./feature-013-workbench-selection-reference.md)、[Spec-012：插件术语统一](./feature-012-plugin-terminology.md)、[架构概览](../architecture/overview.md)

---

## 1. 方案摘要

当前“本轮产出”卡片点开后由宿主的**内置产出预览**渲染，只覆盖图片、Markdown、部分文本和 HTML（HTML 转交浏览器）；PDF、表格、压缩包、Office 文档、音视频等只能显示“暂不支持预览”。

本方案讨论的问题是：**能否让已安装插件为这些产出提供自己的阅读视图**，并把它做成宿主正式能力，而不是让插件绕过隔离去读文件。

结论方向（待确认）：

- 插件**不能**替换或注入内置产出预览的占位区域。产出的展示位属于宿主，插件只能**另开自己的隔离视图页签**。
- 要让插件看到产出，宿主需要提供一条正式的“**宿主分配只读资源**”通路：句柄不透明、不含路径、只读、按视图实例授权。
- 实现的关键约束在于**读取能力**：现有“用户选中的文件”通路**只允许读文本**，二进制（分片读取、受控 URL）目前只在“插件自己弹系统选择器”的通路开放。因此让插件看 PDF/音视频，本质上是**为宿主分配的只读资源开放有界的二进制读取**，这是本方案的核心安全决策，而不是加一个菜单项。
- 内置支持的格式继续走内置预览；插件是**补充**，不是替代。没有插件时行为保持现状。

本文保留完整设计讨论；真正实施前必须先确认第 7 节的待核实项。

## 2. 背景与现状

以下现状来自 2026-10-03 的源码阅读，**不是运行验证**。

### 2.1 产出预览现状（宿主内置）

| 环节 | 现状 |
|---|---|
| 入口 | 聊天“本轮产出”卡片（`BuddyArtifactCard.vue`）→ `openArtifact` → 资源面板 `artifact` 标签页 |
| 渲染 | `src/modules/tasks/widgets/context-panel/DesktopArtifactContextSurface.vue` + `DesktopDocumentContent.vue`，面板里直接写死，没有视图注册、没有插件扩展点 |
| 读文本 | `artifacts.readText` → `ArtifactService.readText()`；只接受文本类 mime 或 `.md`，上限 2 MiB，严格 UTF-8 |
| 读图片 | 自定义协议 `lexora-artifact://preview/<artifactId>` → `artifacts.resolvePreview`；服务端只允许 `image/*` |
| 类型判定 | 按**扩展名**推断 mime（`inferArtifactMimeType`）；目录记为 `inode/directory` |
| 路径语义 | 产出记录保存的是磁盘**实时路径**（`record.currentPath` → `LocalArtifact.path`），预览读的是当前文件，不是快照 |
| 登记条件 | 必须落在已授权目录内；`.env`、`.pem`、`id_rsa` 之类敏感文件名在登记阶段即被拒绝 |
| 目录产出 | 只显示文件夹图标与路径，不能展开 |
| HTML/HTM | 特判走浏览器会话（`isBrowserArtifact`），不经过产出预览 |
| 其它类型 | PDF / xlsx / zip / docx / 音视频等显示“暂不支持预览”，**不会**调用系统默认程序 |

### 2.2 插件（Extension）资源能力现状

| 能力 | 现状 |
|---|---|
| 视图声明 | 清单 `contributes.views`：`resource` 为 `selected-file`（默认）或 `none`；`location` 默认 `context`（工作区资源页签） |
| 视图运行 | 隔离 iframe（`SandboxedExtensionHost`），插件看不到宿主 DOM、Node、任意本地文件 |
| 资源句柄 | 不透明 `{ id, name }`，由 `ExtensionPackageStore` 授予，`#resource()` 解析回 `SpaceFileTarget`；插件拿不到真实路径 |
| 选中文件的读取 | **仅** `resources.readText`（走 `spaceFiles.readDocument`，上限 1 MiB）。`resources.readBytes`、`resources.getUrl` 在该通路下被拒绝 |
| 二进制读取 | 只在插件自己调用 `resources.pickFiles/pickDirectory`（权限 `localResources`）后可用：`readText` / `readBytes`（单次 ≤ 128 KiB）/ `getUrl`（会话内受控 URL）/ `scanDirectory` |
| 写文件 | `resources.beginSave/writeChunk/commitSave`（权限 `resourceExport`），每次弹系统另存为窗口；不能覆写原文件 |
| 菜单入口 | `contributes.menus` 的 `resource.actions` 目标挂在文件预览/编辑器工具栏（`DesktopFilePreview.vue`、`DesktopFileEditor.vue`）；`ExtensionService.executeMenu()` **只对 `resource.actions`** 把文件句柄交给插件命令 |
| 资源状态 | `view.setState` 仅对 `location: 'context'` 的普通视图可用，按 `stateVersion` 升级 |
| 权限确认 | 安装/更新时由用户确认新增权限（`selectedResource`、`localResources`、`resourceExport`、`network` 等） |

### 2.3 差距（本方案要解决的问题）

1. **产出不是一种可分配资源。** 插件能拿到的只有“用户选中的空间文件”和“插件自己选的文件”；产出记录不属于两者。
2. **产出标签页没有插件扩展点。** 它既不是工作台视图，也没有 `WorkbenchMenu`，插件的菜单与视图都挂不上去。
3. **宿主分配资源只支持文本。** 即便把产出映射成空间文件句柄，插件对它也只能 `readText`，读不了 PDF、音视频、表格等二进制内容。
4. **因此“加个插件就能看 PDF”在当前架构下不成立**，除非插件改用自己的系统选择器（等于用户要再选一次文件，且失去与产出、与对话的关联）。

## 3. 目标与非目标

### 目标（用户可见行为）

- 用户点开一个内置不支持的产出，可以在同一个应用里选择“用插件打开”，由插件渲染，无需重新选择文件。
- 插件渲染视图是可关闭、可恢复的独立页签；关掉不影响产出本身，也不影响内置预览。
- 没有插件、插件被禁用、插件失败时，行为回退为现状（“暂不支持预览”），不静默把文件交给系统程序。
- 插件仍然拿不到真实路径，读到的内容不超出本次分配的产出。

### 非目标

- **不**让插件替换或注入内置产出预览区域；内置格式（图片、Markdown、文本、HTML→浏览器）优先级不变。
- **不**向插件开放任意路径、目录遍历、产出以外的文件。
- **不**允许插件写回或覆盖产出对应的原始文件；需要输出时走既有的“另存为”通路。
- **不**在插件侧引入新的格式解析器到宿主；解析、渲染、性能全部由插件自己负责。
- **不**把“调用系统默认程序打开”作为回退，也不新增“导出到磁盘再打开”的隐式步骤。
- **不**自动打开、自动运行插件；每次都由用户明确触发。
- **不**改变产出的登记规则（谁算产出仍由 Agent 工具决定）、不改变产出记录的存储结构语义。
- **不**在第一版让插件视图中的内容参与 Spec-013 的“引用到对话”通路（见第 6 节分期）。

## 4. 方案设计（待确认）

### 4.1 资源模型：从“选中的文件”扩展为“宿主分配资源”

建议不新增一套并行的授权机制，而是把现有 `selectedResource` 的语义从“用户选中的空间文件”扩展为“**宿主分配的只读资源**”，来源有两种：

| 来源 | 现有 | 本方案新增 |
|---|---|---|
| 空间文件（文件管理器打开的文件） | ✅ 已有 | 维持 |
| 产出（`artifactId` + `conversationId`） | ❌ | 新增 |

产出句柄的身份应包含 `conversationId` 与 `artifactId` 并复用 `#requireVisibleArtifact` 的可见性校验；句柄对外仍然只是不透明 id。

### 4.2 用户入口

```text
产出卡片 / 产出标签页
        ↓ 用户点“用插件打开”（或工具栏“更多操作”）
宿主解析可用插件（按类型匹配，见 4.3）
        ↓ 用户选择一个插件（只有一个时也显示插件名）
宿主创建只读资源句柄并校验可见性
        ↓
插件视图（隔离 iframe，页签）阅读渲染
        ↓ 失败或关闭
回退到内置预览 / 保留原占位
```

建议第一批只做**产出标签页工具栏**的入口（`DesktopArtifactToolbar` 的 actions 位置），不先做聊天卡片右键，避免同时改动聊天右键菜单体系。

### 4.3 插件声明与匹配

需要确定一种插件声明“我能处理这类内容”的方式，候选：

- **A（推荐）**：视图声明沿用 `selected-file`，新增可处理类型字段（例如 `accepts: { mime: ['application/pdf'], extensions: ['pdf'] }`），宿主据此筛选。
- **B**：新增 `resource: 'artifact'` 的视图类型，与 `selected-file` 并列。
- **C**：不做类型声明，任何插件都可以被“更多操作”列出，由用户自行判断。

三种都需要提升清单 `apiVersion`（新增字段 / 新增枚举值 / 新增菜单目标），旧插件行为不受影响。多插件命中同一类型时，第一版建议**由用户选择并记住偏好**（宿主配置项），不做自动挑选；不采用“优先级数字”这类隐式规则。

### 4.4 读取能力（本方案核心）

为“宿主分配的只读资源”开放以下能力，全部**有界**：

| 方法 | 用途 | 建议上限与约束 |
|---|---|---|
| `resources.readText` | 文本、Markdown | 沿用现状（文本类 mime，≤ 2 MiB，严格 UTF-8） |
| `resources.readBytes` | 二进制分片（PDF、Office、压缩包） | 单次 ≤ 128 KiB，总量受产出登记上限约束；越界与越权返回明确错误 |
| `resources.getUrl` | 受控 URL（图片、音视频流） | 会话内 URL，随视图销毁失效；**不复用**裸 `lexora-artifact://`，避免绕过权限与缓存语义 |

服务层需要新增**有界分片读取**接口：现有 `artifacts.readText` 只能读文本，`materializeConversationArtifact` 是整份读取（32 MiB 级），都不适合插件流式消费。具体 RPC 形状与上限在第 7 节确认。

### 4.5 安全与信任边界

- 句柄不含路径；插件不能据此枚举目录、读取其他产出或其他视图分配的内容。
- 每次打开是独立实例；视图销毁、插件禁用/卸载、产出被删除时授权立即失效。
- 仍然只读；“保存结果”走 `resourceExport` 的系统另存为，不写回原文件。
- 产出内容对外部模型与插件都属于**不可信数据**：不因“来自本机文件”而授予额外网络、DOM 或进程能力。
- 视图失败、超时、加载超限必须回退到内置占位并给出可读提示，不出现白屏或静默失败。
- 需要审计：谁在何时把哪个产出分配给了哪个插件（沿用现有插件日志/诊断通路）。

### 4.6 生命周期与状态

- 产出标签页打开 → 用户选择插件 → 新页签（`context`）承载插件视图；关闭页签不改变产出记录。
- 视图状态用 `view.setState` 持久化（阅读位置、筛选等），按 `stateVersion` 迁移。
- 重启应用后：产出标签页仍按现状恢复；插件页签按工作台视图恢复规则处理（是否需要恢复由第 7 节确认）。
- 插件不可用（禁用、卸载、不兼容）时，页签显示“插件不可用”并提供回到内置预览的入口。

## 5. 涉及改动点（预估）

| 层 | 位置 | 预估改动 |
|---|---|---|
| 服务层 | `service/src/artifacts/ArtifactService.ts`、`registerArtifactRpc.ts` | 新增有界分片读取 RPC |
| 插件运行时 | `platform/extensions/ExtensionService.ts`、`ExtensionPackageStore` | 支持产出来源的句柄授予与解析；放宽/新增受控读取方法 |
| 界面层 | `DesktopArtifactToolbar.vue`、`DesktopTaskResourcePanel.vue` | 产出标签页的资源操作入口 |
| 插件清单 | `shared/extensions/extensionManifest.ts` | 类型声明字段与 `apiVersion` 提升 |
| 菜单目标 | `shared/workbench/workbenchUi.ts` 等 | 若采用新目标（如 `artifact.actions`）需注册与查询 |
| 技能文档 | `plugin-creator` 的 `protocol.md` / `capabilities.md` / `api.d.ts` | 同步新字段、新权限边界与示例 |

## 6. 建议分期

1. **第一批（最小闭环）**：产出标签页入口 + 产出只读句柄 + `readText` / `readBytes` + 一个示范插件（例如图片/PDF）+ 失败回退。范围限于**产出文件确实存在且可读**的情况。
2. **第二批**：`getUrl`（音视频/大图）、多插件偏好设置、插件页签恢复策略、诊断与审计完善。
3. **第三批**：产出卡片与画布入口、插件视图内容与 Spec-013 引用通路的互通（另开规格讨论，不默认包含）。

## 7. 实施前必须确认

- **产出可见性范围**：跨会话、跨空间、已删除产出的授权语义分别怎么定？
- **分片读取的具体上限**：单次块大小、单视图总量、并发数，与现有 `128 KiB` / `2 GiB` 一类常量如何对齐？
- **`getUrl` 的实现形态**：会话内代理 URL 的路由、缓存头、Range 支持与生命周期。
- **匹配与选择策略**：采用 4.3 的哪个方案；是否需要“仅扩展名匹配”的降级；偏好存在哪里。
- **插件声明字段的最终形态**：`accepts` 的字段名、校验规则、与 `resource: 'selected-file'` 的关系。
- **是否提升 `apiVersion` 到 4**，以及旧插件在提升后的行为矩阵。
- **目录产出**：是否允许插件浏览产出目录（当前目录产出只是占位）。建议第一版明确不做。
- **失败与回退文案**：与现有 `desktop.context.previewUnavailable` / `previewLoadFailed` 的区分。
- **与文件管理器“打开”的通路关系**：产出标签页是否同时提供“在文件管理器中打开”（另一个已知问题，见 Spec-013 讨论），两条入口的先后顺序与去重。
- **插件页签的重启恢复**：恢复是否会让插件重新读取产出（涉及性能与权限续期）。

## 8. 验收与测试计划

（下列为计划，不是已通过清单。）

- [ ] 无插件时，内置不支持的产出仍显示现状占位，不出现新入口的误导性提示。
- [ ] 有可用插件时，产出标签页显示“用插件打开”，且入口文案包含插件名。
- [ ] 只有内置支持的格式（图片、Markdown、文本、HTML）时不出现插件入口，内置行为不变。
- [ ] 插件视图只能在用户明确触发后打开，不自动打开、不抢焦点。
- [ ] 插件读取受限于本次分配的产出：越权 id、其他产出、其他视图的句柄一律被拒绝。
- [ ] 插件无法获得真实路径；日志、错误信息、URL 中不泄露路径。
- [ ] 分片读取越界、超限、并发超限返回明确错误，不导致宿主崩溃或内存异常增长。
- [ ] 视图销毁、插件禁用/卸载、产出删除后，授权立即失效且页签给出可读回退。
- [ ] 插件写回原文件的路径不存在；保存只走系统另存为。
- [ ] 失败、超时、加载失败均回退到内置占位，不白屏。
- [ ] 视图状态按 `stateVersion` 正确迁移；不兼容升级有明确提示。
- [ ] 中英文文案、键盘可达性、减少动画设置符合现有界面约定。
- [ ] 真实桌面验收：用真实插件包在真实 Electron 中验证图片、PDF、大文件、损坏文件与二进制误判文件（例如 `.txt` 里装 PDF）。
- [ ] 安全验收：装饰视图/窗口浮层/内容插槽不得使用该读取能力；伪造 `invocation` 被拒绝；网络能力不因本方案被动扩大。

验证分层：纯逻辑（匹配、句柄、上限、错误码）→ 组件（入口菜单、页签容器、回退态）→ 集成（RPC、授权续期、卸载清理）→ 真实 Electron + 真实插件包的人工与自动化验收。插件安装确认弹窗、系统选择窗口不能由模拟页面替代。

## 9. 文件与参考

### 仓库内（现状引用）

| 位置 | 说明 |
|---|---|
| `apps/buddy/src/modules/tasks/widgets/context-panel/DesktopArtifactContextSurface.vue` | 内置产出预览（本方案不改其职责） |
| `apps/buddy/src/modules/tasks/widgets/context-panel/DesktopArtifactToolbar.vue` | 产出工具栏（第一批入口位置） |
| `apps/buddy/src/modules/tasks/state/context-panel/useTaskResourcePanel.ts` | 产出打开与路由（产出标签页来源） |
| `apps/buddy/service/src/artifacts/ArtifactService.ts` | 产出登记、`readText`、`resolvePreview`、大小与敏感路径规则 |
| `apps/buddy/platform/extensions/ExtensionService.ts` | 插件生命周期、资源授予与读取方法白名单 |
| `apps/buddy/electron/main/extensions/SandboxedExtensionHost.ts` | 隔离插件宿主 |
| `apps/buddy/shared/extensions/extensionManifest.ts` | 插件清单结构与校验 |
| `apps/buddy/src/workbench/useExtensionContributions.ts` | 插件视图与工作台视图的映射 |
| `apps/buddy/src/modules/files/widgets/DesktopFilePreview.vue` | 现有 `resource.actions` 菜单入口范例 |

### 插件侧文档（需同步）

- `plugin-creator` 技能：`references/protocol.md`（视图类型、权限、操作菜单）、`references/capabilities.md`（能力选择）、`references/api.d.ts`（API 类型）。
- 能力查询工具 `lexora_plugin_capabilities` 的目标目录（若新增菜单目标或视图类型需登记）。

### 相关规格

- [Spec-013：工作台选区引用与多分屏目标](./feature-013-workbench-selection-reference.md)（产出与文件“打开”通路差异、引用通路）
- [Spec-012：插件术语统一](./feature-012-plugin-terminology.md)
- [架构概览](../architecture/overview.md)（第 5.1 节插件与内部扩展的区别）

## 10. 实现与验证记录

**尚未开始。** 本批未产生任何代码、测试或提交记录。实施前需用户确认第 7 节事项；实施后在此补充实际范围、验证证据与剩余边界，规则参照 Spec-013 第 12 节。
