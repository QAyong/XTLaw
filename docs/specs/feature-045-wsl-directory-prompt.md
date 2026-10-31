# Spec-045：空间目录在 WSL 里时，提示词告诉智能体改用 `wsl.exe` 执行命令

**日期：** 2026-10-31

**状态：** 已实现并提交（36d3ce4c8）：提示词、两处文字、测试；WSL 里跑过相关 spec、eslint 和类型检查。Windows 开发预览复测显示智能体已改用 `wsl.exe` 且 Linux 命令全部跑通，`/tmp` 脚本这条路和审批次数还没测，见第 5、6 节。

**相关：** [Spec-019：文件管理器基础](feature-019-file-manager-basics.md)（第 16 节：WSL 与网络目录）、[Spec-044：产出卡片在文件管理器中打开](feature-044-artifact-open-by-real-path.md)、`D:\code\Lexora\MOVED.md`（WSL 里的 AI 操作约定）

## 1. 要解决的问题

空间目录现在可以选 WSL 发行版里的目录，文件管理器的读、写、删、监听也已修好（Spec-019 第 16 节）。但智能体对此一无所知：

| 现象 | 原因 |
|---|---|
| 智能体看到的只是 `\\wsl.localhost\Ubuntu-24.04\home\...` 这串路径，不知道是 WSL | `createDirectoryContext` 把路径原样输出，没有任何类型说明 |
| 它在 UNC 路径下用 PowerShell 跑 `git`、`pnpm`，慢，还会撞 `safe.directory`、CRLF | shell 工具是 Windows 侧的 |
| 它不知道 `~/code/Foo` 才是 Linux 视角的同一个目录 | 没有路径对照 |
| 提示词说“shell 在 OS 沙箱里运行，只能改授权目录”，对 WSL 目录并不成立 | 执行提示词按 Windows 沙箱写死 |
| 工具描述写着 `no WSL`，与想要的做法矛盾 | `shellCapability.ts` 第 259 行 |

选 WSL 的初衷是 AI 写 bash 比写 PowerShell 稳得多（引号、管道、`sed`、`grep`、heredoc）。所以目标是：**让智能体在 WSL 目录里用 `wsl.exe` 进 bash 干活**。

## 2. 方案：只改提示词，不碰权限、沙箱和文件引擎

不新增 shell 后端，不新增解释器候选。`wsl.exe` 是一个普通的 Windows 程序，由现有的 PowerShell 或 Git Bash 去调用。智能体照提示词写命令，应用本身的执行路径不变。

这是**过渡方案**。以后做了真正的 WSL 后端，这段提示词的“请这样做”换成“应用已经这样做”即可，识别 WSL 目录的纯函数还能复用。

### 2.1 识别 WSL 目录

`apps/buddy/shared/files/wslPath.ts` 的 `parseWslPath` 已能解析 `\\wsl.localhost\<发行版>\...` 和 `\\wsl$\<发行版>\...`（含正斜杠写法、大小写、根目录），并有单测。**直接复用，不新增函数，不新增“目录类型”字段，不动数据库迁移。**

提示词每次组装时现算，所以已有的 WSL 空间不用重新添加，下一轮任务就生效。

### 2.2 提示词内容

在 `BuddySessionResources.ts` 的 `createDirectoryContext` 末尾追加一段（`createWslNotes`），**只有工作目录、主目录或附加目录里至少有一个命中 WSL 时才追加**；没有 WSL 目录的空间，提示词一个字都不变（有单测逐字比较）。

做法照搬 `MOVED.md` 第 1 节与第 3 节，不另起炉灶：**简单命令直接 `--exec` 程序，复杂命令先写成脚本再运行，脚本放 WSL 的 `/tmp`。**

实际写进去的内容（沿用现有英文，约 200 token，示例为单个目录）：

