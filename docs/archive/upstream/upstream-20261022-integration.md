# 上游集成记录：2026-10-22

区间 `c81bdfb5..upstream/master`（`bbb1bb06`），共 8 个上游提交：移植 4 个，跳过 1 个，推迟 2 个，只评估 1 个。

分支 `codex/upstream-20261022` 从 `origin/master`（`7fc4a237`）切出，4 个移植提交各对应一个上游提交，均用 `git cherry-pick -x` 并保留来源行。

## 已移植

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `305e194c` | `Port upstream 305e194c` | 修复 Codemode 满载时立即失败（3 个文件：`pi-coding-agent` 补丁、`codemode.spec.ts`、`pnpm-lock.yaml`）。冲突只在 `pnpm-lock.yaml` 的 `@earendil-works/pi-coding-agent` `patch_hash`：取本地锁文件，再执行 `pnpm install` 重新生成，生成的哈希 `4d46de79…` 与上游一致，补丁 `patches/@earendil-works__pi-coding-agent@1.3.0.patch` 已被采用，锁文件相对本地基线只有这一个哈希的 3 处引用变化 |
| `d76e5dc1` | `Port upstream d76e5dc1` | 修复沙箱工具链环境继承（21 个文件，沙箱环境、`toolchainEnvironment.ts`、敏感路径、Windows 沙箱准备与对应测试、`sandbox-toolchain` E2E 夹具）。无冲突 |
| `dc7ca3c5` | `Port upstream dc7ca3c5` | 记住上次访问的设置页面（`useDesktopPages.ts`、`desktopPages.spec.ts`、`settings.e2e.mjs`）。`settings.e2e.mjs` 有 1 处冲突，双方改了同一个用例的标题：保留本地标题“registered builtin settings preserve navigation…”，并在它前面加入上游新增的“settings navigation returns to the last page…”用例 |
| `40a99b7c` | `Port upstream 40a99b7c` | 标记任务在所属空间内优先显示（`taskPinnedItems.ts`、`useTaskIndexController.ts`、`DesktopTaskIndex.vue` 及测试）。自动合并，但本地任务布局（折叠限制和“展开”行）与上游不同，所以补了两处测试适配：`taskPinnedItems.spec.ts` 的 7 处投影调用补 `markedTaskIds`；上游新增的控制器用例改用本地的 `taskRows` 和 `expand` 行（上游是 `globalTasks`）。排序发生在行数限制之前，被标记的任务会进入每个空间的前 5 行 |

## 已跳过

| 上游提交 | 原因 |
| --- | --- |
| `9a8da6e6` | 仅拖入本地文件发送时在聊天记录中显示用户消息。这是本地提交上游的 PR，本地 `7fc4a237` 已有等价改动，不重复移植 |

## 推迟（单独成轮，本轮不碰）

| 上游提交 | 原因 |
| --- | --- |
| `d6cd5ec3` | 插件配置多 Shell 执行：71 个文件，含 Rust 变更，试合并约 22 处冲突，体量和风险都需要单独一轮处理 |
| `c07652a3` | 修复插件清单兼容性：9 个文件，与 `d6cd5ec3` 改同一批清单文件，依赖它的结论，跟着它一起单独成轮 |

## 只评估、不移植：`bbb1bb06`

`bbb1bb06 fix(buddy): 区分文件被移动或删除与其他预览失败` 是本地提交上游的 PR 的最终版，本地对应 `ac79baf3`（16 个文件），上游有 24 个文件。逐文件比对 `bbb1bb06^..bbb1bb06` 与 `ac79baf3`：

**两边都有的 16 个文件**

