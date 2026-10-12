# 上游更新第四轮选择性移植（第一批至第五批）

## 范围与状态

**更新日期：** 2026-10-11

前三轮见 [upstream-round-1-integration.md](upstream-round-1-integration.md) 与 [upstream-remaining-integration.md](upstream-remaining-integration.md)。本轮没有合并 `upstream/master`，按功能选择性移植，以 XTLaw 本地实现和品牌为准。**未提交、未推送、未生成安装包**，改动保留在本地工作区（已暂存）。

### 检查范围

- 检查到的上游 commit：`df0f9369`（`upstream/master`，2026-10-11 17:47）。
- 比较基线：当天之前最后一次正确拉取时的 `83ad7687`；当天 15:49 和 18:36 的两次拉取按用户说明视为误拉，不作为基线。
- `83ad7687..df0f9369` 共 22 个提交。没有新的数据库迁移，没有 Pi 版本变化，没有新增依赖补丁。
- 另有 4 个提交（`987e9356`、`9f656481`、`9e6a41e8`、`83ad7687`）出现在上次整合之后、基线之前，单独处理，见"早于比较基线的提交"。

## 已移植（第一批）

| 上游提交 | 内容 | 本地处理 |
| --- | --- | --- |
| `21faa8e3` | Windows 沙盒组件复用与确认延迟 | 干净应用 |
| `39f849fd` | 放宽 Windows 已有数据目录的启动检查 | 解决 2 处冲突，保留 XTLaw 品牌文案 |
| `8155d711` | markstream-vue 升到 2.0.17 | 干净应用，`pnpm install` 后确认版本 |

### 沙盒组件复用（`21faa8e3`）

- 原生沙盒新增 `version` 子命令，输出协议版本和组件版本。
- 沙盒可用性不再按应用二进制的 SHA256 与已安装组件比较，改为比较组件版本；同一组件版本在不同应用构建之间不再重复安装。
- 已安装的旧组件没有 `version` 命令，首次升级后会被判定为需要修复，用户需要重新确认一次沙盒安装，之后不再因应用构建变化重复提示。
- 安装完成后立即采用 `ready` / `incompatible` 结果，不再等待第二次状态检查，缩短确认延迟。

### 已有数据目录的启动检查（`39f849fd`）

- 启动时对已存在的数据目录改为 `Preserve` 策略：只检查路径结构（符号链接、目录连接、非目录对象），不再校验和改写已有 ACL。
- 沙盒存储仍使用 `ValidateAcl`，要求私有权限。
- 删除 `privateDirectoriesUnconfirmed` 提示和诊断中的权限检查字段，更新相关中英文文案。
- 安全姿态变化：已存在的 XTLaw 数据目录若被其他账户授予了权限，启动时不再被阻断。数据位于当前用户的 AppData 下，默认继承用户私有权限；这是上游有意放宽，本地跟随。

### 冲突处理

- `desktopNativeI18n.ts`：采用上游的错误文案和键删除，保留 `XTLaw` 品牌文案（`privateDirectoriesFailed`、`startupRecoveryTitle`）。
- `windowsPrivateDirectoryFixture.ts`：采用上游删除 `writeOnly` ACL 夹具；对应用例已在上游同一提交中移除。
- 两处冲突都是本地品牌化修改与上游删除相邻行造成的，不是本地独有逻辑。

## 已移植（第二批）

| 上游提交 | 内容 | 本地处理 |
| --- | --- | --- |
| `008b5e98` | Skill 创作能力（`skill-creator`） | 2 处冲突，已解决 |
| `be1f4a39` | 更新日志完整展示 | 仅取应用侧；删除 2 个文件；1 个测试文件按本地重写 |
| `9fd6e2dc` | 长文本粘贴为附件 | 7 处冲突，已解决；补 2 个本地独有测试 |

### Skill 创作能力（`008b5e98`）

- 新增内置技能 `skill-creator`，让 Agent 可以在对话中创作 Skill，并在写入前进入预览与审阅。
- `SkillService.preview` 增加 `authoring` 模式：只读取 `SKILL.md` 并走创作校验，不遍历整个目录。
- 新增 `skillReviewRequested` 通知，经 Electron 主进程转发到渲染进程，由界面提示用户审阅。
- 冲突 1：`createBuddyCapabilityFactory.ts` 的导入，同时保留本地的 `RunInputRepository` 和上游的 `SkillAuthoringServices`。
- 冲突 2：`useDesktopWorkbench.ts` 的 `skills.list`，上游最终版本是 `list(spaceId, true)`，同时带空间 ID 和元数据模式，已按此合并，与本地 Skills 设置页轻量加载（#257）的 `metadataOnly` 约定一致。

