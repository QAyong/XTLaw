# 2026-10-16 上游集成：按上游顺序分轮

## 范围与状态

- 区间：`1073fa9a..ad2a3dd1`（`upstream/master`），共 30 个新提交，上游版本 v0.11.1 到 v0.12.0。
- 工作分支：`codex/upstream-20261016`，基于 `master` 的 `fdc0a7dc`。已在你确认后快进合并到 `master`（合并时为 `2203ad30`，不产生合并提交），未推送、未打包。安装器里的版本门槛 `0.1.2.0` 待你确认下一个发布版本号后再改。
- 原则：按上游提交顺序，连续区间分轮；大功能（新迁移、超过 100 个文件、冲突超过 10 处）单独成轮。

## 轮次划分

| 轮次 | 提交 | 状态 |
|---|---|---|
| A | `a69cfc6a` 数据迁移与备份恢复 | 已移植（本地 `daa6aa4d`） |
| B | `f2971e99`、`d7b00bf3`、`3f040626` 任务引用与引用链（含迁移 v29） | 已移植（`76f710ff`、`4e5eb234`、`42a011c7`） |
| C | `0e3ff0b3`、`cc38b967`、`ebe499ad`、`8a2b8e8f`、`913f2085`、`073d1a43` | 已移植（`ed8ce3c3`、`8c1efbb3`、`baf7d99b`、`f02025fa`、`3b4aae86`、`15f5655f`）；`603a8114` 按你的决定跳过 |
| D | `f6e2818a` 文件管理与图标扩展（219 个文件，含 Rust）、`a7836ac4` 空间文件加载卡顿 | 已移植（`c636db80`、`58e8ee85`）；本地 Spec-019 文件管理已移除 |
| E | `25fc399f`、`195ab25e`、`585ac20a`、`2593a182`、`98b6e3ca`、`a8ce94f7` | 已移植（`68fa9cb3`、`79fdf5bb`、`1503b0db`、`e135c64f`、`7fc0090c`、`db3a317a`） |
| F | `1c2c9db4`（`0469b6bc` 是你自己的 PR，`6ec391eb` 只是合并外壳，均不取） | 已移植（`2d2f8ec9`），以上游为准 |
| G | `6251ba91`、`61127eec`（`a7836ac4` 已在 D 轮） | 已移植（`a81daae8`、`af7b21b2`） |

计划跳过：

- `24fefd1b`、`5f9ee744`、`14b42798`：上游发版提交，只改版本号。
- `ad2a3dd1`：官网重构，本地官网已改为 XTLaw 品牌。
- `5ce92339`、`352fa46c`：Playwright 目录与归档调整，本地 e2e 脚本与上游本来就不同步。

## A 轮：数据迁移与备份恢复（`a69cfc6a`）

### 功能

- 统一数据根目录：首次启动时把原有的 userData、sessionData、窗口状态整理到新的数据根目录，用户可在设置里更改数据目录。
- 本地快照备份、导入导出、按范围选择恢复；恢复前保留副本。
- 云备份：WebDAV 与 S3，凭据加密保存，支持定时备份。
- 数据整理窗口、数据目录不可用提示、设置里的空间占用与数据设置页。
- 新增依赖 `@aws-sdk/client-s3`、`@aws-sdk/util-format-url`、`@smithy/types`，已执行 `pnpm install`。没有数据库迁移。

### 冲突处理（8 个文件）

- `DesktopIntegrations.ts`：只引入存储与同步的 IPC。本地没有主题系统，不引入上游的 `registerThemeIpc`。`start()` 恢复为异步，`DesktopApplication.ts` 同步改为 `await`。
- `environment.ts`：采用上游的“旧路径 → 统一数据根”流程，默认 userData 保留本地的 `XTLaw` 目录。
- `desktopApi.ts`、`preload/desktop.ts`：加入 `sync`、`storage`，保留本地的 `selectionReferenceMenu`；不加入 `themes`。
- `requestThroughHost.ts`：保留本地的搜狗微信会话 Cookie 逻辑，请求入参类型放宽为上游写法（支持 `Buffer`）。
- `registerDesktopUpdates.ts`：采用上游的更新缓存位置（数据根下 `cache/updates`），不再使用本地按平台拼的 `xtlaw/updates` 缓存目录。
- `SkillService.ts`：保留本地的轻量元数据读取，加入上游“已安装外部技能沿用已有 ID”的判断，并补上 `existingRecords`。
- `DesktopAppProvider.vue`：同时保留 `resolveUserProfile` 和新增的云备份反馈。

### 品牌

