# 上游集成记录：2026-10-31

区间是 `b31b0ed3d..bb4c76c62` 的 6 个提交（`b31b0ed3d` 是上一轮的基线）。分支 `codex/upstream-20261031`，基于本地 `master`（已含 10-30 三轮同步的合并 `81228e7e8`），用 `git cherry-pick -x`。

本轮只移植 3 个小提交，其余 3 个见“未处理”。

## 已移植

| 上游提交 | 本地提交 | 内容 |
| --- | --- | --- |
| `cf6bdaab9` | `5925a8e01` | 模型目录跳过已禁用的模型；去掉独立的 `image-reading` 模型类型（`providerModelTypeSchema`、服务商校验、i18n、详情页类型筛选），识图只走“图像”设置里的路由 |
| `a189d24a3` | `5c5015945` | 开发环境可查看未发布功能（`useFeatureDiscovery`），E2E 的 `launchRelease` 改为可传版本并保留初始状态 |
| `bb4c76c62` | `3d7aec63f` | CodeMode 开启时不再重复注入工具指引（新增 `compactToolGuidelines.ts`） |

## 冲突解决

`cf6bdaab9`、`bb4c76c62`：无冲突。

`a189d24a3`（1 处）：
- `.playwright/scripts/__tests__/feature-discovery.e2e.mjs`：采用上游新写法，保留本地的隔离实例名（`XTLaw Test` 与 `Lexora Buddy Test`）；`launchRelease` 的默认版本用本地的 `0.2.3`，上游是 `0.14.0`。

## 迁移与旧数据

- `cf6bdaab9` 直接改了 `v38ImageModels.ts`（本地登记为 v40），把 `image-reading` 从 `model_type` / `type_override` 的 CHECK 里去掉。这个迁移是 10-30 才移植的，没有发布过，所以和上游一样直接改，不另加迁移。
- 开发库如果已经跑过旧版 v40 并写入了 `image-reading` 类型的行，不会被重写；本地开发库没有这样的数据时不受影响，有的话要手动清理。

## 检查

- 迁移：改动了一个未发布的迁移（见上）；依赖：无；Rust：无；`.github/workflows`：未改。
- 品牌：新增行里没有用户可见的 “Lexora”。E2E 里 `Lexora Buddy Test` 是原有的实例名白名单。
- `image-reading` 残留：只剩目录名 `.image-reading`、用量记录里的 `image-reading:` 来源 ID、以及提示文案里的说明，都不是被移除的类型。
- WSL 本机：`vue-tsc -b` 通过（`NODE_OPTIONS=--max-old-space-size=8192`）；`service/src/providers`、`storage`、`images`、`agent/context`、`agent/discovery`、`agent/sessions`、`agent/extensions`、`src/modules/models`、`src/modules/onboarding`、`shared/providers` 相关 spec 通过（111 个文件、897 个用例，1 个跳过）。
- 未跑：Playwright E2E（含改过的 `feature-discovery.e2e.mjs`）、开发预览、打包；旧开发库上的迁移行为。

## 未处理

| 上游提交 | 评估 | 说明 |
| --- | --- | --- |
| `ce2707b81`（任务统计与上下文只读数据源） | 待定 | 58 个文件、+3057/−557，模拟 cherry-pick 5 处冲突（`extensionManifest.ts`、`DesktopAppProvider.vue`、`DesktopExtensionFrameHost.vue`、`DesktopExtensionSlot.vue`、`DesktopExtensionInstallReview.spec.ts`）；新增十几个本地没有的文件（`extensionData`、`ExtensionDataClient`、`conversationStatisticsRepository` 等）。无迁移和依赖。先确认它和本地的市场能力层兼容 |
| `c79058417`（输入框工具栏布局与显示） | 待定 | 6 个文件，4 处冲突；本地输入框是作用域样式，上游是 UnoCSS；它改的 `DesktopModelTrigger.vue` 本地已不存在 |
| `1057555ea`（README 展示与截图） | 建议跳过 | 2 处冲突都在 README；新增 6 行 “Lexora” 品牌文案 |

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 仍是 `b31b0ed3d`：它的含义是“此提交及之前的都已决定”，而 `ce2707b81`、`c79058417` 还没有决定，`1057555ea` 只是建议跳过。三者处理完后再推进到 `bb4c76c62`。