### 更新日志完整展示（`be1f4a39`）

只取应用侧，不取 `.github/workflows` 与 `packaging/release`（上游发布草稿与双语校验流程）。

- 更新对话框改用 `DesktopMarkdownContent` 完整渲染发布说明，不再提取前三条摘要；默认禁用图片，滚动显示。
- 发布说明长度上限从 8,000 字符放宽到 1 MiB；`updates.json` 状态文件上限从 128 KiB 放宽到 8 MiB。
- `DesktopMarkdownContent` 新增 `allowImages` 属性；删除不再使用的 `updateReleaseNotes.ts` 及其测试。
- 本地更新来源已隔离为 XTLaw 发布，`desktopUpdateService.spec.ts` 以本地版本为准，只把"限长 8,000"用例改为"保留完整发布说明"。`DesktopUpdateStore.spec.ts` 夹具中的发布地址也改为 XTLaw 地址。
- 发布说明中的链接仍走现有 `openLink` 与发布地址白名单，没有放宽 `isLexoraReleaseUrl`。

### 长文本粘贴为附件（`9fd6e2dc`）

- 粘贴超过 1500 字符或 20 行的文本时，转为文本附件；设置位于"通用 → 对话输入"，默认开启，可关闭后直接粘贴到正文。
- 原文完整保存；可预览，可"还原为文本"，还原是一次可撤销的编辑。
- 导入失败、草稿切换、偏好变化、撤销编辑后，迟到的导入结果不会写入编辑器。
- 配置新增 `desktop.chat.pasteTextAsAttachment`，经 Electron 配置存储与渲染端偏好传入。
- 冲突处理：设置页同时保留本地的"关闭到托盘"和上游新增的"粘贴转附件"；`GeneralSettingField` 取并集；设置注册表测试改为断言完整分组顺序（含本地的账号与窗口行为分组）；若干 UI 上下文测试保留本地的 `sidebarCollapsed`、`agentIdentity` 并补充 `pasteTextAsAttachment`。
- 没有取上游对 `BuddyChatMessageContent.spec.ts` 中深色模式用例的删除：本地仍把 `isDark` 透传给 Markdown，该用例继续有效。
- `BuddyChatAgentIdentity.spec.ts`、`messageLinkRouting.spec.ts` 是本地独有测试，按新增的必填偏好字段补齐。

## 已移植（第三批）

| 上游提交 | 内容 | 本地处理 |
| --- | --- | --- |
| `77b32d88` | 运行中切换模型与权限 | 3 处冲突，已解决；额外取 `83ad7687` 中 1 个文件的结构拆分 |
| `b0508d38` | 工具分组与按组发现 | 2 处冲突，已解决 |

### 运行中切换模型与权限（`77b32d88`）

权限模式：

- 对话的权限模式（人工审批/工作区/完全访问）在运行期间可以切换。数据库 `setPermissionSettings` 不再因为存在排队或运行中的任务而拒绝更新；界面不再显示"当前运行结束后可切换"，对应文案已删除。
- 变更经 `ConversationMetadataService` → `BuddySessionRegistry.applyConversationPermissions` → 会话 `updatePermissionSettings` → `ToolAuthorizationService.updatePermissionSettings` 下发到在线会话。
- 权限变化时，正在等待的授权判定被中止并按新设置重新判定；本次运行已建立的复用授权与沙盒目录授权被清除（新增生命周期原因 `permissions_changed`）。
- Shell 工具始终注册，执行边界按每次调用解析（沙盒或宿主）；`lexora_host_shell` 始终注册，在只读模式下由权限引擎拒绝。
- 权限说明从基础系统提示中拆出，作为独立的 `buddy_permissions` 段在每次模型请求前刷新，使运行中的切换能被模型感知。
- `/review` 触发的运行把执行权限上限压到只读，不受对话当前设置影响；排队兼容性判断同时比较该上限。

模型：

