# 上游集成记录：2026-11-06

区间是 `92cbc5bb5..0b0ffe87d`（上游 v0.20.0），共 14 个上游提交。分支 `codex/upstream-20261106`，从本地 `master`（`b637bef72`）切出，用 `git cherry-pick -x`，按上游顺序一个提交对应一个本地提交。主工作区里有未跟踪的草稿（`docs/drafts/`、`tmp/`），不属于本轮，没有动。

预评估对每个提交单独对 `master` 做了 `git merge-tree` 试合并（不是累计结果）：4 个无冲突，2 个只在测试文件冲突，其余 8 个有冲突或本地已有等价改动。维护者确认后移植 6 个、跳过 3 个，其余 5 个列入待办。

## 上游为什么做这些提交，本地有没有同样的问题

| 上游提交 | 解决的问题 | 本地有没有 |
| --- | --- | --- |
| `659c11e21` | 手动滚动时，滚动状态被直接置为“脱离”，即使这次滚动已经回到底部，之后也不再跟随新内容 | 有（代码与上游改之前一致；按提交说明和代码判断，未在应用里复现） |
| `b210b3bd2` | 提问卡片的布局，以及提问方伙伴身份的展示与兜底（身份查询新增可指定的兜底伙伴） | 有（代码与上游改之前一致，未在应用里复现） |
| `6f58882e4` | 网页渲染中止加载时，在 Chromium 导航回调的调用栈里直接调用 `webContents.stop()`，造成回调重入 | 有 |
| `320b7f339` | 协作工具的 `inputSourceId` 只有 `forward` 用，但模型会给其他操作也带上占位值，校验失败 | 有 |
| `db4f8b8a8` | 伙伴设置里只能选首选模型，不能配推理强度 | 有 |
| `621b46e63` | 从浏览器地址栏复制的链接带着 HTML 标题，粘贴到输入框变成标题而不是链接 | 有 |

## 已移植

| 上游提交 | 内容 | 冲突 |
| --- | --- | --- |
| `659c11e21` | 修复手动滚动后的底部跟随状态 | 无 |
| `b210b3bd2` | 优化提问卡片布局与伙伴身份展示 | 无 |
| `6f58882e4` | 避免网页渲染停止加载时回调重入 | 无 |
| `320b7f339` | 修复协作工具占位参数校验失败 | 1 个测试文件 |
| `db4f8b8a8` | 支持伙伴推理强度配置 | 无 |
| `621b46e63` | 粘贴到输入框时保留纯文本 | 1 个测试文件 |

冲突解决：

- `320b7f339`（`ExecutionDelegationService.spec.ts`）：冲突块里除了这个提交新增的用例，还夹着上游本来就有、本地没有的用例 `hides %s managed NPCs ...`，它依赖本地不存在的 `buddies/__tests__/managedBuddyFixture`。只取本提交新增的用例，把那一条去掉；整个文件 50 个用例通过。
- `621b46e63`（`chatComposerEditing.spec.ts`）：`mountComposer` 的返回值本地多了 `root`、`updates`、`unmount`，保留这些字段并加入上游的 `paste`，同时带入 `paste()` 辅助函数；65 个用例通过。

品牌：新增行里的 `Lexora` 命中只有标识符（`window.lexoraDesktop`、主题 ID `lexora.themes.classic-dark`）和 `buddies.e2e.mjs` 里按窗口标题 `includes('Lexora')` 找窗口，同文件原有的另一处是同样写法，测试配置下的窗口标题本来就是 `Lexora Buddy Test`，不改。

## 跳过

| 上游提交 | 原因 |
| --- | --- |
| `6deb12b96` 修复检查更新被缓存的重定向永久卡死 | 这是我们提给上游的 PR（作者 QAyong）。本地已有 `74d8e866f`，重定向逻辑逐字一致，只有函数名（`fetchReleases`）和 User-Agent（`XTLaw`）不同，无需同步。本地一次请求取固定地址，上游按页取，这个结构差异不是本提交引入的，本轮不动 |
| `f26565d71` README 添加视频频道与微信交流群入口 | 上游品牌内容，README 冲突 |
| `0b0ffe87d` 发布 v0.20.0 | 只改版本号和 `sourceDateEpoch`，本地不照搬上游版本号 |

