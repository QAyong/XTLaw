# Feature-033：文档插件统一契约

**日期：** 2026-10-18
**状态：** 第一、二步已实现，待用户验收；第三、四步未开始

## 目标

目前三个 Office 插件（DOCX、PPTX、XLSX）能工作，是因为本体里写死了格式名：渲染层的 `docx|pptx|xlsx` 正则、聊天引用的 `docx/pptx/xlsx` 格式与位置字段、扩展接口的引用输入联合校验、扩展服务按文件后缀选引用格式、重开引用时按格式名判断，以及打包脚本逐个列出插件。另外 API 4 新增的 `accepts.extensions`、`selectedResourceWrite`、`composerReference`、`resourceExport`、`webAssembly` 没有登记进能力目录，插件创作文档和能力查询都不知道它们。

目标：别人也能做文档插件；新增 CSV、PDF、Markdown 等格式只需新增插件，不改本体；同时让与上游同步时的冲突尽量少。

## 已做的决定（来自用户）

- 第三方作者也能开发文档插件。
- 允许第三方使用 `selectedResourceWrite`（写回当前文件），安装时强提示；保留现有保护：保存前检查文件版本和内容哈希、目录授权、外部修改拒绝覆盖。
- `webAssembly` 暂不对第三方开放：契约里写明“仅内置/官方插件可用”，宿主侧落实该限制；资源上限与第三方开放留给第三步。
- 聊天引用改为通用格式：位置是插件自定义的受限 JSON，宿主严格校验并自己填入插件 ID。
- 编号策略：上游目前只支持 API 1–3，本地 API 4 是自己的编号，担心将来与上游自己的 API 4 撞车。所以能力以“能力目录里的能力名”为准来声明和查询，不只靠 `apiVersion` 数字；文档措辞用“XTLaw 扩展能力”，不宣称 API 4 是公开标准，并标注与上游编号的关系与风险。

## 范围与步骤

1. 契约文档：`apps/buddy/service/resources/skills/plugin-creator/references/document-processor.md`，并更新 `protocol.md`、`capabilities.md`、`api.d.ts`。（已完成）
2. 本体去掉写死：路由由扩展服务回答；引用改为通用格式 `extension`（新旧并存）；能力登记进目录；打包自动发现；`webAssembly` 限制内置/官方。三个插件暂不改。
3. 权限收紧（未开始）：资源上限、预装升级提示、去掉 PPTX 多余的 `localResources`、第三方 `webAssembly` 开放、`selectedResourceWrite` 对第三方的强提示。
4. 共享目录、示例插件、对外文档、tools.mjs 接入（未开始）。

## 设计要点

### 路由

`accepts.extensions` 是唯一依据。纯函数 `matchFileHandlers`（`shared/extensions/extensionFileHandlers.ts`）在已启用且兼容的插件中取匹配视图；恰好一个才接管，没有或有多个（含同一插件两个视图）都走内置预览，这与改前的 `ExtensionService.openFile` 一致。扩展服务和渲染层共用这一个函数。渲染层用现有 `extensions.list()` 与 `onChanged` 缓存结果，不新增 IPC；判定前先等待首次加载完成，避免启动初期把文档当成普通文件。

### 引用

新增 `format: 'extension'`，来源 `extension: { extensionId, kind, hash, location }`。`extensionId` 由宿主填入；`kind` 为插件自定义类型名；`location` 是受限 JSON（≤4096 字节、深度 ≤4、键 ≤32、数组 ≤64、字符串 ≤512，仅限 JSON 基本类型，拒绝原型污染键）。旧 `docx/pptx/xlsx` 格式与字段继续读、显示、重开，不迁移。发给模型的文字只带 `kind`，不带 `location`（位置由插件解释，进提示词没有收益且增加注入面）。`location` 的序列化长度计入引用总长度。

### 能力目录

