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

## 其余三个提交的结论

| 上游提交 | 结论 | 说明 |
| --- | --- | --- |
| `c79058417`（输入框工具栏布局与显示） | 已移植 | 单独成轮，见 `upstream-20261031-2-integration.md` |
| `ce2707b81`（任务统计与上下文只读数据源） | 暂缓 | 不是跳过，见下 |
| `1057555ea`（README 展示与截图） | 跳过 | 2 处冲突都在 README；新增 6 行 “Lexora” 品牌文案和上游产品截图（10 张 webp，约 3.5MB），XTLaw 有自己的 README |

### 暂缓：`ce2707b81`

给插件视图新增只读数据 API（`context.data.read` / `observe`，数据源 `task.metrics`、`context.usage`，清单权限 `permissions.data`），并把任务统计重写为同一来源（新增 `conversationStatisticsRepository.ts`，大改 `ConversationStatusService.ts`，新增 `metrics()` 与 `metrics.changed`；`ContextUsageSnapshotService` 支持按 `runId` 取快照）。

- 规模：58 个文件、+3057/−557，模拟 cherry-pick 5 处冲突（`extensionManifest.ts`、`DesktopAppProvider.vue`、`DesktopExtensionFrameHost.vue`、`DesktopExtensionSlot.vue`、`DesktopExtensionInstallReview.spec.ts`）；无迁移、依赖、Rust 改动。
- 不依赖已决定不移植的 `80b38d769`；`ConversationStatusService.ts`、`ContextUsageSnapshotService.ts`、`useChatContextUsage.ts` 本地与上游父提交一致，能干净套用。
- 暂缓原因：这个提交只在宿主侧铺能力，没有新增插件；上游市场（`useLexora/plugins`，最近一次提交 2026-10-28）里没有任何插件声明 `permissions.data`，上游仓库里也没有使用方。现在移植不会让任何现有功能多出来，却会重写本地的任务统计，有回归风险。
- 重新评估的时机：上游市场出现依赖 `context.data` 的插件时，再移植，并用那个插件做端到端验证。同时要在 Windows 开发预览里对照任务统计面板（老对话的数字、速度、压缩次数）和上下文用量显示。
- 这是“暂缓”，不是跳过；后续有提交依赖它时（例如读取 `data:changed` 的插件、`metrics` 接口），要先移植它。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `bb4c76c62`：区间内 6 个提交都已决定，移植 `cf6bdaab9`、`a189d24a3`、`bb4c76c62`、`c79058417`，跳过 `1057555ea`，暂缓 `ce2707b81`。下一轮从 `bb4c76c62` 之后的新提交开始，同时留意 `ce2707b81` 的重新评估。
