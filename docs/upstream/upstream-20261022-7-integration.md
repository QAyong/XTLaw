# 上游集成记录：2026-10-22（第七轮）

区间是 `b74716ee6..upstream/master`（`5fd3e1012`）里的 5 个提交。分支 `codex/upstream-20261022-7` 叠在 `codex/upstream-20261022-6` 之上，用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `aa856a3d2` | 修复 ChatGPT 登录误开放生图工具：9 个文件，无冲突，无迁移、依赖或 Rust |
| `2f91fa803` | 完善产物卡片操作与媒体预览（useLexora/Lexora#428）：75 个文件，38 处冲突。**只移植媒体预览部分**（取代本地 #408）；产出卡片操作部分不移植，保留本地 #407，见下 |

## 跳过

| 上游提交 | 原因 |
| --- | --- |
| `f6d871837` | 发布 v0.15.0，只改版本号（`package.json`、`buddy.version.json`、`Cargo.lock`、`Cargo.toml`），不照搬上游版本号 |

## 未决定（留给下一轮）

| 上游提交 | 说明 |
| --- | --- |
| `61a0e14fe` | 去掉 Windows ACL 测试里的管理员判断，改 1 个测试文件，无冲突。与 `5fd3e1012` 配套，一起决定 |
| `5fd3e1012` | 在 CI 新增 Windows ACL 无管理员权限测试（`ci.yml`、`buddy-build.yml`、`packaging/buddy/ci/test-windows-platform.ps1`）。本地 `ci.yml` 已改成 XTLaw CI，2 个 workflow 冲突；按规则不碰 `.github/workflows`，需要手改时再定 |

基线只推进到 `f6d871837`（含），这两个提交仍待决定。

## `2f91fa803`：媒体预览取上游，产出卡片保留本地

上游这个提交同时做了两件事，本地各有对应的 PR（#407、#408，都已关闭）。按确认的取舍：

- **#408 媒体预览 → 采用上游。** 上游把它并进了 #428。
- **#407 产出卡片 → 保留本地。** 点产出卡片仍按本地 Spec-035 改走文件管理器（文件收起树、文件夹展开聚焦），Office 文档定位（`revealOpenOfficeDocument`）、192px 卡片样式、折叠前的 `BuddyChatTurnOutputs` 都不动。**上游的卡片操作（引用、定位、在系统文件管理器中显示、复制路径）整体没移植**，包括 `createArtifactActions`、`artifactActionsContext`、`artifactFileTarget`、`artifacts.locate` RPC、`revealFile` IPC、标签页的 `treeTarget`/`locateFile`、新卡片组件及其 e2e（`artifact-cards`）。需要时可以单独补。

### 撤销的本地实现（#408）

删除 `lexora-media` 协议（`electron/main/mediaProtocol.ts` 换成上游的 `handleMediaRequest`）、`serveMediaFile.ts`、`shared/files/mediaFiles.ts`、`DesktopMediaContent.vue` 及对应测试；撤回 `DesktopRuntimeHost`、`environment.ts` 里的注册，`useArtifactPreview` 的 `media`，`ArtifactService.resolvePreview` 的音视频放行，本地的 `mediaFailed` 文案（上游用 `mediaPlaybackFailed`）。`SpaceFileService.read` 的音视频分支换成上游的 `mediaUrl` 方案。

### 采用的上游内容

- `resolveMedia` RPC（空间文件、产出、技能图片）与 `lexora-file://media/`、`lexora-artifact://media/`、`lexora-file://skill-preview/`；`DesktopMediaPreview.vue`、`fileMimeTypes.ts`、`mediaPreview.ts`、`resolveMediaPreview.ts`、`ArtifactFileAccess.ts`、`nativeFileStream.ts`；图片预览也改走流，不再读成 data URL。
- Rust：`file_reader` 改成 `with_file` 加 `run_stream`（`--stream`）。
- 新增 e2e：`media-preview`、`image-preview` 与 `fixtures/artifact-preview.mjs`。

### 与本地分叉的整合

- **`file_reader.rs`：** 本地有 Office 预览用的 `range` 读取（`read_contents`）和 `--save-binary`，上游没有；上游有 `--batch`（来自 #257 的上游版本），本地没有，因为 #257 在本地走的是另一套轻量加载（见 round-4 记录）。保留本地的 `range` 校验与 `read_contents`，让它们在上游的 `with_file` 里执行，再加 `run_stream`；不引入 `run_batch`，对应的两个上游测试也没带。
- **`useDesktopWorkbench.openFile`：** 保留本地 `extensionDocument` 判断，音视频判断换成上游的 `mediaKindForMimeType`。
- **`DesktopArtifactContextSurface`、`artifactContextPresentation`：** 在本地版本上加入上游的音视频分支（`artifactMediaKind`）。
- **`index.html`：** 取上游 CSP，标题保持 `XTLaw`。
- **`skillInstallation.spec.ts`：** 只取上游新增的“技能图片按作用域 URL 提供”用例。
- **`ArtifactService.spec.ts`：** 去掉上游用例里对 `locate` 的断言。
- 上游对选区引用相关 spec、e2e 的改动针对的是上游的实现，保留本地版本。

## 检查

- 迁移：无。依赖：无变更。品牌：新增行里的 `Lexora` 都是协议名（`lexora-file`、`lexora-artifact`）、包名等标识，无用户可见文案。
- 类型检查：`apps/buddy` 的 `vue-tsc -b` 通过。`eslint` 对全部改动文件无问题。
- Rust：`cargo fmt --check` 通过；Windows 上 `bounded-file`（8 个，含上游新增的流式用例）和 `bounded-file-windows`（5 个通过、2 个因权限忽略）通过。另用 Node 脚本直接驱动新构建的 `file_reader --stream`，返回确认字节和正确的数据。Linux/macOS 的 `bounded_file_linux`/`macos` 未在本机跑，依赖 `XTLaw CI` 的 native checks。
- vitest（本机 Windows，服务层、`shared/files`、`src/modules/tasks`、`src/shared/ui`、`src/modules/files`）：891 通过、17 失败，全部是 Windows 环境问题——符号链接 `EPERM`（包括上游新增的 `SpaceFileService` 媒体符号链接用例和 `ArtifactService` 任务工作区用例）、`EBUSY`；其中 `skillInstallation` 3 个、`SkillPackageCache` 与 `SpaceFileRecovery` 的若干个不在或不全在 `known-test-failures.md` 里，但对应文件本次没有改动，失败原因是 `EPERM`/`EBUSY`。
- **`electron/main/__tests__/mediaProtocol.spec.ts` 没有跑通（18 个）：** 测试用的是 `.output/build/native/.../release/lexora-buddy-file-reader.exe`，那是旧版本，不认 `--stream`；重新生成需要 `node packaging/buddy/release/native-host.mjs`，但 `lexora-buddy-runtime-guard.exe` 被占用（os error 5），按约定没有强行处理。解除占用后重跑该 spec。
- 未跑：Playwright E2E（含上游新增的 `media-preview`、`image-preview`）、开发预览、打包、真实窗口里的音视频播放。
