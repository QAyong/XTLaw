# 上游集成记录：2026-10-22（第三轮）

区间是 `c81bdfb5..upstream/master`（`bbb1bb06`）里此前推迟的 `d6cd5ec3` 与 `c07652a3`。前两轮见 [upstream-20261022-integration.md](upstream-20261022-integration.md) 和 [upstream-20261022-2-integration.md](upstream-20261022-2-integration.md)。分支 `codex/upstream-20261022-3` 从 `origin/master`（`aff2d1e9a`）切出，两个提交各对应一个上游提交，均用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `d6cd5ec3` | 支持插件配置多 Shell 执行（71 个文件，含 Rust）。插件声明 `contributes.shells` 候选和设置映射，宿主检测并执行；模型通过统一的 `lexora_shell` 工具选择 `<插件ID>/<候选ID>`。包含 `shellProgram` 类型与检测、`ShellSelection`、扩展 IPC / RPC、原生设置表格、沙盒按解释器与方言启动命令的 Rust 变更，以及 `plugin-creator` 的 `shells.md` 文档 |
| `c07652a3` | 修复插件清单兼容性：清单校验不再 `.strict()`，宿主忽略不认识的顶层、`permissions`、`contributes` 声明；新增 `extensionPackageManifest()`，打包时省略取默认值的权限 |

### 冲突解决（`d6cd5ec3`，10 个文件；`c07652a3`，3 个文件）

- **API 版本：** 上游本提交把 `EXTENSION_API_VERSION` 从 3 升到 4，本地早已因 Office 文档能力用了 API 4，所以常量不变。两边的 API 4 含义不同：本地是文档写回、引用等能力，上游是 Shell。Shell 能力同时要求 `permissions.shells`，不靠 API 版本区分，所以可以并存。测试里保留本地的 `EXTENSION_API_VERSION + 1`（未来版本），不照搬上游写死的 5，并补入“API 4 受支持”用例。**风险：** 上游以后若再把 API 升到 5，要核对和本地的“未来版本”边界是否冲突。
- **系统提示词（`createBuddySystemPrompt.ts`）：** 采用上游的 `lexora_shell` 判断；本地的“Windows 回环 TCP 无需单独审批”提示原来绑定在 `powershell` 工具名上，改成按 `execution.dialect === 'powershell'` 判断，所以启用 `lexora_shell` 时这条提示不丢。
- **设置界面：** 本地 `DesktopPluginSettingField.vue`、`DesktopSettingsGroups.vue` 已改为作用域样式，上游仍是 UnoCSS 组件。按“本地已有组件不改”的规则，保留本地标记，只补上 Shell 需要的部分：字段组件增加 `compact`（表格单元格里隐藏标题和说明，仅保留提示）、`control` 插槽和行内错误；设置组增加 `DesktopShellSettingsTable` 和 `remainingItems()`。上游新增的 `DesktopShellSettings*`、`DesktopSettingCell` 保留其 Uno 类名，所用类（`min-w-*`、`w-*`、`text-muted`、`text-success`、`text-danger` 等）本地主题已有，不需要补映射。
- **导入与媒体协议：** `DesktopRuntimeHost.ts`、`ExtensionService.ts`、`extensionApi.ts`、`extensionManifest.ts` 同时保留本地新增（`mediaProtocol`、`BundledExtensionCatalog`、`openFile`、选区引用、文档能力）和上游的 Shell 导入。导入保持本地的无扩展名写法。
- **SDK（`c07652a3`）：** `authoring.ts`、`plugin.mjs`、`tools.mjs` 保留本地新增（打包大小限制、内置插件处理器、文档契约报告），只补入 `extensionPackageManifest`。

### 品牌

新增文案里的 “Lexora 检测并执行”（`shells.md`）和安装确认里的 “Lexora 按现有权限执行”（中英文）改成 XTLaw。`lexora_shell`、`lexora_host_shell`、`LEXORA_*`、`engines.lexora` 是标识符，保留。`shells.md` 里写死的 `engines.lexora: ">=0.14.0"` 是上游版本号，XTLaw 版本是 0.3.x，已改成“不低于首个提供此能力的 XTLaw 版本”。

## 待定事项

- **Shell 能力的 `engines.lexora` 下限：** 要等发布该能力的 XTLaw 版本确定后，在 `shells.md` 和本地能力版本表（`workbenchDocumentCapabilities`）里写具体版本。
- **macOS：** 上游暂不开放插件候选执行（只接入 Linux 和 Windows），本地跟随。

## 检查

- 迁移：无。依赖：无变更，没有执行 `pnpm install`。
- 类型检查：`apps/buddy` 的 `vue-tsc -b` 通过。`eslint` 对全部改动的 ts、vue、mjs 文件无问题。
- Rust（本机 Windows）：`cargo test -p lexora-buddy-host --lib` 91 通过、2 个忽略，含新增的 `shell_program` 用例（`cmd_keeps_quotes_literal_and_rejects_multiline`、`dialect_uses_matching_flags_…`、`legacy_dialect_defaults_to_powershell_…`）。
- vitest（本机 Windows，跑了 `platform/extensions`、`shared/extensions`、`src/modules/settings`、`src/modules/extensions`、`platform/process`、`service/src/sandbox`、`service/src/permissions`、`service/src/agent/extensions`、`service/src/agent/resources`、`service/src/approvals` 和 `multiShell.integration.spec.ts`）：733 通过、13 失败。其中 12 个在干净的 `origin/master` 上同样失败，属于 `docs/known-test-failures.md` 记录的 Windows 限制（符号链接 `EPERM`、POSIX 路径语义），我在基线上单独复跑 `toolPolicyExtension`、`PermissionEngine`、`sandboxPermissions`、`ToolDisclosure` 确认过。
- 新增的 1 个失败：`ToolDisclosure.spec.ts` “exposes only the unified command tool while retaining roles pinned to legacy shell identities”。它构造的角色范围引用内置工具 `bash`，而 `SessionToolScope` 按 `process.platform` 取已注册的内置工具，Windows 上是 `powershell` 而不是 `bash`，所以抛出 `BUDDY_CAPABILITY_UNAVAILABLE`。这是测试的平台假设，不是移植错误，预期 Linux CI 通过。
- 未跑：Playwright E2E（设置里的“命令解释器”表格、安装确认里的 Shell 权限条目）、`pnpm test:sandbox:windows`（需要已安装的 XTLaw Sandbox 服务）、macOS / Linux 原生测试、开发预览、打包、全量测试。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `bbb1bb06`。至此 `c81bdfb5` 之后的 8 个上游提交都已决定：移植 `305e194c`、`d76e5dc1`、`dc7ca3c5`、`d6cd5ec3`、`c07652a3`、`40a99b7c`、`bbb1bb06`，跳过 `9a8da6e6`。其中 `bbb1bb06` 在 PR #24 中，合并本分支前后都不影响基线文件。