- 对话的模型选择在运行中被修改后，从下一次模型请求开始生效（`prepareRequest` 钩子）。
- 若修改发生在自动重试期间，中止当前重试并用新模型重新发起，重试次数从已用次数续算，不重置预算。
- 完成的助手消息记录实际使用的 `modelId` / `providerId`，会话画布优先展示它，旧消息回退到运行记录的模型。
- 重新生成改用对话当前的模型选择，并在提交时校验选择未变化；界面在重新生成前先等待模型选择持久化完成。

冲突与依赖：

- `createBuddySystemPrompt.ts`：`77b32d88` 依赖更早的 `83ad7687`（提示词浏览）对该文件的拆分，需要导出 `BUDDY_MANUAL_APPROVAL_PROMPT` 与 `createBuddyExecutionPrompt`。只取了这个文件的结构拆分，以 XTLaw 文案为底，提示词浏览功能本身没有移植。
- `projectConversationTree.spec.ts`：本地的"摘录问题可见"用例与上游的"显示实际回答模型"用例都保留。
- `DesktopPermissionModeSelector.vue`：保留本地 CSS 类名，删除"运行中锁定"提示及其样式。

### 工具分组与按组发现（`b0508d38`）

- 新增 `toPiToolGroup`，把内置工具按命名空间分组：浏览器、图片、输出、自动化、会话引用、宠物、系统、Web、Shell、Skill 创作和插件创作。
- 延迟暴露的工具不再平铺名称、标题和描述，而是给模型一份分组摘要（组名、描述、工具数、示例）。
- `lexora_tool_search` 新增 `namespace`、`source`、`offset`，可先列出某个组再按需加载。
- 工具名保持不变（例如 `lexora_browser_open`、`lexora_image_generate`、`lexora_buddy_automation`），已有会话、授权和审批规则不受影响。
- 冲突：自动化与宠物工具的标签，采用上游的 `...TOOLS.xxx` 展开，保留 `XTLaw` 标签。
- 本地的 `lexora_session_ask` 当时没有命名空间，作为独立工具出现在目录中；已于 2026-10-12 移除，见“后续调整”。

## 已移植（第四批：早于比较基线的两个提交）

| 上游提交 | 内容 | 本地处理 |
| --- | --- | --- |
| `9e6a41e8` | 修复插件调用展示及条件检查竞态 | 1 处测试冲突，已解决 |
| `83ad7687` | 新增提示词浏览 | 1 处冲突，已解决；`createBuddySystemPrompt.ts` 已随第三批带入，跳过 |

### 修复插件调用展示及条件检查竞态（`9e6a41e8`）

- 条件检查：插件动作在检查条件的过程中，如果条件刚好失效，不再被误判为"不可用"而跳过；会重新检查一次，再次失效则干净地取消（新增 `ExtensionConditionInvalidatedError`）。
- 聊天记录：插件在某一轮回答期间执行的动作，按时间顺序放进对应那一轮的活动列表，不再作为错位的独立行出现；被跳过的自动动作仍不显示，失败的自动动作会显示。
- `ExtensionService.ts` 经三方合并自动对上，没有手动改动。
- 冲突：`useChatRunSync.spec.ts`。保留本地的"立即停止展示"和"取消失败后恢复展示"两条用例，第三条用例改用上游的 `it.each(['skipped', 'failed'])` 形式。

### 提示词浏览（`83ad7687`）

- 设置的"AI"分组新增"提示词"页，只读展示系统规则（基础系统提示词、执行模式、手动审批、附件处理）和任务模板（审查模板），可复制原文。
- 内容直接来自代码里的提示词常量，因此显示的是 XTLaw 版本的文案；执行模式的说明按当前操作系统生成。
- 新增 `prompts.get` 的 IPC 通道、服务端 `getBuiltinPromptCatalog` 和设置页组件；`SettingsContext` 增加 `prompts` 与 `writeClipboardText`。
- 冲突：`settingsContext.ts` 的导入，同时保留本地的用户资料与助手资料类型和上游新增的 `LocalChatApi`。

## 已移植（第五批：按功能拿取主题栈中的独立功能）

主题栈（`00feaa2c`、`0b9d252e`、`fd88122a`、`df0f9369`）共 383 个文件，其中约 216 个只是把组件样式改成原子类名，再加上组件拆分与主题引擎，本地不需要。按功能梳理后，只取其中独立、对用户有感知的三项：

