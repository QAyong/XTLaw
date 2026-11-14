# 上游集成记录：2026-11-01（第二轮）

区间是 `4db1a090c..f67ae31bf` 的 3 个提交（`4db1a090c` 是上一轮的基线）。分支 `codex/upstream-20261101-2`，从本地 `master`（`3d69df654`）切出，用 `git cherry-pick -x`。

## 已移植

| 上游提交 | 上游 PR | 内容 | 冲突 |
| --- | --- | --- | --- |
| `b61b25c69` | #526 | 命令并行调度与工具状态（回应我们提的 #523） | 4 处 |

## 跳过

| 上游提交 | 上游 PR | 内容 | 原因 |
| --- | --- | --- | --- |
| `095595a0e` | #525 | 插件包核验与风险确认安装 | 我确认跳过。预评估有 13 个文件约 30 处冲突，集中在本地改过的下载代理和 Office 插件相关的 `extensions/` 模块；它放宽了完整性校验（直连官方地址时，大小或 sha256 与目录不一致的包也允许在用户确认后安装），与我们市场的发布流程是否相容未评估。后续提交若依赖它（`acceptUnverified`、`ExtensionSource.mismatch`、`extensionPackageBudget`），要回头重新评估。 |
| `f67ae31bf` | | 发布 v0.18.0 | 只改版本号的发版提交 |

## 与我们自己的 issue 的关系

**#523（完全访问下 shell 命令共用全局 host 锁）**是我们提的，#526 是维护者对它的回应。对照 issue 里的建议方向：

- 让等锁可见：已做。`MutationCoordinator.acquire` 增加 `onWait`，向界面上报占用方的任务标题、状态（排队或已持有）和起始时间；工具卡片显示“正在等待其他任务的命令”，悬停看占用方和已等时间。**没有新增专门的取消按钮**，取消仍走原来的停止当前运行。
- `timeout` 覆盖等锁时间：已做。新增 `ShellCommandDeadline`，从授权通过后开始计时，等锁超时抛 `SHELL_RESOURCE_TIMEOUT`（并说明命令没有开始），开始执行后只把剩余时间交给真正的命令。
- 缩小锁的范围：已做。`lexora_host_shell` 和完全访问下的 shell 都按 `workspace`（授权目录的 `tree` 锁）处理，不再用全局 `host`。不同目录可以并行，同一目录仍然串行。
- 长任务后台执行：**没有做**。

**本地独有的 `lexora_wsl_shell` 上游没有覆盖，我们另补了一个本地提交**（不属于上游移植）：

- `wslShellCapability.ts` 的 `mutationEffect` 原来返回 `{ kind: 'host' }`，仍占全局 host 锁；改为 `{ kind: 'workspace', ownedProcess: false }`，与其他 shell 一样按授权目录加锁，不同工作区可并行。`ownedProcess` 保持 `false`（辅助进程在服务退出时自行杀进程组，没有要恢复的进程）。
- `changeCaptureExtension.ts` 给 `lexora_wsl_shell` 也创建 `ShellCommandDeadline`，`timeout` 覆盖排队时间，排队超时报 `SHELL_RESOURCE_TIMEOUT`，卡片显示“正在等待”。
- 工具描述加上与 `lexora_host_shell` 相同的两句（`timeout` 含资源等待、不同工作区可并行）。
- 其余位置（权限、只读排除、事件桥、终端卡片）本来就已把 `lexora_wsl_shell` 和其他 shell 同等对待，不需要改。
- 测试：`wslShellCapability.spec.ts` 的期望改为 `workspace`；`mutationToolExecution.spec.ts` 新增两条（WSL shell 在另一目录与被占用的工作区并行；同一工作区排队时超时且不启动），并让测试夹具可以传入 `mutationEffect`。临时改回 `host` 时并行用例失败，已确认。

## 冲突解决

`toolPresentation.ts`（1 处）：保留本地的 `lexora_wsl_shell` 判断，并合入上游新增的 `shellDialect` 提取。

`shellCapability.ts`（1 处）：采用上游的 `lexora_host_shell` 描述（说明 `timeout` 包含等待资源，不同工作区可并行），末尾保留本地的 `${wslNote}`。

`BuddyChatActivityGroup.vue`、`BuddyChatToolRow.vue`（各 1 处）：保留本地的作用域样式类名，合入上游的 `resource` / `queued` 状态和 `BuddyChatToolResourceWait` 组件。新组件原样保留上游的原子类名。

## 验证与待办

- 品牌：新增行里没有用户可见的 “Lexora”，只有标识符。
- WSL 本机：`pnpm type-check` 通过（默认 2GB 堆会 OOM，需要 `NODE_OPTIONS=--max-old-space-size=6144`）；改动文件 eslint 通过；相关目录（agent/events、agent/extensions、changes、sandbox、permissions、tasks）155 个测试文件，154 通过、1 个跳过，无失败。
- WSL shell 补丁另跑：`pnpm type-check` 通过，改动文件 eslint 通过，agent、changes、sandbox、permissions、wsl 目录 85 个测试文件无失败。
- 未跑：Playwright E2E、开发预览、打包、Rust 变更（本轮没有）。**必须在 Windows 开发预览里看：** 两个会话都设为完全访问，A 里跑长命令，B 里在另一个工作目录跑命令是否并行；同一目录是否排队，卡片是否显示“正在等待”，悬停提示是否正确；带 `timeout` 的命令在排队时是否超时并报 `SHELL_RESOURCE_TIMEOUT`；WSL 空间目录里的命令是否与其他目录的命令并行、同一目录是否排队、带 `timeout` 的 WSL 命令排队时是否超时、终端卡片的 shell 类型显示是否正常。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 推进到 `f67ae31bf`：区间内 3 个提交都已决定，移植 `b61b25c69`，跳过 `095595a0e` 和 `f67ae31bf`。下一轮从 `f67ae31bf` 之后的新提交开始，同时留意 `ce2707b81` 的重新评估。
