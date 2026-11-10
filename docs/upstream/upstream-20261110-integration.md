# 20261110 上游集成记录

- 分支：`codex/upstream-20261110`
- 基线：`c38297f99a1a600d6de56bbf2b7da452bf9936ac`
- 检查到：`bebb663fbeca6f4d421248b191d97b9b3c076ce4`
- 上轮遗留项复核：`ba96f1979c9fedac6a29d6578ef525a556dfbc58`（侧栏等待回答与执行状态）已在本地 `babdc9ca6424733804e058b0234848d2d29fc739`（合并于 `1122e83d2`）完成本地等价实现，无需重复处理。

## 上游提交处理

1. `1a28f12f5dd07243fa4a29b68d14dc7b2bae30b9` → **跳过**
   - 原因：新增 `packaging/buddy/release/electron-download.mjs` 依赖上轮（`a84e89edf`）已故意排除的 `github-release-download.mjs` 与本地已删除的 `.github/scripts/prepare-test-electron.mjs`，同时涉及 `.github/workflows/buddy-build.yml`、`macos-verify.yml` 及上游多格式发布脚本差异。
2. `2cedc5a2bc7e3fc71425865bc86584635d2f5ff0` → **跳过**
   - 原因：为官网 `LandingDownloadMenu.vue` / `landingDownloads.ts` 增加第三方代理下载弹窗（`LandingDownloadHelp.vue`），依赖本地未移植的上游官网多平台下拉下载菜单组件及 `.playwright/scripts/website/` 测试体系。
3. `bebb663fbeca6f4d421248b191d97b9b3c076ce4` → `809d603fe50b8a6499d04cf45706fa30eb8d44f0`（按本地样式适配移植）
   - 移植聊天视口（`useChatTranscriptViewport.ts`、`BuddyChatTranscriptViewport.vue` 及单测）、执行画布（`useExecutionCanvas.ts`）的 150ms resize 防抖与 `contain: strict` 优化，以及 `useWorkbenchSidebarToggle.ts` 过渡时长调整。
   - 解决 `DesktopChatWorkspace.vue` 与 `WorkbenchLayout.vue` 的本地作用域样式冲突：保留本地类名与作用域 CSS，仅在 `detailVisible` 为真时挂载 `--conversation-detail-width`，并移除 `.desktop-workbench-layout__sidebar` 的 `width` 240ms 过渡（保留 `opacity 100ms ease`）。

## 验证

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @uselexora/lexora-buddy type-check`：通过。
- 相关 spec（仅改动相关文件）：
  - `src/modules/tasks/widgets/transcript/__tests__/useChatTranscriptViewport.spec.ts`：16 个测试通过。
  - `src/workbench/browser/layout/__tests__/useWorkbenchSidebarToggle.spec.ts`：2 个测试通过。
- `git diff --check master..HEAD`：通过。
- 新增行品牌检查：未发现大小写精确的 `Lexora` 品牌字符串。
- 未运行 Windows 预览、Playwright E2E、完整打包。