- 主目录下的 `.lexora-locations` 改为 `.xtlaw-locations`（根目录定位、锁文件），避免与同机的上游 Lexora 共用。
- 整理窗口、数据目录不可用对话框、备份目录名 `XTLaw-backup-*` 和相关文案改为 XTLaw。
- 云备份默认目录与连接名由 `lexora` 改为 `xtlaw`。
- 保留为标识符的部分：远端目录 `lexora-backups-v1`、凭据加密的附加数据 `lexora-backup-credentials-v1`、IPC 通道 `lexora:storage`、`lexora:sync`、`LEXORA_*` 环境变量。这些与本地现有标识符一致。

### 验证

- `vue-tsc -b` 无错误。
- 相关测试 35 个文件、249 个用例：237 通过、3 跳过、9 失败。9 个失败都是符号链接权限（`EPERM`）：
  - 8 个已在 `docs/known-test-failures.md` 中（技能相关）。
  - 1 个是新增的 `StorageSnapshots.spec.ts`“创建可移植快照…”，在准备夹具时创建符号链接失败，同类原因，清单尚未收录。
- 首次启动整理已在开发档位的真实数据（`C:\Users\Lenovo\.xtlaw-dev`）上实测。测试前先备份到 `~/.xtlaw-migration-backups/20261016-a-round`，包含 `.xtlaw-dev`、Roaming 和 Local 下的 `XTLaw Dev` 三份，文件数与字节数核对一致：
  - 新建 `storage.json` 和 `device/`（`electron`、`chromium`、`state`、`crashes`），主目录下出现 `.xtlaw-locations`（定位文件与锁）。
  - 整理是复制，不是搬迁：原 `buddy` 数据、Roaming/Local 下的旧目录没有文件丢失或大小变化，只多了 SQLite 的 `-wal`、`-shm` 与 `lockfile`。
  - 凭据密钥 `Local State` 复制到 `device/chromium`，哈希与原文件一致。日志里有 `runtime.ready`，没有 `credential.decrypt.failed`，没有 error 或 warn。
  - 二次启动：`storage.json`（`dataId`）不变，没有重复整理，同样有 `runtime.ready` 且无 error 或 warn。
  - 实测前发现并修复一处漏改：存储启动流程读 `LEXORA_BUDDY_PET_STATE_PATH`，本地的覆盖变量是 `XTLAW_BUDDY_PET_STATE_PATH`（`a7f41318`）。
- 仍未验证：
  - 没有运行 e2e（`storage.e2e.mjs`、`settings.e2e.mjs`）。
  - 没有在窗口里查看数据整理窗口、设置里的数据与云备份页，也没有实际执行备份、恢复、更改数据目录和云备份。
  - 稳定档位（`~/.xtlaw`，约 800 MB）没有试。
- 注意：整理后旧的 Roaming/Local `XTLaw Dev` 目录仍在原位，后续运行使用 `device/` 下的副本，两边会逐渐分叉。清理旧目录需另行确认。

## B 轮：任务引用与引用链（`f2971e99`、`d7b00bf3`、`3f040626`）

### 功能

- 任务引用改为“按分支持久授权”：新增迁移 v29（`run_session_reference_scopes` 冻结每次运行可引用的历史范围，`session_reference_exclusions` 记录分支下被排除的会话，若干触发器维护），并为已有运行回填。`BUDDY_SCHEMA_VERSION` 由 28 变为 29，编号与上游一致，不依赖被跳过的迁移。
- 新增 `SessionReferenceAccess`、`sessionReferenceRepository`，工具增加 `branchId` 参数；用户消息里引用文本的投影拆到 `buddyUserReferenceText.ts`。
- `3f040626` 撤掉了 `f2971e99` 里的引用设置服务和设置界面（`TaskSessionReferenceAccess.vue` 等），迁移 v29 和服务端授权保留。
- `d7b00bf3`：伙伴画布可折叠；对话行新增 `is-assistant-continuation` 状态类，供消息列表的间距选择器使用。

### 与本地实现的关系

- `f2971e99` 与本地 `c271532b`（10/12，本地独立修复：数字偏移、引用链）功能重叠、设计不同。这次按“跟上游同步”采用上游实现，删除本地的 `sessionReferenceChain.ts`，`sessionReferenceExtension.ts`、`sessionReferenceToolContract.ts`、`sessionReferenceText.ts`、`sessionSearch.spec.ts` 取上游版本。
- 核对结果：上游的引用链深度 3、总数 24，与本地一致；每次使用都会重新核对携带引用的会话是否被删除、分支是否变化、是否被排除；`messageOffset` 续翻、`[SESSION:id]` 标记和 `Referenced tasks` 清单上游都有。
- 删除了本地 `sessionMaterials.spec.ts` 中 4 个针对本地旧设计的用例（引用链深度、不同会话间不共享、携带会话被删后停止、数量上限）。同类约束由上游的授权逻辑和 `schema.spec.ts` 的 v29 升级用例覆盖，但没有逐条等价迁移。`schema.spec.ts` 两边的用例都保留。