| 功能 | 来源 | 本地处理 |
| --- | --- | --- |
| 插件更新与重启分离 | `0b9d252e` 的更新部分 | 逐文件适配，保留本地样式写法 |
| 字体与阅读设置 | `df0f9369` | 去掉对主题引擎的依赖后重新实现 |
| 侧栏宽度取整 | `00feaa2c` 的一处修复 | 一行修复并补测试 |

### 插件更新与重启分离

- 新版本安装后进入"待应用"，不再因为"重启插件"而被悄悄切换；用户在插件卡片的按钮或菜单里点"应用更新"才生效。
- 安装确认框对更新增加"安装完成后立即应用更新"选项，按钮文案在"更新并应用"和"安装更新"之间切换；应用更新会提示将中断正在执行的插件操作。
- 配置与禁用状态在更新后保留。
- `ExtensionService.restart` 不再提升待应用版本，新增 `applyUpdate`；开发目录安装在已存在同名插件时改用 `applyUpdate`。
- 取消了安装完成提示里的"更新版本需重启插件后生效"。
- 单元测试把依赖"重启即升级"的 3 处用例改为 `applyUpdate`，并替换为上游覆盖"待应用版本跨重启保持非活动"的用例。
- 远程插件市场在 XTLaw 中关闭（`catalogUrl: null`），目录里的"应用更新"按钮只对内置目录条目生效，对应的上游端到端步骤改为通过插件卡片应用。

### 字体与阅读设置

- 设置"外观"页新增"字体与阅读"：界面字体、正文字体、代码字体、正文字号（12–20 px），带预览，可读取本机已安装字体，选择"系统字体"即恢复默认。
- 生效范围：界面字体、聊天正文与用户消息、输入框、Markdown 标题缩放、代码块与终端转录、代码编辑器（Monaco）。
- 配置新增 `desktop.typography`（文件内为 `ui_font`、`body_font`、`code_font`、`body_size`），旧配置缺省按默认值读取并保留未知字段。
- 主进程只对受信任渲染进程的主框架授予 `local-fonts` 权限，其他权限仍然拒绝。
- 保持默认外观不变：默认字体栈沿用本地 `index.scss`，默认行高比例保持 1.64（14 px 对应 23 px），没有采用上游默认字体栈和 24 px 行高；`shared/typography` 的单元测试校验 TS 默认栈与样式表一致。
- 没有跟随上游的部分：插件视图的字体环境变量（依赖主题引擎）。

### 侧栏宽度取整

- 配置要求侧栏宽度为整数，而拖拽宽度由 `clientX - bounds.left` 计算，在非整数缩放比例的显示器上会是小数，写入被拒绝，界面随后被重置回旧值。`setWidth` 现在先取整。

### 明确不取

- 配色主题系统（多套主题、主题插件、主题数据格式、窗口背景联动）：用户不需要多套主题，引擎成本与主题数量无关，不引入。
- 给插件开发者的主题能力（`contributes.themes`、`themeManagement` 权限、`styles.uno`、主题导入导出）：依赖主题引擎，且没有使用者。
- 纯重构：约 216 个文件的样式写法迁移、模型选择器拆分、输入框建议与提交按钮抽取、聊天滚动与侧栏切换逻辑抽取、设置行与分组公共组件。

## 暂缓与跳过

### 计划后续批次

没有。可移植的提交已全部完成，剩余项见下方"暂缓"和"早于比较基线的提交"。

### 暂缓

没有。主题栈的 4 个提交已按功能处理：独立功能见"已移植（第五批）"，其余明确不取。

### 跳过

- `0cf7d982`：v0.10.1 版本发布，XTLaw 保持独立版本。
- `80e8eab7`、`ddce33dc`、`831356b3`：上游 CI 与发布草稿工作流，XTLaw 使用自己的 CI 与发布体系。
- `747034e2`：上游 Windows ACL 测试夹具的 CI 修复。本地 `windowsPrivateDirectoryFixture.ts` 合并 `39f849fd` 后与 `upstream/master` 最终版本逐字一致，已被覆盖。
- `9d6c8353`：修复 `nativeBoundedFile.spec.ts` 的 Windows 夹具路径，该测试文件本地不存在，不适用。
- `266e55fe`：Linux 安装包与独立校验文件，改动 `electron-builder` 配置和发布脚本，XTLaw 当前只面向 Windows。

