# 上游集成记录：2026-10-24（第三轮）

区间是 `f2b2b3544..49c517976` 的 1 个提交：`fix(buddy): 修复浏览器加载反馈与错误重试`。分支 `codex/upstream-20261024-3` 叠在 `codex/upstream-20261024-2`（[第二轮](upstream-20261024-2-integration.md)，PR #35）之上，用 `git cherry-pick -x`。至此 `upstream/master` 已全部检查。

## 已移植

| 本地提交 | 上游提交 | 内容与整合方式 |
| --- | --- | --- |
| `447f7f620` | `49c517976` | 15 个文件，3 个文件冲突。见下 |

内容：浏览器工具栏下的加载条（`DesktopBrowserLoadingBar`）；页面加载失败或浏览器打不开时的整页错误页和重试按钮（`DesktopBrowserErrorPage`）；失败后“刷新”会重新访问失败的地址（`BrowserHost.reload` 改为异步，记录 `#failedNavigationTargets`）；导航开始改用 `did-start-navigation`（只认主框架、非页内跳转）代替 `did-start-loading`；`navigate` 里等待页面就绪也纳入失败处理。

## 冲突解决（3 个文件）

| 文件 | 处理 |
| --- | --- |
| `BrowserPageSession.ts` | 采用上游的 `did-start-navigation` 及其守卫（主框架、非页内、跳过引导空白页历史）；本地的“附件导航在 `will-download` 之前保留一次人工手势”逻辑原样放在守卫之后 |
| `useBrowserContextSurface.ts` | 返回值里本地的 `revealDownload` 和上游的 `retry` 并存 |
| `DesktopBrowserContextSurface.vue` | 保留本地的响应式视口、视口控件、引用菜单和提示条；采用上游的加载条（包在工具栏外层）和错误页；上游的 `v-else` 取消“浏览器打不开”整块提示，改由错误页显示；客户端面板元素（`surfaceElement`）移到视口里面，错误页显示时不挂载 |

## 随之做的本地调整

- **提示条与错误页不重复：** 本地的拦截提示（弹窗、上传、下载被拦截）保留；页面本身加载失败（`status === 'error'`）时已经显示整页错误页，所以不再同时显示页面错误的提示条。
- **i18n：** 上游新增的 `desktop.context.browserPageFailed` 与本地已有的同名键重复（TS 报重复属性），保留本地文案，删掉上游那一条；其余新增键（`browserLoading`、`browserPageErrorTitle`、`browserCertificateFailed`、`browserNavigationBlocked`、`browserPageUnavailable`）照取，`browserLoadFailed` 取上游的新措辞。
- **测试：** 本地独有的两个用例（`BrowserHost.browsingCompletion.spec.ts` 的“导航时清除旧图标”、`BrowserHost.humanActions.spec.ts` 的“文档被替换后文件选择取消”）原来触发 `did-start-loading`，改为触发 `did-start-navigation`（主框架）。

## 检查

- 迁移：无。依赖：无变更。Rust：无。不涉及 `.github/workflows`。品牌：新增行里没有 `Lexora` 文案；新增的 `--buddy-*` 变量（`--buddy-accent-solid`）本地主题已有；UnoCSS 类名全部可解析。
- 类型检查（`vue-tsc -b`）通过；改动文件和 i18n 的 `eslint` 无问题。
- 本机 Windows，`vitest run` 跑 `electron/main/browser`、`src/modules/tasks/widgets/context-panel`、`src/platform`、`src/i18n`：31 个文件、283 个用例，只有 `BrowserAdapterServer.spec.ts` 的 7 个失败（本地套接字父目录权限，在 `known-test-failures.md` 里）。新增的 `BrowserHost.spec.ts` 用例、`DesktopBrowserErrorPage.spec.ts`、`useBrowserContext.spec.ts` 通过。
- 未跑：Playwright E2E（浏览器相关）、开发预览、打包；加载条、错误页和重试在真实窗口里的表现，特别是与本地的响应式视口、下载提示、代理控制条叠加时，需要本机手测；Linux/macOS 靠 `XTLaw CI`。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `49c51797646638ef58a0f99ce3911481571d8c53`，即 `upstream/master` 当前最新提交。