### 冲突处理

- `d7b00bf3`：保留本地的 `buddy-chat-agent-turn` 作用域样式写法，只取新增的 `is-assistant-continuation` 状态类。
- `3f040626`：因前一个提交已采用上游实现，无冲突。
- 新增代码中没有需要改的 `Lexora` 文案。

### 验证

- `vue-tsc -b` 无错误，相关目录 ESLint 通过。
- 会话、存储、共享、任务相关测试 174 个文件、1305 个用例：1302 通过，1 跳过，2 失败。2 个失败都已在 `docs/known-test-failures.md`：`BuddyDataPaths.spec.ts`（POSIX 路径）和 `StorageSnapshots.spec.ts`（符号链接权限）。
- 没有启动开发预览，所以迁移 v29 还没有在真实开发库 `.xtlaw-dev/buddy/buddy.sqlite3` 上运行。只有 `schema.spec.ts` 里的 v28 到 v29 升级用例验证了迁移本身。升级后旧版本很可能无法再打开该库，需要时用 `~/.xtlaw-migration-backups/20261016-a-round`，但它在升级前，之后的数据不在里面。
- 没有运行 e2e，没有在窗口里查看画布折叠和引用相关界面。

## C 轮：资源面板、通知、授权与迁移界面

### 跳过

- `603a8114`（资源面板按钮图标换成上游自绘 SVG）：按你的决定跳过。它只改标题栏图标，与后续提交没有依赖。

### 移植内容

- `0e3ff0b3` 子任务通知：新增“子任务通知”开关（`subtaskNotificationsEnabled`，默认开）；通知服务按 `executions.list` 识别子任务，标题为“子任务 #N · 任务名”。本地 `844cf7d0` 的通知清理逻辑（`dispose`、点击保留、关闭与失败回收）原样保留。本地的 `settingsControls.e2e.mjs` 已删除，保持删除。
- `cc38b967` 完全访问下不重复授权：权限引擎在完全访问下不再强制二次确认沙箱绕过，`lexora_host_shell` 按平台映射到 bash 或 PowerShell 策略。
- `ebe499ad` 资源面板操作聚合：连续的“打开/收起资源面板”提示合并为“资源面板操作 N 次”，新增 `BuddyChatPanelGroup.vue`。本地对话流有自己的折叠结构，保留，只把面板行换成分组组件。
- `8a2b8e8f` 关闭最后一个可见标签后自动收起面板：新增设置“自动收起空资源面板”（`contextPanelAutoCollapse`，默认关）。你本地早先的实现（`71bdbf30`）始终开启，按上游同步后变成默认关闭的可选项，使用的人需要在设置里打开。
- `913f2085` Windows 旧版退出：安装器判断已安装版本是否支持“请求退出”，不支持则提示从托盘手动退出。
- `073d1a43` 数据迁移窗口：改进进度、失败原因和诊断导出。

### 与上游不同的处理

- `8a2b8e8f`：本地有“按会话记住面板开关”，关闭时沿用本地的开关恢复逻辑，同时调用 `control.close(原始来源)`，让“用户关闭面板”的记录带上原始来源（上游测试要求）。`useTaskResourcePanelClose.spec.ts` 中“不在可见范围外收起”一条断言原本是“面板仍打开”，本地切换到未保存过状态的任务时面板本来就会收起，改为比较关闭操作的次数。
- `913f2085`：安装器的版本门槛由上游的 `0.11.1.0` 改为 `0.1.2.0`。XTLaw 已发布的 0.1.1 不支持“请求退出”，下一个版本才有。**如果下一个 XTLaw 发布版本号不是 0.1.2，这里必须同步修改**，否则新安装包会对支持的版本也走手动退出，或对不支持的版本发退出请求。
- `073d1a43`：上游页面从 `shared/theme` 取颜色和字体，本地没有这套主题模块。颜色改为 `storageMigrationColors.ts` 里的静态色值（取自本地 `src/theme/buddyTheme.ts` 的亮色与暗色），字体用 `typographyPreferences.ts` 里的默认字体栈。不能直接 import `src/theme`，那会把渲染进程的 DOM 和 naive-ui 类型带进 Electron 主进程的类型检查，已经因此出过一次 `attachmentProtocol.ts` 类型错误。
- `073d1a43`：反馈地址 `github.com/useLexora/Lexora/issues` 改为 `github.com/QAyong/XTLaw/issues`。
- 测试：`DesktopNotificationService.spec.ts` 和 `LexoraConfigStore.spec.ts` 本地与上游分叉很大，保留本地版本，只补子任务通知的用例和新增配置项；`BuddyChatActivities.spec.ts` 并入上游的面板分组用例。

