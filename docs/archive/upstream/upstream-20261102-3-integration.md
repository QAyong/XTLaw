# 上游集成记录：2026-11-02 第三轮

这一轮移植 `618eb4e55`（启动状态复用与加载进度），以及它依赖的、之前一直暂缓的 `ce2707b81`（任务统计与上下文只读数据源）。分支 `codex/upstream-20261102-3`，叠在第二轮分支 `codex/upstream-20261102-2` 之上（含 `c2d639e28`、`3778f938c`），用 `git cherry-pick -x`。

## 为什么先做 ce2707b81

预评估时只查了 `618eb4e55` 里的 `runsMetricsRpc` 导入，判断它不依赖 `ce2707b81`，这个判断不对。真正动手后发现它建在 `ce2707b81` 之上：

- `RunEventLog.findLatest`（及 `RunEventPorts`、`RunEventQueries`）来自 `ce2707b81`，`618eb4e55` 在其中加了 `ensureProjection`，新增的 `RunEventMaintenance.spec` 也用到 `findLatest`。
- `registerRunRpc` 在 `ce2707b81` 里被改成由外部传入 `statistics`（统计服务实例），`618eb4e55` 在此基础上继续改。
- `ConversationStatusService.spec` 是 `ce2707b81` 的统计用例，`618eb4e55` 又改了它。

按规则停下来问了我，我选了先移植 `ce2707b81`。

## 已移植

| 上游提交 | 本地提交 | 内容 | 冲突 |
| --- | --- | --- | --- |
| `ce2707b81` | `3e0209c5d` | 提供任务统计与上下文只读数据源 | 6 个文件 |
| `618eb4e55` | `482d98a5d` | 复用启动状态并展示加载进度 | 7 个文件 |

## ce2707b81

要点：新增 `runs.metrics` RPC 与统计服务（`ConversationStatusService` 由 `BuddyService` 创建并注入 `registerRunRpc`）；插件可在清单里声明 `permissions.data`（`task.metrics`、`context.usage`），宿主以只读数据源形式提供，安装审查里单独列出；`createWorkbenchDataPort` 把工作台数据接到扩展上下文。没有迁移、依赖或 Rust 改动。

冲突解决：

- `BuddyService.ts`（1 处）：`registerRunRpc` 的参数取上游的 `statistics`，保留本地抽出来的共用 `isBusy`。本地原来传给 `registerRunRpc` 的 `getCacheWarmingStatus` 去掉了，因为上游创建统计服务时已经带了同一个钩子（`getCacheWarmingStatus` 在 `host.start('runtime.conversation_statistics')` 里），不再需要。
- `extensionManifest.ts`（1 处）：保留本地的导入列表和风格（本地把 MCP 连接器、子智能体等合在 `./extensionCapabilities`，还有文档能力的导入），只补上 `extensionDataSourceSchema`。
- `DesktopAppProvider.vue`（2 处）：只补 `createWorkbenchDataPort` 的导入（`resolveUserProfile` 本地已从 `@/modules/settings` 导入，不需要上游的 `../shell/userProfile`）；`useExtensionContributions` 保留本地那行（带 `selectionReferences`、`onQuoteResult`）；上游给 `useProvideExtensionContext` 加的 `data: createWorkbenchDataPort(...)`，加到了本地那一处调用里（本地这个调用在更后面，带 `capabilityStatus`）。
- `DesktopExtensionFrameHost.vue`（1 处）：两条导入都要。
- `DesktopExtensionSlot.vue`（1 处）：保留本地的作用域样式，不跟上游删掉它。
- `DesktopExtensionInstallReview.spec.ts`（1 处）：只取 `ce2707b81` 的“数据源审查”用例，丢掉相邻的“忙时关闭重复审查”用例（那是 `e197fc271` 的）。该用例依赖 `e197fc271` 才有的 `mount(review, language)` 与 `current`，本地的 `mount` 补了可选的 `language` 参数并返回 `current`（`shallowRef`）。末尾断言原本是“权限区不存在”，但本地的 `DesktopExtensionReviewPermissions.vue` 总是渲染这个区块（无权限时显示“不申请额外权限”），所以改成断言区块里不再有“任务统计”、且内容共享警告消失。

## 618eb4e55

要点（讲解见会话）：启动页显示真实进度；运行事件恢复时已结束且检查点一致的运行直接认证，不重放；压缩移出启动路径，改为服务就绪后的后台任务；供应商模型解析按输入指纹复用。

