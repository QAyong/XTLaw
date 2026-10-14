# 2026-10-14 上游集成：插件兼容性提示

## 范围与状态

- 本轮只移植上一轮暂缓的 `7e0e301f`（完善插件兼容性提示与管理体验，10/13）。它在上一轮区间 `df0f9369..a270927d` 内，详见 [upstream-20261013-integration.md](upstream-20261013-integration.md)。
- 检查到的上游 commit：`1073fa9a`（`upstream/master`）。`a270927d` 之后只有 `1073fa9a` 一个新提交，本轮未移植，见“下一轮待评估”。
- 工作分支：`codex/upstream-20261014`，基于 `master` 的 `266d1c09`（开放插件市场并指向 XTLaw 插件目录，见 [Feature-032](specs/feature-032-xtlaw-plugin-market.md)）。
- 本地提交 `7b3c707e`，保留来源行。未合并到 `master`、未推送。

## 功能

- 插件不兼容时给出具体原因：应用版本过旧或过新、插件接口或格式版本不受支持、版本范围不匹配、包信息无效。原因属于“应用过旧”一类时，提示升级 XTLaw，并提供“更新 XTLaw”链接。链接走本地检查更新接口，打开 XTLaw 自己的发布页。
- 安装本地插件包或从市场安装时，不兼容的插件显示专门的审核页，不再直接报错。
- 已安装但当前版本无法使用的插件单独列为“不可用”卡片，不再导致整个已安装列表读取失败；不兼容的待应用更新不能被应用。
- 市场目录先按元数据读取条目，不兼容的条目也会列出并标明原因；无法读取的条目单独计数提示，不影响其他插件。
- 插件卡片显示标签和兼容性提示。

## 冲突处理（10 个文件）

- `ExtensionCatalogService.ts`：保留本地内置 Office 目录。内置条目的 ID 优先，市场中同 ID 条目忽略。上游的兼容原因判断和无效条目计数同时作用于内置条目和市场条目。下载内置插件时，不兼容同样抛出兼容性错误。
- `extensionCatalog.ts`：保留本地的包完整性校验和内置条目格式，加入上游的“元数据级”目录条目结构。
- `BundledExtensionCatalog.ts`（无冲突，跟随改动）：上游让共享目录结构保留原始条目，内置目录读取改为逐条按完整格式严格校验。内置插件随产品分发，必须完全有效。
- `extensionManifest.ts`：元数据的接口版本按上游放宽为任意正整数。完整清单的校验接受 1–4，因为本地插件接口版本是 4（上游是 3）。直接采用上游写法会拒收接口版本 3 的插件，包括标题自动生成插件。
- `ExtensionService.ts`：保留本地选区引用相关导入。本地用 `catalog.source(entry)` 记录插件来源，不需要上游的 `EXTENSION_CATALOG_URL` 导入。
- `registerExtensionIpc.ts`：采用上游的不兼容审核包装，保留 `XTLaw Extension` 文件筛选名，不引入本地没有的主题系统导入。
- `DesktopExtensionCard.vue`、`DesktopExtensionCatalog.vue`、`DesktopExtensionManager.vue`：模板按上游新结构改写，只取功能，样式保留本地作用域写法，沿用本地颜色和字号变量。
- 上游新增的 7 个组件（目录卡片、兼容性提示/通知/审核页、标签、不可用卡片、更新下载链接）保留原子类名。经检查，所需类名均可由现有 UnoCSS 配置生成，不需要补映射。
- `ExtensionService.spec.ts`：保留本地“状态保存失败”用例，采用上游扩展后的“不兼容更新保持非活动”用例。去掉上游只在主题权限用例中使用的导入。
- `extensionUpdates.e2e.mjs`：取上游新增的插件标签断言，主题相关参数保留本地版本。

## 品牌

- 兼容性文案中的“Lexora”改为“XTLaw”，“更新 Lexora”改为“更新 XTLaw”。

## 测试适配

- 上游有 3 个测试文件把接口版本 4 当作“未来版本”。本地支持 4，所以这些用例改为使用 `EXTENSION_API_VERSION + 1`：`extensionCompatibility.spec.ts`、`ExtensionCatalogService.spec.ts`、`ExtensionPackageStore.spec.ts`。
- 本地独有的 `DesktopExtensionCatalog.spec.ts` 补上新增的 `unavailable` 状态和目录快照字段。

## 验证

- `vue-tsc -b` 无错误；改动文件 ESLint 通过。
- 插件相关测试 31 个文件、191 个用例：188 通过，3 个失败。3 个失败均为 `docs/known-test-failures.md` 中已记录的符号链接权限限制。
- 用合并后的代码和线上真实的 XTLaw 市场目录、安装包（通过 curl 获取后喂给测试）完成列出和安装：标题自动生成显示为兼容，无效条目为 0，安装成功。
- 未在桌面窗口中查看新的插件卡片、不可用卡片和不兼容审核页，未运行 e2e。

## 下一轮待评估

- `1073fa9a` 完善应用更新体验：72 个文件，新增依赖 `electron-updater` 和原生代码 `installation_gate.rs`，改动 NSIS 安装器与发布流程，需单独成轮。上游把更新包文件名写死为 `Lexora-Buddy-*`，移植时要改为 XTLaw 的安装包命名；发布工作流改动不取。