### 已在本地，无需处理

- `2e7583e7`（#255）对应本地 `7831bd66`。
- `d53682a9`（#257）对应本地 `c54923f0`、`77e895a7`、`2497f90b`。
- `ed7c74cb`（#259）对应本地 `f04de95e`。

### 早于比较基线的提交

`9e6a41e8`、`83ad7687`、`987e9356`、`9f656481` 出现在上次整合（10-09 13:34）之后、比较基线（10-09 23:37）之前，不在 `83ad7687..df0f9369` 范围内，也没有被前几轮整合。处理结果：

- `9e6a41e8`、`83ad7687`：按用户要求移植，见"已移植（第四批）"。
- `987e9356`：只调整两个按钮图标的大小和颜色，其中 `WorkbenchResourcePanelActions.vue` 在 XTLaw 中已不存在，跳过。
- `9f656481`：只在内置插件创作技能的参考文档里加两行说明，描述的打包工具不在本仓库内，无法在本地确认，跳过。

## 验证

只做相关测试和类型检查，没有跑全量测试或打包。

- Vitest 相关用例 9 个文件：沙盒组件兼容、沙盒状态反馈、启动失败展示、私有目录与桌面存储原生用例、`DesktopMarkdownContent` 相关的文件视图/选区引用/消息链接路由。
  - 首次运行 2 个原生用例失败，原因是 `.output/build/native` 下的原生二进制比新 Rust 代码旧；重新编译 `lexora-buddy-private-directories` 与 `lexora-buddy-sandbox` 后全部通过。
  - `windowsSandbox.native.spec.ts` 需要环境变量 `BUDDY_SANDBOX_TEST_BUNDLED` 和已安装的真实沙盒，因此被跳过；改为手动确认新编译的沙盒 `version` 输出为 `{"protocol":1,"version":1}`。
- Rust：`cargo test -p lexora-buddy-host --lib private` 18 个通过。
- ESLint：本轮改动的 14 个 TS/Vue/MJS 文件通过。
- `pnpm type-check`（`vue-tsc -b`）通过。
- 未运行 `.playwright` e2e，也未做桌面可视验收。

### 第二批验证

- `pnpm type-check` 通过；本批改动文件 ESLint 通过（`messageLinkRouting.spec.ts` 的 6 个格式问题在干净 `HEAD` 上就存在，未处理）。
- Vitest 覆盖更新、设置、Skill、输入框、附件、配置、转录、Markdown 与 local-chat 共 61 个文件：483 通过、1 跳过、12 失败。
  - 7 个失败在干净的 `HEAD`（暂存全部改动后）上同样出现：`AttachmentOwnership` 的 `/` 路径分隔符断言、`ComposerResourceService` 的 3 个用例、`skillInstallation` 的 3 个用例（Windows 文件模式位与符号链接权限）。
  - 其余 5 个是 `SkillPackageCache`、`SkillService` 中创建符号链接时的 `EPERM`，本机没有符号链接权限，用例本身未被本批改动。
  - 新增的 `skillAuthoringCapability`、`composerResourceFlow` 粘贴文本、`DesktopUpdateStore` 等用例均通过。
- 首轮失败中一个来自移植：`DesktopUpdateStore.spec.ts` 夹具使用了上游发布地址，已改为 XTLaw 地址后通过。

### 第三批验证

- `pnpm type-check` 通过；累计 165 个暂存的 TS/Vue/MJS 文件 ESLint 通过，仅 `messageLinkRouting.spec.ts` 的 6 个格式问题（干净 `HEAD` 上就存在）。
- Vitest 分两组运行。
  - 运行时与对话相关（agent、chat、conversations、permissions、sandbox、storage、approvals、events、任务状态、输入框、shared）165 个文件：1160 通过、34 跳过、15 失败。
  - 工具与能力相关（agent、artifacts、automations、browser、conversations、images、pet、plugins、sandbox、skills、system、web、mcp、shared）143 个文件：890 通过、21 跳过、27 失败。
