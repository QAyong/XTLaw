# Spec-036：文件管理器预览音频和视频

**日期：** 2026-10-20  
**状态：** 已实现，自动化测试通过；尚未在真实 Electron 窗口中验收

**相关：** [Spec-035：任务产出在文件管理器中打开](./feature-035-artifact-open-in-file-manager.md)

## 1. 背景

文件管理器的右侧预览只认文本和图片：图片由服务进程读成 base64 data URL 经 IPC 送到渲染层，上限 8 MiB。音频和视频动辄几十到几百 MB，不能照搬这条路；超过 1 MiB 的文件原先只显示文件名。

参考 [agegr/pi-web](https://github.com/agegr/pi-web) 的做法：用浏览器原生的 `<video>`、`<audio>`，由服务端按 HTTP Range 流式输出文件，不转码、不引入播放器库。

## 2. 需求边界

**包含：**
- 空间文件管理器里点击音频、视频文件，在右侧预览播放，可拖动进度条。
- “产出”标签页（空间主目录之外、无空间任务等不走文件管理器的产出，见 Spec-035 第 3 节）同样可以播放音视频。

| 类型 | 扩展名 |
|---|---|
| 音频 | mp3、wav、ogg、oga、opus、m4a、aac、flac、weba |
| 视频 | mp4、m4v、webm、mov、ogv |

**不包含：**
- 转码或格式回退：能否播放取决于 Electron 内置的 Chromium 解码器，播放失败只显示“无法播放此文件，可能是当前不支持的编码格式”。
- 技能文件、聊天附件里的音视频。
- 文件被外部改写后自动刷新播放器（文件管理器的图片预览同样不监听单个文件）。
- 字幕、倍速、画中画等播放器增强。

## 3. 实现

| 位置 | 作用 |
|---|---|
| `apps/buddy/shared/files/mediaFiles.ts` | 扩展名到类型和 MIME 的表；`createMediaUrl` / `parseMediaUrl`；`parseMediaRange` |
| `apps/buddy/shared/files/filePreview.ts` | 预览类型增加 `audio`、`video` |
| `apps/buddy/service/src/spaces/SpaceFileService.ts` | `read` 对音视频只返回类型和大小，不读内容，不受 1 MiB / 8 MiB 上限约束 |
| `apps/buddy/electron/main/mediaProtocol.ts` | 新协议 `lexora-media://file/<目标>`：每次请求向服务进程调用 `spaceFiles.locate` 重新校验空间、目录授权和版本，再按 Range 流式输出 |
| `apps/buddy/electron/main/app/environment.ts`、`DesktopRuntimeHost.ts` | 注册协议特权（`stream`）并安装处理器 |
| `apps/buddy/index.html` | CSP 增加 `media-src 'self' lexora-media:` |
| `apps/buddy/src/shared/ui/files/DesktopMediaContent.vue` | `<video controls>` / `<audio controls>`，出错显示提示，URL 变化时清除 |
| `DesktopDocumentContent.vue`、`DesktopFilePreview.vue` | 预览类型为音视频时用 `createMediaUrl` 生成地址并渲染播放器；重试会带 `?v=` 强制重新加载 |
| `apps/buddy/src/app/workbench/useDesktopWorkbench.ts` | 音视频文件直接走 `file-preview`，不再先尝试作为文本编辑副本打开 |

### 3.1 产出标签页

| 位置 | 作用 |
|---|---|
| `apps/buddy/electron/main/serveMediaFile.ts` | 从 `mediaProtocol.ts` 抽出的 Range 流式输出，两个协议共用 |
| `apps/buddy/electron/main/attachmentProtocol.ts` | `lexora-artifact` 遇到音视频扩展名时改用 `serveMediaFile`，不再 `readFile` 整个文件；图片仍整读 |
| `apps/buddy/service/src/artifacts/ArtifactService.ts` | `resolvePreview` 允许音视频产出，内容类型取自扩展名（产出记录里 mp3、mp4 登记为 `application/octet-stream`） |
| `useArtifactPreview.ts`、`DesktopArtifactContextSurface.vue` | 按文件名判断，渲染与文件管理器相同的 `DesktopMediaContent` |
| `apps/buddy/index.html` | `media-src` 增加 `lexora-artifact:` |

产出文件可在任意授权位置，读取方式是 Node 直接读取 `currentPath`（与原先图片整读相同），不经过空间目录授权的重新校验，只校验产出记录可见；叶子为链接或非普通文件时拒绝。

## 4. 行为细节

- **URL 只带文件目标。** URL 是 `{spaceId, directoryId, revision, path}` 的 base64url，不含本机路径；渲染层不能借它读授权之外的文件。目标被撤销或目录版本变化后请求返回 404。
- **Range。** 支持 `bytes=a-b`、`bytes=a-`、`bytes=-n`，返回 206 与 `Content-Range`；无效或多段范围返回 416；无 Range 时返回 200 与完整长度。浏览器取消请求时销毁底层读流。
- **只读 GET。** 其他方法返回 405；响应带 `Cache-Control: private, no-store` 与 `X-Content-Type-Options: nosniff`。
- **工具栏。** 与图片相同，只有“预览”一个模式。

## 5. 已知限制

- **没有走原生有界读取器。** 文本和图片读取经过 `readBoundedFile`（原生进程，64 MiB 上限、每次最多 128 KiB），那套机制不适合持续播放，且上限低于常见视频。本通路用 Node 直接读：路径来自 `spaceFiles.locate` 的规范化结果，打开前拒绝叶子是链接或非普通文件，打开后核对大小。在“定位”与“打开”之间把叶子换成链接的竞争窗口仍存在，与产出预览（`lexora-artifact`）的读取强度相当，弱于文本读取。
- **格式依赖 Chromium。** `mov` 里的 HEVC/ProRes、`flac`/`m4a` 在不同平台的支持不一致，播放失败时只有通用提示。
- **每个 Range 请求都往返一次服务进程**（`locate`）。拖动进度条时请求较密，未测过长视频下的开销。

## 6. 验证

- 自动化：`mediaFiles.spec.ts`（类型判断、URL 往返与拒绝、Range 解析）、`mediaProtocol.spec.ts`（`serveMediaFile` 的整段、分段、416、空文件、链接叶子）、`ArtifactService.spec.ts`（音视频产出可解析、其他二进制仍拒绝）、`SpaceFileService.spec.ts`（音视频预览不读内容）、`DesktopMediaContent.spec.ts`（播放器与错误提示）。
- `SpaceFileRecovery.spec.ts` 有 6 个用例在本机失败，在未改动的基线上同样失败，与本改动无关。
- 未验证：产出标签页的真实播放；真实 Electron 窗口中的播放与拖动进度条、各平台解码器差异、打包产物、产出卡片进入文件管理器后的音视频。
