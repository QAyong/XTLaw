# 上游集成记录：2026-10-30

区间是 `85faae2df..b31b0ed3d` 的 5 个提交（`85faae2df` 是上一轮的基线）。分支 `codex/upstream-20261030`，基于 `origin/master`，用 `git cherry-pick -x`。

本轮只做下载代理（上游 #479、#488 及维护者追加提交）；语音和图像/OCR 两个大功能单独成轮，见“暂缓”。

## 已移植

| 上游提交 | 本地提交 | 内容 |
| --- | --- | --- |
| `919caef9a`（#488） | `3752745da` | 下载代理：设置 → 网络代理新增“下载代理”列表（添加、编辑、删除、启停、上下移动，总开关），更新包和插件包下载按顺序试已启用的代理，最后回落到 GitHub 原地址。新增共用的 `downloadBytes`（重定向、超时、错误分类） |
| `b31b0ed3d` | `80ceb206f` | 代理页拆成“应用连接”和“下载代理”两块，补顺序提示、暂停提示和窄屏布局 |

## 跳过

`be832d45f`（#479，更新包下载优先走 GitHub 镜像）：本地已有等价提交 `44bf15695`，且结果被 `919caef9a` 覆盖。

## 暂缓（不移植，本轮不做）

- `c2c3978a9`（语音输入与回复朗读）：137 个文件、+3701/−154，含迁移 v37，模拟 cherry-pick 在 12 个文件里冲突。新增行里有 `NSMicrophoneUsageDescription: 'Lexora uses the microphone…'`，要改为 XTLaw；还改了 `electron-builder.config.cjs` 和 `packaging/buddy/macos`，Windows 和 macOS 打包在 WSL 里验证不了。
- `9d3fd48dd`（图像增强与 OCR 服务）：85 个文件、+2812/−143，含迁移 v38，模拟 cherry-pick 在 20 个文件里冲突。它与 `c2c3978a9` 共同修改 24 个文件（`schema.ts`、`DesktopIntegrations.ts`、`LexoraConfigStore.ts`、模型相关的文件等），必须排在 `c2c3978a9` 之后。
- 迁移编号：本地没有上游 v36（`ExtensionCapabilities`，`80b38d769` 已决定不移植），本地 `BUDDY_SCHEMA_VERSION` 是 37（上游 v35 登记为 37）。按“上游编号 + 2”，v37、v38 应登记为本地 39、40，本地 38 空着；两个迁移只改 `provider_model_states`，不依赖 v36 的表，但上游测试把 `user_version = 36` 当作前置版本，移植时要改写。编号由用户在对应一轮决定，本轮没有动。

## 决定

- 下载代理默认开启（跟上游）：`downloads.enabled = true`，默认带 `ghfast.top`、`gh-proxy.com`、`gh.monlor.com` 三个。本地 0.4.2 里“下载镜像默认不开启”（`f8415b380`）的行为随之改变。
- 旧设置 `proxy.downloadMirror` 不迁移：0.4.2 会把它（默认 `off`）写进配置文件，而上游的 `proxySettingsSchema` 是 `.strict()`，不处理会让升级后的配置读不出来。`LexoraConfigStore.ts` 的 `decodeConfig` 在解析前删掉该键，下次保存时文件里就不再有它；`LexoraConfigStore.spec.ts` 有对应用例。

## 冲突解决