- **迁移编号：** 按“上游编号 + 2”，上游 v39（供应商解析）登记为本地 41，上游 v40（事件维护）登记为本地 42；`BUDDY_SCHEMA_VERSION` 是 42，本地 38 仍空着。两个迁移的表结构与上游一致。
- **启动画面：** 保留本地结构、XTLaw 标题和作用域样式，只合入阶段文案与进度条。进度未知（`progress === null`）时沿用原来的滑动条，有进度时按比例显示；条带 `role="progressbar"`，替代原来的 `aria-hidden`。`DesktopShell` 把 `stages` 传下去。本地的 `DesktopStartupArtwork` 没有 `still` 属性，不用。
- **冲突解决：**
  - `schema.ts`、`database.ts`：补两个迁移的登记和触发器名检查，保留本地的 v23 文件名。
  - `schema.spec.ts`（3 处）：取本地版本，再带入上游对新列、新触发器的断言（`resolution_json: null`、三个触发器的缺失检测）；上游把两条迁移用例合成一条，这里按本地编号合成“identity and input formats”那条（从本地 v35 起），并补了 `before` 快照；保留本地的“升级 schema 36”等用例；上游删掉的 `MutationCoordinator` 相关导入因本地仍保留该用例而补回。
  - `RunEventRecovery.spec.ts`：本地与上游基线只差基准测试的一处载荷，整个文件取上游版本。
  - `registerRunRpc.ts`：保留上游的 `statistics`，加 `verifyRun` 与 `RunEventCorruptionError`。
  - `ConversationStatusService.spec.ts`：随 `ce2707b81` 先移植后无冲突。
  - `run-event-recovery.e2e.mjs`：本地没有这个文件（上游 10-15 的 Playwright 目录整理提交里才有），不移植；也无法在 WSL 里跑。
- **本地补改：**
  - 新增 `RunEventFailure.ts` 里的报错文案从 “Lexora Buddy event maintenance…” 改为 “XTLaw event maintenance…”，与同目录其他文案一致。
  - `RunEventBootstrapRecovery.spec.ts`、`RunEventMaintenance.spec.ts` 里“上游 v38 的老库”改按本地编号 40 构造（`version <= 40`、`user_version = 40`），期望版本改用 `BUDDY_SCHEMA_VERSION`。
  - `DesktopStartupScreen.spec.ts`：补 `stages` 属性，断言改为 `progressbar`，并新增“显示进行中阶段与真实进度、失败阶段显示告警”的用例。

## 验证与待办

- 品牌：新增行里没有用户可见的 “Lexora”。
- WSL 本机：`pnpm type-check` 通过（`NODE_OPTIONS=--max-old-space-size=8192`）；改动的 64 个文件 eslint 通过。`ce2707b81` 之后跑过 `src/modules/tasks`、`src/modules/extensions`、`src/app`、`electron`、`shared` 等 335 个文件，全部通过。`618eb4e55` 之后把 `service/src`、`electron`、`shared`、`src/app` 共 512 个文件跑了一遍，只有 1 个失败：上游的 `RunEventBootstrapRecovery.spec` 写死了迁移版本 40，已按本地编号改好；改后 `service/src` 的 `events`、`storage`、`providers` 69 个文件重跑全部通过，没有再重跑全量。
- 未跑：Playwright E2E、开发预览、打包。**必须在 Windows 开发预览里看：**
  - 用一份大历史库启动：启动页进度条从无进度滑动变成按比例前进，文案依次是读取本地数据、准备历史记录、准备模型与能力、恢复工作台；启动耗时是否缩短。
  - 把 v40 的数据库升级到 v42：历史对话、用量、审批、事件文件都在；再次启动不重复重放。已升级的库不能再被旧版本打开（`currentVersion > BUDDY_SCHEMA_VERSION` 时会拒绝）。
  - 对话进行中或刚结束时，后台压缩不影响输入和流式输出；关掉再开后历史完整。
  - 设置里的模型服务：启动后供应商和模型列表与升级前一致；新增、删除、同步模型后，下次启动没有用到过期的解析结果。
  - 触发器给 `messages`、`run_events` 等表的每次写入多一次更新，长对话和多任务并发时看有无卡顿。
  - 插件声明 `permissions.data` 后，安装审查里单独列出“绑定范围的数据源”；统计和上下文用量能读到。
- 待办：`6ca67989d`（浏览器执行隔离，与本地 Spec-017 的弹窗、文件选择、下载放行冲突）还没决定。更早暂缓的 `e197fc271`、`095595a0e` 仍不动，`1057555ea`（README）不动。`ce2707b81` 的 `DesktopExtensionInstallReview` 相关的 `e197fc271` 部分（后台安装、忙时关闭重复审查）不在本轮。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `3778f938c`：`c2d639e28`（第二轮）、`618eb4e55`（本轮）、`3778f938c`（第二轮）都已移植，`56e23e072` 确认不要，之前的 `677e3b303` 本地已有等价提交。`6ca67989d` 在它之后，下一轮从它开始。