在已有 `workbenchContributionCatalog` 的 `runtime` 类别下扩展，新增 `shared/workbench/workbenchDocumentCapabilities.ts`，登记 `documents.handler`、`documents.writeBack`、`documents.reference`、`documents.export`、`documents.webAssembly`，每项含中英文标题、范围、描述、`since`（首次出现的应用版本）、`requires`（权限与清单字段）。`lexora_plugin_capabilities` 无需改动即可查到。

首次出现版本按 git 祖先关系核对：`accepts`、`selectedResourceWrite`、`composerReference`、`resourceExport` 都在 `xtlaw-v0.2.0` 之前；`webAssembly` 与通用引用在 `xtlaw-v0.2.2` 之后，写作 0.2.3（以实际发布版本为准）。

### 内置/官方插件的判定

不用作者名等可伪造字段。判定依据是宿主代码在审查时传入的安装来源：`source.catalog === BUNDLED_EXTENSION_CATALOG_URL`（只有内置目录条目会得到该值，远端目录会过滤掉 `kind: 'bundled'` 条目，并且与内置插件同 ID 的远端条目被隐藏），或者 `development`（开发目录加载）。本地安装包、第三方目录不满足，声明 `webAssembly` 时在 `reviewFiles` 抛 `EXTENSION_WEBASSEMBLY_RESTRICTED`。运行时（CSP）再做一次同样的判断作为兜底。

## 未决问题

- 第三方开放 `webAssembly` 的资源上限（内存、Worker 数、wasm 体积、CPU 时间）与审核方式。
- `selectedResourceWrite` 对第三方的“强提示”形式（独立警告块？二次确认？）。目前安装审查对它与其他权限样式相同。
- 预装只在首次初始化时安装一次，插件升级不会自动推送给已有用户（需要在插件市场点更新）。是否在升级时提示、如何提示，留给第三步。
- 多个插件接管同一扩展名时，目前只能留在内置预览，没有“选择默认打开方式”的界面。是否需要，等有第三方文档插件后再看。
- PPTX 的 `localResources`：只有回退用的只读预览 `preview.js` 调用了 `pickFiles`，编辑器 `view.js` 没有。是否去掉，留给第三步。
- 上游发布自己的 API 4 时，本地 `apiVersion` 数值需要重新协调；能力名保持不变。

## 第二步落地的文件

新增：`shared/extensions/extensionFileHandlers.ts`（匹配函数）、`extensionTrust.ts`（内置/官方判定）、`shared/conversation/extensionQuoteLocation.ts`（受限 JSON）、`shared/workbench/workbenchDocumentCapabilities.ts`（能力登记）、`platform/extensions/legacyOfficeQuote.ts`（旧三种引用形状）、`packaging/buddy/release/bundled-plugins.mjs`（打包发现）。

## 与上游同步的冲突点（上游已有、本地做了小改的文件）

`ExtensionService.ts`（openFile 与引用捕获）、`ExtensionPackageStore.ts`（+4 行）、`ExtensionProtocol.ts`（CSP 条件）、`buddyUserContent.ts`、`buddyResourceQuoteText.ts`、`extensionApi.ts`、`extensionManifest.ts`（校验与升级对比改读登记）、`extensionAuthoring.ts`、`workbenchContributionCatalog.ts`（一行展开）、`useDesktopWorkbench.ts`、`DesktopWorkbenchArea.vue`、`createDesktopSelectionReferences.ts`、`platform-definition.mjs`，以及插件创作文档 `protocol.md`、`capabilities.md`、`api.d.ts`。原则是新逻辑放进新增文件，对上游已有文件只做小范围替换。

## 已知风险

- 开发目录加载（`development`）仍可声明 `webAssembly`：用户在插件管理里选择开发目录即可，视为作者本人的主动操作；第三步评估是否仅在开发构建中开放。
- `buildExtensionPackage`（创作用的构建）不检查 `webAssembly` 来源限制，要到安装审查才报错。
- 渲染层缓存已安装插件的 `accepts`，插件变化后靠 `onChanged` 刷新；刷新期间的一瞬间仍按旧结果判断。
