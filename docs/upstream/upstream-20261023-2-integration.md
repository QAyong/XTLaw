# 上游集成记录：2026-10-23（第二轮）

只移植 `8dea569f3` 一个提交，分支 `codex/upstream-20261023-2`，用 `git cherry-pick -x`。上一轮见 [upstream-20261023-integration.md](upstream-20261023-integration.md)。区间 `a378eb8ae..f5aa11ed1` 的另外 3 个提交本轮未处理，见下。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `8dea569f3` | 修复 Shell 执行模式与声明不一致：`ToolDisclosure`、`SessionToolCapabilities`、`toolCatalog`、`toolDiscoveryExtension`、`createBuddySessionExtensions`、`shellCapability` 随权限模式更新 Shell 工具的 schema 和提示（full access 时去掉 `readOnly`），会话恢复后保持一致；新增 `shellExecutionContract.spec.ts` 和一个 `toolScopeSession.spec.ts` 用例 |

### 冲突解决（1 处）

- **`toolScopeSession.spec.ts`：** 一行 codemode 断言，本地用 `currentPlatform.shell`，上游用 `getPiShellToolName(process.platform)`。后者内部就是 `resolveBuddyPlatform(platform).shell`，两者等价；采用上游写法，并删除因此不再使用的 `currentPlatform` 导入。

## 检查

- 迁移：无。依赖：无变更。Rust：无。品牌：新增行里没有 “Lexora” 文案（`lexora_shell`、`lexora_host_shell` 是工具名）。
- `service/src/agent/extensions/discovery` 与 `shellExecutionContract.spec.ts` 共 6 个文件：54 通过、1 跳过（仅 Linux 的用例）；`vue-tsc -b` 通过（本机 Windows）。
- 未跑：仅 Linux 的那个用例，以及真实 Shell 沙箱下的行为。

## 本轮未处理的上游提交

| 上游提交 | 状态 |
| --- | --- |
| `a4b72c02f`（#444，厂商深浅主题图标） | 建议跳过：本地 `1ef83f972` 已有等价实现（图标资源、`ProviderIcon.vue`、`providerIcons.ts`、许可证文件与上游一致；触发器已并入本地的 `DesktopModelSelector.vue`）。上游合并内容与 PR 分支一致，维护者未追加改动 |
| `2d630ea4e`（插件附带技能） | 依赖插件三连，新增依赖 `yaml 2.9.0`，三连合并后再做 |
| `f5aa11ed1`（#445，长用户消息五行折叠） | 待移植，本地没有该功能；上游合并内容与 PR 分支一致 |

## 基线

`docs/upstream-baseline.json` 不变（`bfb0bb696`）：它前面还有插件三连（`b6896babc`、`16777975e`、`a378eb8ae`）没有决定，基线不能越过它们。
