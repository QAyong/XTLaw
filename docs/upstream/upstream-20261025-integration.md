# 上游集成记录：2026-10-25

区间是 `49c517976..f0a5ed59a`（`upstream/master` 当前最新）里的 4 个提交。分支 `codex/upstream-20261025` 基于 `origin/master`（`e4e5e7ae4`），用 `git cherry-pick -x`。

## 已移植

| 本地提交 | 上游提交 | 内容与整合方式 |
| --- | --- | --- |
| `865cea31d` | `57d5bec16` 的沙箱部分 | 只取 Windows 沙箱目录访问修复：`apps/buddy/native/host` 下 9 个文件，**无冲突**。见下 |
| `e8bedafe0` | `f0a5ed59a` | 修复任务切换时的阅读位置恢复：14 个文件，3 个文件冲突。见下 |

按上游时间顺序先落沙箱，再落阅读位置。无新迁移、无依赖变更、不涉及 `.github/workflows`。

## `57d5bec16`：只取沙箱部分

上游提交 33 个文件，混了免安装版 ZIP、更新策略、打包和 CI。预评估里它们在三方合并里有 9 个文件冲突（`buddy-build.yml`、`electron-builder.config.cjs`、`desktopDistribution.ts`、`DesktopUpdatePolicy.spec.ts`、`packaging/**`），全部在不取的范围内。做法是只对 `apps/buddy/native/host` 取上游的差异（`git apply --3way`），其他路径不动：

- `src/shell_sandbox.rs`、`src/shell_sandbox/{acl_state,filesystem,process,shell_program}.rs`
- `__tests__/{shell_program,shell_sandbox_acl_state,shell_sandbox_filesystem}.rs`、`shell_sandbox.windows.mjs`

（任务清单里把后四个源文件写成 `filesystem.rs` 等，实际路径都在 `src/shell_sandbox/` 下，上游该提交在 `native/host` 下恰好只改了这 9 个文件。）

没取：免安装版 ZIP、更新策略、打包与 CI（`electron-builder.config.cjs`、`packaging/**`、`.github/**`）、`sandbox.e2e.mjs`、`verify-windows-sandbox.ps1`、`package.json`、官网文档、`DesktopUpdate*`、`desktopDistribution.ts`、`desktopSmokeCheck.ts`、i18n。新增行里没有 `Lexora` 文案。

## `f0a5ed59a`：阅读位置恢复

内容：切换任务时，历史没加载够就先显示“正在恢复阅读位置”（带“回到最新”），用滚动锚点是否在 DOM 里（`hasScrollAnchor`）判断是否需要继续加载更早的消息；读者的滚轮、触摸、键盘、指针操作（`readerScrollIntent`）会取消恢复；阅读位置不再记录 `firstLoadedItemId`。

| 文件 | 处理 |
| --- | --- |
| `BuddyChatMessageList.vue` | 本地的历史状态条是作用域样式（`buddy-chat-message-list__history-status`），上游同一处是 UnoCSS 类。保留本地类名，只采用上游的显示条件（恢复中或加载更早）、文案和“回到最新”按钮 |
| `BuddyChatTranscriptViewport.vue` | 本地把滚动逻辑内联在组件里，`useChatTranscriptViewport` 组合式函数在本地没人用（上游改的是它）。保留本地内联实现，把上游的 `hasScrollAnchor`、`findScrollAnchor`、`readerScrollIntent`（滚轮/触摸/键盘/指针）加进去 |
| `useChatViewport.ts`（5 处） | 本地有定位跳转跟踪（`cancelPendingReveal`、`revealOperation`、`onRevealed/onRevealError/onRevealCancelled`、`reportedRevealMessageId`）。上游新增的 `cancelPositioning`/`finishPositioning` 里的“清掉待定位消息”改为调用 `cancelPendingReveal()`，让定位取消回调照常触发；其余按上游 |

自动合并部分里和本地定制相关的文件（`useChatRunSync.ts`、`useChatWorkspace.ts`、`DesktopChatWorkspace.vue`）没有冲突；任务阅读位置/资源面板位置的本地定制不在这几处改动里。

## 跳过

| 上游提交 | 原因 |
| --- | --- |
| `6c89a8c95` 陪伴贴纸切换与自定义上传 | Lexora 吉祥物和鲸鱼娘素材不符合 XTLaw 品牌；本地“欢迎插画”开关一直没有实际画面，保持现状。后续提交对它没有依赖（`ed2d37c0f`、`57d5bec16`、`f0a5ed59a` 都不碰贴纸文件） |
| `57d5bec16` 的免安装版 ZIP 部分 | 见上 |

## 评估后待下一轮：`ed2d37c0f`

`feat(buddy): 完善引用流转与输入材料按需读取`，91 个文件、+3531/-425。本轮只评估，没有移植。评估结果见 PR 正文。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `f0a5ed59a2ad8b9786cc50c089d4267abfd933ca`（`upstream/master` 当前最新）。**基线的含义是“这个提交及之前的上游提交都已决定移植、跳过或列入待办”，不等于都已移植**：`ed2d37c0f` 尚未移植，记在上面“评估后待下一轮”（后来在[第二轮](upstream-20261025-2-integration.md)移植），不能因为基线已经越过它而漏掉。

## 检查

- 类型检查（`vue-tsc -b`）通过。
- `eslint` 检查 `transcript`、`workspace`、`state/runs` 三个目录，无问题。
- 本机 Windows，`vitest run` 跑 `tasks/widgets/workspace`、`tasks/widgets/transcript`、`tasks/state/runs`：24 个文件、207 个用例全部通过（包含上游新增的 `useChatViewport.spec.ts`、`useChatRunSync.spec.ts` 用例）。
- Rust 沙箱改动靠 `XTLaw CI` 的 Native checks（含 Windows 矩阵和非管理员令牌的沙箱验收）；CI 里的 `verify-windows-sandbox.ps1` 是本地旧版，没有取上游新版。
- 未跑：Playwright E2E、开发预览、打包；任务切换时阅读位置恢复在真实窗口里的表现（长历史、切回、中途滚动取消、与本地资源面板位置叠加）需要本机手测；Windows 沙箱目录访问的真机验收（上游改了 `sandbox.e2e.mjs` 和验收脚本，本轮没取）。
