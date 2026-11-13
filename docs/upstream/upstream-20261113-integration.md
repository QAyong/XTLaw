# 20261113 上游集成记录

- 分支：`codex/upstream-20261113`
- worktree：`/home/lenovo/code/Lexora-worktrees/upstream-20261113`
- 基线：`8f6e80af67c4dc8d3248e77b118aa5140123eea4`（本地 `master`）
- 检查到：`1c8f1a2648b1ce2a11cec2959e2e619e94020442`
- 本轮范围：检查 `bebb663fbeca6f4d421248b191d97b9b3c076ce4..1c8f1a2648b1ce2a11cec2959e2e619e94020442` 的 19 项。初轮移植三项；后续用户另行批准第 9、11、15 项在同一分支移植，累计移植六项。

## 上游提交处理

1. `670ca0cf6b01079ea39cb2b9cd1a4ff656da8134` → **暂缓**：需单独评估产物查看与任务目录授权的解耦，以及其本地权限边界。
2. `2e6c94fb04f626e0dfcdae0250e590ac88454038` → **本地等价实现** `aff598ca4624a54435a87cdb1965e4f0430e4c8b`：此前空试合并确认本地行为已覆盖。
3. `2cb0e2c9adfeaa8a4eab7b028bd16329782c705e` → **暂缓**：本地推理硬件信息与运行诊断需要单独评估。
4. `dcadb09dc8f7f82e03a110d9efeae6cdfaed1f38` → **本地等价实现** `639cd5dfaa07d8401cfa9f33b69b333b37b24741`：本地作用域样式已按 12/18px 固定加载圆环尺寸处理。
5. `f0228448755d68d5843f2306443bd68db1328ac4` → **本地等价实现** `8f6e80af67c4dc8d3248e77b118aa5140123eea4`。
6. `f065b33613ebdaca3060ec75d08ce602f42694d1` → **本地等价实现** `65dd8d30cb240d3acb01b33d5801d4445141ec35`。
7. `c92e9135c435dd3f3db4a34365c68023f33c571e` → **本地等价实现** `6c104cda19205a8e9137b8cc8fde6556a3437ea9`：此前空试合并确认本地行为已覆盖。
8. `09e58acec8798508fce76e6829295748e09e343a` → **后续独立轮移植** `a3181b75b0605d5b945ebdf56454d2f8c2985dc5`：用户随后批准在 `codex/upstream-20261113-archive` 单独移植，归档直接执行且迁移登记本地 v44；见 [任务归档与永久清理集成记录](upstream-20261113-archive-integration.md)。本记录的六项统计仍对应原轮次，两个分支均尚未合并 master。
9. `355d13ce2dc3534b0bcb9bf1a38e0745e16bd02c` → `7189290e3b2dcf1a2687c4d04e51f6c179944c17`（`-x` 移植并适配）：用户明确决定中文输入法触发符默认开启。保留本地 `d9e250962f5fd4001fedb0fa931cf33ccaad305d` 的既有触发行为和中文标点边界，补设置开关及配置持久化；详见“后续授权移植”。
10. `559dfa73537dc6985c95933a2db951465d269e91` → `bb558a85a6f5fe0b44eeaa5a8bfa5b3f765ba37b`（`-x` 移植）：在 assistant `message_start` 时发布思考期间的上下文用量估算，随后仍以实际输入 token 用量更新。
11. `2173712b07aa6687d8c1921951d0d2449339dc2e` → `ae21a8fd65e164f2f3c7804fb276508642d8e688`（`-x` 移植并适配）：在本地已有错误状态文案、加载状态和重试按钮基础上，补持久错误提示生命周期；失败提示持续，重试转 loading，成功或状态变更清除，卸载清理并忽略迟到错误。
12. `740e0bb27b593a2baeea3e78f50dbe3e2a8212b2` → **暂缓**：依赖任务归档能力，需先处理归档迁移及其本地方案。
13. `cbe1cf39332a4b4ce6fcd13eed3958f39f5d6451` → **暂缓**：依赖任务归档及输入触发开关引导，前置能力未齐。
14. `1c5118ff32a8ba7a6d6a5c8ae882055ad25661b9` → **暂缓**：插件模型能力解析依赖尚未移植的 `19dffae6a` 与 `2cb0e2c9a` 插件推理工作。
15. `67cec89f241c99cd93aaa21903e83ba3e1780068` → `f79f86ad6f57ca480f7977d12818dfc21c72c437`（`-x` 移植并按 XTLaw 数据授权/品牌适配）：补齐 task/branch 可见图片引用列表及授权、保存失败的 retained output 与请求回执；具体适配和验证见下文。
16. `3b3a56a79add0956fb250da8b65dd03a0a118168` → `be0a94e2f818ce66e872883816ef68ab1036b5af`（`-x` 移植并适配 XTLaw）：保留原有菜单与非 macOS 图标路径；新增按 profile 选择 macOS 1x/2x 表示，并以本地正式、开发、测试托盘图替换上游图片。
17. `f5f4110e38ee124d5f936e6fa9f3e4164c8f446e` → **跳过**：纯发版提交，不移植上游版本号或发布版本变更。
18. `770998d4fbbb9eed12bf861dad483cfd4067906b` → **暂缓**：依赖未移植的 `19dffae6a` 与 `2cb0e2c9a` 插件推理实现。
19. `1c8f1a2648b1ce2a11cec2959e2e619e94020442` → `74699d79b1ca9123ecf222e2437df37597c9ba58`（`-x` 移植）：递归打包并验证 `resources/icons/` 下的 PNG，覆盖新增 macOS 子目录。

