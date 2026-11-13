# 20261113 上游集成记录

- 分支：`codex/upstream-20261113`
- worktree：`/home/lenovo/code/Lexora-worktrees/upstream-20261113`
- 基线：`8f6e80af67c4dc8d3248e77b118aa5140123eea4`（本地 `master`）
- 检查到：`1c8f1a2648b1ce2a11cec2959e2e619e94020442`
- 本轮范围：检查 `bebb663fbeca6f4d421248b191d97b9b3c076ce4..1c8f1a2648b1ce2a11cec2959e2e619e94020442` 的 19 项；仅移植维护者批准的三项。

## 上游提交处理

1. `670ca0cf6b01079ea39cb2b9cd1a4ff656da8134` → **暂缓**：需单独评估产物查看与任务目录授权的解耦，以及其本地权限边界。
2. `2e6c94fb04f626e0dfcdae0250e590ac88454038` → **本地等价实现** `aff598ca4624a54435a87cdb1965e4f0430e4c8b`：此前空试合并确认本地行为已覆盖。
3. `2cb0e2c9adfeaa8a4eab7b028bd16329782c705e` → **暂缓**：本地推理硬件信息与运行诊断需要单独评估。
4. `dcadb09dc8f7f82e03a110d9efeae6cdfaed1f38` → **本地等价实现** `639cd5dfaa07d8401cfa9f33b69b333b37b24741`：本地作用域样式已按 12/18px 固定加载圆环尺寸处理。
5. `f0228448755d68d5843f2306443bd68db1328ac4` → **本地等价实现** `8f6e80af67c4dc8d3248e77b118aa5140123eea4`。
6. `f065b33613ebdaca3060ec75d08ce602f42694d1` → **本地等价实现** `65dd8d30cb240d3acb01b33d5801d4445141ec35`。
7. `c92e9135c435dd3f3db4a34365c68023f33c571e` → **本地等价实现** `6c104cda19205a8e9137b8cc8fde6556a3437ea9`：此前空试合并确认本地行为已覆盖。
8. `09e58acec8798508fce76e6829295748e09e343a` → **暂缓**：新增 v42 迁移且涉及约 150 个文件，按大功能单独评估。
9. `355d13ce2dc3534b0bcb9bf1a38e0745e16bd02c` → **部分已有，待办**：本地 `d9e250962f5fd4001fedb0fa931cf33ccaad305d` 已覆盖部分输入法触发行为；新增触发开关尚缺。
10. `559dfa73537dc6985c95933a2db951465d269e91` → `bb558a85a6f5fe0b44eeaa5a8bfa5b3f765ba37b`（`-x` 移植）：在 assistant `message_start` 时发布思考期间的上下文用量估算，随后仍以实际输入 token 用量更新。
11. `2173712b07aa6687d8c1921951d0d2449339dc2e` → **部分已有，待办**：本地 `f130f312d313a5f4cdb09c376cc65d7e8fba7f71` 已有部分云备份加载失败恢复；状态逻辑仍待补齐。
12. `740e0bb27b593a2baeea3e78f50dbe3e2a8212b2` → **暂缓**：依赖任务归档能力，需先处理归档迁移及其本地方案。
13. `cbe1cf39332a4b4ce6fcd13eed3958f39f5d6451` → **暂缓**：依赖任务归档及输入触发开关引导，前置能力未齐。
14. `1c5118ff32a8ba7a6d6a5c8ae882055ad25661b9` → **暂缓**：插件模型能力解析依赖尚未移植的 `19dffae6a` 与 `2cb0e2c9a` 插件推理工作。
15. `67cec89f241c99cd93aaa21903e83ba3e1780068` → **暂缓**：生图引用与保存失败恢复需另行评估。
16. `3b3a56a79add0956fb250da8b65dd03a0a118168` → `be0a94e2f818ce66e872883816ef68ab1036b5af`（`-x` 移植并适配 XTLaw）：保留原有菜单与非 macOS 图标路径；新增按 profile 选择 macOS 1x/2x 表示，并以本地正式、开发、测试托盘图替换上游图片。
17. `f5f4110e38ee124d5f936e6fa9f3e4164c8f446e` → **跳过**：纯发版提交，不移植上游版本号或发布版本变更。
18. `770998d4fbbb9eed12bf861dad483cfd4067906b` → **暂缓**：依赖未移植的 `19dffae6a` 与 `2cb0e2c9a` 插件推理实现。
19. `1c8f1a2648b1ce2a11cec2959e2e619e94020442` → `74699d79b1ca9123ecf222e2437df37597c9ba58`（`-x` 移植）：递归打包并验证 `resources/icons/` 下的 PNG，覆盖新增 macOS 子目录。

