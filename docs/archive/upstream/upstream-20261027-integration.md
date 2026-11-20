# 上游集成记录：2026-10-27

区间是 `977df5b77..46fcc9081` 的 5 个提交（`977df5b77` 是 10-26 的基线，已在 `master`）。分支 `codex/upstream-20261027`，用 `git cherry-pick -x`。至此 `upstream/master` 已全部检查。5 个提交与本地 `master` 试合并均有冲突（6 / 4 / 6 / 2 / 11 处）。

## 已移植

| 本地提交 | 上游提交 | 内容 |
| --- | --- | --- |
| `77765633a` | `9f1b732cf` | 插件原生菜单引用：`references.capture / commit / release`，`ExtensionWorkbenchResult` |
| `2e06b530d` | `c730e741c` | 上下文标签固定与批量关闭（右键菜单） |
| `cb87103d4` | `b9c51fd51` | 插件直接编辑本地文件：`fileEditing` 权限、`context.documents`、工作副本存储、Rust 文件引擎写字节 |
| `60787cb57` | `397a035b4` | Pi 升级到 1.4.0（含 3 份补丁改名）、`codemode` 默认开启 |
| `b60f9dabc` | `46fcc9081` | 只移植 plugin-creator 技能文档与能力目录，见下 |
| `7e6563eec` | （本地修正） | 工作台回复结果变宽后，`ExtensionService` 里三处按字符串使用的地方补类型收窄 |

## 跳过

`46fcc9081` 中的 `apps/website`（插件文档页、站点配置、SEO、落地页文案）和 `apps/buddy/extensions/README.md`：按约定只取 plugin-creator 技能文档。`agent-settings.md` 被上游改名为 `agent.md`，已同步修了 README 里的链接。

## 冲突解决

`9f1b732cf`：本地的工作台回复是 `(requestId, viewId, data)`（选区引用用 `data` 传捕获结果），上游改成 `(requestId, result)`。合并为 `(requestId, result, data?)`：`result` 采用上游的 `ExtensionWorkbenchResult`，`data` 保留给本地的 `quote-capture / quote-add`。`references.*` 权限检查用本地的 `extensionMayReference`。

`c730e741c`：`WorkbenchResourcePanel.vue` 保留本地的作用域样式和最大化按钮，只加右键菜单、固定图标和批量关闭；`useContextPanelTabs` 导出里加 `setPinned`，保留本地的 `restoreOpenStates / getOpen / setOpen`。

`b9c51fd51`：本地已有 `selectedResourceWrite`（写回当前文件）和 Office 文档处理器，上游 `fileEditing` 是另一套独立能力，两者并存：清单权限、安装审核界面里“保存当前文件”和“编辑原件”分开显示。Rust：写字节统一用上游的 `WriteBytesRequest`（借用），本地二进制协议 `run_binary` 沿用 64 MiB 上限，改名 `MAX_BINARY_REQUEST_BYTES`，避免和上游 256 MiB 的 `MAX_BINARY_BYTES` 重名。

`397a035b4`：`LexoraConfigStore.spec.ts` 本地已大改，保留本地版本，只改 `codemode` 默认值期望并补上游的“默认开启且不覆盖显式选择”用例；`pnpm-lock.yaml` 取本地版本后用 `pnpm install` 重新生成。

`46fcc9081`：上游把 `protocol.md` 拆成多个专题文件。`SKILL.md`、`capabilities.md`、`protocol.md`、`sdk-workflow.md` 取上游新版并把 `Lexora` 改为 `XTLaw`，再加回本地独有的条目：文档处理器契约、市场能力（MCP 连接记录、NPC 子代理）、`selectedResourceWrite / composerReference / webAssembly` 三行权限。`references.md` 里“需要 Lexora 0.17.0”改为“`engines.lexora` 不低于 0.17.0”。

## 检查

- 迁移：无；依赖：Pi 1.3.0 → 1.4.0，已 `pnpm install`；Rust：有（文件引擎）；`.github/workflows`：未改。品牌：新增代码里没有需要改的 “Lexora”（只有 `lexora_` 工具名、`LexoraConfigStore` 和 `engines.lexora`）；文档中的产品名已改为 XTLaw。
- 本机类型检查（`vue-tsc -b`）通过；改动文件的 ESLint 通过；`cargo check --tests`（`native/host`）通过。
- 本机 Windows 跑过相关测试（`platform/extensions`、`shared/extensions`、`src/app/workbench`、`context-panel`、`electron/main/config`、`src/modules/extensions`、`service/src/agent/sessions`、`service/src/files`）：失败的只有符号链接权限（EPERM）类用例和 `known-test-failures.md` 列出的 `createBuddySession`、`createReusableBuddySession`；`codemode.spec.ts`、`extensionPackageTools.spec.ts` 在并行跑时超时，单独重跑通过。`ExtensionWorkingCopyStore.spec.ts` 的 20 个用例需要先用 `packaging/buddy/release/native-host.mjs` 构建原生文件读取程序，构建后通过。
- 未跑：Playwright E2E（含上游新增的上下文标签 E2E 用例）、开发预览、打包；插件文件编辑的真实窗口表现；右键菜单固定与批量关闭的真实窗口表现；Pi 1.4.0 补丁在真实对话里的表现；Rust 的 Linux/macOS 构建（`unix.rs` 本机未编译，依赖 `XTLaw CI` 的 native checks）。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `46fcc9081`，即 `upstream/master` 当前最新提交。