### 验证

- 本轮按“少跑检查”执行：每个提交只跑改动相关的测试，整轮结束后跑一次 `vue-tsc -b` 和 ESLint，均通过。
- 失败的测试都不是本轮引入：
  - 符号链接权限：`mutationToolExecution.spec.ts` 一条，已补进 `docs/known-test-failures.md`。
  - Windows 平台差异：`PermissionEngine.spec.ts` 的“forces confirmation…”，Windows 上 `lexora_host_shell` 走 PowerShell 策略，识别不到 `sudo`、`shutdown now`，已补进清单。
  - 本地搜狗微信搜索源（`b6139b74`）新增后断言未更新：`useWebSettingsCapability.spec.ts`，已补进清单。
- 未验证：没有运行 e2e，没有在窗口里查看资源面板分组、新增的两个设置开关和数据迁移窗口，没有触发过真实的子任务通知。

## D 轮：文件管理与图标主题（`f6e2818a`、`a7836ac4`）

### 决定与更正

- 你决定“同步上游，我们的那个不要了”：用上游的原生文件引擎和新资源管理器，替换本地的文件管理（Spec-019，`76ab90c0`）。
- 更正：评估阶段我说“图标主题依赖整套主题系统”，说重了。逐行核对后，这个提交新增的代码对主题系统的硬依赖只有两处，没有引入主题引擎，第 4 轮“不要多套主题”的决定不受影响。

### 功能

- 原生文件引擎（Rust `file_engine`）：新建文件和文件夹、重命名、复制、移动、删除到系统回收站、从回收站恢复、写入；操作先写日志，状态为准备、执行中、已应用、未应用、需要核对、已确认；中途被打断时不会假装成功，重启后保留“结果未知”的操作并阻止重放，由用户核对后确认；路径冲突检测、目录授权撤销检查、监听目录变化。
- 新资源管理器：右键菜单（新建文件、新建文件夹、重命名、复制、剪切、粘贴、删除、在文件管理器中显示、刷新、全部折叠）、命名对话框、操作失败提示、“结果需要核对”恢复界面。
- 文件图标主题：内置 Material Icons，设置里新增“文件图标主题”，插件可通过 `contributes.iconThemes` 贡献图标主题（需要 API 3）。
- `a7836ac4`：文件加载延迟显示，减少闪烁和卡顿，文件引擎读取分页优化。
- 新增 Rust 依赖：`rusqlite`（内置编译）、`notify`、`trash`、`cap-std`、`sha2`、`uuid`，以及 Windows 与 macOS 的系统接口 crate；`Cargo.lock` 已更新。

### 本地 Spec-019 的移除

- 前端：`WorkspaceFileOperations`、`WorkspaceFileMutationGuard`、`DesktopWorkspaceFileMenu`、`DesktopContextFileTree`、`fileTreeContextMenu`、`workspaceFilesApi`、`spaceFileNames`，以及对应测试和 40 条不再使用的翻译键。
- 后端与原生：Rust `file_mutation` 模块和 `--mutate-entry`、TS `mutateBoundedEntry` 及其测试、`spaceFilesLocate` 通道和 `locateEntry`、旧的变更接口和结果类型。
- `docs/specs/feature-019-file-manager-basics.md` 保留为历史记录，已加“已被取代”说明。

### 保留与适配

- 保留本地的 Office DOCX 二进制读写（`readBytes`、`saveBytes`）：接到上游的 `SpaceFileService` 上，用 `track` 纳入待完成操作，保存后发布变更事件。注意它不经过文件引擎的日志，与引擎的路径保护是两套机制。
- 保留本地 `file_writer` 的二进制保存（`--save-binary`）和 `ReadRequest.range`（分块读取），并入上游的 `--serve` 与 `write_large`。上游新增的 `bounded_file_windows.rs` 测试补了 `range: None`。
- 本地选区引用、引用链、更新、备份等其他功能不受影响；`useDesktopWorkbench.ts` 用“先反向去掉 Spec-019、再叠加上游改动”的方式三方合并，保留了本地的选区引用与伙伴等改动。
- 对主题系统的两处依赖：
  - `themeIdSchema` 来自 `shared/theme/themePreferences.ts`：直接取上游文件（只依赖 `zod`）。
  - 图标变体要知道亮或暗：新增 `src/theme/desktopAppearance.ts`，由 `App.vue` 在应用配色时写入，`fileIcon.ts` 读取。这是本地写的小衔接，不是上游文件。
