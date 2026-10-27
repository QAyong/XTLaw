# Windows 开发笔记（存档）

从 `AGENTS.md` 移出。项目现在在 WSL 里开发，以下内容只在回到 Windows 本机做开发预览、打包、安装包验证时参考。原主仓库 `D:\code\Lexora` 已删除，文中涉及该路径的结论是 2026-10-25 的实测记录。

## Windows 开发预览（Codex）
- 默认使用 `development` 档位和 `C:\Users\Lenovo\.xtlaw-dev`，沿用现有开发数据。
- 本机 MSIX 版 Codex 直接启动的子进程会继承 AppData 文件重定向，可能读取 `Packages\OpenAI.Codex_2p2nqsd0c76g0\LocalCache` 中的旧密钥副本；即使沙箱限制关闭、用户名相同，显示相同路径也不代表读取同一文件。不要直接在 Codex shell 中运行 `pnpm dev:buddy` 启动预览。
- 优先运行 `apps/buddy/.output/dev-preview/start-in-desktop.ps1`。该脚本属于本机临时产物；若被清理，重新创建桌面启动器：用 `Shell.Application.Windows().FindWindowSW(0, 0, 8, [ref]$desktopHandle, 1).Document.Application.ShellExecute(...)` 委托实际 Windows 桌面进程启动 PowerShell，再在仓库根目录执行 `pnpm dev:buddy`。仅调用新建 `Shell.Application` 对象自身的 `ShellExecute` 不足以避免重定向。后台 PowerShell 使用隐藏窗口，Electron 预览窗口正常显示。
- 启动后，从相同桌面进程上下文读取诊断日志，确认本次启动有 `runtime.ready` 且无 `credential.decrypt.failed`；不能只凭窗口出现认定启动成功，也不能用 Codex 直接读取的 AppData 日志替代此确认。
- 出现凭据解密失败时，先核对实际密钥副本的时间与哈希；不要删除凭据、重置开发数据或覆盖 `Local State` 来修复启动环境问题。
- **工作副本不要放在 `D:\code\Lexora\` 目录树里。** 2026-10-25 实测：放在 `D:\code\Lexora\.claude\worktrees\…`（以及 `D:\code\Lexora\` 下任何新建目录）里的 `electron.exe` 一启动就崩溃（退出码 `-2147483645`，即 `0x80000003`），同一文件放在临时目录或 `D:\code\` 下 `Lexora` 之外则正常；同目录里新编译的 `lexora-buddy-runtime-guard.exe` 会报 `RUNTIME_GUARD_FAILED`。在这个位置启动的进程令牌被限制（连 Git 的 `whoami` 都报 `NtCreateDirectoryObject 0xC0000022`）。用户关闭火绒实时防护后现象不变，所以不是火绒；按位置限制的原因没有查清。不要靠 `--no-sandbox`、`ELECTRON_OVERRIDE_DIST_PATH` 或复制 Electron 绕过（只会换成运行时守卫失败）。要用最新代码做开发预览或端到端测试，就在仓库外建工作副本：`git worktree add --detach D:\code\xtlaw-dev origin/master`，再 `pnpm install --frozen-lockfile`（约 4 分钟）。主仓库 `D:\code\Lexora` 里原来就有的 Electron 能正常运行，但可能不是最新代码，且有用户未提交的改动，不要为了预览去更新或改动它。
- 在仓库外的工作副本里启动：复制 `apps/buddy/.output/dev-preview/start-in-desktop.ps1` 到该副本的 `apps/buddy/.output/dev-preview-latest/`，只把 `$previewRepository` 改成该副本路径（写成 UTF-8 带 BOM，用 `pwsh` 7 运行），保留 `XTLAW_BUDDY_PROFILE=development` 和 `XTLAW_HOME=…\.xtlaw-dev`。用脚本生成路径时不要手写含 `\v`、`\n` 的字符串字面量，用 `os.sep.join` 拼接，否则会被转义坏。
- 复制出来的启动脚本里加一行 `$env:POWERSHELL_UPDATECHECK = 'Off'`：PowerShell 7 在控制台太窄或隐藏窗口里显示更新提示时会因 `PadRight(-17)` 崩溃（`totalWidth must be non-negative`），与应用无关。
- 开发预览与 `.playwright` 端到端测试共用同一份 `apps/buddy/.output/build/electron`（`electron-vite dev` 也会往里写）：跑端到端前先结束预览进程，再执行 `electron-vite build`。这条是预防措施，没有证据显示它造成过失败。不要同时开两个开发预览，也不要让预览和测试抢同一个开发数据目录或 Electron `userData`，会争单实例锁。
- 启动后的日志在 `C:\Users\Lenovo\.xtlaw-dev\logs\application.jsonl`。2026-10-25 在仓库外工作副本里的正常结果：有 `runtime.ready`，没有 `credential.decrypt.failed`；会出现 `sandbox.workspace_preparation.failed` 警告，但没有阻止启动。运行时守卫失败的特征是 `runtime.guard` 步骤的 `startup.step.failed`（`OPERATION_FAILED`），随后 `runtime.exited_abnormally` 反复重启。
- 排查"进程被限制"时，用同一个 Electron 以 Node 模式做对照：`ELECTRON_RUN_AS_NODE=1 <electron.exe> -e "require('fs').writeFileSync(process.env.TEMP+'\probe.txt','ok')"`，和系统 `node.exe`、仓库外副本比较；不要在用户的数据目录里写探测文件。

## Windows 安装包（Agent）
- 在 Git Bash 里运行 NSIS 安装包的静默参数要加 `MSYS_NO_PATHCONV=1`，否则 `/S` 会被转换成 `S:/`，安装包会拉起一个看不见的图形安装窗口，表现为"静默安装什么都不做"。用 PowerShell 的 `Start-Process -ArgumentList '/S'` 没有这个问题。
- 静默安装并且是升级时，安装脚本会执行 `XTLaw.exe --updated` 自动启动应用；之后再装会因为应用在运行而返回 32。每轮测试前后要确认并结束自己拉起的 XTLaw 进程，不要结束用户自己在用的进程。
- 自动化图形安装向导：按进程找到安装窗口，对"下一步/完成"按钮（控件 ID 1）发 `BM_CLICK`，遇到"请退出 XTLaw"选"是"（ID 6），同时用 Restart Manager（`rstrtmgr.dll`）每 0.1 秒记录谁占着 `Uninstall XTLaw.exe`。`powershell.exe` 5 读取不带 BOM 的 UTF-8 脚本会乱码，脚本用 `pwsh` 7 运行。
- 用户报告"不能打开要写入的文件 `Uninstall XTLaw.exe`"：2026-10-25 在同一台电脑上自动点击 18 次（同版本覆盖、旧版升级、应用运行中/未运行）都没有复现；安装脚本和打包配置自 10-15 起未改，与上游同构。先让用户在弹窗还在时叫停，不要点"忽略"，再抓占用者。

## Windows 打包：旧产物被占用时
- 清理 `.output/package/desktop` 出现 `EPERM`、`EBUSY` 或明确的“文件正被其他进程使用”时，先做一次只读检查。文件占用不等于权限不足，也不能仅凭 XTLaw 正在运行就认定是 Agent 锁住了文件。
- 不反复重试删除/重命名，不强杀正在承载当前会话的 XTLaw，不提权、不改 ACL。保留被占用的旧产物，优先绕开旧目录继续打包。
- 如果 `build:desktop` 已成功，仅清理旧目录失败，则复用本次构建，不重复编译；如果构建未完成或源码已变化，先重新执行 `pnpm --filter @uselexora/lexora-buddy build:desktop`。
- 备用打包命令：`pnpm --filter @uselexora/lexora-buddy exec electron-builder --config electron-builder.config.cjs --win nsis --x64 --publish never --config.directories.output=.output/package/desktop-rebuild-<时间戳>`。将 `<时间戳>` 替换为本次唯一值；目标架构非 x64 时改用实际架构。必须使用完整的 `--config.directories.output` 参数，不用 `-c.directories.output`，后者本机曾被误解析为配置文件路径。
- 备用流程不能跳过校验：使用 `packaging/buddy/release/verify-electron-bundle.mjs` 的 `verifyElectronBundle()` 检查构建，使用 `packaging/buddy/release/verify-package.mjs` 的 `verifyDesktopDirectory(新目录下的 win-unpacked 路径, 实际 targetId)` 检查新包；`targetId` 从 `resolveBuildTarget()` 获取，不猜测。
- 校验通过后，将新安装包放到 `apps/buddy/.output/artifacts/windows/`，核对文件大小与 SHA256，向用户交付实际生成的文件。不要误交付旧包；不要为绕开占用永久修改打包配置或源码。占用解除后的旧目录清理可另行处理，不阻塞交付。
