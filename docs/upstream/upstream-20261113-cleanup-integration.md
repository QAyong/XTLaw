# 任务残留清理：宿主移植与插件市场发布

日期：2026-11-13。用户在归档能力移植后授权移植 `740e0bb27`，将官方任务残留清理插件适配到 XTLaw 并发布到 `QAyong/xtlaw-market`。本轮没有授权应用 master 合并、应用正式打包或应用发布。

## 来源与本地提交

工作分支 `codex/upstream-20261113-cleanup`，worktree `/home/lenovo/code/Lexora-worktrees/upstream-20261113-cleanup`，基于归档轮次 `d50da5ceff778670db221f82080f3132de1bf7ff`。

| 来源 | 本地实现 |
| --- | --- |
| Lexora `740e0bb27b593a2baeea3e78f50dbe3e2a8212b2` | `6a318aaea4e1719a6245f07a409795645698fbbe`，`git cherry-pick -x` 后适配，保留完整来源行。 |
| useLexora/plugins `d430627f162fe087dc4fb2bb1743d7b938cfabfa` 的 `legacy-task-cleanup` | `d741a7dbf45d88424be59af2bf9e9cbecc5d2c5a`，复制固定源码、许可证及来源记录，提供 XTLaw 1.0.1 适配版和单项市场同步。 |
| 本地 Windows 验证发现的 fixture 依赖与导航差异 | `95158cc457ecb3ea43ebc1ae4d1395b730db4462`，只改测试：Vite SSR 包含依赖，清理用例使用本地任务页、“市场”和可见安装菜单。 |

宿主、插件源码、Windows 验证分别由三个独立子代理处理，根代理负责 Git、统一验证、市场同步与发布。

## 宿主职责与边界

- 插件提供 `taskCleanup.run({ confirm(preview, signal), onProgress? })` 的确认、进度及结果界面，移除旧宿主清理对话框和插件 ViewContext 的 `list/delete` 接口。
- 仅获 `legacyTaskCleanup` 权限的可信用户 `extension.actions` 调用取得单次清理能力。跨插件、过期令牌、重复调用、后台/定时/斜杠/普通视图调用不得冒充用户确认。
- Core 仅扫描 `legacy_removed`，冻结任务 ID 与 revision；预览只提供 `total/skipped`，不让插件挑选任意目标。确认严格返回 `true` 后才逐项 CAS 校验并提交删除。取消或确认前终止不创建删除作业。
- 关闭或隐藏面板取消未确认操作；已接受的核心作业可能继续完成并保留回执。插件停用后不继续提交尚未接受的目标，结果未知时不自动重试。
- 保留本地正常归档、归档只读历史、恢复不续跑及永久删除确认。归档迁移仍登记本地 v44，未覆盖已发布的 v42/v43。保留 XTLaw 品牌、Office、本地文件访问及撤权规则和任务布局。
- 未引入插件推理、后台安装、安装进度或 `extension_capabilities` 等延后能力，未修改 `.github/workflows`、应用版本及发布配置。

## 插件源头与产物

唯一源码源头为 `plugins/legacy-task-cleanup/`，市场目录由该路径同步。保留稳定 ID `p95e8d9a8d120433d9ba2058e1c844ed0.legacy-task-cleanup`、作者 `Lexora` 和原始 MIT 全文。`PROVENANCE.md` 记录固定源提交与文件 blob SHA；main/state/view/CSS 行为实现保持原样。

适配版本 `1.0.1`、API 4、最低 `engines.lexora >=0.5.6`，唯一权限 `legacyTaskCleanup`。现有正式宿主 0.5.5 不具备本次菜单/确认接口，不支持此包。配套应用尚须另行获准合并并发布，不能将隔离测试版本称为正式 0.5.6 发布。

```sh
XTLAW_MARKET_DIR=/home/lenovo/code/xtlaw-market pnpm market:sync --plugin=legacy-task-cleanup
XTLAW_MARKET_DIR=/home/lenovo/code/xtlaw-market pnpm market:check --plugin=legacy-task-cleanup
# 在 /home/lenovo/code/xtlaw-market 中：
pnpm build
```

单项同步防止覆盖市场已有的播放器等独立变化。最终目录新增一项，其余 10 项深比较完全一致，能力包目录未改。安装包有 9 个文件：compiled manifest、3 个 JS、CSS、README、LICENSE、PROVENANCE 和 VERIFICATION，不包含 `.d.ts` 或开发测试。

