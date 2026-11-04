# 上游集成记录：2026-11-04

区间是 `81fce6c28..92cbc5bb5`，共 10 个上游提交。分支 `codex/upstream-20261104`，从本地 `master`（`793dd5c2d`）切出，用独立 worktree `~/code/Lexora-upstream-20261104`（主工作区当时有别的会话的未提交改动）。

自动预备机器人（PR #73，分支 `codex/upstream-auto-dacd1f46`）已移植 `073eda14`、`dacd1f46`，并在 `f469272f5`（新增依赖）停下。这两个提交通过合并提交 `a47c2e6ef` 带进本分支，没有重复移植，也没有动 `master`；#73 因此被本分支覆盖，合并本分支后可以关闭它。其余提交由我手动处理，用 `git cherry-pick -x`，按上游顺序一个提交对应一个本地提交。

## 已移植

| 上游提交 | 内容 | 冲突 |
| --- | --- | --- |
| `68c2a0ea4` | 支持逐题作答并优化提问面板 | 无 |
| `1fa6e5f8a` | 修复系统语音初始化与首次朗读 | 1 个修改/删除 |
| `1c23add2c` | 修复子任务权限继承 | 2 个文件 3 处 |
| `c2d02dea7` | 服务模型支持批量全选与清空 | 1 个文件 1 处 |

机器人已移植（随合并提交进入本分支）：`073eda14`（优化问答正文与面板布局）、`dacd1f46`（修复编辑与重新生成后的对话加载状态）。

要点：

- `68c2a0ea4`：依赖机器人分支里的 `073eda14`，所以排在合并提交之后。
- `1c23add2c`：只读角色（`fileAccessLimit: 'read_only'`）不再把基础权限档位改成 `read_only`，而是单独带 `fileAccessLimit`，网络和审批沿用基础模式；`PermissionEngine` 新增只读限制的拒绝判定（写入、删除、非沙箱执行返回 `READ_ONLY_PROFILE`）。本地的 `lexora_wsl_shell` 是 `execute` 且不在沙箱内，所以在只读角色下同样被拒，与 `SessionToolScope` 里它在 `READ_ONLY_EXCLUDED_TOOLS` 的做法一致。
- `c2d02dea7`：没有迁移文件改动；`providerModelStateRepository` 改的是读写方式。

## 跳过

| 上游提交 | 内容 | 原因 |
| --- | --- | --- |
| `b2bae6a13` | 发布 v0.19.1 | 只改版本号（`package.json`、`buddy.version.json`、`Cargo.lock`、`Cargo.toml`），不照搬上游版本号。后面的提交都不依赖它 |

## 暂缓（待办）

`f469272f5`（长对话渲染与分屏拖拽性能）、`de5b6a805`（重新生成时的滚动位置与历史保留）、`92cbc5bb5`（关闭分屏后的正文空白）。三者依赖同一处改动，一起暂缓，单独成轮。

预评估结论（只读试合并，未改文件）：

- `f469272f5` 把对话视口改成虚拟列表，新增依赖 `@tanstack/vue-virtual@3.13.51`，改 33 个文件。直接移植约 11 处冲突，主要集中在 `BuddyChatTranscriptViewport.vue`。
- 冲突的根源是结构差异：上游自 `00feaa2c5` 起把视口逻辑放在组合式函数 `useChatTranscriptViewport` 里，本地当时只引入了引擎，组件仍把同样的逻辑内联。两者函数体逐函数一致（机械比对无差异），本地的组合式函数文件与上游父提交逐字相同，但没人引用。
- **建议采用上游方法**：先做一个纯重构提交，把本地视口组件切到组合式函数（保留本地作用域样式），再按序移植三个提交。模拟结果：`f469272f5` 剩 `AgentTurnFlow` 4 处、`MessageList` 1 处、`useChatViewport` 1 处、`pnpm-lock.yaml` 1 处、`reading.e2e.mjs` 1 个修改/删除；`de5b6a805` 剩 `DesktopChatWorkspace.vue` 1 处；`92cbc5bb5` 无冲突。
- 需要设计判断的只有 `BuddyChatAgentTurnFlow.vue`：本地有 XTLaw 的“过程分段折叠”（`docs/specs/feature-001-turn-process-folding.md`，折叠按钮、`topToggle`、`useChatActivityNavigation`），上游没有。虚拟行滚出视口会被卸载，本地的折叠状态（`BuddyChatAgentTurn.vue` 的 `collapsed`、`manuallyChanged`，`AgentTurnFlow` 的 `standaloneCollapsed`）是普通 `shallowRef`，卸载后会回到默认值，需要改成上游的 `useChatTranscriptValue`（按代码判断，未实测）。
- 其余本地功能不受影响：选区引用只在单个正文元素内取选区；应用没有页内查找；`revealActivity` 在单个回合内查找节点。
- 建议单独分支、单独 PR，便于回退；滚动行为只能在 Windows 预览里验证，同时带入上游的 `reading.e2e.mjs`。
- 上游新增的 7 个单测文件在 WSL 能跑。

