# 2026-10-16 上游集成：按上游顺序分轮

## 范围与状态

- 区间：`1073fa9a..ad2a3dd1`（`upstream/master`），共 30 个新提交，上游版本 v0.11.1 到 v0.12.0。
- 工作分支：`codex/upstream-20261016`，基于 `master` 的 `fdc0a7dc`。未合并到 `master`、未推送、未打包。
- 原则：按上游提交顺序，连续区间分轮；大功能（新迁移、超过 100 个文件、冲突超过 10 处）单独成轮。

## 轮次划分

| 轮次 | 提交 | 状态 |
|---|---|---|
| A | `a69cfc6a` 数据迁移与备份恢复 | 已移植（本地 `daa6aa4d`） |
| B | `f2971e99`、`d7b00bf3`、`3f040626` 任务引用与引用链（含迁移 v29） | 待做 |
| C | `603a8114`、`0e3ff0b3`、`cc38b967`、`ebe499ad`、`8a2b8e8f`、`913f2085`、`073d1a43` | 待做 |
| D | `f6e2818a` 文件管理与图标扩展（219 个文件，含 Rust） | 待评估 |
| E | `25fc399f`、`195ab25e`、`585ac20a`、`98b6e3ca`、`2593a182`、`a8ce94f7` | 待做 |
| F | `0469b6bc`、`1c2c9db4`、`6ec391eb` 选区引用 | 待做，按差异同步，不逐个 cherry-pick |
| G | `6251ba91`、`61127eec`、`a7836ac4` | 待做 |

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
