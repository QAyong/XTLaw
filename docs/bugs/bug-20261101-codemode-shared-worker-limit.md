# Bug：多个会话共用 2 个 Codemode worker，脚本等 60 秒后失败

**日期**：2026-11-01
**优先级**：中（P2。脚本没执行就被当成没查到，浪费回合；不丢数据）
**状态**：已在本地修复，并向上游提交 [useLexora/Lexora#516](https://github.com/useLexora/Lexora/pull/516)（2026-11-01）。服务环境未设置或为空时写入 `8`，用户设过的值原样传入。`buddyServiceEnvironment.spec.ts` 24 个用例通过、3 个跳过。未改 Pi 的排队和 60 秒超时。`docs/**` 没有进 PR。关联上游 Issue #397，但不自动关闭。
**范围**：本地服务进程的 Codemode worker 默认上限。不改 Pi 的排队和 60 秒超时，也不改成一个会话一个进程。

## 现象

同一套 XTLaw 里，一个会话的 `codemode` 脚本占着 worker 时，另一个会话的脚本等满 60 秒后直接失败，工具请求没有发出：

```
Script failed
Script error:
No codemode worker became free within 60 seconds. All 2 workers, shared by every session in this process, are held by other scripts. Retry after they finish.

The script did not start.
```

2026-11-01 这次检索就是这样：报错写明 2 个 worker 由本进程的所有会话共用，被其他脚本占着。模型只能换词重试，或把“没执行”当成“没查到”。

## 原因

Pi 的上限按**进程**算，不按会话算。默认 2。每个脚本启动时读环境变量 `PI_CODEMODE_MAX_WORKERS`；未设置、空字符串和 `0` 都是 2，设成 `3` 就是 3。本地测试 `drains five sessions in FIFO order with worker limit %s`（`apps/buddy/service/src/agent/sessions/__tests__/codemode.spec.ts`）已经断言这一点。

Pi 命令行是一个会话一个进程，所以 2 看起来像按会话算。我们不是。`docs/architecture/overview.md` 写明桌面应用只有三个进程，对话和工具都在主进程用 `utilityProcess.fork` 拉起的那一个 `Buddy Local Service` 里。`BuddySessionFactory` 在这个进程里调用 `createAgentSession`，会话放进 `BuddySessionRegistry` 的 `Map`（默认最多留 8 个）。`apps/buddy/service/src/agent` 下没有按会话 `fork`、`spawn` 或起 `Worker`。专业助手也是进程内会话，不是单独的 `pi` 进程。

因此这个对话和另一个对话的 `sourcePid` 相同，共用那 2 个 worker。调用子代理的脚本会一直占着自己的 worker，直到子代理返回；子代理自己的脚本还要再占名额。2 个名额很容易被两个这样的脚本占满，后面的脚本等到 Pi 的 60 秒后失败。

本地服务的环境是白名单，不是整份继承。`createChildProcessEnvironment`（`apps/buddy/platform/process/childProcessEnvironment.ts`）只复制 `apps/buddy/shared/platform/definitions.json` 里列出的变量，再合并 `additions`。`PI_CODEMODE_MAX_WORKERS` 不在名单里。现在 `createBuddyServiceEnvironment`（`apps/buddy/electron/main/runtime/buddyServiceEnvironment.ts`）也没有把它放进 `additions`。所以即使用户在启动 XTLaw 的环境里设了这个变量，服务进程也拿不到，实际仍是 Pi 的默认 2。

## 对照：pi-web 已经按这个模型改过

[pi-web](https://github.com/agegr/pi-web) 和我们一样，不是和 Pi 命令行一样。他们的 `lib/codemode-workers.ts` 写明：

> pi lets two codemode workers live per process. The CLI runs one session per process; pi-web runs every session and in-process subagent in one, and a script that calls subagents holds its worker until they return, so two workers are taken by two such scripts and the subagents' own scripts wait out pi's 60 s and fail.

他们的做法可以学，而且改动小：

- 常量 `PI_WEB_CODEMODE_MAX_WORKERS = 8`。
- `applyCodemodeWorkerDefault()`：变量未设置或为空时写成 `"8"`；用户设过的值原样保留，包括 Pi 会拒绝的 `"0"`、`"abc"`。
- 在服务启动、任何会话跑脚本之前调用（`instrumentation-node.ts` 的 `registerNodeInstrumentation()`）。
- 不改 Pi，不按会话起进程。用户仍可用环境变量覆盖。
- README 写明：这个上限由该服务里的所有会话和子代理共用；每个脚本最多 256 MB。

源码：<https://github.com/agegr/pi-web/blob/main/lib/codemode-workers.ts>，<https://github.com/agegr/pi-web/blob/main/instrumentation-node.ts>。

## 修复方案（已实施）

在 `createBuddyServiceEnvironment` 的 `additions` 里显式写入 `PI_CODEMODE_MAX_WORKERS`，不要只加进平台白名单，也不要只改 Electron 主进程的 `process.env`。计数器在 fork 出去的服务进程里。

规则与 pi-web 相同：

- 从传入的 `source` 读取，不要从过滤后的环境读。未设置或空字符串时写 `"8"`。
- 用户给了任何非空字符串就原样传入，不要改成合法值。Pi 自己会把 `0` 等无效值退回 2，本地测试已覆盖。
- 加一段和 pi-web 同义的注释：命令行是一会话一进程；我们一个服务进程跑全部会话和进程内子代理，所以默认从 2 提到 8。

8 是默认值，不是保证不再排队。超过 8 个同时运行的脚本，或者父脚本占着 worker 等子代理时，仍会排队，满 60 秒仍失败。这正是 2 不够用的原因，不要为了消灭排队去起一会话一进程。

内存按 pi-web 的说明估算：每个脚本最多 256 MB，8 个同时顶满约 2 GB。他们接受了这个上限。本次不另调这个数，也不做设置页开关。设置里已有 Codemode 总开关，本 bug 不加新控件。

测试加在 `buddyServiceEnvironment.spec.ts`：未设置和空字符串得到 `"8"`；`"2"`、`"16"`、`"0"`、`"abc"` 原样保留。`codemode.spec.ts` 仍在测试进程里用 `vi.stubEnv` 验证 Pi 的解析，不要因为它而改服务环境的默认值。

## 验收

- 父进程没设这个变量时，服务进程环境里是 `PI_CODEMODE_MAX_WORKERS=8`。
- 父进程设过的值原样进入服务进程，包括无效值。
- 两个会话可以同时跑过 2 个、不超过 8 个 `codemode` 脚本。
- 第 9 个仍排队，而不是立即失败。
- 现有的跨会话 FIFO 测试在显式 stub 环境变量时仍然通过。

## 相关记录

`docs/drafts/upstream-issue-codemode-worker-limit.md` 已发布为上游 Issue [useLexora/Lexora#397](https://github.com/useLexora/Lexora/issues/397)。那份记录的是更早的“满员立即拒绝”。当前 Pi 已改为排队 60 秒，并提供 `PI_CODEMODE_MAX_WORKERS`。剩下的是宿主默认值仍为 2。本次没有重新核对上游 Lexora 是否已经设置该变量。

也没有在本会话打开 `node_modules` 里的 `execute.js`。Pi 每次脚本读取该变量，依据是本地 `codemode.spec.ts`，以及 pi-web 对 `maxCodemodeWorkers()` 的源码断言。8 个 worker 的实际内存未测。