- 文件：`legacy-task-cleanup-1.0.1.lexora-extension`
- 大小：15,726 bytes
- SHA-256：`5c75507c5223b2df1cd47c77274cd7d5e21c86a0c7ef633bba2c173dcfa7a5e8`
- 市场源码提交：`49f1d70abb0ec72eaeae0a0f483b76a56813df5e`
- 市场构建器修复及 Release 来源：`c210b779f0fbce4b53f54487db88635e1795fc81`，修复所有视图入口及相对模块引用的 JavaScript 路径映射；旧的 15,719-byte 中间包未发布。

## 验证

- Buddy 类型检查：`NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @uselexora/lexora-buddy type-check` 通过。
- Vitest 按项目串行运行，避免 `localhost:9999` 冲突：runtime 2 文件/15 项、platform 6 文件/94 项、unit 3 文件/19 项，共 11 文件/128 项通过。覆盖 Runtime、Core cleanup、单次与跨插件令牌、Batch/Controller、ExtensionService、请求生命周期和安装审核/FrameHost。
- `node --test packaging/market/legacy-task-cleanup.test.mjs`：真实 main/state/view 源码隔离验证 10 项通过，覆盖确认、取消、原 signal、停用、重复调用、结果重开、未知结果保留计数及 UI 分项呈现。
- `node --test packaging/market/sync.test.mjs`：4 项通过，覆盖单项同步保留其他市场插件、只读检查、无效选项不回退全量同步及原全量检查行为。
- 市场 `node --test scripts/source-compiler.test.mjs`：7 项通过，覆盖视图入口、模块引用、类型导入、缺失入口和导入边界；加上上述 142 项，共 149 项相关测试通过。新构建器输出的原有 10 个条目和包哈希不变。
- 新 fixture 在项目依赖树以外的 `/tmp` 中构建并加载成功，准备 32 个旧任务并校验 schema v44，不依赖临时 `node_modules` 链接。
- 新源码插件 API 的读取、源码构建和打包检查通过；市场构建通过。当前运行的旧桌面内置编译器拒绝 `extension.actions`，属版本契约不符，未因此降低兼容版本或删权限。
- Windows 独立克隆 `D:/dev/Lexora-win` 从干净工作区构建真实 Electron 宿主成功。宿主代码来自 `6a318aaea4e1719a6245f07a409795645698fbbe`；测试脚本提交 `95158cc457ecb3ea43ebc1ae4d1395b730db4462` 对 `apps/buddy` 无差异。隔离 bootstrap 仅允许 test profile，并在内存中把唯一编译期版本元数据从 0.5.5 覆盖为 0.5.6；兼容谓词不变，磁盘 build、正式版本文件和日常 XTLaw 均未修改。覆盖审计保存在本机验证目录。
- Windows 本地实测已完成实际包安装审核、启用、确认取消、隐藏取消和确认后的清理进度检查。整轮目标 E2E 在返回市场后未切“已安装”、找不到插件卡片处退出 1；结果重开、最终分项计数、全部最终数据边界、空结果及停用尾项尚未通过整轮断言，不标记 E2E 全绿。用户随后明确本轮以已有本地实测为准，不再将这些尾项作为市场分发阻塞。
- 未跑：完整归档 E2E/完整测试套件、应用安装器打包、macOS 实机验证。

## 市场发布与收尾

已发布 [任务残留清理 1.0.1](https://github.com/QAyong/xtlaw-market/releases/tag/legacy-task-cleanup-v1.0.1)。先推送源码/构建器提交并上传 Release 安装包，实际下载核对 SHA-256 和 15,726-byte 大小后，才提交推送市场目录。GitHub Release 资产 digest 与本地包一致。市场最终提交 `db04d3b665091e8582197ccd9fd1bb5be4fdfba5`，分支 `main` 已推送且工作区干净；远端目录 Git blob 与本地一致。市场负责分发，运行验证在本地宿主完成。

应用分支未合并 master、未推送，worktree 保留待确认。主 worktree 的用户未跟踪文件 `docs/specs/feature-051-resource-panel-split.md` 不移动、不暂存。本轮不推进 `lastChecked`，此前评估基线仍是 `1c8f1a2648b1ce2a11cec2959e2e619e94020442`，不表示所有上游提交均已移植。
