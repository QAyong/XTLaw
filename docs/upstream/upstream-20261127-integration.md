# 2026-11-27 上游 Pi、桌面首屏与 MCP 修复

- 集成分支 `codex/upstream-20261127`，本地起点 `fc0fcba3c453562182bff6e8bb94799673e99660`。
- 上游范围 `6149e1315d21e916b525bafbc9e334c0bc52e286..383808ed07d417544e3377ca6fc87faf299b0e8f`，共 14 个提交。按确认范围移植 3 个。
- 连续基线 `lastChecked` 保留为 `ea0435c3fba15180be6fa3802eaaebe858657867`。前一轮的记录仍有未逐项定案的旧区间。

| 上游提交 | 本地处理 |
| --- | --- |
| `8f5ade53` | 本轮跳过。配对设备详情、下载入口和设备信息迁移服务于此前暂缓的 Android 连接功能。 |
| `2275cbee` | 本轮跳过。上游插件推理启动目录和诊断所改的运行模块尚未引入 XTLaw。 |
| `05faff45` | 本轮跳过。Android 下载和断点续传依赖移动端文件协议。 |
| `35c7d483` | 本轮跳过。Android 输入区状态和耗时。 |
| `9ba7d2be` | 本轮跳过。Android 分支恢复及图标。 |
| `151008ba` | 本轮跳过。Android 后台连接与通知。 |
| `af5c277a` | 本轮跳过。移动端文案。 |
| `4bf4430a` | 本轮跳过。上游独立服务安装校验、旧运行历史迁移及 Android 通知跳转。 |
| `84228fae` | 本轮跳过。上游原生服务启动和 Android APK 安装。XTLaw 服务由 Electron utility process 启动。 |
| `125335fa` | 暂缓。Windows 凭据加密及 Chromium 数据迁移需要用旧版数据单独验证。 |
| `3bac9f93` | `f6dcf021a72acbaa940ff06663153d88cd9b5f00`。Pi 升至 1.6.1，`undici` 升至 8.12.4。沿用 Electron 对 Pi 包的外置方式，增加 WASM 和图片缩放 worker 的运行检查与 ASAR 校验。 |
| `a9da7010` | `83de5ad355af318e2dcddf89e6e9593676478fc7`。移植桌面逻辑及回归。首屏等待当前会话的首批事件，仅读快照的调用仍可提前返回。 |
| `c8b11d4b` | 本轮跳过。Android 初始皮肤。 |
| `383808ed` | `6900ec701b4666c04c47647992999fdca60e34f9`。过期 HTTP 会话在列出工具时最多自动重建一次。工具调用失败只报告，不重放。本地通知观察者过滤诊断事件，避免触发额外刷新。 |

## 验证

- WSL 下 `pnpm install`、Buddy 全量类型检查、改动文件 ESLint 和 `git diff --check` 通过。
- MCP、诊断和桌面首屏共 17 个定向测试文件、140 条用例通过。Pi 工具验证、会话工具能力和 Codemode 共 3 个定向测试文件、41 条用例通过。
- WSL 下 Electron Vite 构建和 bundle 校验通过。Pi 冒烟实际执行 Codemode WASM 和图片缩放 worker。Linux Debian 桌面包生成并通过 ASAR 校验，归档内包含 Pi 1.6.1、QuickJS 和 Photon WASM 以及图片缩放模块和 worker。
- Windows 独立克隆工作区干净。冻结锁文件安装、Pi 运行检查、Electron Vite 构建、bundle 校验和 Windows x64 解包版构建通过。首次 ASAR 校验发现 Windows 条目路径需要原生分隔符。修复后的 `6900ec701b4666c04c47647992999fdca60e34f9` 只变更校验脚本，用它复查同一解包产物通过。
- 未运行 Windows NSIS 安装、Playwright E2E 或全量测试。