六个移植提交均保留完整 `(cherry picked from commit <上游完整 SHA>)` 来源行。其余项目按等价实现、部分已有及待办、暂缓、纯发版跳过分别记录；推进基线不表示其余功能都已移植。

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
- 初轮集成记录与基线提交：`97514ad43a687b14d54c248f8cdc6cd32d579a79`；中文输入法后续记录提交：`e3e2c3ed32d410b4fb94c8d780411891b9fae5a0`。云备份与生图适配由本次独立文档提交记录，最终 SHA 见交付报告。
- 最终提交后复核 `git status` 并在交付报告中给出最终工作区状态。
- 未合并 `master`，未推送；按要求保留此 worktree。

## 后续授权移植：中文输入法触发符

- 用户在初轮三个提交及文档提交后，另行授权移植 `355d13ce2dc3534b0bcb9bf1a38e0745e16bd02c`；之后又分别明确授权移植云备份 `2173712b07aa6687d8c1921951d0d2449339dc2e` 与生图 `67cec89f241c99cd93aaa21903e83ba3e1780068`。
- 上游提交 → 本地代码提交：`355d13ce2dc3534b0bcb9bf1a38e0745e16bd02c` → `7189290e3b2dcf1a2687c4d04e51f6c179944c17`。提交标题为英文（中文），保留完整 `-x` 来源行。
- 默认行为：`DEFAULT_DESKTOP_CHAT_PREFERENCES.chineseInputTriggers` 和触发解析 helper 默认值均为 `true`。首次读取没有 `chinese_input_triggers` 字段的旧配置会解码为 `true`，读取不会抢先重写原文件。用户明确保存 `false` 后，配置写入 `chinese_input_triggers = false`，其他设置更新和重启后仍恢复 `false`。
- 开启时保留行首 `、` 命令、`￥` 技能触发及原有中文标点边界；关闭时仅屏蔽 `、`、`￥` 别名，`/`、`$`、`@` 继续工作。设置值以响应式 Ref 传入已打开的 Composer，切换时会立即重新计算当前触发建议；未选建议时原文不被替换。
- 设置 UI 采用本地作用域样式、既有保存错误处理及输入设置分组，原有最小化到托盘等设置保留；配置默认权限模式与品牌未改。
- 定向验证：ConfigStore spec 47 项通过；触发解析、Composer、设置注册三个 unit spec 合计 85 项通过；`NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @uselexora/lexora-buddy type-check` 通过。并行运行时 unit runner 曾打印 localhost:9999 `EADDRINUSE` 提示，串行重跑全部三个 spec 后通过且未再出现该提示。
- 本次未运行 Windows 预览、Playwright E2E、实际打包或 macOS 实机验证。
- 本次代码提交后更新本文档；最终分支 HEAD 与干净状态在交付报告中确认。

## 后续授权移植：云备份加载失败

- 上游提交：`2173712b07aa6687d8c1921951d0d2449339dc2e` → 本地代码提交 `ae21a8fd65e164f2f3c7804fb276508642d8e688`（`Port upstream ...` 标题，保留完整 `-x` 来源行）。
- 本地已有状态错误文案、`loadState` 与重试按钮；本次只新增持久 `MessageReactive` 的生命周期管理。首次加载失败持续显示一条错误消息；重试复用该消息切到 loading，重复失败恢复 error；成功及 `onChanged` 状态到达时清理；卸载销毁消息、取消订阅，并用 `mounted` 忽略请求迟到错误。没有重复引入上游重试 UI，保留本地作用域样式和保存/按钮逻辑。
- 新增 `DesktopSyncSettings.spec.ts` 覆盖失败→重试再次失败→成功、`onChanged` 清除和卸载后迟到错误：3 项通过。

