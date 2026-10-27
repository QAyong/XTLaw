# 上游集成记录：2026-10-22（第二轮）

区间只含 `bbb1bb06`：上一轮（见 [upstream-20261022-integration.md](upstream-20261022-integration.md)）只做了差异评估，本轮按评估建议移植，分支 `codex/upstream-20261022-2`。

## 已移植

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `bbb1bb06` | `Port upstream bbb1bb06` | 区分文件被移动或删除与其他预览失败。本地 `ac79baf3` 已含其中 16 个文件里的大部分，本轮 cherry-pick 实际只增加 12 个文件（+415/−38），其余自动并入 |

### 冲突解决（11 个文件）

以本地为准、补入上游追加内容：

- `ArtifactService.ts`：保留本地注释，把 `ENOTDIR` 也算作文件不存在（本地只认 `ENOENT`）。对应 spec 保留本地音视频用例，并补入上游“父路径变成普通文件”的用例。
- `SpaceFileService.ts`：采用上游的 `rethrowMissingFile(error, targetPath)`（按 `GrantedPathError(PATH_NOT_FOUND)` 与带 `path` 的 `ENOENT`/`ENOTDIR` 精确判断，目录不可用仍报原错误，读取器不可用保留原错误），替换本地沿 `cause` 链最多 5 层的做法。本地音视频分支的 `stat` 也改用新签名，保持“删除后报 `FILE_NOT_FOUND`”。`readDocument` 随上游改为先以 `existing` 模式解析根路径，所以文档读取路径也能报“已移动或删除”。spec 以上游为准，保留本地的音视频预览用例，去掉被上游用例取代的本地同名用例。
- `DesktopFileEditor.vue`：保留本地自动保存的错误条件 `(copy?.error && copy.error !== 'FILE_SAVE_FAILED') || failed`，只把文案换成上游的 `FILE_NOT_FOUND` 判断。
- `fileViewIdentity.spec.ts`：`mount` 同时保留本地的自动保存、恢复草稿等选项和上游的 `readDocument`，加入上游 3 个新用例。
- `DesktopFilePreview.vue`、`DesktopArtifactContextSurface.vue`、`useArtifactPreview.ts`、`workbenchLabels.ts`：全部保留本地（媒体预览、选区引用、`mediaFailed` 文案、本地作用域样式），上游在这些文件里的有效改动本地 `ac79baf3` 已有。
- `file-explorer.e2e.mjs`：只加入上游新增的“编辑器区分外部删除并在恢复后不丢未保存修改”用例。上游同一区域的“复制路径”用例属于另一个上游提交，本地没有对应功能，不带入。

原生代码（`file_engine/io.rs`、`protocol.rs`、`file_engine.rs`）、`WorkingCopyService.ts` 及其 spec 无冲突。

### 与自动保存的交互

`WorkingCopyService` 在读取失败时区分 `FILE_NOT_FOUND` 与 `FILE_READ_FAILED`，已有未保存修改时文件缺失不丢草稿，文件恢复后清除错误并转为冲突。`WorkingCopyAutoSave` 在 `copy.error`（非 `FILE_SAVE_FAILED`）存在时不自动保存，因此文件被删除后不会被自动保存重新创建，文件恢复后进入 `conflict`，同样被拦住。`WorkingCopyAutoSave.spec.ts` 通过。

## 检查

- 迁移：无。依赖：无。
- 品牌：新增行里的 `Lexora` 只有标识符（`window.lexoraDesktop`、`LEXORA_BUDDY_FILE_READER`、`LEXORA_LOCAL_CHAT_ERROR`），没有可见文案。
- 样式：没有新增模板类名。
- 类型检查：`apps/buddy` 的 `vue-tsc -b` 通过；`eslint` 对改动的 `.ts`、`.vue`、`.mjs` 无问题。
- 测试（本机 Windows，只跑改动相关）：`SpaceFileService`、`ArtifactService`、`fileViewIdentity`、`src/workbench/services`、`src/modules/tasks/widgets/context-panel` 共 20 个文件、203 个用例全部通过；Rust `cargo test -p lexora-buddy-host --test file-engine` 23 通过、3 个被忽略。
- 未跑：Playwright E2E（新增的 `file-explorer.e2e.mjs` 用例，尤其是自动保存开启状态下编辑后外部删除再恢复）、开发预览、打包、全量测试。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 保持 `dc7ca3c5` 不变：`d6cd5ec3` 与 `c07652a3` 仍未决定，基线不能越过它们。`bbb1bb06` 现在已移植；`40a99b7c`（上一轮已移植）、`9a8da6e6`（已跳过）都在基线之后但已处理，下一轮不要当作新提交。