## 冲突解决

`1fa6e5f8a`：`SpeechButtons.spec.ts`（修改/删除）：本地没有这个文件（本地的等价修复用的是 `useSpeechCatalog.spec.ts`），上游这次只是给 mock 补 `prepareSystem` 并调整断言，与行为无关，删除不移植（同 11-02 先例）。

`1c23add2c`：

- `createBuddySystemPrompt.ts`（2 处）：`createExecutionProfilePrompt` 本地多一个 `windowsShell` 参数，上游新增了 `fileReadOnly`，两个都保留，调用处依次传 `activeToolNames`、`fileReadOnly`。只读分支里保留本地的 `localNetwork`（Windows 回环网络），后面接上游按 `roleLimited` 区分的网络与审批说明；非角色限制时的措辞随上游从 “External network access…” 改为 “Network access…”，本地没有测试断言旧措辞。
- `toolScopeSession.spec.ts`（1 处）：两个 import 都留（`connectorToolsId`、`DEFAULT_NETWORK_PERMISSIONS`），按路径排序。

`c2d02dea7`：`DesktopProviderAddDialog.vue`（1 处）：本地模型工具栏用作用域样式，不带上游的 `flex items-center gap-2` 原子类，在作用域样式里补 `gap: 0.5rem`。新增的两个按钮所在的 `div` 本地周围已是原子类写法，随上游保留。

品牌：新增代码里只有 `LexoraDesktopApi` 类型名命中，属于标识符，保留；没有默认名称、头像或文案问题。

## 验证与待办

- WSL 本机：`pnpm type-check` 通过（`NODE_OPTIONS=--max-old-space-size=7168`）；`vitest run --changed master` 覆盖与 73 个改动文件相关的 210 个测试文件，1941 个通过、1 个跳过；71 个改动文件的 eslint 通过。
- 首次 `--changed` 运行有 18 个文件失败，原因是新 worktree 没有 Linux 原生辅助程序（`lexora-buddy-file-reader`、`lexora-buddy-process-control`、`lexora-buddy-image-transform`），测试里的 `NativeFileEngine` 起不来；在 `master` 基线 worktree 上跑同样这 18 个文件，有 95 个失败；集成分支是 99 个，多出的 4 个是 `1c23add2c` 新增的权限继承用例，同样因为缺原生程序。用 `cargo build --locked --release --target x86_64-unknown-linux-gnu` 编出 `lexora-buddy-host` 和 `lexora-buddy-image-transform`（输出在 worktree 的 `.output/`，不进仓库）后，这 18 个文件全部通过（254 个通过、1 个跳过），其中包括 `1c23add2c` 的 `toolScopeSession`、`mutationConcurrency` 权限继承用例。
- 本轮没有 Rust 源码改动。
- 未跑：Playwright E2E（含改动过的 `speech-playback.e2e.mjs`）、开发预览、打包。**必须在 Windows 开发预览里看：**
  - 逐题作答：多问题时一题一题回答，提交后续接，历史记录摘要。
  - 子任务权限继承：基础为完全访问、角色为只读时，子任务的网络请求仍按基础策略自动批准，写入和删除被拒；基础为工作区写入时网络请求仍走原有审批。
  - 系统语音：首次朗读前初始化是否正常，设置里切换语音后的状态。
  - 模型批量全选：添加服务商对话框里“全选 / 清空”按钮的布局（工具栏间距）和禁用态，选择过程中开关是否被禁用。
- 待办：虚拟列表一轮（上面“暂缓”），建议采用上游方法。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `92cbc5bb5`：区间内 10 个提交都已决定（移植 4、机器人已移植 2、跳过 1），`f469272f5`、`de5b6a805`、`92cbc5bb5` 列入上面的待办，不会再被自动预备重复评估。
