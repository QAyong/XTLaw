# 已知测试失败（Windows 本机基线）

**生成日期：** 2026-10-13
**基线提交：** `065b1b48`（`master`，上游 `df0f9369` 之后的本地状态）
**命令：** 在 `apps/buddy` 下执行 `pnpm exec vitest run --maxWorkers=4`，进程环境设置 `NO_PROXY=127.0.0.1,localhost,::1`（避免本机代理改变 localhost 拒绝连接的结果）。
**结果：** 1014 个测试文件，3612 个用例：3509 通过、57 失败、46 跳过。

移植上游后只跑改动相关的测试；出现失败时先和下表比对，表中用例在干净基线上就失败，不是移植引入的。表格过期（基线换了、用例改名或新增 Windows 限制）时，在新的干净基线上重新生成。

前三类是 Windows 环境限制，在 Linux CI 上会通过：

- **符号链接权限**：普通用户在 Windows 上创建符号链接需要开发者模式或管理员权限，用例在准备夹具时报 `EPERM`。
- **Unix 套接字**：用例在临时目录监听 `.sock` 或要求父目录是 POSIX 私有目录。
- **POSIX 路径语义**：用例断言 `/home/...`、`/opt/...` 这类 POSIX 绝对路径，或依赖 POSIX 的文件 URL / 系统目录。

第四类在干净基线上同样失败，原因各不相同（Windows 路径分隔符、文件模式位、本地用例与现状不一致等），附上首行错误便于比对。

### 符号链接权限（EPERM）（29）

| 测试文件 | 用例 |
| --- | --- |
| `platform/extensions/__tests__/ExtensionPackageStore.spec.ts` | extension package contract detects installed file tampering and rejects development symlinks |
| `platform/extensions/__tests__/ExtensionResourceStore.spec.ts` | applies plugin filters inside a directory, refreshes files and revokes the directory independently |
| `platform/extensions/__tests__/ExtensionResourceStore.spec.ts` | rejects replacement and symlink retargeting without changing source files |
| `service/src/agent/execution/__tests__/BuddyTurnLauncher.spec.ts` | buddyTurnLauncher rejects a Space root that resolves to a different directory at launch |
| `service/src/agent/sessions/__tests__/createBuddySession.spec.ts` | createBuddySession discloses skill metadata in the real Pi prompt without preloading bodies or references |
| `service/src/agent/sessions/recovery/__tests__/inspectCommittedPiCompaction.spec.ts` | inspectCommittedPiCompaction rejects files outside the exact Buddy conversation branch directory |
| `service/src/attachments/__tests__/ComposerResourceService.spec.ts` | attachment working copies preserves working edits across restart and restores deleted copies without modifying the snapshot |
| `service/src/attachments/__tests__/ComposerResourceService.spec.ts` | composer resource import keeps Space text references live, preserves metadata at send, and migrates legacy draft tokens |
| `service/src/browser/__tests__/BrowserHostClient.spec.ts` | browserHostClient rejects direct and symlink escapes without calling Main |
| `service/src/browser/__tests__/BrowserHostClient.spec.ts` | browserHostClient resolves an existing granted local file before sending a grant-shaped Main request |
| `service/src/directories/__tests__/resolveGrantedPath.spec.ts` | resolveGrantedPath does not grant a missing target through a dangling symlink |
| `service/src/directories/__tests__/resolveGrantedPath.spec.ts` | resolveGrantedPath rejects existing targets reached through a symlink outside the grant |
| `service/src/directories/__tests__/resolveGrantedPath.spec.ts` | resolveGrantedPath rejects new targets whose nearest existing parent is a symlink outside the grant |
| `service/src/directories/__tests__/searchDirectoryEntries.spec.ts` | directory browsing and explicit deep search rejects traversal, hides sensitive files and excludes escaping symlinks |
| `service/src/permissions/__tests__/PermissionEngine.spec.ts` | permissionEngine uses canonical sensitive-path checks for shell reads and explicit Git content diffs |
| `service/src/permissions/__tests__/ToolAuthorizationService.spec.ts` | harness tool authorization rejects a path replaced while waiting without granting its new target |
| `service/src/plugins/__tests__/pluginAuthoringCapability.spec.ts` | rejects symlinked source files instead of packaging unrelated user data |
| `service/src/sandbox/__tests__/SandboxDirectoryPermissions.spec.ts` | run-scoped shell directory permissions rejects credentials, symbolic redirects, files and unrecognized request fields |
| `service/src/sandbox/__tests__/SandboxDirectoryPermissions.spec.ts` | run-scoped shell directory permissions revalidates directory identity after approval and before subsequent execution |
| `service/src/skills/__tests__/skillInstallation.spec.ts` | skill installation lifecycle preserves the complete document and previews files only within the selected package |
| `service/src/skills/__tests__/skillInstallation.spec.ts` | skill installation lifecycle rejects traversal in downloaded archives and symlinks in local packages |
| `service/src/skills/__tests__/pluginSkills.spec.ts` | plugin skills rejects symlink package resources during materialization and inspection<br>`Error: EPERM: operation not permitted, symlink`（Windows 创建符号链接需要权限） |
| `service/src/skills/__tests__/SkillPackageCache.spec.ts` | skillPackageCache does not reuse a cached package for an unauthorized root or after a resource becomes a symlink |
| `service/src/skills/__tests__/SkillPackageCache.spec.ts` | skillPackageCache reuses unchanged document bytes while detecting same-size edits and path escapes |
| `service/src/skills/__tests__/SkillService.spec.ts` | skillService does not let a skill file symlink leave its resolved skills directory |
| `service/src/skills/__tests__/SkillService.spec.ts` | skillService rejects a cached document replaced by a symlink outside its source |
| `service/src/skills/__tests__/SkillService.spec.ts` | skillService unloads revoked Space skills and rejects symlink escapes |
| `service/src/storage/__tests__/StorageSnapshots.spec.ts` | creates portable snapshots without credentials or recursive backups and restores in place with a recovery copy |
| `service/src/agent/extensions/__tests__/mutationToolExecution.spec.ts` | authorized mutation execution serializes overlapping grants across different working directories and preserves root, child and resumed root diffs |
| `service/src/attachments/__tests__/ImageBlobStore.spec.ts` | rejects corrupt, missing, linked and malformed blobs without replacing their contents |