```
WSL directories (reached from Windows through \\wsl.localhost):
- \\wsl.localhost\Ubuntu-24.04\home\lenovo\code\Foo = Ubuntu-24.04:/home/lenovo/code/Foo
The shell tool runs on Windows, not in WSL. Run commands for these directories inside WSL, with Linux paths:
  wsl.exe -d Ubuntu-24.04 --cd /home/lenovo/code/Foo --exec <program> <args>
For pipes, variables or multi-line logic, use the write tool to save a bash script with LF line endings at \\wsl.localhost\Ubuntu-24.04\tmp\<unique-name>.sh, run it with wsl.exe -d Ubuntu-24.04 --cd /home/lenovo/code/Foo --exec bash /tmp/<unique-name>.sh, then delete it.
Use read/write/edit for file changes. These commands run on the host outside the shell sandbox and need host approval.
```

要点：

- **简单命令不套 `bash -c`。** 少一层引号，也更省 token。
- **复杂命令走脚本文件，不走 PowerShell 管道。** 基线里 PowerShell 写出的文件末行带 CRLF，管道给 `bash -s` 很可能同样带 `\r`；内置 `write` 工具写出来是 LF（实测），所以脚本交给它写。
- **脚本放 `/tmp`，不放项目目录。** `/tmp` 不在已授权目录里，用 `write` 写它会触发产品审批卡；先接受这点，实测时看会多弹几次再调整。
- **文件读写不强制走 `wsl.exe`。** 2026-10-31 实测（见第 5 节），内置 `write`/`edit` 在 WSL 目录上新建、覆盖、局部替换都成功，保留应用的变更追踪。
- 不带 `--user`：应用拿不到发行版里的用户名，用发行版默认用户。
- 命令示例用第一个命中的 WSL 目录（工作目录优先，其次主目录、附加目录）；每个命中的目录各列一行，相同路径只列一次。
- 只在命中 WSL 时才追加，普通空间不付任何 token；这段在系统提示里、一个空间内内容固定，服务商支持提示缓存时后续轮次只按缓存价计费。

**为压缩去掉的内容**（遇到问题再按需加回）：

| 去掉的 | 理由 |
|---|---|
| 非交互 bash 不加载 nvm 的提醒 | 找不到 `node`、`pnpm` 时再让用户在空间指令里补 |
| “保持 LF”（针对文件修改） | 实测内置工具写出来就是 LF；脚本一句里仍保留 |
| “WSL 没有回收站，删除不可恢复” | 用户决定不写进提示词；文件管理器里的删除确认框已有提示（Spec-019 第 16 节） |
| 沙箱文件系统限制的说明 | 合并进最后一句“在沙箱之外执行、需要宿主审批” |

### 2.3 改两处说明文字，避免自相矛盾

| 文件 | 现在 | 改成 |
|---|---|---|
| `service/src/sandbox/shellCapability.ts:259` | `no WSL, SSH, containers, PTY or persistent sessions` | `no SSH, containers, PTY or persistent sessions, and no WSL shell candidate (for WSL directories follow the Directory context notes and run commands through wsl.exe)` |
| `service/resources/skills/plugin-creator/references/shells.md:5` | `不使用 WSL、PTY 或交互终端` | `不使用 PTY 或交互终端；插件也不能声明 WSL 候选（WSL 目录里的命令由智能体用 wsl.exe 前缀执行，不属于解释器候选）` |

两处都在应用里，随应用版本走，和提示词放在同一个提交。

### 2.4 不改的东西

- **市场插件不改。** `multi-shell` 只声明解释器候选，其 README 的“不支持 WSL”指的就是候选，仍然成立；改它要走升版本、构建、发 Release 的流程，等以后做了原生 WSL 后端再一起改。
- 不改沙箱、审批、`detectShellPrograms`、文件引擎。
- 不在选目录时弹提示，不做 Linux 路径到 UNC 的输入转换。
- 不改执行提示词里的 Windows 沙箱段落；对 WSL 目录的修正由上面追加的那一段说明。

## 3. 已知限制

