# Bug：中断的主机调用留下危险标记，导致后续工具被持续拒绝且无恢复途径

**日期**：2026-10-17<br>
**优先级**：中（一次中断即可触发，需手工清库才能恢复；自动化场景下影响更大）<br>
**状态**：已确认缺口，未修复；已向上游提交 [useLexora/Lexora#373](https://github.com/useLexora/Lexora/issues/373)；本机遗留标记已于 2026-10-17 手工清理（见 §9）<br>
**代码基准**：`master` @ `eb87b593`<br>
**环境**：Windows，XTLaw 开发预览。

## 1. 现象与证据边界

- 需要主机权限的工具（`powershell`、`lexora_host_shell`、`mcp__*` 连接器工具等）全部返回 `MUTATION_RESOURCE_UNSAFE`，连 `Write-Output ok` 也被拒。
- 失败毫秒级返回，说明命令没有被执行，是在获取变更租约时被拒。
- 来源：另一次智能体会话的自述，以及 `feature-030` §4 的记录。**触发它的那次具体中断是推断**（时间点和现象吻合），未取得持久化记录佐证。

## 2. 机制（已读代码确认）

`MutationCoordinator.ts` 的行为：

1. 需要主机权限的调用声明 `{ kind: 'host' }` 租约。`claimsOverlap` 对 host 声明一律判为重叠。
2. 租约结算为 `hazard`（危险标记）后，`#drain` 会拒绝所有与之重叠的后续申请，抛 `MUTATION_RESOURCE_UNSAFE`。
3. 危险标记写入仓库（`repository.settle(..., 'hazard')`）。构造时 `listUnreleased()` 读回：只有「运行期租约」或「所有已记录进程均已释放」才自动结算，其余按 `MUTATION_INTERRUPTED` 恢复为危险标记。主机 shell 租约生命周期是 `external`，不满足自动结算。
4. 唯一的解除路径是 `confirmReleased`，只在 `recordOwnedProcessSettlement` 确认全部进程已释放时调用。`src` 中没有面向用户的解除入口。

产生危险标记的两条路径：

| 路径 | 位置 | 说明 |
| --- | --- | --- |
| 调用结束时进程清理未确认 | `changeCaptureExtension.ts` 的 `finally`：`started && ownedProcess` 且结算状态不是 `released` → `markHazard('OWNED_PROCESS_CLEANUP_UNCONFIRMED')` | 被中断（abort）的 shell 若无法确认进程树已结束，会走这里。**这与「Script aborted」吻合，但是否确为本次原因未验证。** |
| 应用被强制结束 | 构造函数恢复逻辑 | 调用进行中进程被杀，租约未结算，重启后按 `MUTATION_INTERRUPTED` 恢复 |

## 3. 与另一会话说明的出入

| 说明中的说法 | 代码显示 |
| --- | --- |
| 「租约在内存里，重启即清」 | **不成立。** 危险标记持久化，重启后会恢复（见上第 3 点）。重启不能作为恢复手段 |
| 「文件读写、改代码不受影响」 | 代码上 host 危险标记与**任何**声明重叠，`write`/`edit` 的文件声明理论上也会被拒。该会话仍能编辑可能走了别的路径，**未验证**，待复现时确认 |

## 4. 触发频率评估

没有遥测，无法给出实测频率；以下为按代码的推断。

- **必要条件**：主机类调用在进行中被中断且进程清理未确认，或应用在调用进行中被强杀/崩溃。普通正常结束、普通失败不会留下标记。
- **暴露面**：所有 shell（完全访问档位为 host 声明，其余为工作区目录声明）、所有 `mcp__*` 工具、未分类或 `execute` 类工具。
- **自动化**：暴露更大。无人值守的长任务更容易遇到超时中断或应用被关闭；一旦留下标记，之后每次运行都失败，且没有人在场发现。
- **写文档**：纯 `write`/`edit` 用文件声明，调用短、不涉及进程，基本不会产生标记。但若通过 shell 脚本生成文档（Python、officecli 等），则走 shell 声明；工作区 shell 的标记会拦截该工作区目录下的后续写入。
- 一旦发生即「粘性」：影响持续到手工清理，而不是单次失败。

## 5. 复现思路（待补）

1. 启动一个会长时间运行并派生子进程的 shell 命令。
2. 在其运行中强制结束应用，或让进程清理确认失败。
3. 重启应用，再发起任意主机类调用，预期收到 `MUTATION_RESOURCE_UNSAFE`。

## 6. 修复方向（未实施，需确认）

- 启动恢复时，对无法验证的主机租约做显式失效：若记录的进程已不存在（按 PID 与启动时间核对），直接 `confirmReleased`。
- 提供用户可见的「清除遗留标记」入口，并在拒绝提示中说明原因与操作，而不是只返回错误码。
- 排查 abort 路径为何进程清理未确认，从源头减少 `OWNED_PROCESS_CLEANUP_UNCONFIRMED`。
- 补测试：重启后孤儿主机租约被自动失效；清理后后续申请成功。

不放宽 fail-closed：存在无法确认已结束的进程时，仍应拒绝。

## 7. 临时恢复

重启本身无效（已实测：重启后同样被拒）。需要退出应用，备份数据库后，把遗留租约和进程记录改为已结算。相关表：`run_mutation_leases`（`status`、`reason`、`claims_json`）、`run_mutation_processes`（`settlement`）。

**不要只清 `claims_json` 含 `"host"` 的记录**：见 §9，实际卡住的是目录（tree）租约。

## 8. 重要补充：卡住的不一定是 host 租约

`claimsOverlap` 对 host 声明一律判为重叠，所以**任何**未结算的危险标记（包括工作区目录租约）都会拦住所有主机类调用。§2 第 1 点据此成立，但「堵住的一定是 host 租约」不成立。

## 9. 本机实测与清理记录（2026-10-17）

只读查询正式数据库（用户目录下的 `.xtlaw`，不是开发档位的 `.xtlaw-dev`）：

| 项 | 内容 |
| --- | --- |
| 未结算租约 | 1 条：`status=hazard`，`lifetime=external`，`reason=OWNED_PROCESS_CLEANUP_UNCONFIRMED` |
| 租约声明 | `[{"kind":"tree", 某会话的工作区目录}]`，**不含 host** |
| 未结算进程 | 2 条，均为 `unknown`：一条 `sandbox-dispatch`（请求标识），一条 `sandbox-job`（含 `platform`、`pid`、`startTime`、`nonce`） |
| 进程核对 | 记录的 pid 已不在运行；`startTime` 对应 2026-10-17 23:01:21，与租约创建时间吻合 |

结论：

1. 触发路径确为 §2 第一条：沙箱 shell 被中断，进程清理未确认，`finally` 里 `markHazard('OWNED_PROCESS_CLEANUP_UNCONFIRMED')`。
2. 另一会话提供的清理脚本只处理 `claims_json` 含 `"host"` 的记录，对这条 tree 租约**无效**（`--apply` 会报「无可释放」）。
3. 进程记录里已有 `pid` 与 `startTime`，所以 §6 第 1 点（启动时核对进程是否还在，不在则自动解除）所需信息已持久化，不用新增记录。

清理操作（用户已退出应用并确认）：

- 备份整库到同目录 `buddy.sqlite3.bak-manual-orphan-20261017-232524`，大小与哈希与原库一致。
- 单事务内只改这一条租约（`released`，`reason=manual-orphan-cleanup`）和它的 2 条进程记录（`released`）；条数与预期不符则回滚。
- 清理后未结算租约 0 条、未结算进程 0 条。

验证：用户确认重启后主机类工具已恢复（2026-10-17）。开发档位数据库无遗留标记。根因缺口仍在，见 §6 与上游 #373。

## 8. 术语

| 原名称 | 中文含义 |
| --- | --- |
| lease | 变更租约：执行有副作用的工具前需先获得的占用声明 |
| hazard | 危险标记：无法确认已安全结束的租约，会阻止重叠的后续申请 |
| `MUTATION_RESOURCE_UNSAFE` | 申请因与危险标记重叠被拒 |