### Unix 套接字（10）

| 测试文件 | 用例 |
| --- | --- |
| `electron/main/browser/__tests__/BrowserAdapterServer.spec.ts` | browserAdapterServer authenticates a short-lived capability bound to the current conversation session |
| `electron/main/browser/__tests__/BrowserAdapterServer.spec.ts` | browserAdapterServer fails closed before acquiring control for commit-like activation |
| `electron/main/browser/__tests__/BrowserAdapterServer.spec.ts` | browserAdapterServer only releases an in-flight action when its owning connection disconnects |
| `electron/main/browser/__tests__/BrowserAdapterServer.spec.ts` | browserAdapterServer rejects oversized or structurally invalid requests without exposing diagnostics |
| `electron/main/browser/__tests__/BrowserAdapterServer.spec.ts` | browserAdapterServer revokes capabilities immediately when the bound BrowserSession is destroyed |
| `electron/main/browser/__tests__/BrowserAdapterServer.spec.ts` | browserAdapterServer revokes only the adapter capability on close and keeps the browser page alive |
| `electron/main/browser/__tests__/BrowserAdapterServer.spec.ts` | browserAdapterServer validates, acquires, executes, and releases each safe action on the same session |
| `service/src/browser/__tests__/BrowserAdapterClient.spec.ts` | browserAdapterClient maps state, snapshot, action, and close over strict NDJSON requests |
| `service/src/browser/__tests__/BrowserAdapterClient.spec.ts` | browserAdapterClient rejects a response with a different request id |
| `service/src/browser/__tests__/BrowserAdapterClient.spec.ts` | browserAdapterClient surfaces stable server failures without response diagnostics |

### POSIX 路径语义（8）

| 测试文件 | 用例 |
| --- | --- |
| `electron/main/__tests__/rendererProtocol.spec.ts` | renderer protocol resolves renderer assets without allowing host or path escape |
| `electron/main/runtime/__tests__/buddyServiceEnvironmentPaths.spec.ts` | service environment and sensitive path policy preserves protection after filtering XDG_CONFIG_HOME |
| `electron/main/runtime/__tests__/buddyServiceEnvironmentPaths.spec.ts` | service environment and sensitive path policy preserves protection after filtering XDG_DATA_HOME |
| `electron/main/runtime/__tests__/buddyServiceProcess.spec.ts` | buddyServiceProcess closes pending RPC when the utility process exits |
| `electron/main/runtime/__tests__/buddyServiceProcess.spec.ts` | buddyServiceProcess finishes the capture and persists the terminal records when Electron removes stderr listeners at exit |
| `electron/main/runtime/__tests__/buddyServiceProcess.spec.ts` | buddyServiceProcess propagates a stderr read error and closes the capture before utility exit |
| `electron/main/runtime/__tests__/buddyServiceProcess.spec.ts` | buddyServiceProcess records stderr across chunks when the utility stream reaches EOF |
| `service/src/sandbox/__tests__/sandboxPermissions.spec.ts` | isolated shell permissions builds a private shell environment without provider secrets, host sockets or proxy inheritance |