- `shared/extensions/extensionPath.ts` 取上游文件，避免插件清单和图标主题之间的循环引用；`extensionManifest.ts` 改为从它导入并转出。
- 配置存储的 `update` 增加上游的 `assertCurrent` 参数（写入前检查，防止过期写入），图标主题服务使用它。
- 插件包文件数量限制：并入上游的 `validateExtensionFileCounts`（总数 4096、非图片 512，图片不计入后者），字节上限保持本地的 16 MiB 和 64 MiB（Office 集成调大的）。放在 `shared/extensions/extensionPackageLimits.ts`，不恢复上游的 `extensionLimits.ts`。
- 插件开发文档：`plugin-creator` 技能加入图标主题说明，不加入主题 API、`styles.uno` 等主题引擎部分。
- 品牌：图标主题来源名、插件文档中的 Lexora 改为 XTLaw；CSP 加入 `lexora-icon:` 协议（与本地其他协议同为 `lexora-` 前缀的标识符）。临时文件名 `.lexora-*.stage`、`.copy`、`.rename` 与本地已有的 `.lexora-save-*` 保持一致，没有改。

### 验证

- `vue-tsc -b`、ESLint 无错误；`cargo check --all-targets` 通过。
- Rust 测试：`file-engine` 11 个通过、3 个因需要 SMB 权限被忽略；`bounded-file-windows` 5 个通过、2 个因需要 NTFS 大小写敏感目录或 SMB 被忽略；`bounded-file` 4 个、`bounded-write` 3 个通过。覆盖了 Windows 回收站删除与恢复、重启后保留结果未知的操作、去重和租约共享。
- TS 相关测试：第一次宽范围运行 2174 个用例，20 个失败，其中 19 个已在 `docs/known-test-failures.md`，另 1 个是本地 Spec-019 遗留的 `spaceFileNames` 载荷测试，随该模块删除。清理和 `a7836ac4` 之后，空间、文件、任务面板和工作台相关的 31 个文件、201 个用例全部通过。
- `SpaceFileService.spec.ts` 等测试使用 `.output/build/native/x86_64-pc-windows-msvc/release/lexora-buddy-file-reader.exe`，该路径里原有的是 10/14 的旧版本，不认识 `--serve`，测试会超时。我用 `cargo build --release --target x86_64-pc-windows-msvc --target-dir .output/build/native -p lexora-buddy-host --bin lexora-buddy-file-reader` 重建了这一个可执行文件，其余 `.output` 内容没动。以后在干净环境跑这些测试，需要先执行 `pnpm prepare:test-runtime`（或同样重建）。
- 没有在桌面窗口里查看新资源管理器、右键菜单、恢复界面和文件图标设置页；没有在 `.xtlaw-dev` 的真实数据上运行文件引擎；回收站行为只由 Rust 测试覆盖。

### 风险与后续

- 文件引擎在数据目录下新增操作日志和目录登记。升级后旧版本不认识这些数据；这部分没有用真实开发数据验证。
- 上游的 `file_engine` 也影响选区引用那一轮（`0469b6bc`、`1c2c9db4`、`6ec391eb` 与 D 轮重叠 6 个文件），F 轮合并时需要注意。

## E 轮：更新、云备份、本地备份、图片存储、空间占用、安装目录

按“轻量模式”：你勾选全部六个，一次性移植，最后统一检查一次。

### 内容

- `25fc399f` 更新下载失败反馈：失败分为下载、校验、保存、超时四类，更新对话框给出具体说明，提供“重试”和“手动下载”，日志记录错误码。冲突只在对话框的样式写法上：保留本地作用域样式，把上游的“最大高度加内部滚动”布局用同等的作用域规则补上。
- `195ab25e` 云备份连接测试：“测试连接”真的做一次读写验证（写入随机文件、读回比对、删除），失败给出 15 种以上具体提示，表单按字段标红。冲突在备份目录输入框，沿用我们的默认值 `xtlaw`。
- `585ac20a` 本地备份保留：设置新增“本地备份保留数量”（默认 3，范围 1 到 10），超出的旧备份在下次成功备份后清理，调小时弹窗询问是否立即清理，待上传或恢复的副本保留。冲突在配置存储和配置接口，只取备份保留相关的导入，不引入主题偏好。
- `2593a182` 空间占用展示：分类行和占比条，统计口径调整。
- `98b6e3ca` 减少图片重复存储：图片按内容哈希存为 `conversations/<id>/media/images/<sha256>`，消息只存引用，工具返回的图片同样复用。
- `a8ce94f7` Windows 首次安装可选择安装目录（升级时不再询问）；去掉 `electron-builder.config.cjs` 的 `allowToChangeInstallationDirectory: false`；构建 Rust 的静态链接参数由命令行改为环境变量。

