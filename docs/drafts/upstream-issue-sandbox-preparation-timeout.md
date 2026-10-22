# 上游 Issue 草稿：Windows 沙盒准备阶段超时

> 状态：草稿，未提交。建议另开 Issue，正文里引用 #398。
> 标题：`[Bug] Windows 沙盒在大工作区上准备阶段必然超过 60 秒，命令从未启动，并发预准备还会留下半截 ACL 状态`

---

### 提交前
- [x] 我已搜索现有 Issue。相关的是 #398（恢复机制缺口）和 #373；本报告是它们的上游诱因：沙盒准备阶段超时，以及超时之后留下的状态。

### 影响范围
Desktop (Buddy)

### Lexora 版本
代码核对基于 `upstream/master` @ `93644a07`（2026-10-19）。应用版本：下游 XTLaw 构建，基于该提交。

### 运行环境
Windows 11 x64，桌面端，沙盒 shell 档位。工作区里有若干大目录：一个含 `node_modules` 的仓库约 206 万个文件，另一个约 116 万个文件（用 `EnumerateFiles` 递归枚举，分别约 21 秒和 20 秒）。

### 严重程度
**高：在这类工作区上，沙盒 shell 实际不可用。**
- 一段时间内的所有沙盒命令请求都失败，没有一次成功启动命令。
- 每次失败还会触发 #398 描述的危险标记，之后所有主机命令被拒绝，需要手工清理数据库。

### 复现步骤
没有在上游环境复现，以下是本机现象与代码阅读：

1. 在 Windows 上，工作区（Space）的目录里包含文件数很大的目录（例如带 `node_modules` 的仓库）。
2. 启动应用，再通过沙盒 shell 执行任意命令（哪怕是 `Write-Output ok`）。
3. 请求在约 60 秒后以 `SANDBOX_TIMEOUT` 结束，命令从未运行。

### 实际结果
应用日志中，时间窗口内 7 次沙盒请求全部失败。其中 5 次是同一个形态，时间线完全一致：

```
requested +0s → backend.preparing +1s → backend.timed_out +60~61s → backend.settled +70~74s [SANDBOX_TIMEOUT]
```

- 没有任何一次出现 `started`，即从未收到原生 supervisor 的 `ready`。
- 按 `shell_sandbox/process.rs` 的执行顺序，`ready` 在「授予文件系统权限（`Grants::apply`）→ 写脚本 → 启动挂起子进程」之后才发出，且 `ResumeThread` 在 `ready` 之后。所以这 5 次里用户命令都**没有被恢复运行过**。
- 随后 TS 侧在取消请求 10 秒后强制结束 supervisor（`windowsSandboxProcess.ts` 的 `forceKill` 为 `10_000`），所以没有 `processesReleased` 回执，settlement 被记为 `unknown`，进而留下危险标记。这就是 #398 的触发路径之一。

**启动时的并发预准备同样失败。** `BuddyService.ts` 的 `prepareSpaces()` 对**每个** Space 并发执行 `void sandbox.prepare(roots)`，没有串行化、限速或优先级区分。本机 7 个 Space 的预准备全部在 `sandbox.prepare` 的 70 秒 RPC 超时（`ShellSandboxClient.prepare`）时失败，记录为 `sandbox.workspace_preparation.failed`，时间点是应用启动后约 70 秒。

**超时后留下半截状态。**
- 沙盒日志目录里有两个 0 字节的 `acl-*.pending` 文件，对应两次启动后没有完成的 ACL 改写。
- 大目录根上没有沙盒组的 ACE，但其子孙文件上已经出现了沙盒组继承来的 `(I)(M)` 条目；其他位置的文件则没有。说明 ACL 继承传播被中断过，处于不一致的中间状态。每次重试都要重新处理，所以不会收敛。

### 原因（代码依据与推断）
已核实的预算（互相独立，且都不随文件数缩放）：

| 位置 | 预算 |
|---|---|
| `sandboxExecutionLifecycle.ts` | 准备阶段 `preparationTimeoutMs = 60_000`（命令本身的超时是 30 分钟） |
| `shell_sandbox/process.rs` `run` | `Cancellation::listen(..., 60s)` |
| `shell_sandbox/process.rs` `prepare` | `Cancellation::listen(..., 900s)` |
| `ShellSandboxClient.ts` | `host.sandbox.prepare` RPC 超时 70 秒 |
| `windowsSandboxProcess.ts` | 取消后 10 秒强制结束 |

推断（**没有测量**）：耗时主要在 `Grants::apply`，即给 Space 的目录授权时 Windows 对整棵目录树做 ACL 继承传播，以及进程间共享的 ACL 互斥锁（`Global\LexoraBuddySandboxRoot-…`、`…Denials-…`）上的等待。原生 supervisor 的 `diagnostic`（如 `filesystem_preparing`）虽然被解析，但没有写进应用日志，所以无法从日志确认时间花在哪一步。

### 预期结果
1. **准备成本不应随工作区文件数线性增长到超出预算。** 例如：只授权命令实际需要的路径、对 `node_modules` 和 `.git` 这类目录排除或延迟授权、或换成不需要整树继承传播的机制。
2. **预算和阶段要可见、可区分。** 准备阶段的超时、原生 supervisor 的 `diagnostic` 阶段和耗时应该写进应用日志；界面上区分「正在准备沙盒（已用 X 秒）」和「命令运行中」。
3. **不要对所有 Space 并发预准备。** 至少串行或限并发，并且后台预准备不应与前台命令争抢同一把根目录互斥锁。
4. **超时不应留下半截状态**，或者半截状态要能被下一次准备续上，而不是每次从头再来。
5. **没有进入运行（没有 `ready`、没有恢复子进程）的失败，不应产生危险标记。** 这一点与 #398 直接相关：此时「命令从未启动」是可以证明的，不需要等不到的释放回执。
6. 取消后的清理预算（10 秒）与原生清理实际需要的时间要对齐，或在强制结束后给出可恢复的证据。

### 上次正常版本
不适用。我们没有对比更早的版本。

### 模型与工具信息
与具体模型无关。

### 补充材料
- 相关：#398、#373。
- 不确定的部分：具体是 ACL 传播还是互斥锁等待占用了 60 秒；每个文件数量级下的耗时曲线；上游的小工作区是否正常。
- 我们没有修改 ACL，也没有清理 `.pending` 文件，现场保留。
- 如果维护者认可方向，我们愿意提交 PR。