- 全部失败都在暂存全部改动后的干净 `HEAD` 上复现，或属于本机的系统限制：
  - 干净 `HEAD` 同样失败：第一组的 15 个（`BuddyTurnLauncher`、`toolPolicyExtension`、`createBuddySession`、`createReusableBuddySession`、`inspectCommittedPiCompaction`、`PermissionEngine`、`ToolAuthorizationService`、`SandboxDirectoryPermissions`、`sandboxPermissions`、`BuddyDataPaths`），以及 `BrowserAdapterClient`×3、`BrowserHostClient`×2、`pluginAuthoringCapability`×1、`WebCapabilityService`×1；`skillInstallation`×3 已在第二批验证中取过基线。
  - 错误类型都是 Windows 限制：Unix socket `listen EACCES`、创建符号链接 `EPERM`、POSIX 文件权限位；`SkillPackageCache`×2、`SkillService`×3 是符号链接 `EPERM`，用例本身没有被本批改动。
- 本批新增和改动的用例通过：`modelRetry`、`ChatQueueService`、`turnRequestRepository`、`ToolAuthorizationService`（权限变更相关）、`useChatPermissionSettings`、`toolGroups`、`ToolDisclosure`、`toolDiscoverySession`、`projectConversationTree`。
- 未运行 `.playwright/scripts/__tests__/modelSelection.e2e.mjs` 等 e2e，也没有做桌面可视验收；运行中切换的真实交互（切换时的审批卡片、重试期间换模型）没有人工验证。

### 第四批验证

- `pnpm type-check` 通过；两个提交涉及的 36 个 TS/Vue 文件 ESLint 仅剩 `ExtensionService.ts:884` 的 1 个格式问题，来自本地 Office 集成提交 `109394bc`，不是本批引入。
- Vitest：插件与转录相关 36 个文件 389 通过、3 失败；设置、Electron、共享与提示词相关 102 个文件 541 通过、2 失败。
  - 3 个失败是 `ExtensionPackageStore`、`ExtensionResourceStore` 创建符号链接时的 `EPERM`。
  - 2 个失败（`linuxAutostart`、`rendererProtocol`）在干净 `HEAD` 上同样失败（Windows 路径语义）。
  - 新增的 `ExtensionConditions`、转录投影与分段、`useChatRunSync`、`DesktopPromptContent` 用例通过。
- 没有运行 `settings.e2e.mjs`、`extensionAgent.e2e.mjs`，也没有在桌面窗口里实际打开"提示词"页和触发插件动作。

### 第五批验证

- `pnpm type-check` 通过；本轮改动的约 40 个 TS/Vue/MJS 文件 ESLint 仅剩 2 个在干净 `HEAD` 上就存在的问题（`ExtensionService.ts` 单行多语句、`extensionApi.ts` 导入顺序）。
- Vitest 相关 187 个文件：1196 通过、19 失败。
  - 14 个在干净 `HEAD` 上同样失败：`BrowserAdapterServer`、`buddyServiceEnvironmentPaths`、`buddyServiceProcess`、`DesktopExtensionFrameHost` 等（Windows 路径与进程语义）。
  - 其余是已知的符号链接权限（`ExtensionPackageStore`、`ExtensionResourceStore`）以及 `linuxAutostart`、`rendererProtocol`（前一轮已取基线）。
  - 新增和改动的用例通过：`useTaskSidebarPreferences`（含小数宽度）、`ExtensionService`/`ExtensionAgent`（待应用版本）、`LexoraConfigStore`（字体默认值、合并、越界拒绝、保留未知字段）、`window`（字体权限）、`typographyPreferences`。

### 真实窗口端到端验证

构建 Electron 后在隔离的测试实例（`~/.lexora-test`，不接触真实用户数据）中运行 Playwright：

| 脚本 | 对应功能 | 结果 |
| --- | --- | --- |
| `typography.e2e.mjs`（新增，按上游改写） | 字体与阅读设置 | 通过：默认值、本机字体读取与失败重试、独立选择、主题切换与重启后保持、保存失败回滚、恢复默认、输入框与标题缩放 |
| `extensionUpdates.e2e.mjs`（新增，按上游改写） | 插件更新与重启分离 | 通过：安装更新、独立应用、重启不升级、禁用状态与配置保留 |
| `pastedText.e2e.mjs` | 第二批：长文本粘贴为附件 | 通过 |
| `skillCreator.e2e.mjs` | 第二批：Skill 创作 | 通过 |
| `modelSelection.e2e.mjs` | 第三批：运行中切换模型与权限 | 2 个用例全部通过 |
| `settings.e2e.mjs` 提示词用例 | 第四批：提示词浏览 | 2 个用例通过 |
| `extensionContributions.e2e.mjs` | 插件开发目录安装与重启回归 | 通过 |

