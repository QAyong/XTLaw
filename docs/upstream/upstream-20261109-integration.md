# 20261109 上游集成记录

- 分支：`codex/upstream-20261109`
- 基线：`8229e0db07bb908e57fb6407d0cb158d46c5cf4a`
- 检查到：`c38297f99a1a600d6de56bbf2b7da452bf9936ac`
- 按上游提交顺序逐项处理；五个产品移植各自对应一个本地提交，均保留完整 cherry-pick 来源行。

## 上游提交处理

1. `a84e89edfe9856ae45b626fb2b9388d30d8e75ef` → `87feeff5f305954e60430a370df5d102707cfdc5`（部分移植）
   - 移植 task capability、对话/视口及相关单测，以及 `CredentialVault.spec.ts`、`StorageBackupService.spec.ts` 和 `fileConsumers.spec.ts` 的 Electron 宿主隔离。
   - 故意排除 `.github/workflows/ci.yml`；`packaging/buddy/release/github-release-download.mjs` 及其测试；`search-tools.mjs`、`shell-sandbox.mjs` 对下载器的调用改动；以及 `.playwright/scripts/__tests__/transcript-history.e2e.mjs`。这些文件均未进入本地提交。
2. `dfc6a79e39b61597fcda59acb0f4da01071d7478` → `ad9af298f1e6c19e4e01c8e6d1b5e605579a23f6`（完整移植）
   - Agnes 图像协议兼容。
3. `22ee9fc552c673af1d0c366eff2eb6cda0bb7429` → **跳过**
   - CI 拆分；包含 workflow 改动及仅服务于上游推理冒烟测试的 `vite.config.ts` 改动，不属于本轮产品修复。
4. `c51edc0a5f642a1afa97147e065200ac163aae84` → `e58dcd118915d62fd22090599947eb5556e1a008`（完整移植）
   - 修复浏览器慢加载被误判为无响应；本地浏览器定制保留。
5. `3f7451be804c909e89e0ff0448322744d766fc7b` → `9b5d05102c005fdf5904ac63e84283b45c51a0f2`（部分移植）
   - 仅移植 `chatTranscriptEstimates.ts`、`useChatTranscriptViewport.ts` 及其单测。
   - 故意排除 `.playwright/scripts/__tests__/transcript-history.e2e.mjs`，未恢复或新增该文件；新增测试夹具中的 `buddyName` 使用“晓晓”。
6. `ba96f1979c9fedac6a29d6578ef525a556dfbc58` → **待办，下一轮必须重新评估**
   - 侧栏等待/执行状态。本地已删除 `DesktopTaskHistoryList.vue`，任务列表为本地定制，不在本轮移植。
7. `8d7411447892fd61764f9566f66c7ef8d9d980ba` → `fa3ee9f0154edd35e8f2bf8ef71efe695b7bbec9`（后续分支移植，不在本分支）
   - Pi 1.4.0 升至 1.5.0 已在 `codex/upstream-pi-1.5.0` 移植。详见 `docs/upstream/upstream-20261109-pi-integration.md`。不要因为本记录原来写了待办而再移植一次。
8. `eb2d36d5091f70e367d80440f6be9bab3416ed04` → `4a6ff639b45bd5e64ffa8119346263323fd68910`（按本地代码适配移植）
   - 将宿主响应能力改为独立 heartbeat 探测，不用请求耗时判断插件故障；在冲突文件中保留本地已有方法，并补入响应/生命周期相关测试。仅带入 `plugin-creator/references/lifecycle.md` 对应说明。
9. `c38297f99a1a600d6de56bbf2b7da452bf9936ac` → **跳过**
   - 仅将版本改为 `v0.21.0`；本地版本为 `0.5.4`，未照搬上游版本号。

## 验证

- `pnpm install --frozen-lockfile`：成功；lockfile 已是最新，从本地 store 链接依赖。安装输出提示 Prisma 当前版本声明支持 Node.js 20.19+/22.12+/24+，但安装与后续验证均完成。`package.json`、`pnpm-lock.yaml`、patch 均无工作区改动。
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @uselexora/lexora-buddy type-check`：通过。
- 相关 spec（仅改动相关文件，不跑全量）：
  - unit：`useTaskCapability.spec.ts`、`useChatTranscriptViewport.spec.ts`、`useChatViewport.spec.ts`、`extensionRequestLifecycle.spec.ts`；4 个文件、100 个测试通过。
  - runtime：`CredentialVault.spec.ts`、`StorageBackupService.spec.ts`、`BrowserHost.spec.ts`、`SandboxedExtensionHost.spec.ts`、`ProviderImageService.spec.ts`；5 个文件、108 个测试通过。
  - platform：`fileConsumers.spec.ts`、`ExtensionResourceReadBytes.spec.ts`；2 个文件、72 个测试通过。
  - 合计 11 个文件、280 个测试通过。`useTaskCapability.spec.ts` 输出 Vue `onScopeDispose()` 警告，但测试全部通过。
- `git diff --check master..HEAD`：通过。
- 新增行品牌检查：未发现大小写精确的 `Lexora` 品牌字符串；默认智能体夹具保持为“晓晓”。
- 未运行 Windows 预览、Playwright E2E、完整打包。
