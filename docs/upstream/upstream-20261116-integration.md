# Upstream integration 20261116 (20261116 上游集成记录)

- 本地分支：`codex/upstream-20261116`
- 本地基线：`df782f24c1e4848a5a868c35f623dbf5ea40bf82`（当时等于本地 `master`）
- 检查到的 `upstream/master`：`ea0435c3fba15180be6fa3802eaaebe858657867`
- 移植按上游顺序执行；每个被移植提交各对应一个保留 `-x` 来源行的本地提交。

## 逐项结论

| 上游提交 | 处理结果 |
| --- | --- |
| `c24f9b5e16e778c3041de6118f73591ab49775ec` | 本地等价，跳过。`master` 的 `1576d120d66a493499195d388fb680eb97ec5802` 已覆盖图片查看器与头像对比度。 |
| `b54c468c7b8203537c080606deba3037769aadb8` | 暂缓，不移植。该提交涉及 Android 与本地服务解耦，改动约 890 个文件，并存在迁移编号冲突。 |
| `e98c408e808fc137177fc2963edde7a70909ef62` | 本地等价，跳过。`master` 的 `6b2094fed9aa80c97728b77cecf65baa24e2d39c` 已把归档清理转圈放到按钮上。 |
| `2167b0577dcfa8b346dc1e376d687e3d3c145690` | 移植到本地提交 `0c5ceebc91e8fa726475d9bb43d76043cbb665b1`：使用 `TextEditorPool`，将 Monaco 创建延后一轮，关闭 `automaticLayout` 并单独观察布局；时间线通过 `reconcileTimelineEventBuckets` 只重算脏 run。保留本地引用选区、`copy.blocked` 只读判断，以及插件文档、Office 和预览打开路径。 |
| `7eedb55a15ae95635e59763264b137c7db3fb619` | 跳过。上游改动是网站微信群二维码，本地对应文件已删除。 |
| `ea0435c3fba15180be6fa3802eaaebe858657867` | 移植到本地提交 `dd1450221d7f8c0abdbe6a2215db0ace9376d894`：自定义服务支持 `api_key` 或 `none`，免认证时不要求密钥。保留 XTLaw 的 HostCredentialStore、服务结构、设置页和作用域样式。数据库仍为本地 schema v44；只在现有迁移流程末尾幂等补上 `provider_configs.authentication`，未引入迁移版本或改变 schema lineage。 |

## 冲突取舍

2167 的 `.playwright/scripts/__tests__/transcript-history.e2e.mjs` 在本地基线不存在，该测试文件是在被跳过的 `b54c468c` 之后加入，故丢弃 2167 对它的上游修改，没有为了保留该测试引入 b54。新增的 `.playwright/scripts/fixtures/renderer-responsiveness.mjs` 只包含通用键盘探针和 trace 文件读取逻辑，不依赖 b54，予以保留。

Provider 冲突仅吸收免认证需要的配置、校验和界面行为；保留本地插件能力、HostCredentialStore、设置组件结构与 scoped 样式。数据库冲突只保留 `completeProviderAuthenticationSchema` 的导入和末尾调用，未采用上游 schema 42 / v43Persistence 分支。

## 验证

- 依赖：集成 worktree 中 `pnpm install --frozen-lockfile` 通过，锁文件未再变化。安装日志有 Prisma 对当前 Node 版本的支持提示，安装仍完成。
- 相关 Vitest：编辑器、时间线重算和免认证相关用例通过。首轮编辑器测试因 mock 未返回实际所需的 disposable 失败；修正 mock 后 `fileViewIdentity.spec.ts` 通过，未改断言。`chatTimelineReconcile.performance.spec.ts` 的基准用例按文件设置跳过。
- 类型检查：默认堆上限下 OOM；`NODE_OPTIONS=--max-old-space-size=6144 pnpm --filter @uselexora/lexora-buddy type-check` 通过。
- Windows 桌面：在 `D:\dev\Lexora-win` 检出本分支并执行 `electron-vite build` 后，用临时 Playwright 场景测过两件事。临时脚本未提交。
  - 长对话中模型仍在输出时，从文件树依次打开 3 个文本文件：窗口未被记为无响应。编辑器出现耗时依次为 610、136、128 毫秒；最长的主线程长任务为 51 毫秒。这不是当初十四万到十八万 token 的现场。
  - 流式回答结束后的残影：本地 `df782f24` 已经移除聊天视口的 `contain: strict`，上游 PR #635 未合并。同一构建上连续 3 轮输出带列表和代码块的回答，结束后立即截图，再滚动 120 像素后回到原位。三轮画面均为 1260×770，像素差都是 0。这只能说明这次没有复现残影。
- 未跑全量测试、打包或安装包验证。