为让这些脚本在 XTLaw 上运行，做了最小适配：测试夹具接受应用名 `XTLaw Test`；`settings.e2e.mjs`、`extensionAgent.e2e.mjs` 的导航改走侧栏底部入口；提示词用例的品牌文案对应到 XTLaw。

以下脚本在干净 `HEAD` 之前就与 XTLaw 现状不一致，本轮没有继续修复，因此它们覆盖的功能没有端到端验证：

- `updates.e2e.mjs`（更新对话框）：夹具使用上游发布地址和旧侧栏选择器。
- `extensionAgent.e2e.mjs`（插件调用显示与条件竞态）：使用的插件夹具 ID 与 XTLaw 预装的 Office 插件不一致；其余用例也假设"只有 1 个插件"。
- `settings.e2e.mjs` 其余 5 个用例：断言所有设置页都有 `.settings-groups`（"外观"页没有）、插件数量假设、MCP 夹具。

### Linux 对照验证（WSL，未完成原生程序编译）

在 WSL（Ubuntu 24.04，Node 26.11.1、pnpm 12.5.1）里克隆独立副本，应用同一份暂存改动，跑整套单元测试（约 100 秒）：

| 版本 | 通过 | 失败 | 跳过 | 总数 |
| --- | --- | --- | --- | --- |
| 本次改动 | 3477 | 95 | 30 | 3602 |
| 干净原版 | 3416 | 90 | 33 | 3539 |

- Windows 上失败的 53 项里，**45 项在 Linux 上通过**，原因是 Windows 的限制：符号链接权限、Unix 套接字、文件权限位、路径语义。
- 另外 8 项两边都失败，在干净原版的 Linux 上同样失败，不是本次改动引入。
- Linux 上约 90 项失败（干净原版也有）来自没有编译原生测试程序（文件读取器、图片处理、沙盒、搜索工具）。CI 在单独的作业里准备它们。
- 本次改动在 Linux 上多出 6 项失败：`ComposerResourceService` 1 项明确报 `BoundedFileReadError`（原生文件读取器缺失），`skillAuthoringCapability` 5 项读文件走同一个读取器，属于推断，没有在补齐原生程序后复核。
- 编译原生测试程序的步骤（Rust 1.98.0、meson、ninja、bubblewrap）中途暂停，改由云端 CI 在 Linux 上完整验证。
- 在 WSL 里跑测试需要设置 `ELECTRON_OVERRIDE_DIST_PATH`，否则 `require('electron')` 会尝试下载二进制并卡住。
- Clash 只监听 `127.0.0.1`，WSL 的 NAT 网络访问不到；通过只监听 WSL 虚拟网卡的临时转发可以走代理，验证后已停止。

## 注意事项

- 新增配置字段 `desktop.typography` 是向前兼容的追加；旧版本读取时会保留未知字段。

- 运行中切换权限会清除本次运行已经建立的复用授权，用户需要重新批准；这是上游的设计，不是缺陷。
- 工具目录的呈现方式变化会影响模型看到的系统提示内容，建议用真实模型做一次带 MCP 与技能的对话冒烟。
- 移植的原生沙盒改动需要随下一次完整打包重新编译；本轮只重编了两个相关二进制用于测试，没有生成安装包。
- 首次用新版本运行时，沙盒组件会提示一次修复，属于预期行为。
- 本轮没有数据库迁移，不需要备份或回滚特殊处理。

## 后续调整（2026-10-12）：会话引用与上游一致