- 12 个文件的改动行完全一致：`runtimeRequest.ts`、`shared/runtime/localChatError.ts`、`src/shared/lib/localChatError.ts`、四个 `i18n` 文案文件、`DesktopFilePreview.vue`、`DesktopArtifactContextSurface.vue`、`useArtifactPreview.ts`、`useResourcePreviews.spec.ts`、`workbenchLabels.ts`。
- 4 个文件上游更完整，是维护者追加的：
  - `ArtifactService.ts`（及 spec）：上游把 `ENOTDIR` 也算作文件不存在（本地只认 `ENOENT`）。
  - `SpaceFileService.ts`（及 spec）：上游把 `rethrowMissingFile` 改成按 `GrantedPathError(PATH_NOT_FOUND)` 和带 `path` 的 `ENOENT`/`ENOTDIR` 精确判断，并要求错误路径等于目标路径；本地是沿 `cause` 链最多 5 层找 `ENOENT`/`PATH_NOT_FOUND`。上游同时覆盖了文档读取路径 `readDocument`（本地只覆盖了 `read` 预览），并且让“目录本身已不可用”仍然报 `ENOENT`，不当成文件缺失，也保留读取器不可用（`BOUNDED_FILE_READER_UNAVAILABLE`）的原错误。

**上游多出的 8 个文件**

| 文件 | 内容 | 与本地的关系 |
| --- | --- | --- |
| `native/host/src/file_engine/io.rs`、`protocol.rs` | Rust 文件引擎读取时把找不到的目标映射为新错误 `FILE_NOT_FOUND`（并先确认根目录仍然有效） | 维护者追加，是 `readDocument` 走原生引擎时才能报“已移动或删除”的前提；本地没有。TS 端 `NativeFileEngine` 对引擎返回的错误码是透传的，不需要改 TS |
| `native/host/__tests__/file_engine.rs` | 165 行 Rust 测试 | 随上面的 Rust 变更 |
| `DesktopFileEditor.vue` | 编辑器的错误条在 `FILE_NOT_FOUND` 时显示“文件已被移动或删除”，否则显示通用失败 | 维护者追加。本地 `73243234`（自动保存）改过同一个错误条，条件是 `(copy?.error && copy.error !== 'FILE_SAVE_FAILED') \|\| failed`；上游改动只替换条内文案，可以直接叠加，不冲突 |
| `WorkingCopyService.ts`（及 `WorkingCopyService.spec.ts`） | 读取失败时区分 `FILE_NOT_FOUND` 与 `FILE_READ_FAILED`；已有未保存修改时文件缺失不丢草稿，文件恢复后清除错误并转为冲突 | 维护者追加。与自动保存兼容：`WorkingCopyAutoSave.ts` 在 `copy.error`（非 `FILE_SAVE_FAILED`）存在时不自动保存，所以文件被删除后不会被自动保存重新创建；文件恢复后 etag 不同，进入 `conflict`，同样被自动保存拦住 |
| `fileViewIdentity.spec.ts` | 新增预览失败重试、文档缺失保留修改、初始缺失重试 3 个用例 | 本地 `73243234` 把这个文件加了 142 行（自动保存），合并时要手动叠加，但不冲突语义 |
| `.playwright/.../file-explorer.e2e.mjs` | 新增“文件编辑器区分外部删除并在恢复后不丢未保存修改”E2E，并在 `createSpace` 里先关闭功能引导 | 维护者追加。本地编辑器带自动保存，E2E 里编辑后文件被删除、再被恢复的步骤需要在自动保存开启和关闭两种状态下确认 |

**结论与建议**

1. 上游版本覆盖面比本地大：本地 `ac79baf3` 只修了“预览”和“任务产出”两条路径，上游补上了“编辑器读取文档”这条路径，还修了 `ENOTDIR` 和边界情况。两边对 `SpaceFileService.rethrowMissingFile` 的判断方式不同（本地沿 `cause` 链找错误码，上游按错误路径精确匹配），不是简单的子集关系。
2. 不在本轮移植，因为它含 Rust 变更，需要单独的 Rust 构建和 Windows 验证；本轮其他提交都没有 Rust。
3. 建议下一轮单独移植 `bbb1bb06`：先用上游版本替换本地 `ac79baf3` 的 `ArtifactService.ts` 和 `SpaceFileService.ts`（替换前确认本地 `ac79baf3` 的用例在上游实现下仍通过，尤其是 `cause` 链上的错误码），再引入 Rust、`WorkingCopyService.ts`、`DesktopFileEditor.vue` 和测试。需要重点验证：自动保存（`WorkingCopyAutoSave.spec.ts`）与文件缺失状态的交互，以及新 E2E 在自动保存开启时的行为。
4. 本地没有迁移相关的差异。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 由 `c81bdfb5` 推进到 `dc7ca3c5e207f0c3330fe08425631112390e0ea7`。`d6cd5ec3` 和 `c07652a3` 本轮没有决定，所以基线不能越过它们，只推进到 `dc7ca3c5`。

