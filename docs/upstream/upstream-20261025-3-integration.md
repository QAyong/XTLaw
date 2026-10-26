# 上游集成记录：2026-10-25（第三轮）

区间是 `f0a5ed59a..a84e5f203`（`upstream/master` 当前最新）里的 3 个提交。分支 `codex/upstream-20261025-3` 叠在第二轮分支之上（[第一轮](upstream-20261025-integration.md)、[第二轮](upstream-20261025-2-integration.md)），用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `76e850d71` | 插件安装审核按资源分组展示权限：4 个文件，1 个文件冲突。见下 |
| `ea3d41c34` | 自定义通知音效：40 个文件，9 个文件冲突（含 1 处 modify/delete）。见下 |

## 跳过

| 上游提交 | 原因 |
| --- | --- |
| `a84e5f203` 发布 v0.16.0 | 只改版本号文件。XTLaw 不照搬上游版本号和发布配置 |

## `76e850d71`：插件安装审核

上游把平铺的权限列表改成“资源 + 可执行的操作”分组（剪贴板、文件、目录、对话引用、任务工具……），更新时标出新增操作；附带技能改成名字标签；默认打开方式表格更紧凑。本地这个页面已经和上游分叉（作用域样式、本地独有的权限），冲突是整页的。处理：采用上游的新组件 `DesktopExtensionReviewPermissions.vue` 和页面布局，把本地权限补进分组，避免安装审核里少列权限：

- `composerReference`：放在“对话引用”组，单独一项“将文件选区引用到聊天”（三个 Office 插件声明的就是它）；只声明它时说明里不出现“读取”。“读取”仍只对应显式的 `references`（和第二轮一致）。
- `selectedResourceWrite`：放在“文件”组，叫“保存当前文件”；对非内置插件保留本地的“高风险”标签和覆盖文件的警告（沿用 `extension-permission-risk` 测试标记）。
- `webAssembly`：新增“插件页面”组（xlsx 插件用）。
- `windowEffects`：沿用本地措辞（“显示窗口特效”，不声称注入 CSS）。
- 新增文案里的 `Lexora` 全部改为 `XTLaw`（模型调用、定时任务、默认打开方式、插件市场来源）。

已有的 `DesktopExtensionInstallReview.spec.ts` 里本地的高风险用例原样通过。

已知的既有缺口（不是这次引入）：`addedExtensionPermissions` 不包含 `composerReference`、`selectedResourceWrite`、`webAssembly`、`resourceExport`，所以更新插件时这几项新增了也不会出现“新增”标。留待另外处理。

## `ea3d41c34`：自定义通知音效

内容：通知提示音可选（三个内置音效 Material Sounds，或导入音频文件）、音量、设置页的“测试通知”按钮；通知用应用自己的隐藏音频窗口播放（系统提示音关闭 `silent`）；音效列表和导入的音频文件进入设置范围的备份与恢复。新增三个内置 wav 和 CC BY 4.0 许可证文件（`public/third-party/material-sounds-LICENSE.txt`），内置音频经 `?asset` 打包（本地已经在用 `?asset`）。

冲突与调整：

| 文件 | 处理 |
| --- | --- |
| `DesktopNotificationService.ts` | 保留本地的通知保留表（`#notifications`）、`dispose`、`onClose`、`onError`；加入上游的 `test()`、`#createNotification`、`onShow`、`openApp`、`getSoundSelection`、`playSound`；测试通知标题改 `XTLaw` |
| `DesktopIntegrations.ts` | 保留本地的通知诊断记录和站点动态注册（`registerSiteFeed`），接入音效播放器、音效库、设置变更处理 |
| `LexoraConfigStore.ts`、`backupSettings.ts` | 只加 `notification_sound`；上游同一行带的 `navigation_layout` 本地没有，不加 |
| `DesktopNotificationsSettings.vue` | 采用上游版本（基于共享的设置行组件）。本地是较旧的内联行布局，没有本地独有功能 |
| `DesktopNotificationService.spec.ts` | 保留本地用例，补上新增的必需选项；上游的音效与测试通知用例放进单独的 `DesktopNotificationSound.spec.ts`，本地点击导航在微任务里完成，用例里加了一次 `await` |
| `LexoraConfigStore.spec.ts` | 保留本地用例，补上默认的 `notificationSound` |
| `backupSettings.spec.ts` | 本地已删除，按删除处理；新增的“合并音效列表”用例放进独立的 `backupSettingsNotificationSound.spec.ts` |
| `workbench.e2e.mjs` | 保留本地；上游同一提交里顺带加的“通知导航”E2E 三个用例没取（依赖上游的窗格/侧栏结构，本机跑不了 E2E，无法验证）。新增的 `notification-sounds.e2e.mjs` 保留，隐藏音频窗口标题和测试通知标题改 `XTLaw` |

**备份格式影响：** 无迁移。设置备份多了可选的 `desktop.notification_sound` 和 `buddy/notification-sounds/<id>.audio`；旧备份没有这些字段，恢复时保留当前音效（有用例）；新备份在更旧的 XTLaw 版本上恢复时，这个字段按未知键处理，额外文件会被忽略（未验证，旧版本没有这段代码）。

## 检查

- 迁移：无。依赖：无变更。Rust：无。不涉及 `.github/workflows`。
- 品牌：新增行里的 `lexora` 都是标识符（`lexoraDesktop` 全局、IPC 通道 `lexora:notification-sounds`、音频分区 `lexora-notification-audio`、`lexora.themes.classic-dark`），可见文案和窗口标题已改为 `XTLaw`。
- 类型检查（`vue-tsc -b`）通过；全部暂存文件 `eslint` 无问题。
- 本机 Windows `vitest`：扩展审核（`src/modules/extensions`）通过；通知服务两个 spec、`LexoraConfigStore` 全部通过。`electron/main`、`shared/notifications`、`shared/storage`、`service/src/storage`、`platform/storage`、`src/modules/settings`、`src/platform` 里其余失败，和第二轮分支改动前同机对比后，新增的只有 `selectiveBackup.spec.ts` 的“restores sound settings…”：它因为本机缺原生目录权限程序（`lexora-buddy-private-directories.exe`，`spawn ENOENT`）而失败，本机没有验证，靠 `XTLaw CI` 的 Linux 全量测试。其余失败改动前就存在（Windows 环境限制，见 `known-test-failures.md`）。
- 未跑：Playwright E2E（含新增的 `notification-sounds.e2e.mjs`）、开发预览、打包；真机听音效、测试通知按钮、Windows 通知横幅与应用内播放的配合、从旧备份恢复。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `a84e5f203ec000a0a12b8c270e75ddbc5043fa1b`，即 `upstream/master` 当前最新提交。
