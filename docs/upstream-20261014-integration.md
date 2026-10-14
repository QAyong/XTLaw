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

## 第 2 部分：应用更新体验（`1073fa9a`）

- 工作分支：`codex/upstream-20261014-updates`，基于 `master` 的 `c17cb102`。本地提交 `119cc5fa`，保留来源行。未合并到 `master`、未推送、未打包。
- 移植后上游区间已追平：`upstream/master` 仍为 `1073fa9a`。

### 功能

- Windows 应用内更新：发现新版本后在应用内下载安装包（带进度，可取消），然后“安装并重启”。安装程序可以请求应用退出，不必再手动从托盘退出。
- 设置 → 关于新增“更新”分组：自动检查（沿用原有“更新通知”的配置字段 `updateNotificationsEnabled`）、自动下载、安装包缓存管理、稍后提醒与跳过此版本。
- 安装闸门：安装程序运行期间，新增的原生检查 `installation_gate.rs` 阻止应用再次启动。
- macOS 只有开发者签名的包支持应用内安装。XTLaw 的 macOS 包是临时签名，会退化为“下载后打开安装包”；Linux 只下载。
- 新增依赖 `electron-updater`（仅 macOS 签名包使用），已执行 `pnpm install`。没有数据库迁移。

### 改成 XTLaw 的部分

- **更新包查找**：上游写死了 `useLexora/Lexora`、`v<版本>` 标签和 `Lexora-Buddy-*` 文件名。改为 `productLinks.ts` 集中提供 `RELEASE_TAG_PREFIX`（`xtlaw-v`）、`releaseTagUrl`、`releaseDownloadUrl`，更新检查、更新包选择、更新策略三处共用。
- **安装包命名**：`desktopDistribution.ts` 的 `desktopUpdateArtifactName` 生成 `XTLaw-<版本>-<平台>-<架构>`，打包脚本 `artifacts.mjs` 也改用它，删除原来各格式各自拼接的 `suffix`。逐一核对 6 个发布包，新旧文件名完全一致。
- **安装闸门互斥量**：`Local\lexora-buddy-installation` 改为 `Local\xtlaw-installation`。`installation_gate.rs` 和 `installer.nsh` 同步修改，避免与同机安装的上游 Lexora 互相阻塞。
- **下载缓存目录**：`lexora-buddy/updates` 改为 `xtlaw/updates`。缓存文件名解析改为识别 `XTLaw-`。
- **品牌文案**：安装程序提示、“关闭后继续安装”原生对话框、更新通知标题改为 XTLaw。

### 不取的部分

- `release.yml`、`macos-verify.yml` 的改动，XTLaw 使用自己的 CI。
- macOS 更新用 zip 包：包括 `electron-builder` 的 zip 目标、打包目标、`package-desktop.mjs` 的 zip 构建、`verify-macos-install.mjs` 的 zip 校验。临时签名的包用不上应用内安装。打包时传入包格式的环境变量保留，用于区分 Linux 的 deb 与 pacman。

### 冲突处理（14 个文件）

- 打包与安装：`electron-builder.config.cjs` 保留产品名 `xtlaw`，加入分发元数据；`artifacts.mjs`、`package-desktop.mjs` 保留 XTLaw 产物格式与 `xtlaw.app`；`installer.nsh` 采用上游“请求退出再安装”流程并改为 XTLaw 文案。
- 主进程：`DesktopIntegrations.ts` 保留本地通知清理并接入安装请求；`ipc.ts` 合并导入。
- 文案：采用上游新的更新设置文案，品牌为 XTLaw。原“更新通知”开关并入新的“自动检查”。
- 界面：关于页、关于设置、更新对话框只取功能，保留本地作用域样式，包括检查失败时的缓存结果状态、跳过/稍后操作和下载/安装按钮。`DesktopApplicationToggle.vue` 采用上游版本：新的更新设置依赖它的“不可用原因”提示和插槽，它使用的设置行和分组组件第 3 批已移植。新增组件所用原子类本地均可生成，不需要补映射。
- 测试：`useDesktopUpdates.spec.ts` 及更新相关测试夹具改为 XTLaw 的发布地址、标签和文件名；`LexoraConfigStore.spec.ts` 补上新配置项 `autoDownloadUpdates`。

### 验证

- `vue-tsc -b` 无错误；改动文件 ESLint 通过。
- 更新相关测试 39 个文件、210 个用例：208 通过、2 跳过、0 失败，覆盖更新服务、更新包选择/策略/缓存/下载、安装请求、退出流程、配置、设置页与通知。
- 用 `xtlaw-v0.1.1` 的真实发布数据验证更新包选择：Windows x64/arm64、macOS arm64、Linux deb x64/arm64、Arch x64 共 6 个安装包都能找到并取到 SHA256。
- 原生：`cargo check`（库与 `lexora-buddy-process-control`）通过；`installer-process-windows` 5 个测试通过，包括使用新互斥量名的安装闸门用例。
- 未打包、未运行 e2e。`.playwright/scripts/__tests__/updates.e2e.mjs` 在本轮之前就使用上游发布地址和旧菜单选择器，与 XTLaw 不一致，本轮没有修复。
- 应用内更新的端到端验收需要两个都带此功能的版本：0.1.1 用户仍需手动下载一次新版本，之后的升级才能在应用内完成。