### 图片目录与备份、恢复（`98b6e3ca`）的核对

- 路径归类：`buddy/conversations/<id>/media/images/<sha256>` 属于备份范围 `tasks`（不属于 `workspaces`），与引用它的消息所在的数据库表同属 `tasks`。用 `backupPathScope`、`backupPathAllowed`、`backupDirectoryAllowed` 实测：选 `tasks` 时文件和目录都允许，只选 `workspaces` 或 `settings` 时都不允许。所以恢复 `tasks` 会同时带回消息和图片，不会出现消息有引用而图片缺失。
- 图片库按对话目录隔离（`conversationImageDirectory(对话目录)`），不跨对话共享：删除对话时随目录一起删除，只恢复部分对话也自洽。
- 空间占用：`storageTree` 已把 `conversations/<id>/media` 计入“附件”类别，空间占用页会统计到。
- 上游补充了 `selectiveBackup.spec.ts` 的相应用例，已通过。
- 没有核对：已有对话里的旧图片不会被迁移，新旧两种存储会并存；没有用真实数据做一次备份再恢复的端到端验证。

### 与上游不同的处理

- 品牌：`SyncConnectionForm.vue` 的备份目录示例和占位符保持 `xtlaw`；远端目录名 `lexora-backups-v1` 和凭据加密附加数据仍是格式标识，未改。
- `.playwright` 里新增的更新类 e2e 用例仍使用上游发布地址和 `Lexora Buddy` 菜单名，与 XTLaw 不一致，这是此前就存在的问题（见 10/14 记录），本轮没有修复，也没有运行 e2e。

### 验证

- 统一检查一次：`vue-tsc -b` 无错误，ESLint 无错误。
- 相关测试 100 个文件、669 个用例：652 通过、4 跳过、13 失败。其中 12 个已在 `docs/known-test-failures.md`，另 1 个是新增的 `ImageBlobStore.spec.ts`“拒绝损坏、缺失、链接和格式错误的图片”，在创建符号链接时被系统拒绝，同类，已补进清单。
- 没有验证：Windows 安装包的目录选择页（需要打包后实际安装，也要确认 `StrContains.nsh` 在打包时可用，已确认该文件在 `app-builder-lib` 模板里）；云备份的真实 WebDAV 或 S3 连接；本地备份清理的实际效果；更新下载失败各分支的窗口效果。

## F 轮：选区引用（`1c2c9db4`）

### 为什么只取一个提交

- `0469b6bc` 是你自己提交的 PR（#245），本地已有对应实现。
- `6ec391eb` 是把 PR 合进主线的合并提交，它的文件树与 `1c2c9db4` 完全相同，没有额外内容。
- 真正的差异只有维护者在你的 PR 之上加的 `1c2c9db4`。单独取它，冲突是 15 个；按三个提交整体合，冲突是 43 个。
- 你的要求是“以上游为准”：选区引用相关行为冲突时取上游，但不丢本地其他功能。

### 上游带来的

- 统一的引用卡片 `ReferenceCard`（替换聊天里的 `ChatReferenceCard`）；点引用在编辑器和预览里定位并高亮原文（`useResourceQuoteReveal`、`useQuoteHighlight`、`revealMonacoQuote`）。
- 浏览器元素选择更稳：滚动和 Shadow DOM 下元素身份不丢，替换页面后拒绝旧引用，帧高亮可清理；浏览器按钮选元素不会点到页面。
- 首次带浏览器引用发送时保留已打开的资源面板。
- 引用文本投影到模型输入的逻辑拆到 `buddyResourceQuoteText.ts`。
- 12 个新增文件，4 个 e2e 脚本（没有运行）。

### 以上游为准而移除的本地内容

