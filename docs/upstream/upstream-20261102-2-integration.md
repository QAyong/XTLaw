# 上游集成记录：2026-11-02 第二轮

这一轮处理上一轮暂缓的 `c2d639e28`，以及新提交里只改补丁和锁文件的 `3778f938c`，其余新提交留到后面的轮次评估。分支 `codex/upstream-20261102-2`，从本地 `master`（`18fd2f9a4`）切出，用 `git cherry-pick -x`。基线 `lastChecked` 仍是 `c2d639e28`，本轮不推进，原因见“待办”。

## 已移植

| 上游提交 | 本地提交 | 内容 | 冲突 |
| --- | --- | --- | --- |
| `c2d639e28` | `6d7baa0e5` | 修复命令并发阻塞与产物写入保护 | 6 个文件 |
| `3778f938c` | `10b493165` | 防止空摘要被视为压缩成功 | `pnpm-lock.yaml` |

要点：

- shell 命令（含 `lexora_host_shell`、沙箱 shell，以及走同一条 `resolveMutationPlan` 的 `lexora_wsl_shell`）不再占工作区排他锁，改为 `coordination: 'observe'`：同一工作区内命令与文件工具并发，重叠的变更靠 `hasConcurrentChanges()` 标为 partial；`MutationCoordinator` 的 `release`、`markHazard` 变成异步。
- 产物写入（`registerGeneratedFile`、`registerGeneratedImages`）改为暂存目录 + 原生 `writeFile`；`writeFiles` 变成必需项，缺失时抛 `ARTIFACT_PUBLICATION_FAILED`。三个调用方（`extensionResourceCapabilities`、`ImageGenerationService`、`ImageTransformService`）本来就传了 `writeFiles`，不用改。
- Rust：`file_engine/io.rs`、`operations.rs` 和 `file_engine.rs` 测试。

`3778f938c` 要点：给 `@earendil-works/pi-coding-agent@1.4.0` 的补丁加一段：压缩（compaction）的模型回复里既没有工具调用、文本又为空时，返回 `model returned an empty summary` 失败，不再当作压缩成功。只改了补丁文件和锁文件，没有源码改动。

## 跳过

| 上游提交 | 内容 | 原因 |
| --- | --- | --- |
| `56e23e072` | 稳定版与尝鲜版更新通道 | 我再次确认不要（上一轮已跳过，这一轮重新问过）。 |

## 冲突解决

- `shellCapability.ts`（1 处）：采用上游的新说明（“同一工作区可并发、命令不加锁”），保留本地的 `${wslNote}`。
- `ArtifactService.ts`（2 处）：fs 导入只留 `readFile`、`realpath`、`stat`，路径导入去掉 `join` 但保留 `relative`；`realpath`、`relative` 是本地 Spec-044/046 的真实路径打开仍在用的。写文件那几处按上游改，本地没有在里面加东西。
- `ArtifactService.spec.ts`（1 处）：丢掉本地“输出在授权目录之外”那条用例，因为上游把它并进了“presents only explicitly selected, authorized files…”；保留本地新增的“按会话解析普通文件和目录”“带授权根打开 HTML 入口”两条。
- `MutationCoordinator.spec.ts`（1 处）：采用上游改写后的用例体（“keeps new captures uncertain while an observed process has no release proof…”），丢掉旧的 root/child/resumed 分段用例。
- `mutationToolExecution.spec.ts`（3 处）：导入保留本地的 `MutationToolOptions` 类型，去掉上游已不用的 `appendFile`；`actor` 的 `toolOptions` 采用上游的签名并保留本地的 `mutationEffect`，去掉 `workspaceRoot`。
  - 本地有 2 条 WSL shell 用例依赖旧的锁语义（“在另一目录与被占用的工作区并行”“排在同一工作区之后超时且不启动”），后者在 `observe` 下不再成立，前者的 `workspaceRoot` 夹具也被上游删了。合成一条新用例“runs the WSL shell beside a held workspace without waiting for it”，断言占着工作区时 WSL shell 直接运行、不出现 `resource` 阶段。