1. **君子协定。** 智能体可能不照提示词做，仍用 PowerShell 跑命令。靠措辞降低概率，应用不拦截。
2. **审批变粗。** 应用只看到“运行 `wsl.exe ...`”，分辨不出里面是 `ls` 还是 `rm -rf`，每条都按宿主命令审批。
3. **沙箱用不了。** Windows 沙箱大概率连不上 WSL，也管不到 9P 上的目录，实际只有完全访问模式能跑 `wsl.exe`（未实测）。
4. **WSL 里没有隔离。** 默认能访问 `/mnt/c`，且发行版里有免密 sudo。
5. **经 `wsl.exe` 改的文件没有应用级变更追踪。** 改完要靠 `git diff` 核对（MOVED.md 第 5 节）。
6. **进程取消。** Windows 侧的进程监管管不到 WSL 里的子进程，取消命令后 WSL 里可能还有残留进程。

## 4. 测试

- `shared/files/__tests__/wslPath.spec.ts` 已覆盖识别，没有改。
- `service/src/agent/resources/__tests__/BuddySessionResources.spec.ts` 新增三例：
  - 主目录是 WSL 目录：提示词含发行版、Linux 路径、`--exec <program> <args>` 和 `/tmp` 脚本路径，同一目录只列一次，修订哈希与普通目录不同。
  - 只有附加目录是 WSL 目录（`\\wsl$\Debian\var\log` 写法）：同样追加，命令用该发行版。
  - 没有 WSL 目录：`directoryContext` 与改动前逐字相同。
- 已在 WSL 里跑：上述两个 spec（14 例通过）、eslint（无输出）、`pnpm type-check`（需要 `NODE_OPTIONS=--max-old-space-size=6144`，默认堆会 OOM，与本次改动无关）。

## 5. 已有的验证记录

2026-10-31，Windows 开发预览（`D:\dev\Lexora-win`，`preview/office-locate`，已含 `3e6871a40`、`bf624ebe6`），空间目录选 `~/code/测试`，让智能体只用 `write`/`edit`/`read`：

| 步骤 | 结果 |
|---|---|
| `write` 新建 `hello.txt` | 成功 |
| `write` 覆盖已有文件（以前报 `FILE_RECOVERY_REQUIRED`） | 成功 |
| `edit` 局部替换（先读后写，走租约） | 成功，没有 `FILE_LEASE_INVALID` |
| `read` 读回 | 成功，4 行 |

从 WSL 一侧核对：文件内容是 `alpha / BETA / gamma / delta`，LF 结尾，23 字节，目录里没有残留的 `.lexora-save-*` 临时文件或备份。

### 基线：没有提示词时，智能体在 WSL 空间里怎么跑命令（2026-10-31）

同一个空间，让智能体只用 shell 做五步，提示词里不提 WSL。用的 shell 工具是 `powershell`，工作目录是 `\\wsl.localhost\Ubuntu-24.04\home\lenovo\code\测试`：

| 步骤 | 命令 | 结果 |
|---|---|---|
| 1 | `pwd; uname -a` | `pwd` 成功；`uname` 不存在，报错 |
| 2 | `grep -i "a" hello.txt \| wc -l` | `grep` 不存在，报错 |
| 3 | here-string 写 `demo.sh`，再 `./demo.sh` | 文件写入成功；运行无任何输出，Windows 不会按 shebang 执行 |
| 4 | `sed -i 's/BETA/beta/g' hello.txt; cat hello.txt` | `sed` 不存在，报错，替换没发生 |
| 5 | `git status` | Windows 版 git 能跑；该目录本来就不是仓库，所以没测到 `safe.directory` |

结论：五步里三步失败，两步不确定，**证实了没有提示词时智能体拿到的是 Windows 的 PowerShell，Linux 程序一个都用不了**。智能体自己说过 `wsl bash -lc "..."` 可以走 WSL，说明只要告诉它，它知道怎么做。

