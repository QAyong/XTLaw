# 2026-10-16 上游自动预备

上游检查范围：`ad2a3dd1..3ca97e2e`，共 6 个新提交。

- 已按顺序移植：1 个
- 自动跳过：0 个
- 停下待人工处理：1 个（d4e914d5）
- 停下后未处理：4 个

## 已移植（等你审查）

| 上游提交 | 说明 | 文件数 |
|---|---|---|
| [`7f88940e`](https://github.com/QAyong/XTLaw/commit/7f88940eb902ee5c057297ad64c3e78b8bbb8347) | feat(buddy): 支持备份压缩 | 13 |

## 停在这里，需要人工

[`d4e914d5`](https://github.com/QAyong/XTLaw/commit/d4e914d50e07c2bf053599621bf7685e6c689aec) fix(buddy): 修复插件主题请求与错误诊断

- cherry-pick 冲突 8 个文件
- 冲突文件：.playwright/scripts/__tests__/extensionContributions.e2e.mjs、.playwright/scripts/__tests__/extensionContributions.mjs、apps/buddy/electron/main/extensions/SandboxedExtensionHost.ts、apps/buddy/platform/extensions/ExtensionService.ts、apps/buddy/platform/extensions/__tests__/ExtensionService.spec.ts、apps/buddy/shared/extensions/extensionApi.ts、apps/buddy/shared/theme/themeClient.ts、apps/buddy/src/modules/extensions/widgets/DesktopExtensionFrameHost.vue

后面的提交可能依赖它，所以不再往下自动处理。处理完后更新 `docs/upstream-baseline.json`。

## 停下后未处理（仅预评估，不保证可按序移植）

| 上游提交 | 说明 | 试合并冲突 | 需关注 |
|---|---|---|---|
| [`9372413d`](https://github.com/QAyong/XTLaw/commit/9372413d6e4454949c39fbef241a7e35c694f0ef) | fix(buddy): 修复浏览器元素选取错位 | 3 | — |
| [`cc0ac294`](https://github.com/QAyong/XTLaw/commit/cc0ac2941b910ada3d3a822599e3c15d070cfba9) | fix(buddy): 修复插件媒体资源与主题图片存储 | 18 | — |
| [`86e3b502`](https://github.com/QAyong/XTLaw/commit/86e3b5022377259c3be8ff5c8609946cfadd8cdf) | feat(buddy): 支持网页读取与截图模式 | 0 | — |
| [`3ca97e2e`](https://github.com/QAyong/XTLaw/commit/3ca97e2ede22ada50699e1ce271f48ed19d43149) | feat(buddy): 扩展插件窗口样式与主题材质能力 | 38 | 新增行含 Lexora 字样，需检查品牌：apps/buddy/src/modules/extensions/widgets/DesktopExtensionInstallReview.vue |
