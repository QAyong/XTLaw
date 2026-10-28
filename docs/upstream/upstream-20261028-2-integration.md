# 上游集成记录：2026-10-28（第二轮）

区间是 `80b38d769..85faae2df` 的 3 个提交（`80b38d769` 是上一轮的基线）。直接在 `master` 上用 `git cherry-pick -x`，按用户要求不开分支。

## 已移植

| 上游提交 | 内容 |
| --- | --- |
| `85faae2df` | 工作中消息的发送方式：设置 → 运行时新增“工作中发送消息”（`follow_up_behavior`：`steer` 补充当前工作，默认；`queue` 排队）。选“排队”时新消息的投递模式为 `next`，等当前工作结束再处理；队列里的消息仍可立即发送（`promoteNext`）。回答待处理问题不受影响。新增引导步骤 `follow-up-behavior` |

## 跳过

`09d0d8580`（发布 v0.17.0）：只改版本号，不照搬上游版本号。

## 暂缓（不移植，本轮不做）

`e197fc271`（优化插件后台安装与进度反馈）：26 个文件、+1093/−317，模拟 cherry-pick 在 9 个文件里冲突（`ExtensionPackageStore.ts`、`ExtensionService.ts`、`ExtensionCatalogService.ts`、`DesktopExtensionManager.vue` 等）。内容是把插件包的读取、解包、校验、暂存和编译搬进 `worker_threads`（新增 `ExtensionPackageWorker.ts`、`packageWorker.ts`、`extensionPackageProcessing.ts`，删除 `compilerProcess.ts`，`electron.vite.config.ts` 多一个 worker 入口），并拆出 `useExtensionOperations` / `useExtensionRemoval`，新增“正在安装”卡片。

暂缓原因：属于体验与性能优化，不是缺陷修复；冲突集中在本地改动多的插件模块；它改了主进程线程模型和构建入口，而 Windows 打包与 E2E 在 WSL 里验证不了。后面没有提交依赖它。以后遇到装插件时界面卡顿，或上游后续提交建立在它之上，再单独成轮，先对照本地插件模块的改动。

## 冲突解决

`85faae2df`：
- `featureDiscovery.ts`：保留本地的引导版本号（`0.2.3` / `0.3.1`），不引入上游的 `navigation-layout`（本地没有这个引导）；`follow-up-behavior` 的版本按 XTLaw 版本体系记为 `0.4.1`（上游是 `0.18.0`），即 `xtlaw-v0.4.0` 之后的下一个发布版本。若实际发布版本号不同，需同步改这里与对应 spec。
- `featureDiscovery.spec.ts`：版本号从 `0.17.0` / `0.18.0` 改为 `0.4.0` / `0.4.1`。
- `featureGuideSteps.ts`：只加入 `follow-up-behavior` 步骤，不加 `navigation-layout`。
- `DesktopRuntimeSettings.vue`：本地用作用域样式（`runtime-settings__*`），没有采用上游的 `DesktopSettingRow` / `DesktopSettingsGroup`；在“执行行为”分组（原“工具执行”，文案键由 `toolExecution` 改为 `executionBehavior`）里放入 `runtime-settings__group`，包含“工作中发送消息”和 Codemode 两行；类型导入合并为 `DesktopChatPreferences, LexoraConfigPatch`。
- `useTaskCapability.ts`：新增 `inputDelivery: actorInput.delivery`，保留本地的 `presentedActiveRun`。

## 检查

- 迁移：无；依赖：无；Rust：无；`.github/workflows`：未改。
- 品牌：新增行里的 “Lexora” 只有文件名 `LexoraConfigStore.ts`，没有用户可见文案。
- 样式：未新增 UnoCSS 类名，无需补映射。
- WSL 本机：`vue-tsc -b` 通过（需 `NODE_OPTIONS=--max-old-space-size=6144`，默认堆会 OOM）；`ChatQueueService.spec.ts`、`featureDiscovery.spec.ts`、`useActorInputTarget.spec.ts`、`useChatTurnExecution.spec.ts`、`useChatWorkspace.spec.ts` 以及 `src/modules/onboarding`、`src/modules/settings` 共 36 个文件、244 个用例通过；改动文件 eslint 通过。
- 未跑：Playwright E2E、开发预览、打包；设置页“工作中发送消息”分段开关的真实窗口表现，以及“排队”模式下发送、立即发送的实际流程。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `85faae2df`。
