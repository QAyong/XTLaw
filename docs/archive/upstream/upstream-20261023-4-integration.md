# 上游集成记录：2026-10-23（第四轮）

补回 #257 的上游最终版本，再移植 `2d630ea4e`（插件附带技能）。分支 `codex/upstream-20261023-4`，用 `git cherry-pick -x`。计划见 [upstream-20261023-3-integration.md](upstream-20261023-3-integration.md) 的“下一轮计划”。

## 已移植

| 上游提交 | 内容与整合方式 |
| --- | --- |
| `d53682a9d`（#257） | 补回维护者在合并前追加的改动（#257 提交于 10-09 22:03，维护者 10-10 上午追加两个提交后合并）：新增 `SkillSourceCache`（带文件监听的来源缓存）、`SkillPackageCache`/`skillFiles`/`SkillInspector`/`SkillService` 改写、管理版本号 `managementRevision`、Skills 设置页刷新按钮；原生 `file_reader` 新增 `--batch` 批量读取，`nativeBoundedFile.ts` 新增 `readNativeBoundedFiles`。取代本地早期的轻量实现（`c54923f02`、`77e895a77`） |
| `2d630ea4e` | 插件附带技能：清单 `contributes.skills`（最多 32 个，需要 API 4）、`PluginSkillSource`、技能目录与输入框候选带插件来源、安装审查列出附带技能、`$插件名:技能名` 调用、`plugin-creator` 新增 `skills.md`、新增依赖 `yaml 2.9.0` |

### #257 的冲突解决（11 处）

- **`file_reader.rs` / `bounded_file.rs`：** 本地已有 `--stream`（范围流式读取），上游新增 `--batch`。两个模式都保留，入口按第一个参数分发；测试同时导入 `run_stream` 与 `run_batch`。**这与 `upstream-20261022-7` 当时不引入 `run_batch` 的决定相反**，已与你确认。
- **`nativeBoundedFile.ts`：** 采用上游“等进程关闭再返回”的包装，输出上限沿用本地的 `outputLimit`（含 `range` 的 `length + 8`），`executeReader` 参数改名为 `outputLimit`。
- **`SkillService.ts`（4 处）：** 采用上游的 `#currentSkill(…, 'enable' | 'remove')` 与 `lightweight ? skill : load`；保留本地的 `#canOverrideBuiltin` 和 `developerToolsEnabled`（`0cc69e858`）；保留 `a69cfc6a` 带来的外部安装 ID 查找（`installation?.id ?? discoveredId`，与当前上游一致）。删除不再使用的 `isCurrentRevision`。
- **`skillFiles.ts` / `SkillInspector.ts` / `useSkillsManager.ts` / `DesktopSkillsToolbar.vue`：** 采用上游；工具栏只保留用到的 `NButton`、`NInput`。
- **测试：** `SkillService.spec.ts` 以上游为准并保留本地“只读元数据”用例；`SkillPackageCache.spec.ts`、`skillInstallation.spec.ts` 本地与上游用例都保留（含 #428 带来的技能图片用例）。两个本地用例（覆盖内置技能、技能图片）原先用包版本号移除技能，改用 `managementRevision`。
- **`nativeBoundedFile.spec.ts`：** 一并带入上游 `9d6c8353`（Windows 夹具路径），round-4 因该文件本地不存在而跳过，现在文件进来了。

### `2d630ea4e` 的冲突解决（11 处，均为机械或样式性）

- 清单导入与校验顺序、`ExtensionPackageStore`/`buildExtensionPackage` 的技能文件校验、`SKILL.md`（保持 XTLaw 文案）。
- 安装审查和技能列表/详情/文件：本地是作用域样式，保留本地类名，只带入 `skillInvocationName`、插件来源标签和“附带技能”区块（新增 `extension-install-review__skills` 样式）。
- `SkillService.ts`：`developerToolsEnabled` 与新增的 `pluginSkills` 选项并存。
- **`chatComposerEditing.spec.ts`：** 上游这个提交把该测试文件里的 10 个用例删掉了（包括 `echoes local transactions once`、`hydrates an external draft…`、`ranks skill name matches…` 等，上游现在的 master 里也没有）。对应行为在本地代码里仍然存在，所以不跟着删，保留本地全部用例，只加入上游新增的“两个同名插件技能绑定各自来源”用例。

## 检查

- 迁移：无。依赖：新增 `yaml 2.9.0`，`pnpm install --frozen-lockfile` 通过。Rust：有（`--batch` 与测试）。品牌：新增行里没有用户可见的 “Lexora” 文案（`lexoraDesktop`、`engines.lexora`、`.lexora-extension` 均为标识符）。
- Rust：`cargo test -p lexora-buddy-host --test bounded-file` 10 个全部通过（本机 Windows）。
- `vue-tsc -b` 通过；`eslint` 对改动文件无问题。
- 测试（本机 Windows）：#257 后的 `service/src/skills`、`platform/filesystem`、`src/modules/skills` 共 85 个用例，失败的 8 个全部在 `docs/known-test-failures.md` 里（符号链接 EPERM 与 `expected +0 to be 64`）；加上 `2d630ea4e` 后再跑扩展、技能、输入框、伙伴相关 56 个测试文件，491 个用例，失败的 12 个也都是这两类。其中 `pluginSkills.spec.ts` 的符号链接用例是新增失败，已补进 `known-test-failures.md`。
- 本机重新构建了测试用的原生读取器（`.output/build/native/x86_64-pc-windows-msvc/release/lexora-buddy-file-reader.exe`，被 git 忽略），因为旧的没有 `--batch`；其他开发预览用的原生组件没动。
- 未跑：Playwright E2E（`skills.e2e.mjs` 的新增用例、`extension-skills.e2e.mjs`）、开发预览与打包、Rust 在 Linux/macOS 上的 native checks（要靠 `XTLaw CI`）。

## 本区间其余提交

| 上游提交 | 结论 |
| --- | --- |
| `8dea569f3` | 已在第二轮移植 |
| `a4b72c02f`（#444） | 跳过，本地 `1ef83f972` 已有等价实现 |
| `f5aa11ed1`（#445） | 已在第三轮移植 |

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `f5aa11ed1`，即上游 master 的最新提交，此前的所有上游提交都已决定。
