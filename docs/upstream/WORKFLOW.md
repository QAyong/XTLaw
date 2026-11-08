# 上游集成流程

从 `AGENTS.md` 移出。做上游集成（手动一轮，或处理自动预备机器人停下的提交）前先读这里。推送限制、迁移编号等硬规则同时保留在 `AGENTS.md`，两处冲突时以 `AGENTS.md` 为准。

默认不整体合并 `upstream/master`；保留 XTLaw 品牌、应用与数据隔离、Office、浏览器、选区引用及任务布局等定制，不照搬上游版本号和发布配置。依赖有变化时执行 `pnpm install`。

## 流程（一轮 = 一个上游区间）

1. `git fetch upstream --prune`，基线读 `docs/upstream-baseline.json` 的 `lastChecked`（或维护者指定的提交），列出 `基线..upstream/master` 的新增提交。
2. 只读预评估，不改工作区：逐个提交用 `git merge-tree --write-tree` 试合并并统计冲突；列出新迁移、依赖变更、原生代码改动和提交之间的依赖。输出“移植 / 跳过”清单，维护者确认后再动手。自动预备已覆盖的提交以其报告为准。
3. 从干净的本地 `master` 创建 `codex/upstream-<日期>`，按上游顺序逐个 `git cherry-pick -x`，一个上游提交对应一个本地提交，冲突在该提交内解决。该分支上的提交视为已获授权；说明按“英文（中文）”改写并保留来源行，例如 `Port upstream d3caa745: add companion management (移植上游 d3caa745：新增伙伴管理)`。若 `master` 不干净或已有同名分支/worktree，先报告，不复用或覆盖。
4. 跳过某个提交前，检查后续提交是否依赖它（迁移编号、共享模块、后续再改的文件）；有依赖就一并跳过或问维护者，不自行改成本地实现。
5. 大功能（含新迁移、超过 100 个文件，或预评估冲突超过 10 处）单独成轮，先只做评估。
6. 移植后只做类型检查和改动相关测试，不默认跑全量测试或打包。`docs/known-test-failures.md` 是 Windows 基线，不套用到 WSL/云端结果；这里出现的失败按真问题处理。Rust 变更可依赖 `XTLaw CI` 的 native checks，并在记录里写明依据。
7. 更新集成记录（放在 `docs/upstream/`），逐项记录“上游提交 → 本地提交”“上游提交 → 本地等价实现”或“上游提交 → 跳过及原因”，同时更新 `docs/upstream-baseline.json` 的 `lastChecked`。
8. 交付时报告分支、完整 commit SHA、工作区状态、是否已合并/推送和关联 worktree。经维护者确认合并到 `master` 后，删除该轮本地 worktree 和临时分支；远端分支确认不再使用后再删除。

## 判断是否已集成

- `git branch --merged` 只反映提交祖先关系，不能判断 cherry-pick、squash 或人工适配后的功能是否已经存在。
- 不得仅凭提交哈希、分支领先/落后数量或旧分支的提交数，把内容判定为“未集成”。先查 `cherry-pick -x` 来源和本轮集成记录，再比较实际代码差异；必要时检查功能入口和构建结果。
- 基于 `upstream/master` 的上游 PR 分支不属于 XTLaw 本地主线，不参与本地功能覆盖统计。

## 推送与云端

- 未经明确要求不推送或发布。例外：可以推送 `codex/upstream-<日期>` 到 `origin`（`QAyong/XTLaw`）并开草稿 PR（目标 `master`）。
- 不推 `master`，不向上游 useLexora 推送或开 PR，不改 `.github/workflows`，不处理令牌和密钥。
- 可在 WSL 本地或云端会话（`target: cloud`）执行整轮流程。云端从 `origin` 取代码，开始前 `master` 必须已推送；本地 `master` 领先 `origin/master` 时先问维护者。
- 缺少 `pnpm`、Rust 工具链或运行时间不够时，停下来报告，不绕过。

## 自动预备（`.github/workflows/upstream-watch.yml`）

- 每 6 小时检查上游，把可机械处理的提交逐个 cherry-pick 到 `codex/upstream-auto-<末提交短哈希>`，开草稿 PR 并更新 Issue「上游待同步」；基线随分支推进。不碰 `master`，不打包，不发布。
- 自动跳过只有两种：只改版本号的发版提交，以及本地已有等价改动的提交，均写入报告。
- 遇到下列情况停在该提交，由维护者接手：迁移、依赖或 `package.json` / `pnpm-lock.yaml` 变更、Rust 代码、超过 100 个文件、新增行含 `Lexora`、改动 `.github/workflows`、cherry-pick 冲突。停下后，机器人对后面的提交只做只读评估（可移植 / 等待 / 需人工 / 冲突 / 自动跳过），供维护者确认清单，不替代第 2 步；语义依赖以类型检查为准。
- 机器人分支上的提交视为已获授权，英文部分由机器生成，审查时按需改写。先审查并合并机器人分支，再处理它停下的提交，不重复移植同一批。
- 机器人 PR 合并或关闭后应清理对应的本地分支/worktree；远端自动分支确认不再需要后再删除。未合并的自动分支必须在集成记录中注明状态，不能长期依靠分支名表达进度。
- PR 要自动跑 CI 需要仓库密钥 `UPSTREAM_BOT_TOKEN`；未配置时在 PR 上关闭再重开来触发。令牌由维护者保管，不写进仓库，也不发给 Agent。
- 停下规则以 `.github/scripts/upstream-watch.mjs` 为准；调整规则时，脚本和本节一起改。

## 迁移

- 迁移编号与上游一致。需要的上游迁移若依赖被跳过的前序迁移，停下来问维护者，不自行分配本地编号。
- 已发布的本地迁移不覆盖、不重编号（现状：本地 v23/v24 与上游顺序相反）。

## 样式

- 上游组件用 UnoCSS 原子类名，本地组件用作用域样式。移植上游组件时保留类名，在 `apps/buddy/uno.config.ts` 补类名映射，指向 `src/theme` 中已有变量（缺失的给回退值），不改写成作用域样式；本地已有组件不改。

## 品牌与隔离

- 每轮在新增代码中查找 `Lexora`（排除 `lexora_` 工具名、包名等标识），检查默认名称、头像、文案和数据目录；内置智能体身份是“晓晓”。
