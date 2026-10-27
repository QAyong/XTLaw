# 上游集成记录：2026-10-19

分支 `codex/upstream-20261019`，从 `master`（`a90029d6`）切出。区间 `702e9933..upstream/master`（`6c636187`，v0.14.0），共 12 个上游提交；本轮移植 10 个、跳过 2 个，区间内全部有结论。

## 已移植

按上游顺序逐个 `git cherry-pick -x`，提交说明为“英文（中文）”并保留来源行；冲突在对应提交内解决。

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `1bf1f90b` | `ea56ee47` | 分屏新任务交互。`DesktopWorkbenchArea.vue` 冲突：保留本地的侧栏底部 `DesktopSidebarFooter` 插槽，仅把 `@new-task` 改为上游的 `spaceId => newTask({ spaceId })` 调用形式 |
| `32d1a0d7` | `5ced4f50` | NPC 小队协作开关。`buddyLabels.ts` 冲突：本地已把“NPC”改称“协作助手”，保留本地文案，新增 `npcTeamEnabled`、`npcTeamEnabledHint`、`npcTeamDisabledHint`（中英文），措辞改用本地的“助手”叫法 |
| `9b59f22b` | `10788d3f` | 子任务交接与收尾延迟，无冲突 |
| `f5ce6387` | `4098f56b` | 任务执行信息展示顺序，无冲突 |
| `4fad9d03` | `f78041dd` | GitHub 项目链接。`productLinks.ts` 冲突：同时保留 `REPOSITORY_URL` 和本地的 `xtlaw-v` 发布标签函数；链接来自 `package.json` 的 `repository`（`QAyong/XTLaw`） |
| `8ac7bac1` | `808649c4` | 插件源码链接。`DesktopExtensionCatalog.vue` 冲突：保留本地网格类名，仅补上 `:repository="item.repository"` |
| `f6d666ef` | `fdff8537` | 工具资源结算与进程恢复（Rust 12 个文件，无冲突）。**偏离上游**：Windows 作业对象名前缀 `Global\Lexora.Buddy.Shell.v2.` 改为 `Global\XTLaw.Buddy.Shell.v2.`，同步改了 `recovery.rs`、`ownedProcessRecovery.ts` 和对应 spec 共 3 处；以后上游再改这三处会在该行冲突，按此保留 XTLaw 前缀 |
| `cb013dd1` | `5ede0294` | 任务模型跨分屏联动，含迁移 v30。本地原为 v29，与上游编号一致，`BUDDY_SCHEMA_VERSION` 升到 30。`schema.spec.ts` 冲突：保留本地的 v23 升级用例，并加入上游的 v30 用例 |
| `dcbd103d` | `3805f0ea` | 故障隔离与文件操作保护（Rust 文件引擎 8 个文件、service 32 个、前端 16 个）。冲突 4 处：`run-event-recovery.e2e.mjs` 本地不存在（上游 Playwright 目录重整 `5ce92339` 当时已跳过），其改动丢弃；`DesktopStartupScreen.vue` 保留本地标记，新增 `openStorage` 事件与“数据与备份”按钮，操作区允许换行；`DesktopShell.vue` 启动遮罩改按路由 `requiresRuntime` 判断（`settingsCatalog.ts` 中 `logs`、`storage` 已为 `false`），上下文面板和 `WorkbenchHost` 加 `hasBeenReady`，并接上 `@open-storage`；`DesktopWorkbenchArea.vue` 把四处重复的可见条件抽成带 `hasBeenReady` 的 `contextVisible`。新增的暂存文件名 `.lexora-{id}.stage` 与本地已有的 `.lexora-*` 临时文件前缀一致，保留。本地 `DesktopStartupScreen.spec.ts` 的失败态按钮数从 2 改为 3 |
| `b68e89d6` | `68fdf428` | 首次使用向导与版本功能引导（新增 `modules/onboarding`、`driver.js@1.10.1`、配置字段 `featureDiscovery` / `featureAnnouncementsEnabled` / `onboardingCompleted`，无数据库迁移）。**按 XTLaw 改造**：裁掉导航布局部分（`DesktopNavigationLayoutSettings.vue`、`DesktopNavigationLayoutPicker.vue`、`navigation-layout` 引导、向导偏好步的布局选择、预览窗口的布局变体）；功能引导版本改为 XTLaw 版本，`npc-team` 标 `0.2.3`，并新增基线常量 `FEATURE_DISCOVERY_BASELINE = '0.2.2'`：从未记录过版本的老用户按“上次看到 0.2.2”处理，所以发布号是 `0.2.3` 还是 `0.3.0` 都会提醒；默认伙伴改为“晓晓”，头像预设读本地 `buddyAvatarPresets('actor')`，选中晓晓时提交 `null`；文案 “Lexora” 改为 “XTLaw”，`npc-team` 引导文案改用本地的“协作助手”叫法；`uno.config.ts` 补 `canvas` 颜色和 `overlay` 阴影映射。冲突：配置存储（仅加三个字段，本地已移除 `typography` 位置）、`LexoraConfigStore.spec.ts`（取本地版本并新增功能引导用例）、`DesktopAppProvider.vue`、`DesktopShell.vue`、`DesktopTitleBar.vue`（保留本地结构，接入向导与引导）、关于页（加向导入口与版本功能列表）、`settings/ui.ts`、`pnpm-lock.yaml`（取本地后 `pnpm install`） |

