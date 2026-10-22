# 上游集成记录：2026-10-19（第二轮）

分支 `codex/upstream-20261019-2`，从 `master`（`ba46e981`）切出。区间 `6c636187..upstream/master`（`93644a07`），共 3 个上游提交；本轮移植 1 个、跳过 2 个（本地已有），区间内全部有结论。

## 已移植

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `6a6de765` | `Port upstream 6a6de765` | 重构 Windows 沙盒并简化权限策略（67 个文件，含 Rust 原生代码，`Cargo.toml` 仅增加 `windows-sys` 的三个 feature，无依赖版本变化，无迁移）。冲突 4 处：`apps/website/src/guide/permissions.md` 本地已删除，保持删除；`shell_sandbox.windows.mjs` 取上游的租约目录断言，目录名改为 `XTLaw Sandbox`；`createBuddySystemPrompt.ts` 取上游的沙盒文案，保留本地的“外部网络授权”措辞和 “XTLaw service user”，并删除不再使用的 `hostIpc`；`PermissionEngine.ts` 两个 import 都保留。**偏离上游（品牌隔离）**：沙盒本地账户前缀 `Lexora` → `XTLaw`（`account.rs`；账户名长度校验改为按 `NAME_PREFIX` 计算，之前写死 18/20 位导致 CI 里全部账户被拒、沙盒报 `SANDBOX_UNAVAILABLE`，以后上游再改前缀或长度要一并检查 `valid_name`）。全局互斥锁 `Global\LexoraBuddySandbox{Acl,Root,Denials}` **保持上游名字不改**：源码注释说明两个产品有意共用它来串行化同一目录的 ACL 改写，改名会让两个产品互相看不到对方的锁 |

## 跳过

| 上游提交 | 原因 |
| --- | --- |
| `93067d66` | 本地已移植（`d9fc122c`） |
| `93644a07` | 本地已有等价改动（`e4c2db64`，`git patch-id` 一致） |

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 由 `6c636187` 推进到 `93644a07`。

## 检查

- 新增行品牌检查：账户前缀与命名对象已改为 XTLaw；其余 `lexora-buddy-sandbox.exe`、`lexoraDesktop`、`lexora-app:` 等为标识，保留。`windowsSandbox.spec.ts` 里测试常量 `C:\Program Files\Lexora Buddy Sandbox\…` 为本地原有，未动。
- `pnpm type-check`（`apps/buddy`）通过。
- 未在本机跑任何测试、`cargo check`、Playwright E2E、开发预览或打包；按用户要求，验证交给 PR 上的 `XTLaw CI`（含 native checks）。沙盒涉及真实 Windows 账户与 ACL，Windows 实机行为（安装沙盒、授权目录、租约恢复）未验证，合并前建议在本机用 `shell_sandbox.windows.mjs` 补跑。
