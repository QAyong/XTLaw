# 上游集成记录：2026-11-01

区间是 `bb4c76c62..4db1a090c` 的 15 个提交（`bb4c76c62` 是上一轮的基线）。分支 `codex/upstream-20261101`，从本地 `master`（`5256db91b`）切出，用 `git cherry-pick -x`，全部移植，没有跳过。

## 已移植

| 上游提交 | 上游 PR | 内容 | 冲突 |
| --- | --- | --- | --- |
| `a171f2941` | | 兼容服务模型列表同步 | 无 |
| `126c32252` | #499（我们的） | 附件栏滚轮横向滚动，新增共用的 `scrollWheelHorizontally` | 3 处 |
| `8b874a1cd` | | 用量趋势体验 | 1 处 |
| `c01879a04` | 取代已关闭的 #502 | 文件创建与操作反馈 | 6 处 |
| `a9677d073` | | 语音与图像功能引导 | 2 处 |
| `b007312ec` | | 独立识图与生图工具（含 Rust） | 3 处 |
| `3878ae1d2` | | 适配 magpie 的模型能力识别 | 无 |
| `92e8a7508` | #512 | 权限模式按钮垂直对齐 | 无 |
| `9639e4b56` | #513 | CodeMode 并发限制与排队调度 | 5 处（含 `pnpm-lock.yaml`） |
| `75a976b80` | | 备份停服竞态与备份状态 | 1 处 |
| `ebf77bf04` | | 恢复权限按钮背景、修图文间距 | 无 |
| `8b77c86ff` | | 避免模型目录误标不可用 | 无 |
| `e8d481dca` | | 插件宿主兼容范围声明（docs） | 1 处 |
| `fec973789` | #520 | CodeMode 默认并发提到 8 | 无 |
| `4db1a090c` | #522 | 模型请求失败误分类 | 1 处（`pnpm-lock.yaml`） |

`a171f2941` 自动预备分支 `codex/upstream-auto-a171f294` 已经移植过，但那个分支基于 `origin/master`，落后本地 `master` 24 个提交，所以没有合并它，而是在本分支上重新挑了一次；那个分支可以丢弃，里面推进基线的提交也不用。

## 与我们自己的 PR 的关系

- **#499（`126c32252`）已合并，内容与我们的 PR 分支顶端 `daadc260f` 完全一致**，维护者没有追加提交，不需要同步回本地。本地 `master` 原先有自写的 `scrollSideways`（附件栏）和 `handleTabsWheel`（资源面板标签），都改用上游的 `scrollWheelHorizontally`。行为差异：附件栏只有传了 `wheel-to-horizontal` 的输入框才会把滚轮转成横向滚动，消息里展示的附件不再转换。
- **#516（Codemode worker 默认上限 8）已关闭**，维护者在 #513 的基础上调整，结果就是 `9639e4b56` 加 `fec973789`。本地分支 `fix/codemode-default-workers`（`7b1b60462`）作废，不再合并。
- **#502（新建文件弹窗选择后缀）已关闭**，维护者明确不做选择器，改成默认文件名加后缀。`c01879a04` 就是那个替代实现，已决定采用上游做法（见下）。

## 冲突解决

`126c32252`（3 处）：`DesktopChatComposerFrame.vue` 保留本地（没有 `.has-welcome` 标题样式，上游只改了这些样式）；`ChatInputMaterialStrip.vue` 用上游的 `handleWheel`；`WorkbenchResourcePanel.vue` 保留本地的作用域样式写法，只把滚轮处理换成共用函数。

`8b874a1cd`（1 处）：`DesktopUsageTrend.vue` 保留本地的作用域样式类名，只合入功能：`displayRequest`、加载中保留快照、`aria-busy`、`inert`、日视图才显示日期选择、“更新中”提示。

`c01879a04`（6 处）：**采用上游做法，去掉了本地的后缀选择器**（`86dfa278a`）。
- 新建文件弹窗改为带默认文件名 `未命名.md`，选中主文件名部分；新增名称校验错误、同名冲突提示和忙碌状态。
- `shared/files/fileName.ts` 里选择器留下的 `newFileExtensions`、`withFileExtension` 及其用例已删除（还原为上游父提交的版本）；`explorerLabels.ts` 的 `extension` / `noExtension` 文案随之删除。
- 本地独有的功能保留：`FileTarget` / 授权目录、`canPaste`、`copy` 时把绝对路径写入系统剪贴板（`operations.copyPath`）；复制失败的提示改走 `message.error`，不再写 `error`。
- 反馈方式：忙碌状态改到工具栏里（上游做法，延迟 200ms 显示，原来本地是 400ms 的浮动提示）；文件操作失败走 `message.error` 弹提示；资源管理器自己的错误（读取历史、授权确认失败等）仍用本地的浮动提示并 6 秒自动消失。`WorkspaceExplorer.spec.ts` 的提示用例相应改写。
- `LexoraConfigStore` 无关；`useExplorerCommands.spec.ts` 去掉选择器用例，复制失败改为断言 `message`。

`a9677d073`（2 处）：引导版本不照搬上游的 0.18.0，按本地版本映射：`speech-settings`、`image-settings` 记为 `0.4.9`（语音和图像已在 0.4.8 发布，所以 0.4.9 升级时才会提示）。不加上游的 `navigation-layout`（本地没有该功能）。用例改为本地版本号。