`919caef9a`（16 处）：
- `downloadMirrors.ts` 及其 spec：采用上游的 `downloadRoutes(url, settings)`，本地的 `mode` 版本和 `DOWNLOAD_MIRRORS` 常量删除。
- `proxySettings.ts`：删除 `downloadMirror`、`DOWNLOAD_MIRROR_HOSTS`、`DownloadMirrorMode`、`ProxyConnectionSettings`；`DesktopNetwork.ts`、`OutboundProxy.ts` 恢复为上游的 `ProxySettings` 写法。
- `productLinks.ts`：只删除 `RELEASE_DOWNLOAD_MIRRORS`，保留 `xtlaw-v` 发布标签、`releaseTagUrl`、`releaseDownloadUrl`、官网链接。
- `DesktopUpdatePackage.ts`：下载循环换成 `downloadBytes`，保留本地的发布标签判断和链接校验。
- `ExtensionCatalogService.ts`：把下载部分换成 `#downloadVerified`（`downloadBytes` + 逐路由校验大小和 sha256，被改动的包会换下一条路由），删除 `#fetchVerified`；保留内置目录、能力包（packs）、`lexora.water-reminder` 排除和 `catalogUrl`。构造参数仍是本地的 options 形式，用 `getDownloadSettings` 代替 `downloadMirror`；没有采用上游的 checksum 注入参数（本地没有 `processPackage({ kind: 'hash' })`），沿用同步 `sha256`。
- `ExtensionService.ts`、`registerExtensionIpc.ts`、`DesktopIntegrations.ts`、`registerDesktopUpdates.ts`、`DesktopUpdateDelivery.ts`：`downloadMirror` 换成 `getDownloadSettings`，保留本地的 `bundled` 等选项。
- `DesktopProxySettings.vue`：去掉镜像下拉及相关样式，接入 `DesktopDownloadProxySettings`。
- i18n：去掉 `desktop.settings.proxy.mirror*` 文案，加入 `desktop.settings.downloads.*`。
- 测试：`LexoraConfigStore.spec.ts` 的 `createConfigStore` 支持预置内容；`ExtensionCatalogService.spec.ts` 保留本地的 `QAyong/xtlaw-market` 地址、packs 和水提醒用例；`DesktopUpdateDelivery.spec.ts`、`DesktopUpdatePackage.spec.ts`、`settingsFeedback.spec.ts` 去掉 `mirror` / `downloadMirror`。
- `.playwright/scripts/__tests__/settings-controls.e2e.mjs`：本地从未有过这个文件（移植 `0e3ff0b3` 时没带），所以上游新增的“下载代理”E2E 用例没有移植，两个提交都不带它。

`b31b0ed3d`（2 处）：
- `DesktopProxySettings.vue`：本地原是作用域样式，现采用上游的 UnoCSS 写法（该文件原本与上游同源，差异只有镜像下拉）；`DesktopDownloadProxy*` 三个组件也是上游的 UnoCSS 类名，保持原样。
- `uno.config.ts`：补 `shadow-soft`（`boxShadow.soft`），指向本地已有的 `--buddy-shadow-soft`；其他类名（`bg-subtle`、`bg-surface`、`text-muted`、`text-fg`、`text-danger`、`border-border`）本地已有。
- E2E 同上，不带。

## 检查

- 迁移：无；依赖：无；Rust：无；`.github/workflows`：未改。
- 品牌：新增行里的 “Lexora” 是类型名 `LexoraConfig`、`LexoraConfigStore` 和 `isLexoraReleaseUrl`；`downloadBytes.spec.ts` 里有测试用的 `github.com/useLexora/Lexora/...` 地址，仅作测试数据。用户可见文案没有 “Lexora”。
- WSL 本机：`vue-tsc -b` 通过（需 `NODE_OPTIONS=--max-old-space-size=8192`，默认堆会 OOM）；`platform/network`、`shared/network`、`electron/main/updates`、`electron/main/config`、`ExtensionCatalogService.spec.ts`、`src/modules/settings` 相关 spec 通过（18 个文件、144 个用例；设置模块 30 个文件、118 个用例）；改动文件 eslint 通过。
- 未跑：Playwright E2E、开发预览、打包；设置页“下载代理”的真实窗口表现；真实网络下代理失败后回落到 GitHub 的流程；0.4.2 实际配置文件升级后的读取（只有单元测试覆盖）。
- 默认开启后，所有用户的更新包和插件包下载会先走第三方代理（大小与 sha256 仍以 GitHub 官方响应为准，代理替换文件会校验失败并换下一条路由）。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `b31b0ed3d`。`c2c3978a9` 和 `9d3fd48dd` 记为“暂缓”，不是跳过，下一轮从这两个开始。
