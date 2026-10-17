# 上游集成记录：2026-10-17

分支：`codex/upstream-20261017`（基于机器人分支 `codex/upstream-auto-660506cb`，该分支已含 c249ed7c、660506cb）。

检查范围：机器人停下的 `4a0ab562` 到 `upstream/master`（`792a30ac`）。

## 已移植

| 上游提交 | 说明 | 处理 |
|---|---|---|
| `4a0ab562` | 支持 Mermaid 图表 | 新增依赖 `mermaid ^12.2.0`；锁文件冲突用 `pnpm install` 重新生成 |
| `248f8b5b` | 修复 Windows 大文件测试超时 | 无冲突 |
| `02af8afb` | 修复推理与回复顺序 | 测试文件冲突：保留本地版本，给推理节点补 `messageId: 'reply'` |
| `4d5a26d7` | 修复 HTTP 链接无法打开 | 无冲突 |
| `20eabddd` | 修复引用菜单长标题溢出与 Monaco 右键菜单直角 | 我提交的上游 PR，合并内容与 PR 分支一致；以上游版本替换本地 `d1162cfb`、`4a75aaec`，并删除 `ResourceSelectionQuoteMenu.vue` 中重复的样式块 |
| `792a30ac` | 插件文本生成被长度上限截断时返回独立错误码 | 我提交的上游 PR；保留本地截断保护，补上 `code` 属性、`extensionApi.ts` 错误码校验；上游测试替换同名测试文件，本地路由会话标识测试移到 `extensionModelCapabilitiesRequestContext.spec.ts` |

## 跳过

| 上游提交 | 原因 |
|---|---|
| `c242d689` | 只改版本号的发版提交，XTLaw 不照搬上游版本号 |
| `f7794178` | 简化上游 Issue 模板；含 `Lexora` 字样和上游安全公告链接，XTLaw 使用自己的模板 |

## 延后（单独成轮）

| 上游提交 | 原因 |
|---|---|
| `0223ed89` | 插件社区首次迁移：1246 个文件（约 1150 个是 `legacy/web-stack` 改名），含新迁移 `20261016000000_community` 和 `.github/workflows` 改动，不涉及 `apps/buddy`；新增行含 `Lexora` 字样。其余提交与它没有文件依赖 |

## 检查

- 品牌：已移植提交的新增行不含 `Lexora` 字样。
- 类型检查：`pnpm type-check`（apps/buddy）通过。
- 相关测试：extensionModelCapabilities、navigationPolicy、BuddyChatActivities、transcript 模型共 16 个文件、203 个用例通过。
- 未跑全量测试；机器人 PR #9 的 `Workspace checks` 失败（`DesktopWindowHost`、`requestThroughHost` 共 6 个用例）尚未查清，合并前需处理。