- 检查到的上游 commit 仍为 `df0f9369`（`git fetch upstream --prune` 后 `df0f9369..upstream/master` 为 0 个提交），没有新的可移植内容。
- 移除本地 `lexora_session_ask`：删除 `sessionAskExtension.ts` 及其测试；`createBuddyCapabilityFactory.ts`、`BuddyService.ts`、`BuddyRuntime.ts`、`shared/conversation/chatApi.ts` 恢复为上游内容。
- `ChatTurnService.ts` 去掉追加的“已引用会话……调用 `lexora_session_ask`”提示段，以及向 `contextItems` 写入 `sessionReference` 的逻辑；会话引用只通过消息内容中的 `sessionReferences` 与 `[SESSION:id]` 投影传递，与上游一致。该文件仅保留与会话引用无关的 `resourceQuotes` 本地差异。
- 除下面三处有意偏离外，本地只有一处兼容读取差异，在 `runInputRepository.ts`：读取 `context_items_json` 时过滤历史遗留的 `sessionReference` 项，再按上游的严格枚举解析。不能直接删除枚举值，否则历史 run 输入会在读取时抛错。新增 `runInputRepository.spec.ts` 覆盖遗留行可读与未知类型仍被拒绝。
- 有意偏离上游：消息续翻参数 `beforeMessageId` / 结果字段 `nextBeforeMessageId` 改为数字偏移 `messageOffset` / `nextMessageOffset`，涉及 `sessionReferenceToolContract.ts`、`searchConversationHistory.ts`、`sessionReferenceExtension.ts`。原因：上游契约的可选字符串游标必须是真实消息 ID，习惯满填可选字段的模型（本机日志中的 `gpt-6-luna`）只能编造值而连续失败，见 `docs/bugs/bug-20261010-session-reference-responses-optional-cursor.md`。下次移植上游时，这三个文件的搜索契约保留本地版本。
- 有意偏离上游（授权范围）：上游只对“最新一条用户消息”里附加的会话授权，下一条消息不再附加就会撤出工具。本地改为“用户在当前会话活动分支上显式附加过的会话”持续有效，改动在 `sessionReferenceExtension.ts`（`referencedSessionIds()` 按消息缓存，沿分支祖先收集 `sessionReferences`；工具披露要求至少一个被引用会话仍存在）以及工具描述文字（`sessionReferenceToolContract.ts`）。没有引用过的会话、已放弃分支上的引用仍不授权；会话删除、活动分支变化、文件权限与执行前校验不变。下次移植上游时，这一函数保留本地版本。
- 有意偏离上游（引用链）：被引用会话的活动分支上，用户亲手附加过的会话也可读，最多再沿 3 层、整体不超过 24 个会话，环路与当前会话自身被忽略；新增 `sessionReferenceChain.ts`。为了让模型发现下一层 ID，`sessionMessageText()` 把消息里的 `session_ref` 节点渲染为行内 `[SESSION:id]` 标记，并在消息文本末尾追加 `Referenced tasks: [...]` 清单（此前节点转成文本为空）；用户手打的同形标记会被转义，授权只看数据里的 `sessionReferences`。做法对齐 ZCode：下一层引用留在文本里。使用时会重新核对携带该引用的会话仍存在且活动分支未变；其他不相关会话里的引用不会被带过来。
- UI 侧与上游的差异（样式写法、冻结选区引用等）属于其他本地定制，本次不改。
- 验证：会话相关测试共 24 个文件、185 个用例（`service/src/conversations/__tests__` 全部、`sessionReferenceAuthorization`、`ChatQueueService`、`runInputRepository`、`chatQueueRepository`、`conversationHistoryRepositories`、`agent/extensions/__tests__`、`BuddyTurnLauncher`）：180 通过、1 跳过、4 失败。4 个失败都是 Windows 环境问题，与本次改动无关：`BuddyTurnLauncher.spec.ts` 1 个用例因创建符号链接需要权限（`EPERM`），`toolPolicyExtension.spec.ts` 3 个用例以 `/tmp` 作工作目录、在 Windows 上被判为 `INVALID_PATH`，它们依赖的文件本次均未改动。`vue-tsc -b` 与相关文件 ESLint 通过。未跑全量测试或打包。
- 验收（2026-10-12）：用 `pnpm --filter @uselexora/lexora-buddy package:windows` 生成安装包 `XTLaw-0.1.1-windows-x64.exe`（SHA256 `e120068d62a9ce1ebc299dce258461c0dee90a5bc6ed834854e5cfed90ad07be`，基于提交 `060c2c83`，约 2 分钟，包体与打包目录校验通过），用户实机验收通过。版本号仍是 0.1.1，未签名。
- 已在本地提交，未推送（见 `git log`）：去掉 `ask` 并对齐上游；会话检索改为数字偏移、授权持续有效并加入引用链；文档与 bug 记录；验收记录。