## 跳过

| 上游提交 | 原因 |
| --- | --- |
| `cfd76fce` | 上游新增 `full` / `compact` / `immersive` 三种导航布局，并依赖本地已在 Spec-006（`d8961097`）中删除的 `DesktopAppSidebar.vue`；本地的“导航并入空间侧栏”等价于上游的 `immersive`。完整移植要恢复双侧栏、推翻 Spec-006，另有 11 个冲突。以后想要图标栏（`compact`）可作为本地新功能另做 |
| `6c636187` | 发版提交，只改版本号（上游 v0.14.0）；XTLaw 版本号独立 |

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 由 `702e9933` 推进到 `6c636187`：区间 12 个提交，10 个移植、2 个跳过。

## 检查

- 新增行品牌检查：没有需要改的 `Lexora` 展示文案。唯一的字面量是 `buddies.e2e.mjs` 里按窗口标题 `Lexora` 查找窗口，与 `desktop.e2e.mjs` 里测试应用名 `Lexora Buddy Test` 一致，保留。
- 迁移：新增 v30（`cb013dd1`），迁移 v30 只在 `schema.spec.ts` 的 v29 升级用例中验证，未在真实开发库 `.xtlaw-dev` 上运行；升级后旧版本很可能无法再打开该库，首次用新版本运行前应备份。Rust：`f6d666ef` 改动 12 个文件，`cargo check --tests`（`lexora-buddy-host`）通过，未运行 Rust 测试。无依赖变更，未执行 `pnpm install`。
- `pnpm type-check`（`apps/buddy`）通过。
- 第一批（A 清单）改动相关目录的 spec（`shared/buddies`、`service/src/buddies`、`service/src/agent/execution`、`executionRepository`、`turnRequestRepository`、composer、buddies、extensions、`electron`）：842 通过，17 失败。
  - 16 个已在 `docs/known-test-failures.md`：`BrowserAdapterServer` 7、`buddyServiceProcess` 4、`buddyServiceEnvironmentPaths` 2、`linuxAutostart` 1、`rendererProtocol` 1、`BuddyTurnLauncher` 1。
  - 1 个不在清单：`buddiesExtension.spec.ts`（头像符号链接），在夹具里 `symlink` 报 `EPERM`，属于 Windows 符号链接权限限制；没有在干净基线上复现确认，也未写入清单。
- 第二批（B 清单）：`pnpm type-check` 通过；本批改动的 20 个 spec 文件加 `service/src/storage`、`platform/process`、`service/src/changes`、`chat`、`runs` 目录，472 通过、9 失败：
  - 2 个已在清单：`BuddyDataPaths`、`StorageSnapshots`（符号链接）。
  - 1 个符号链接 `EPERM`：`mutationToolExecution`（第一批已注明，同为 `symlink`，未写入清单）。
  - 6 个是 `MutationRecoveryService.spec.ts`（`f6d666ef` 新增）：夹具用 `/workspace` 这类 POSIX 路径，Windows 下报 “Windows file paths must be fully qualified”，属于 POSIX 路径语义类限制；没有在干净基线上复现，也未写入清单。
- 第三批（`dcbd103d`）：`pnpm type-check` 与 `cargo check --tests` 通过。相关 spec 先后失败 26、29 个，原因是测试用的原生二进制过期：`.output/build/native/.../lexora-buddy-file-reader.exe` 还是 10-17 构建的，与新文件引擎协议不匹配；执行 `pnpm prepare:test-runtime` 重新构建后，剩 6 个失败，均在新增的 `SpaceFileRecovery.spec.ts`：3 个符号链接 `EPERM`，3 个目录重命名 `EBUSY`（Windows 对被占用目录的限制）。这 6 个未在干净基线上复现，也未写入已知失败清单。
- 第四批（`b68e89d6`）：执行 `pnpm install`（仅 `driver.js` 增加 8 行锁文件）；`pnpm type-check` 通过；新增或改动的 spec（`featureDiscovery`、`FeatureReleaseBrowser`、`initializeDesktopConfig`、`LexoraConfigStore`）及 `onboarding`、`buddies`、`settings`、`electron/main/config`、`src/app`、`src/i18n` 目录共 384 个用例通过（先有 1 个 `LexoraConfigStore.spec.ts` 的整对象断言需补三个新字段，已更新）。`uno.config.ts` 的新映射用临时 spec 验证能生成 `bg-canvas`、`shadow-overlay`、`font-650` 等类，临时 spec 已删除。品牌检查：新增行里剩下的 `lexora` 都是标识（`lexoraDesktop`、`lexora.themes.*`、`lexora:settings:update`、`Lexora Buddy Test` 测试应用名）。
- 两份新增 Playwright 脚本 `feature-discovery.e2e.mjs`、`onboarding.e2e.mjs` 已按裁剪后的行为改写（版本改 `0.2.3`、去掉布局断言、引导步数 2 步、头像文件改用本地存在的 `.webp`），**未运行**，选择器和按钮名称没有对照真实界面核对。
- 首次使用向导只对全新数据目录触发（配置文件和 buddy 数据目录都不存在）；本机 `.xtlaw-dev` 已有数据，看不到向导。向导和引导的界面未目测。
- 未跑全量测试、Playwright E2E、开发预览或打包，未目测分屏新任务、小队协作开关、GitHub 项目链接和插件源码链接的界面。