### 其他（干净基线即失败）（14）

| 测试文件 | 用例 |
| --- | --- |
| `electron/main/__tests__/linuxAutostart.spec.ts` | linuxAutostart uses an absolute XDG config directory and rejects relative overrides<br>`AssertionError: expected '\home\lexora\.config' to be '/home/lexora/.config' // Object.is equality` |
| `service/src/agent/extensions/__tests__/toolPolicyExtension.spec.ts` | toolPolicyExtension always-confirm does not persist a directory grant when approval is activated for the turn<br>`Error: expected { block: true, …(2) } to be undefined` |
| `service/src/agent/extensions/__tests__/toolPolicyExtension.spec.ts` | toolPolicyExtension always-confirm projects a stable denial fact when the read-only profile blocks mutation<br>`Error: expected { block: true, …(2) } to deeply equal { block: true, …(2) }` |
| `service/src/agent/extensions/__tests__/toolPolicyExtension.spec.ts` | toolPolicyExtension always-confirm records directory grant persistence failure and blocks the tool<br>`Error: expected { block: true, …(2) } to deeply equal { block: true, …(2) }` |
| `service/src/agent/sessions/__tests__/createReusableBuddySession.spec.ts` | createReusableBuddySession maps Pi session write errors from compact to the stable storage code<br>`Error: expected Error: EISDIR: illegal operation on a dir… { …(3) } to match object { code: 'SESSION_STORAGE_UNAVAILABLE' }` |
| `service/src/agent/sessions/__tests__/createReusableBuddySession.spec.ts` | createReusableBuddySession maps Pi session write errors from prompt to the stable storage code<br>`Error: expected Error: EISDIR: illegal operation on a dir… { …(3) } to match object { code: 'SESSION_STORAGE_UNAVAILABLE' }` |
| `service/src/agent/sessions/__tests__/createReusableBuddySession.spec.ts` | createReusableBuddySession maps Pi session writes during turn activation to the stable storage code<br>`Error: expected Error: EISDIR: illegal operation on a dir… { …(3) } to match object { code: 'SESSION_STORAGE_UNAVAILABLE' }` |
| `service/src/attachments/__tests__/AttachmentOwnership.spec.ts` | attachment ownership stages a draft snapshot under the destination message and can roll it back<br>`AssertionError: expected [ { …(11) } ] to deeply equal [ ObjectContaining{…} ]` |
| `service/src/attachments/__tests__/ComposerResourceService.spec.ts` | composer resource import lists and references directories, AVIF and oversized videos without importing their contents<br>`AssertionError: expected '[LOCAL#1]\n[LOCAL#2]\n[LOCAL#3]\n\nIn…' to contain 'C:\Users\Lenovo\AppData\Local\Temp\bu…'` |
| `service/src/skills/__tests__/skillInstallation.spec.ts` | skill installation lifecycle installs without a workspace, preserves package resources and keeps selection identity across updates<br>`AssertionError: expected +0 to be 64 // Object.is equality` |
| `service/src/storage/__tests__/BuddyDataPaths.spec.ts` | buddyDataPaths keeps every durable conversation resource under one conversation directory<br>`AssertionError: expected 'D:\home\user\.lexora\buddy\conversati…' to be '/home/user/.lexora/buddy/conversation…' // Object.is equality` |
| `service/src/web/__tests__/WebCapabilityService.spec.ts` | web capability routing bounds concurrent cache retention without crossing conversation boundaries<br>`AssertionError: expected 438 to be 384 // Object.is equality` |
| `src/modules/tasks/widgets/transcript/__tests__/messageLinkRouting.spec.ts` | markdown link destinations routes nested anchor clicks in narration mode<br>`AssertionError: expected "vi.fn()" to be called with arguments: [ 'https://example.com' ]` |
| `service/src/permissions/__tests__/PermissionEngine.spec.ts` | permissionEngine forces confirmation for unknown capabilities and recognizable system mutations<br>`AssertionError: expected { type: 'allow' } to match object { type: 'ask', … }`（Windows 上 `lexora_host_shell` 走 PowerShell 策略，识别不到 `sudo`、`shutdown now`） |
