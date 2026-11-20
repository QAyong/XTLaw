# 2026-11-20 上游浏览器修复集成

- 集成分支 `codex/upstream-20261120-browser`
- 本地起点 `77ee35573079c8340208fb6e33be970cecea90a6`
- 上游 `392f814bd9607fedda57fc381ebc3cea4ef788de` → 本地 `f4c3d63dde6984e68bb3f5689d7f6204521ad472`，保留 cherry-pick 来源。

前台打开先按会话与执行者准备浏览器页面并展示资源面板，再开始导航。用户在加载中关闭面板后，导航完成时面板保持关闭。展示失败通过 XTLaw 的现有宿主 RPC 上报，工具返回 `CONTEXT_PANEL_UNAVAILABLE`。宿主撤回尚在等待的子资源授权时，已完成的导航继续成功。实际授权拒绝和整次操作取消仍会传递。

子代理适配了 XTLaw 的浏览器宿主、服务 RPC 和模型可见描述。CI、依赖和服务拓扑保持本地版本。此次仅处理 `392f814b`，因此 `lastChecked` 仍为 `ea0435c3fba15180be6fa3802eaaebe858657867`，后续可以继续处理同一区间的其余提交。

## 验证

- 移植前用上游新增的 3 条回归用例复现问题。
- 移植后在 WSL 的 Buddy 项目配置下通过 34 个相关 Vitest 文件，共 399 条用例，包含上述 3 条回归。
- `NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @uselexora/lexora-buddy type-check` 通过。
- Windows 桌面预览、Playwright E2E、打包及安装包验证未跑。