## 暂缓（待办）

| 上游提交 | 为什么没做 |
| --- | --- |
| `19dffae6a` 插件多模态推理与自定义设置页 | 187 个文件、+11347 行，25 处冲突；含 Rust 原生代码（`apps/buddy/native/host`）、插件清单与 API 变更，还改了 `.github/workflows/macos-verify.yml`（不能改，要单独决定）。它改的 `extensionPackageProcessing.ts` 来自一直暂缓的 `e197fc271`，本地没有这个文件。单独成轮，先只评估 |
| `c056edf3d` 打包后启用 Node 推理运行时 | 它改的 `inference-smoke` 相关文件是 `19dffae6a` 新增的，必须跟 `19dffae6a` 一起 |
| `71391fd53` 已安装插件的更新提示与快捷更新 | 建立在 `e197fc271` 之上：上游改前版本的 `DesktopExtensionCard.vue` / `DesktopExtensionManager.vue` 已经带着 `useExtensionOperations`、`useExtensionRemoval`、`DesktopExtensionInstallationStatus`、`pendingInstalls`，本地都没有。本地默认落在插件市场页，那里已经有“更新”按钮，所以这个提交只是在“已安装”页多一个提示。`e197fc271` 落地后预计接近干净 cherry-pick；急需的话可手工做最小版（新增 `useExtensionCatalog.ts`、两条文案、Card 按钮、Manager 的更新映射，不动 `DesktopExtensionCatalog.vue`） |
| `0ed050880` 任务历史分页与全局搜索 | 52 个文件、12 处冲突（超过 10 处，按规则单独成轮）；没有数据库迁移。上游删除 `DesktopTaskSidebarSection.vue`，本地 11-05 刚改过它（`0da2004a2`，折叠时显示运行状态），与任务布局定制正面冲突，需要先决定怎么取舍 |
| `141dda34e` 修复模型配置变更引发的历史列表跳动 | 核心修复独立（`setModelSelection` 不再刷新 `updated_at`，涉及 `ConversationMetadataService.ts`、`conversationMemberRepository.ts`、`conversationRepository.ts`），但 `taskPinnedItems.ts` 的一行和 3 个新测试文件依赖 `0ed050880`。建议随 `0ed050880` 一起 |

更早暂缓的 `e197fc271`（插件后台安装与进度反馈，见 `upstream-20261102-4-integration.md`）状态不变。

## 验证与待办

- WSL 本机：`pnpm --filter @uselexora/lexora-buddy type-check` 通过（默认堆会 OOM，需要 `NODE_OPTIONS=--max-old-space-size=8192`）；17 个改动的 TS/Vue/mjs 文件 eslint 通过；`vitest run --changed master`：28 个相关测试文件、402 个用例全部通过。
- 未跑：Playwright E2E（含 `db4f8b8a8` 在 `buddies.e2e.mjs` 里新增的用例）、开发预览、打包。**需要在 Windows 开发预览里看：**
  - 伙伴设置：选有推理强度的模型后出现推理强度选择，没有强度选项的模型不显示；换模型时保留当前强度；选同一个模型不重置设置。
  - 提问卡片布局；非内置伙伴发起的提问显示的身份。
  - 流式输出时手动上滚再滚回底部，是否重新跟随新内容。
  - 把浏览器地址栏复制的链接粘贴进输入框，得到链接本身；粘贴后撤销、重做；发送中粘贴被拦截；选区引用、资源粘贴不受影响。
  - 网页抓取/渲染被取消时不崩溃、不报重入。
- 待办：上表五个暂缓提交。建议先处理 `e197fc271`，再带出 `19dffae6a`、`c056edf3d`、`71391fd53` 这一组插件轮；任务历史一轮（`0ed050880`、`141dda34e`）先定怎么处理本地的任务侧栏改动。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `0b0ffe87d`：区间内 14 个提交都已决定（移植 6、跳过 3、列入待办 5），待办项不会再被自动预备重复评估。