从 WSL 一侧核对 `demo.sh`（62 字节）：前两行是 LF，**最后一行是 CRLF**（`0d0a`）。也就是说 PowerShell 写出的文件换行符是混合的；`hello.txt` 没被动过（`sed` 失败）。命令输出里的中文目录名显示为乱码，是控制台 GBK 解码造成的。

### 复测：加了提示词之后（2026-10-31，提交 36d3ce4c8，预览副本合并后）

同一个空间、同一条五步提示词（其中写着“不要用 read、write、edit”）。智能体全部用 `powershell` 工具，命令里通过 `wsl.exe -d Ubuntu-24.04 --cd ... --exec bash -c "..."` 进 WSL：

| 步骤 | 基线 | 复测 |
|---|---|---|
| 1 `uname -a` | 报错，不存在 | 成功，输出 `Linux ... microsoft-standard-WSL2` |
| 2 `grep \| wc` | 报错，不存在 | 成功，输出 `4` |
| 3 写并运行 `demo.sh` | 写成，运行无输出 | 写成并运行，输出正确；其间一行 PowerShell 去 CR 的写法抛了 `MethodException`（智能体自己的写法问题，不影响结果） |
| 4 `sed -i` | 报错，不存在 | 成功，`BETA` 变 `beta` |
| 5 `git status` | 报错（本就不是仓库） | 同样报“不是 Git 仓库”，是正确结果 |

从 WSL 一侧核对：`hello.txt` 为 LF，内容 `alpha / beta / gamma / delta`；`demo.sh` 68 字节、可执行、全是 LF、没有 CR，只是末行没有换行；`/tmp` 里没有残留脚本。

结论：

- 提示词有效：智能体认出了 WSL 目录，Linux 命令全部在 Linux 里跑通。
- **中文没有乱码**：目录名 `测试` 和 git 的中文报错都正常显示（第 6 节第 4 项在这个场景下不成立）。
- **`/tmp` 脚本这条路没被测到**：测试提示词禁止了 `write`，智能体就自己用 `bash -c` 加 base64 绕过去，并因此出了那行小错。多层引号仍是薄弱点，要用不禁止 `write` 的提示词再测一次。
- 没记录：当时是沙箱还是完全访问模式、每条命令弹了几次审批。

**没验证的：** 文件管理器是否在约 2 秒内自动刷出；并发和大文件；在已有 git 仓库的 WSL 目录里写；租约身份（`dev:ino`）在 9P 上长期是否稳定，只能说这一次没问题。

## 6. 待确认

1. **`canonicalRoot` 的真实形态。** 提示词里显示的是 `realpath` 之后的路径，有可能是 `\\?\UNC\wsl.localhost\...` 这类前缀，`parseWslPath` 不认。实现时先在开发预览里把真实值打出来，再决定要不要在识别函数里兼容。
2. **智能体是否真的照做。** 在开发预览里用同一条基线提示词再跑一遍：看它是否用 `wsl.exe` 直接 `--exec`；管道和引号那几步是否改走 `/tmp` 脚本；`write` 到 `\\wsl.localhost\<发行版>\tmp\...` 会不会弹审批、弹几次；脚本是不是 LF。
3. **`wsl.exe` 在沙箱模式下能不能跑。** 影响文档里“只有完全访问模式可用”这句话，需要实测后改成事实。
4. ~~中文输出乱码。~~ 复测里中文目录名和报错都正常显示，暂不处理；换到别的场景再出现时再看。

## 7. 实施步骤

1. ~~`BuddySessionResources.ts`：`createDirectoryContext` 追加 WSL 段落，用 `parseWslPath` 判断。~~ 已完成。
2. ~~`shellCapability.ts` 与 `shells.md` 改文字。~~ 已完成。
3. ~~补 `BuddySessionResources.spec.ts` 的用例，跑相关 spec 和类型检查。~~ 已完成。
4. 在 Windows 开发预览里验证（第 6 节第 1、2、3、4 项），用基线提示词对比前后。**未做。**
5. 回填第 5、6 节，视结果决定是否加回压缩掉的内容。