- 原生编辑菜单：`selectionReferenceMenu`、`selectionReferenceEdit` 通道、`desktopSelectionReferenceEditInputSchema` 和 `executeEdit`。这是你 PR 里做的，上游在后续提交里去掉了。
- 编辑器里基于 `quoteSelection` 状态的定位（`applyQuoteSelection`），改用上游的 `useResourceQuoteReveal`。
- `ChatReferenceCard.vue`，改用 `ReferenceCard.vue`。

### 保留的本地内容

- Office DOCX 引用：`createDesktopSelectionReferences` 里 `docx` 的特殊处理，以及 `createFile` 里打开 DOCX 的路径和 `file-preview` 回退（并入了上游新增的 `current` 守卫参数）。
- 通知点击跳转的两个 IPC（`appGetPendingOpenTarget`、`appCompleteOpenTarget`）；`showSelectionReferenceResult`；`activeResource`。
- 样式：新增的 `ReferenceCard` 等上游组件保留其原子类名；本地已有组件（文档预览、浏览器工具栏、文本预览）保留作用域样式，只补上高亮等新增规则。

### 测试的取舍

- `registerBrowserDesktopIpc.spec.ts`、`composerDraftRepository.spec.ts`、`resourceQuotes.spec.ts` 冲突时先取了上游版本，结果丢掉了 7 个本地测试（草稿里恢复文件、浏览器、产物摘录各一个，引用文本投影 3 到 4 个，页面确认框的“只回复一次”）。我逐个核对后补回：
  - `composerDraftRepository.spec.ts` 用本地版本（上游没有新增用例，本地是超集）。
  - `resourceQuotes.spec.ts` 保留上游版本，本地版本另存为 `resourceQuotesProjection.spec.ts`，两者都通过。
  - `registerBrowserDesktopIpc.spec.ts` 保留上游版本，给 `ipcMain` 的 mock 补 `on`、`removeListener`，给宿主 mock 补 `hasActiveDownloads`；页面确认框的用例另存为 `registerBrowserDesktopIpcDialog.spec.ts`。
- 没有运行 e2e。

## G 轮：插件任务钩子、Linux 更新

### `6251ba91` 插件任务钩子与请求上下文

- 新增三个任务事件：`task:created`、`task:run:before`（可声明阻塞，前置阶段总预算 10 秒）、`task:reply:started`，并把请求上下文传到插件的模型请求。
- **与你本地 `16617fef` 的差异：** 本地给插件模型请求发的是每次随机的 `uuidv7`；上游改为由对话、分支、插件、动作（或调用）标识算出的确定性路由标识。采用上游，所以同一个动作的多次调用现在共用一个路由标识；本地 `extensionModelCapabilities.spec.ts` 里“两次调用路由头不同”的断言改成了“相同”，并给任务会话补了 `conversationId`、`branchId`。
- **我取上游文件时丢了本地的输出截断保护**（输出被 token 上限截断时单独报 `EXTENSION_MODEL_TRUNCATED`，不返回半截文本），测试暴露后已补回。
- `ExtensionCapabilities.spec.ts` 的期望里补上 `agent.hooks`（该能力项来自本次新增的目录条目）。
- `extensionAgent.e2e.mjs` 冲突取了本地版本，上游新增的钩子 e2e 没有加入（本地 e2e 文件名与上游不同，且没有运行 e2e）。

### `61127eec` Linux 应用内更新

- Linux 上下载完成后，确认系统授权，应用退出、安装更新并重新打开；失败可回退，并显示手动安装步骤和可复制的命令。新增 Rust `linux_update.rs`、TS `linuxInstaller.ts`、`DesktopUpdateInstallDialog.vue`；安装闸门文件改名为 `desktopInstallationGate`；`process_control` 增加对应入口。
- XTLaw 的调整：可执行文件路径 `/opt/xtlaw/xtlaw`（来自 `productName: xtlaw` 和 Linux 的 `executableName: xtlaw`）、锁文件 `/run/xtlaw-update.lock`、临时目录 `/var/tmp/xtlaw-update-*`、安装包名前缀 `XTLaw-`；界面和对话框文案中的 Lexora 改为 XTLaw；对应测试夹具的文件名和发布地址改为 XTLaw 的。
- 冲突只有更新对话框和提醒条的样式写法：保留本地作用域样式，取上游新增的状态文案和 `pending` 属性。
- **没有在 Linux 上验证。** Windows 上 `cargo check --target x86_64-unknown-linux-gnu` 因缺少 Linux 的 C 交叉编译器失败（`rusqlite` 的内置编译需要），所以 `linux_update.rs` 没有真正编译，也没有运行 `native/host/__tests__/linux_update.rs`；我只用 `rustc` 单独解析了这个文件，只报缺少外部依赖，没有语法错误，这只是弱证据。`Cargo.toml` 里 Linux 下的 `rustix` 特性（`fs`、`process`、`event` 等）已满足它的导入。

