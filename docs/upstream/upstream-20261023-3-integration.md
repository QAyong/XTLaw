# 上游集成记录：2026-10-23（第三轮）

区间 `a378eb8ae..f5aa11ed1`（插件三连已由 #32 合并，基线在 `a378eb8ae`）。分支 `codex/upstream-20261023-3` 基于合并了 `origin/master` 的本地 `master`，用 `git cherry-pick -x`。上一轮见 [upstream-20261023-2-integration.md](upstream-20261023-2-integration.md)。

## 本区间 4 个提交的结论

| 上游提交 | 结论 |
| --- | --- |
| `8dea569f3` 修复 Shell 执行模式与声明不一致 | 已在上一轮移植（`f4cc8437c`） |
| `a4b72c02f`（#444）厂商深浅主题图标 | **跳过**：本地 `1ef83f972` 已有等价实现（图标资源、`ProviderIcon.vue`、`providerIcons.ts`、许可证文件与上游一致；触发器已并入本地的 `DesktopModelSelector.vue`）。上游合并内容与 PR 分支一致，维护者未追加改动 |
| `2d630ea4e` 支持插件附带技能 | **暂缓**，见下 |
| `f5aa11ed1`（#445）长用户消息默认五行折叠与展开 | **已移植**，见下 |

## 已移植：`f5aa11ed1`

新增 `BuddyChatUserBubble.vue`（含展开/收起）及其测试，`BuddyChatMessageContent.vue` 的用户消息气泡改用它，补中英文案。上游合并内容与 PR 分支（`codex/user-message-folding`）一致，维护者未追加改动。

### 冲突解决（1 处）

- **`BuddyChatMessageContent.spec.ts`：** 本地测试按渲染出的 HTML 断言（`parseHtml(html)`、`data-material-key`），上游按 DOM 断言（`document`、`.buddy-chat-message-content__attachment`）。保留本地断言，把上游对气泡的断言改写成等价形式：用户文本落在 `.buddy-chat-user-bubble__body` 里，且材料条不在气泡内。
- 主检出里原有未提交的同名改动（`chat.ts`、`BuddyChatMessageContent.vue`、两个测试和 `BuddyChatUserBubble.vue`）与移植结果逐文件对比一致，已存入 stash 后随移植提交取代并删除。

## 暂缓：`2d630ea4e`（插件附带技能）

试移植时有 14 个文件、29 处冲突，已中止，没有提交任何内容。主要原因不是文本冲突，而是技能服务的基础不同：

- 上游 `SkillService` 的 `#sources` 缓存来自 `d53682a9d`（#257，加快 Skills 设置页加载），本地没有这套，而是用 `c54923f02`（设置页 Skills 列表仅读取 SKILL.md）另行实现。`2d630ea4e` 在 `#sources` 之上改了 `#assertCurrent`、`dispose`、缓存失效和技能管理校验，本地没有对应位置。
- 本地还有 `developerToolsEnabled`（`0cc69e858`，允许覆盖内置技能），上游没有，与新增的 `pluginSkills` 选项在同一处构造参数里。
- 涉及的界面文件（`DesktopSkillDetail.vue`、`DesktopSkillFiles.vue`、`DesktopSkillRow.vue`、`ChatComposerSourcePicker.vue`、两份 `skills.ts` 文案）同样有本地改动。
- 新增依赖 `yaml 2.9.0`，需要确认并执行 `pnpm install`。
- 无迁移、无 Rust。

可选做法见本轮汇报：补回 #257 的 `#sources` 再移植、直接把插件技能适配到本地的加载方式，或推迟到 Office 插件真有技能要附带时。

## 检查

- 迁移：无。依赖：本轮提交无变更（`2d630ea4e` 暂缓）。Rust：无。品牌：新增行里没有 “Lexora” 文案。
- `src/modules/tasks/widgets/transcript` 下 8 个测试文件共 59 个用例通过；`vue-tsc -b` 通过（本机 Windows）。

## 基线

`docs/upstream-baseline.json` 不变（`a378eb8ae`）：`2d630ea4e` 还没有结论，基线不能越过它。