基线之后但本轮已经处理的上游提交（下一轮不要再当作新提交处理）：

- `40a99b7c`：已移植。
- `9a8da6e6`：已跳过（本地 `7fc4a237` 已有等价改动）。
- `bbb1bb06`：已评估，结论见上，留待下一轮单独移植。

`d6cd5ec3` 和 `c07652a3` 仍未决定。

## 检查

- 迁移：区间内没有新迁移，没有分配编号。
- 依赖：`pnpm-lock.yaml` 只变 `pi-coding-agent` 的补丁哈希，已 `pnpm install`。
- 品牌：新增行里的 `Lexora` 只有标识符，没有用户可见文案：环境变量 `LEXORA_BUDDY_HOME`、`LEXORA_BUDDY_STORAGE_PROTECTION`、`LEXORA_BUDDY_PROCESS_CONTROL`、`LEXORA_TEST_MISE`，原生二进制 `lexora-buddy-sandbox`，工具名 `lexora_gate`，页面 id `lexora.tasks`/`lexora.settings`，`window.lexoraDesktop`，测试临时目录前缀。没有新增默认名称、头像、数据目录文案；“晓晓”身份未受影响。
- 样式：整个区间只有 `DesktopTaskIndex.vue` 增加了 1 行脚本传参（`markStates`），没有新增模板类名或样式，所以 `uno.config.ts` 不需要补映射。
- 类型检查：`apps/buddy` 的 `pnpm type-check` 通过。`eslint` 对改动的 `.ts`、`.vue`、`.mjs` 文件和 `.playwright/scripts` 无问题。
- 测试（本机 Windows，只跑改动相关的 spec，12 个文件）：
  - 除 `codemode.spec.ts` 外的 11 个 spec 文件：8 个通过，2 个整体跳过（平台限定，如 `macosSandbox`），1 个有失败（`sandboxPermissions.spec.ts`，见下）。`widgets/task-index` 目录 5 个文件 37 个用例全部通过。
  - `codemode.spec.ts`：23 个用例通过，但需要原生文件读取器。该 worktree 位于 `.claude\worktrees\` 下，`.output` 里放的读取器从这个路径启动时报 `FILE_IO_FAILED`，原因没有查明；改用主目录已构建的 `lexora-buddy-file-reader.exe`（临时改 `vitest.setup.ts`，已还原，未提交）后 23/23 通过。
  - `sandboxPermissions.spec.ts` 的“preserves the user home…”在 Windows 本机失败：`createSandboxEnvironment` 在 Windows 宿主上默认走 `win32` 分支，用例断言 POSIX 路径与分隔符，属于 Windows 宿主限制（同类见 `docs/known-test-failures.md` 的 POSIX 路径语义），Linux CI 上应通过。没有在改动前的基线上单独验证它是否原本就失败，也没有改用例（试过给 `createSandboxEnvironment` 传 `linux`，仍因宿主 `path.join`/`delimiter` 失败，已还原）。`SandboxDirectoryPermissions.spec.ts` 的两个用例是已记录的符号链接 `EPERM`。
- 未跑：Playwright E2E（`sandbox.e2e.mjs`、`settings.e2e.mjs` 的新增用例）、需要真实 `mise.exe` 的沙箱工具链 E2E（`LEXORA_TEST_MISE`）、开发预览、打包、全量测试、Rust 构建与测试（本轮没有 Rust 变更）、迁移在真实开发库上的运行（没有迁移）、Windows 沙箱原生用例（`shell_sandbox.windows.mjs`）。