前三个移植提交的说明均保留完整 `(cherry picked from commit <上游完整 SHA>)` 来源行。其余项目按等价实现、部分已有及待办、暂缓、纯发版跳过分别记录；推进基线不表示其余功能都已移植。

## XTLaw macOS 托盘图标适配

- 源素材：`apps/buddy/resources/icons/tray-icon.png`、`tray-icon-dev.png`、`tray-icon-test.png`；均为本地 XTLaw 的 256×256、8-bit RGBA PNG。按稳定、development、test 对应替换上游新增的六张 macOS 图片，没有使用上游品牌图或生成式图像工具。
- 输出：`apps/buddy/resources/icons/macos/tray-icon*.png`，未带后缀为 16×16（1x），`@2x` 为 32×32（2x），全部为 RGBA PNG。
- 缩放方法：使用本机 Python 标准库脚本读取 PNG（解码 PNG 行过滤器），以 premultiplied-alpha 空间执行可分离 Lanczos-3 缩小，再编码 RGBA PNG。未安装 Pillow 或其他图像依赖。Alpha 通道保留并用于边缘抗锯齿。
- Alpha 检查：原始图 alpha 范围为 0–255；六张输出也均为 0–255。输出 alpha 非零像素占比：16×16 为 96.5%–96.9%，32×32 为 94.1%–94.2%，圆角轮廓仍保有透明像素。
- 可视检查：把三张原始图与全部六张输出一起比较。X/T 白色字形、蓝色上勾及开发版 `D`、测试版 `T` 标记均保留；16×16 下轮廓与标记仍可辨，32×32 边缘更细。未观察到颜色晕边或不透明底色替换；缩小后的边缘有正常的 alpha 抗锯齿。
- 实现检查：`createDesktopTrayImage` 在 macOS 通过 `addRepresentation` 注册 scaleFactor 1 和 2，并按 `BuddyRuntimeProfile` 选择图；非 macOS 仍通过 `nativeImage.createFromPath(iconPath)` 使用调用方原路径。`DesktopIntegrations` 传入 `paths.profile`。本地托盘的打开、重启、退出菜单及回调未改动。

## 验证

- 工具链：Node `v26.12.1`、pnpm `12.5.1`、Cargo `1.99.1` 可用；worktree 起初无 `node_modules`。`pnpm install --frozen-lockfile` 成功，锁文件未变。安装时 Prisma 提示当前 Node 版本不在其支持列表内；安装仍成功，下面实际类型检查通过。
- `pnpm --filter @uselexora/lexora-buddy exec vitest run --project=runtime electron/main/trayIcon.spec.ts service/src/agent/events/__tests__/PiEventBridge.spec.ts`：通过，2 个 spec 文件、12 项测试通过（托盘图标 4 项，PiEventBridge 8 项）。
- `pnpm --filter @uselexora/lexora-buddy type-check`：首次在 Node 默认约 2 GB 堆上限发生 OOM，退出码 134；查看 WSL 可用内存约 9.0 GiB 后，以 `NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @uselexora/lexora-buddy type-check` 重跑通过。
- `node --check apps/buddy/electron-builder.config.cjs` 与 `node --check packaging/buddy/release/verify-package.mjs`：通过。
- 未运行 macOS 实机验证、Windows 预览、Playwright E2E 或打包。

## 提交与状态

- 第 1 项：`559dfa73537dc6985c95933a2db951465d269e91` → `bb558a85a6f5fe0b44eeaa5a8bfa5b3f765ba37b`
- 第 2 项：`3b3a56a79add0956fb250da8b65dd03a0a118168` → `be0a94e2f818ce66e872883816ef68ab1036b5af`
- 第 3 项：`1c8f1a2648b1ce2a11cec2959e2e619e94020442` → `74699d79b1ca9123ecf222e2437df37597c9ba58`
- 独立集成记录与基线文档作为第四个本地提交；该提交完整 SHA 在最终交付报告中给出。
- 文档提交后复核 `git status` 并在最终交付报告中给出最终工作区状态。
- 未合并 `master`，未推送；按要求保留此 worktree。