`b007312ec`（3 处）：
- `readFileExtension.ts`：用上游的 `imageReadingRequest` / `imageReadingToolResult`（支持多图和 `native` 结果），**保留 10-30 第三轮加的“识图不可用时返回说明文本”**：`IMAGE_READING_UNSUPPORTED` 仍被捕获并返回说明，其他错误照常抛出。
- `ArtifactService.ts`：同时保留本地的 `BuddyServiceError` 和上游新增的 `runNativeImage`。
- `imageGenerationExtension.ts`：用上游的 `describeImageGeneration`（品牌中立，不含 “Lexora Buddy”）。
- `imageReadingUnavailable.spec.ts`：原来的 1×1 PNG 夹具会被新的原生图片校验拒绝，换成有效的 PNG，并像其他用例一样用 `resolveBuddyImageTransformer` 指定原生程序。

`9639e4b56`（5 处）：
- `featureDiscovery.ts`：新增 `codemode-concurrency`，记为 `0.4.9`。
- `DesktopRuntimeSettings.vue`：本地仍是作用域样式；只把 CodeMode 开关一行换成上游新增的 `DesktopCodemodeSettings`，其余保留。该组件用上游的 `DesktopSettingRow`，所以这一行的外观和同组其他行**可能不完全一致，需要在 Windows 预览里看**。
- `DesktopFullAccessConfirmationDialog.vue`：改为上游的薄包装，内容挪到新增的共用 `DesktopRiskConfirmationDialog.vue`；本地给它加的作用域样式随之去掉。
- `LexoraConfigStore.spec.ts`：保留本地的 `future = true` 断言，其余用 `toMatchObject`；“默认三次重试”那条的期望值补上 `codemodeWorkerLimit` 和 `codemodeOverflow`。
- `pnpm-lock.yaml`：见“锁文件”。

`75a976b80`（1 处）：`BuddyService.ts` 里 `registerRunRpc` 保留本地的 `getCacheWarmingStatus`，换用提交里抽出来的共用 `isBusy`。**更正：这个提交不依赖暂缓的 `ce2707b81`**，冲突里的 `statistics` 只是 diff 的上下文行，提交本身没有改动任何用到它的代码。

`e8d481dca`（1 处）：`shells.md` 保留本地的“不低于首个提供此能力的 XTLaw 版本”说法，因为本地版本号和上游不同；其他文档合入上游。

`4db1a090c`（1 处）：只有 `pnpm-lock.yaml`，见下。它依赖 `b007312ec` 新增的 `modelRequestFailure.ts`，所以必须排在后面。

## 锁文件

`9639e4b56` 和 `4db1a090c` 只改了 `patches/@earendil-works__pi-coding-agent@1.4.0.patch` 和 `pi-ai@1.4.0.patch`，锁文件里只有补丁哈希的变化。这两处冲突一开始取了上游的块，结果带进了上游的 `zod@4.6.6`，与本地的 4.6.7 不一致，`pnpm install` 会漏建 `pi-agent-core`。已改为保留本地锁文件、只替换两个补丁哈希，哈希与补丁文件的 sha256 一致，`pnpm install --frozen-lockfile` 通过。

## 本地验证过 Rust

`b007312ec` 给 `native/image` 的 `image` crate 加了 `bmp` feature。WSL 里重新编译了 `lexora-buddy-image-transform`（release，`x86_64-unknown-linux-gnu`，只写 `.output/`，不进仓库），`cargo test` 通过（9 个）；之前 10-28 编译的旧二进制不支持 BMP，会让 3 个用例失败。Windows 的原生检查仍依赖 `XTLaw CI`。

## 检查

- 迁移：无；依赖：只有两个补丁哈希；`.github/workflows`：未改；Rust：`native/image/Cargo.toml` 加了 `bmp`。
- 品牌：新增行里没有用户可见的 “Lexora”，只有标识符。
- WSL 本机：`vue-tsc -b` 有 5 个错误，全在这个分支没碰过的文件里（`electron/main/window.ts` 的 `app-command` 事件类型，`electron/main/browser/browserFaviconCache.ts` 的 `icons` 可能为 `undefined`），来自 `master` 上之前的提交，不是这轮引入的。改动的 135 个文件 eslint 通过。`vitest related` 覆盖 400 个测试文件，除一个期望值外全部通过；那个期望值（默认并发 8）修正后重跑该文件通过，没有再全量重跑。
- 未跑：Playwright E2E、开发预览、打包。**必须在 Windows 开发预览里看：** 新建文件弹窗（默认文件名、重命名、同名冲突提示、取消忙碌操作）；资源管理器的浮动错误提示；用量趋势切换视图时的加载状态；输入框附件栏和资源面板标签的滚轮横向滚动；设置 → 运行时里 CodeMode 一行的外观、并发数、“不限制”确认框；完全访问确认框；备份时的“正在备份数据…”和服务停止、恢复；0.4.9 升级引导的三条新提示。

## 其他

- 我们开着的 PR #521（`wsl-native-tools`）改了 `BuddyService.ts` 和 `createBuddySessionExtensions.ts`，#504（`wsl-space-directories`）和 #521 都改了 `plugin-creator/references/shells.md`；这些文件上游这批提交也动过，后续变基这两个 PR 时会有冲突。
- `ce2707b81`（任务统计与上下文只读数据源）仍然暂缓，理由不变；`1057555ea` 已在上一轮跳过。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `4db1a090c`：区间内 15 个提交全部移植。下一轮从 `4db1a090c` 之后的新提交开始，同时留意 `ce2707b81` 的重新评估。