## 后续授权移植：生图引用与失败恢复

- 上游提交：`67cec89f241c99cd93aaa21903e83ba3e1780068` → 本地代码提交 `f79f86ad6f57ca480f7977d12818dfc21c72c437`。提交标题为英文（中文），保留完整 `(cherry picked from commit 67cec89f241c99cd93aaa21903e83ba3e1780068)` 来源行。
- 用户批准范围仅为此生图提交；未引入归档、插件推理、任务目录授权重构、workflow 或版本变更。
- 引用访问在当前分支/任务范围内从已接受的 public snapshot、run inputs/events、execution 和 continuation lineage 收集附件/产物；isolated 子代理受 `contextSourceIds` 限定且不继承未接受父材料或同伴私有结果。`lexora_image_list` 仅列可见引用元数据；真正图像物料化仍走当前 AttachmentService/ArtifactService，并受当前目录授权校验。保留本地 `ArtifactFileAccess` 和读取权限，不采用未批准的撤权后继续读取及敏感路径放行行为。
- 输出路径在发出图像请求前通过 `preflightGeneratedImageOutput` 校验授权、现存目标和父目录，取消信号贯穿预检。成功返回前把经校验的原始 PNG 写入 task-owned scratch，并在请求回执和错误结果保留路径、MIME、大小、SHA256；部分/未知请求会阻止自动重试，避免重复收费。
- 本地差异：ArtifactService 冲突测试中，撤销目录授权后仍允许已交付产物读取及按名字放行 `.env`/`public.pem` 与 XTLaw 权限策略冲突；这些上游行为未移植，对应新增测试改为明确断言撤权后拒绝访问及本地敏感路径拒绝发布。保留并通过上游的“缺失输出父目录在提交前不创建、成功后编号 PNG 正确”测试。
- 生图及关联 runtime 验证：`pnpm --filter @uselexora/lexora-buddy exec vitest run --project=runtime --maxWorkers=2 <本次相关 11 个 spec 路径>`：11 个 spec、152 项测试通过，串行/限 worker 避免并发测试干扰。覆盖引用可见性（accepted snapshot、isolated 子代理、续跑、跨任务隔离）、图像原始材料、请求回执、生成保存/输出授权预检/取消与失败恢复、工具 schema/contract/参数/lifecycle、ArtifactService 和 Composer 边界；未调用真实收费生图 API。
- 原生 helper 首轮失败及恢复：测试最初报告 `spawn .../.output/build/native/x86_64-unknown-linux-gnu/release/lexora-buddy-image-transform ENOENT` 和 `FILE_ENGINE_INTERRUPTED`。检查 `apps/buddy/vitest.setup.ts`、`platform/native/nativeHost.ts` 与 `platform/targets.json` 后确认测试要求按 `x86_64-unknown-linux-gnu` target 子目录放置 helper；先前不带 `--target` 的构建产物位于 `release/`，路径不匹配。随后在 `apps/buddy/` 按 manifest 构建两个测试所需 helper（不是打包）：
  - `cargo build --locked --release --target x86_64-unknown-linux-gnu --target-dir .output/build/native --manifest-path native/Cargo.toml --package lexora-buddy-image-transform --bin lexora-buddy-image-transform`
  - `cargo build --locked --release --target x86_64-unknown-linux-gnu --target-dir .output/build/native --manifest-path native/Cargo.toml --package lexora-buddy-host --bin lexora-buddy-file-reader`
  - 目标产物分别为 `.output/build/native/x86_64-unknown-linux-gnu/release/lexora-buddy-image-transform` 和 `.output/build/native/x86_64-unknown-linux-gnu/release/lexora-buddy-file-reader`。设置匹配后首轮复跑定位出与本地撤权/敏感路径规则冲突的上游新增测试；修改冲突处后，最终 152 项相关测试全部通过。
- Buddy 类型检查：`NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @uselexora/lexora-buddy type-check`：通过。此前中文输入法代码阶段及此次新增生图/云备份代码均用此命令验证。
- 未调用真实收费图像生成 API；未运行 Windows 预览、Playwright E2E、实际打包或 macOS 实机验证。
- 本轮代码提交完整 SHA、最新独立文档提交 SHA、worktree 状态和未合并/未推送信息见交付报告。