- `SpeechButtons.spec.ts`（修改/删除）：本地没有这个文件（本地的等价修复 `7137d9596` 用的是 `useSpeechCatalog.spec.ts`），上游这次只是重构这个 spec 的写法，与行为无关，所以删除，不移植。
- 本地补改（不在上游提交里）：`wslShellCapability.ts` 的注释和工具说明，原来写着“占住工作区授权目录、同一工作区排队、超时包含等锁”，已改成与新模型一致。

`pnpm-lock.yaml`（2 处，`3778f938c`）：冲突在 importer 和 snapshot 里各一行，上游那行的依赖后缀（`zod@4.6.6`、`undici@8.12.3` 等）与本地不同，所以不能直接取上游。保留本地这两行，只把 `patch_hash` 从 `d9408954…` 换成 `bd7d205f…`；`patchedDependencies` 里的哈希本来就自动合并成新值。补丁文件的 sha256 以 `bd7d205f573262ac` 开头，与锁文件一致，所以没有手工生成哈希。`pnpm install --frozen-lockfile` 通过，新补丁目录里已有空摘要检查。

## 验证与待办

- 品牌：新增行里没有 “Lexora” 用户可见文案。
- WSL 本机：`pnpm type-check` 通过（`NODE_OPTIONS=--max-old-space-size=8192`）；改动的 21 个 TS/Vue 文件 eslint 通过；`service/src` 的 `changes`、`artifacts`、`agent`、`files`、`sandbox`、`images`、`plugins`、`__tests__` 共 104 个文件，103 通过、1 个跳过，968 个测试通过；Rust `cargo test --package lexora-buddy-host --test file-engine` 23 个通过。
- **测试前要重编原生文件读取器。** `FileResourceCoordinator.spec.ts` 经 `NativeFileEngine` 用的是 `apps/buddy/.output/build/native/<target>/release/` 下的 `lexora-buddy-file-reader`，那份是 10-28 编的，会让“新建文件权限 0o600”的用例失败（得到 0o644）。在仓库根目录执行 `node packaging/buddy/release/native-host.mjs` 重编后通过。
- `3778f938c`：`pnpm install --frozen-lockfile` 通过（Prisma 的 Node 版本提示是已知问题，不影响）；`agent/sessions`、`agent/resources`、`agent/execution`、`runs` 共 30 个文件 314 个测试通过。没有专门覆盖“空摘要”的用例，上游也没加。`node_modules/.pnpm` 里会留下旧哈希的补丁目录，无害。
- 未跑：Windows 本机的 Rust 测试和原生沙箱测试、Playwright E2E、开发预览、打包。**必须在 Windows 开发预览里看：**
  - 同一工作区里，长时间运行的命令（含 `lexora_wsl_shell`）期间文件工具能否同时写入，重叠的变更是否标为部分覆盖。
  - 生成图片、图像编辑、插件 `artifacts.publish` 写出的产物，在授权目录里是否权限、位置正确，撤销授权后是否不再落盘。
  - Spec-044/046 的“按真实路径打开产物”“Office 工作副本”没有回归（本轮在 `ArtifactService.ts` 合并时只动了写入路径）。
- 待办：新提交 `618eb4e55`（启动状态复用；含迁移 v39/v40，本地编号待定）、`6ca67989d`（浏览器执行隔离，与本地 Spec-017 的弹窗、文件选择、下载放行冲突）还没有决定，所以 `lastChecked` 不推进。更早暂缓/跳过的 `ce2707b81`、`e197fc271`、`095595a0e` 状态不变。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 保持 `c2d639e28`：本轮移植的就是它，但它之后的 `618eb4e55`、`6ca67989d` 尚未决定（`3778f938c` 已移植，但排在 `618eb4e55` 之后，基线不能越过未决定的提交）。