### 验证

- `vue-tsc -b` 和 ESLint 对 `electron`、`src`、`shared`、`service/src`、`platform`、`extensions`、`.playwright/scripts` 全部无错误。
- F 与 G 之后的一次宽范围测试（349 个文件、2409 个用例）：33 个失败，其中 23 个是已知失败，10 个是新增。10 个都已查清并修复：`registerBrowserDesktopIpc` 的 mock 缺 `on`、`removeListener`、`hasActiveDownloads`（6 个）；`ExtensionCapabilities` 的期望缺 `agent.hooks`；`DesktopUpdateCache` 的 Linux 夹具还用着 Lexora 的包名和发布地址；`extensionModelCapabilities` 的两个用例（截断保护丢失、路由标识断言）。修复后对涉及的文件重跑通过；没有再重跑整个宽范围测试。

## 整体结果（本轮 1073fa9a 到 ad2a3dd1）

- 移植：`a69cfc6a`；`f2971e99`、`d7b00bf3`、`3f040626`；`0e3ff0b3`、`cc38b967`、`ebe499ad`、`8a2b8e8f`、`913f2085`、`073d1a43`；`f6e2818a`、`a7836ac4`；`25fc399f`、`195ab25e`、`585ac20a`、`2593a182`、`98b6e3ca`、`a8ce94f7`；`1c2c9db4`；`6251ba91`、`61127eec`。
- 跳过：`603a8114`（面板按钮图标，你决定不要）；`24fefd1b`、`5f9ee744`、`14b42798`（发版提交，只改版本号）；`ad2a3dd1`（官网重构，本地官网已是 XTLaw 品牌）；`5ce92339`、`352fa46c`（Playwright 目录与归档调整）；`0469b6bc`（你自己的 PR，已在本地）、`6ec391eb`（合并外壳，无额外内容）。
- 本地被上游取代的实现：Spec-019 文件管理（D 轮）、引用链 `c271532b`（B 轮）、选区引用的原生编辑菜单（F 轮）、插件模型请求的随机路由标识 `16617fef`（G 轮）。

## 远端 CI 结果

- 推送 `master` 后的第一次 CI（运行 38872039890，提交 `345539c6`）：两个 Linux 原生检查（x64、arm64）在“Check Rust formatting”失败。原因是我把 `linux_update.rs` 里的临时目录路径改成 `xtlaw-update-` 之后没有重新格式化，`rustfmt` 要求把 `format!` 合并成一行。已修复（`dac97b75`，只改这一行）。
- 第二次 CI（运行 38872817110，提交 `dac97b75`）：原生检查在 Windows、macOS、Linux 全部通过，Linux 上的格式检查、clippy 和测试都通过，也就是 `linux_update.rs` 在 Linux 上的编译和单元测试有了真实证据。但这次推送只改了原生代码，CI 按路径过滤，前端、工作区和仓库检查被跳过。第一次 CI 里这几项是被原生检查的失败连带跳过的。所以前端这一套 CI 在同步上还没真正跑过。
- 为了补上这个缺口：从同步前的 `16617fef` 建临时基线分支 `ci-baseline-20261016`，再从 `master` 对它开 PR #5（只用于触发 CI，不合并）。第一轮（运行 38881251862，提交 `dac97b75`）：4040 个前端用例里只有 1 个失败，`useWebSettingsCapability.spec.ts` 的搜索来源排序用例缺少 `sogou-weixin`。这个失败不是同步引入的：来源 `b6139b74`（10/14，新增搜狗微信公众号文章搜索）早在基线 `16617fef` 里，只是测试一直没更新，我在 C 轮就在本地发现并登记过。
- 修复（`cdffdd74`）：把期望列表补成 `['brave', 'native', 'google', 'bing', 'duckduckgo', 'sogou-weixin']`，并从已知失败清单里删除这一条。第二轮完整 CI（运行 38882680542，提交 `cdffdd74`）：**全部通过**，包括 Workspace checks、Repository checks 和 CI Gate，Website quality 与依赖缓存因路径过滤跳过。
- 收尾：PR #5 已关闭（没有带 `--delete-branch`，因为它的头分支是 `master`），临时基线分支在远端和本地都已删除。
- 这些 CI 覆盖的是：编译、格式、clippy、单元测试和工作区检查。没有覆盖：e2e、打包安装、Linux 上真实的应用内更新、云备份真实连接。
