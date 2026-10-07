# Bug：卷上回收站目录存储名大小写不一致导致「移到回收站」被拒绝

**日期：** 2026-10-07<br>
**优先级：** 中<br>
**状态：** 已修复，用户验收通过（Windows 开发版；安装版需重新打包后生效）<br>
**代码基准：** `master` @ `40458c3e`（工作区存在与本问题无关的未提交改动）<br>
**环境：** Windows 11 家庭版 中文版（10.0.26300，x64）；XTLaw 0.9.4 安装版与本仓库开发版（`apps/buddy`，产品名 XTLaw Dev）；工作区位于 D: 卷

## 复现步骤

1. 启动桌面版，打开工作台文件管理器，定位到 D: 卷上的工作区（本机为 `D:\code\Lexora`）。
2. 选中该卷上的文件（本机为 `pr-assets/session-reference-answer.png`）。
3. 右键 → 移到回收站 → 确认。

## 实际结果

确认框内显示红色提示「当前平台或文件系统无法安全执行此操作，未修改文件」，文件保持原样（大小与时间戳未变，未被移到回收站或任何其他位置）。

同一次会话中的其他操作正常：同一目录下新建文件、重命名均成功。把同样的文件放在 C: 卷（如 `%TEMP%`）上，用同一个 helper 回收成功。

## 预期结果

D: 卷上的文件移动到系统回收站，可从回收站恢复。判断应基于卷的文件系统能力、回收站目录是否存在且归属当前用户，不应因该目录在磁盘上的存储大小写而拒绝。

## 影响范围

- 影响：回收站根目录在磁盘上的**存储名不是 `$Recycle.Bin`**（例如全大写 `$RECYCLE.BIN`）的卷上，该卷内所有「移到回收站」操作失败。本机 D: 卷即为这种情况；C: 卷存储名为 `$Recycle.Bin`，不受影响。
- 不影响：同一卷上的新建文件、新建目录、重命名；读取、预览、保存也不受影响。
- 无数据风险：失败发生在准备阶段，属于 fail-closed，不删除、不覆盖、不移动。用户仍可用系统资源管理器删除（资源管理器走 Shell API，NTFS 本身不区分大小写）。
- 同一根因的第二个入口：`pin_directory` 对**请求路径**也使用同一个区分大小写的规范路径比较（`windows.rs:171`，源路径见 `windows.rs:94`）。本机实测：请求路径中仅大小写与磁盘存储名不同的目录时，helper 返回 `unsafe-path`。若工作区根目录或祖先目录以与磁盘不同的大小写被引用，应用侧表现会是「此路径包含链接或超出授权目录，不允许修改」，而不是本文的「平台或文件系统无法安全执行」。该应用侧路径尚未实际复现。
- 文案归属需注意：`unsupported` 同时也是 helper 缺失、平台不属于 win32/darwin/linux、stderr 无法识别时的兜底原因（`mutateBoundedEntry.ts:19`、`:42`）。本文只说明本次实例的确切原因，不能用这条文案反推所有同类报告都是大小写问题。

## 初步判断

「移到回收站」由原生 helper `lexora-buddy-file-reader.exe --mutate-entry` 执行。它在开始前会把目标所在的各级目录按句柄固定（`pin_directory`），并用 `GetFinalPathNameByHandleW` 取回的**磁盘真实路径（含存储大小写）**与传入路径做 `!=` 比较，用于防止路径替换。该比较区分大小写，而回收站根目录路径是代码里硬编码的字符串：

- `apps/buddy/native/host/src/file_mutation/windows.rs:171`：`final_path(&handle)? != directory.to_string_lossy().trim_end_matches('\\')`
- `apps/buddy/native/host/src/file_mutation/windows/recycle.rs:67`：`let bin = Path::new(volume).join("$Recycle.Bin");`
- `recycle.rs:94`、`:95`：`pin_directory(&bin / &directory).map_err(|_| MutationError::Unsupported)?`

本机 D: 卷回收站根目录的存储名为 `$RECYCLE.BIN`（全大写），因此比较结果永远不相等：`pin_directory` 返回 `UnsafePath`，再被 `recycle.rs` 的 `map_err` 一律改写为 `MutationError::Unsupported`（`file_mutation.rs:22`，stderr 输出 `unsupported`），协议层 `spaceFileMutationErrorSchema` 解析为 `reason: 'unsupported'`，界面据此显示 `desktop.context.fileError.unsupported`。

NTFS 大小写不敏感但**保留创建时的大小写**：同一个目录可以既叫 `$RECYCLE.BIN` 又叫 `$Recycle.Bin`，资源管理器与 Shell API 都能正常使用，只有逐字节比较的代码会把它们当成不同路径。

| 名称 | 含义 |
|---|---|
| `$Recycle.Bin` / `$RECYCLE.BIN` | 回收站根目录在磁盘上的存储名；大小写不同、指向同一目录 |
| `pin_directory` | helper 中按句柄固定目录并校验其规范路径的步骤 |
| `GetFinalPathNameByHandleW` | 由句柄取回磁盘真实路径，含存储大小写 |
| `unsupported` | helper 的错误标记，同时是回收站定位失败与兜底失败共用的一种原因 |
| fail-closed | 校验未通过即拒绝，不做任何修改 |

## 证据等级与实测记录

- **实测（本机）：** 下列 helper 调用与 Win32 诊断在 2026-10-07 完成。探针使用 `--mutate-entry` 并手工完成 `ready` → `commit` 握手，全部在自建 `.tmp-*` 临时目录与 `%TEMP%` 内进行，探针目录已删除；用户原文件 `pr-assets/session-reference-answer.png` 未被访问或修改（大小 31312 字节、时间 2026-09-29 23:02:48 未变）。
- **代码确认：** 上述实现与文案链路。
- **未验证：** 除文件管理器右键删除以外的删除入口；Windows 10、ReFS/exFAT、网络盘或移动介质上的表现；修复后的回归。

被调用的两个 helper 二进制（开发版与安装版）：

| 二进制 | 大小 | 时间 |
|---|---|---|
| `apps/buddy/.output/build/native/x86_64-pc-windows-msvc/release/lexora-buddy-file-reader.exe` | 478208 | 2026-10-07 14:40:43 |
| `C:\Users\Lenovo\AppData\Local\Programs\XTLaw\resources\native-host\lexora-buddy-file-reader.exe` | 478208 | 2026-10-07 16:13:20 |

行为对照（同一台机器、同一批临时文件）：

| 调用 | 卷 / 路径 | 结果 |
|---|---|---|
| `create-file` | D: 工作区内临时目录 | 成功（stdout `ready` + `"file"`） |
| `rename` | D: 工作区内临时目录 | 成功 |
| `trash` | D: 工作区内临时文件 | **失败，stderr=`unsupported`，文件保持原位** |
| `trash` | C: `%TEMP%` | 成功 |
| `create-file`（请求路径中目录写成 `.TMP-CASE-PROBE`，磁盘存储名为 `.tmp-case-probe`） | D: | 失败，stderr=`unsafe-path` |
| `trash`（安装版 helper） | D: | 失败，stderr=`unsupported`，与开发版一致 |
| `trash`（安装版 helper） | C: | 成功 |

Win32 逐项复现（用与 `pin_directory` 相同的访问掩码与标志）：

| 检查项 | `C:\$Recycle.Bin` | `D:\$Recycle.Bin` |
|---|---|---|
| `GetFinalPathNameByHandleW` | `\\?\C:\$Recycle.Bin` | **`\\?\D:\$RECYCLE.BIN`** |
| `GetDriveTypeW` | 3（固定盘） | 3（固定盘） |
| `GetVolumeInformationW` 文件系统 | NTFS | NTFS |
| `CreateFileW`（LIST_DIRECTORY \| READ_ATTRIBUTES \| READ_CONTROL） | 成功 | 成功 |
| `GetSecurityInfo` 所有者 | 当前用户 SID | 当前用户 SID |
| 回收站 `<SID>` 子目录存在性 / 属主 | 存在 / 当前用户 FullControl | 存在 / 当前用户 FullControl |

卷类型、文件系统、目录存在性、ACL、属主、句柄打开均不是原因；唯一不匹配的是 `$Recycle.Bin` 这一层目录名的存储大小写。C: 与 D: 的唯一差别即此项，而两者行为相反，可排除「随机失败」与「版本差异」。

## 为什么现有测试没有覆盖

- `apps/buddy/native/host/__tests__/file_mutation_windows.rs:219` 的 `recycle_fixture` 用私有 `fixture-bin` 目录替换真实系统回收站，测试从不接触真实 `$Recycle.Bin` 的存储名。
- `apps/buddy/service/src/spaces/__tests__/SpaceFileMutation.spec.ts:104` 确实包含走真实回收站的原生用例（仅在 win32 运行，含文件、非空目录、回收后恢复），但其 fixture 工作区由 `mkdtemp(join(tmpdir(), ...))`（`:21`）建在系统临时目录，即系统盘（本机 C: 卷），该卷的存储名恰好与硬编码一致，因此在遇到 `$RECYCLE.BIN` 卷前不会失败。
- 界面与服务层用例只注入结果：适配器用例固定返回 `unsupported`（`:89`）用于验证「不退回永久删除」，界面用例注入 `open-resource`、`result-unknown` 验证文案与刷新，都不覆盖原因来源。

即：真实回收站路径只在系统盘上被测过，D: 卷这类存储大小写不同的卷没有入口覆盖。

## 修复建议

1. **高：** 让 `pin_directory` 的规范路径比较（`windows.rs:171`）与源路径比较（`windows.rs:94`）按大小写不敏感处理（例如 `eq_ignore_ascii_case`），或改为与磁盘真实名逐段比对；保留 `\\?\` 前缀校验与重解析点拒绝，不削弱防路径替换能力。
2. **高：** 不要把回收站定位失败与「平台/文件系统不支持」合并：为 `recycle.rs:94`、`:95` 的失败保留可识别原因（至少不要一律改写为 `unsupported`），必要时新增诊断码，避免把可直接诊断的本机问题伪装成平台限制。
3. **中：** 补测试：回收站根目录名与磁盘存储名大小写不一致时仍能成功回收；对称地，祖先目录大小写不一致不应被误判为 `unsafe-path`，而真实重解析点仍必须拒绝。可考虑把真实回收站用例的工作区放到存储名与硬编码不同的卷上（需可配置），或在原生测试中直接构造大小写不一致的 bin 目录。
4. **中：** 在 `docs/specs/feature-019-file-manager-basics.md` 的回收站小节记录该边界条件（卷上回收站目录存储名大小写）。

实施情况见下文「处理方式」。

## 处理方式（2026-10-07）

1. **修复大小写比较。** 在 `apps/buddy/native/host/src/file_mutation/windows.rs` 新增 `same_path`（`eq_ignore_ascii_case`），替换源路径校验（原 `windows.rs:94`）与 `pin_directory` 目录校验（原 `windows.rs:171`）两处 `!=` 比较。ASCII 折叠覆盖驱动器号与 `$Recycle.Bin`；非 ASCII 大小写差异仍失败关闭。
   - 安全性不变：句柄始终由被比较的请求字符串打开，准备阶段拒绝重解析点，`path.starts_with(root)` 的词法包含判断保持大小写敏感。大小写折叠只会接受「请求本身已解析到的那个条目」，不会接受替换路径。
2. **未改动读取路径。** `host/src/file_reader/windows.rs` 注释明确「大小写敏感的包含关系同时保护大小写敏感的 NTFS 目录」，属于有意设计，本次不改。
3. **未改动写入路径（同一模式，遗留项）。** `host/src/file_writer/windows.rs:33`、`:45`、`:76` 是同类「句柄路径 vs 请求路径」比较。本机未观察到保存失败，改动会扩大影响面，因此保留；若后续出现路径大小写可疑的保存失败，可按同一方式处理。
4. **未改回收站失败归类。** `recycle.rs:94`、`:95` 仍把定位失败一律改写为 `unsupported`：卷上确实没有可用回收站时仍会显示同一句「平台或文件系统无法安全执行」。这是诊断可读性问题，需协议新增原因码，本次未做。
5. **补充测试**（`native/host/__tests__/file_mutation_windows.rs`）：`path_casing_differences_resolve_to_the_same_entry`、`recycle_destination_pins_a_differently_cased_bin_directory`、`path_comparison_folds_ascii_case_only`。
6. **重建开发版 helper 使其立即生效**（在 `apps/buddy` 执行）：

```
cargo rustc --locked --release --target x86_64-pc-windows-msvc --target-dir .output/build/native \
  --manifest-path native/Cargo.toml --package lexora-buddy-host --bin lexora-buddy-file-reader \
  -- -C target-feature=+crt-static
```

安装版 `C:\Users\Lenovo\AppData\Local\Programs\XTLaw\resources\native-host\` 下的旧二进制未替换，需重新打包安装后生效。

## 验收记录（2026-10-07）

| 项目 | 结果 |
|---|---|
| `cargo test -p lexora-buddy-host --lib` | 58 项通过（含新增 3 项） |
| `cargo fmt --check`（本次改动文件） | 无差异；`file_reader.rs`、`file_writer.rs` 存在与本次无关的既有格式差异，未改动 |
| `vitest run --project=runtime SpaceFileMutation.spec.ts` | 9 项通过，含真实回收站回收与恢复用例 |
| helper 重建产物 | `lexora-buddy-file-reader.exe`，478720 字节，2026-10-07 22:59:25 |

helper 冒烟（直接以 `--mutate-entry` 调用；探针文件已从回收站恢复并删除探针目录；用户原文件全程未动）：

| 场景 | 修复前 | 修复后 |
|---|---|---|
| D: 新建文件 | 成功 | 成功 |
| D: 重命名（源路径大小写不同） | 失败 `unsafe-path` | 成功 |
| D: 移到回收站 | **失败 `unsupported`** | **成功，文件进入系统回收站** |
| C: 移到回收站 | 成功 | 成功 |
| 目标不存在 | `missing` | `missing` |
| 路径含 `..` 逃出授权根 | `unsafe-path` | `unsafe-path`，目标未变 |
| junction 祖先 | `unsafe-path` | `unsafe-path`，目标未变 |
| 从系统回收站恢复（Shell undelete） | 未测 | 两个探针文件均可恢复 |

仍未验证：安装新包后的行为；除本机 D: 外的其他卷（ReFS、exFAT、网络盘、移动介质）。

**用户验收（2026-10-07）：** 用户回复验收通过。本文档按用户反馈记录结论，不推断其执行的具体操作范围。

**提交：** 先前按用户要求暂缓；用户现已授权将此修复与本轮界面调整一并提交，按独立提交组织，范围为原生修复、对应测试、本文档与 `docs/specs/feature-019-file-manager-basics.md`，不推送远端。提交前重新执行 `cargo test --locked --manifest-path apps/buddy/native/Cargo.toml --target-dir apps/buddy/.output/build/native -p lexora-buddy-host --lib`，58 项通过。曾试提交一次（`ecf2a8f8`），随后按要求以 `git reset --mixed` 撤回，内容未丢失。

## 相关实现与测试

- 修复：`apps/buddy/native/host/src/file_mutation/windows.rs`（`same_path`、源路径校验、`pin_directory`）
- 新增测试：`apps/buddy/native/host/__tests__/file_mutation_windows.rs`（`path_casing_differences_resolve_to_the_same_entry`、`recycle_destination_pins_a_differently_cased_bin_directory`、`path_comparison_folds_ascii_case_only`）
- `apps/buddy/native/host/src/file_mutation/windows/recycle.rs:67`、`:94`、`:95`
- `apps/buddy/native/host/src/file_mutation/windows.rs:94`、`:157`、`:171`（`same_path` 定义在 `:214`）
- `apps/buddy/native/host/src/file_mutation.rs:22`
- `apps/buddy/platform/filesystem/mutateBoundedEntry.ts:19`、`:42`
- `apps/buddy/service/src/spaces/SpaceFileService.ts:45`
- `apps/buddy/shared/spaces/spaceFileApi.ts:70`
- `apps/buddy/src/i18n/locales/zh-CN/tasks.ts:191`（文案）、`apps/buddy/src/i18n/locales/en-US/tasks.ts:193`
- `apps/buddy/src/modules/tasks/widgets/context-panel/DesktopWorkspaceFileMenu.vue:204`、`:271`
- `apps/buddy/native/host/__tests__/file_mutation_windows.rs:219`
- `apps/buddy/service/src/spaces/__tests__/SpaceFileMutation.spec.ts:21`、`:89`、`:104`

## 验收建议

1. 在存储名为 `$RECYCLE.BIN` 的卷上，文件与目录（含已打开且有未保存内容、需要保存后继续的场景）都能移到回收站，并可在系统回收站中恢复。
2. 存储名为 `$Recycle.Bin` 的卷（本机 C:）行为不回归。
3. 请求路径大小写与磁盘存储名不一致时不再被误判；真实重解析点（junction / symlink / 指向卷外的路径）仍被拒绝。
4. 其他卷类型（ReFS、exFAT、网络盘、移动介质）在此修复后仍应保持 fail-closed，并给出与「平台不支持」不同的可诊断原因。

## 原始材料

用户提供的截图：确认框标题「移到回收站」，路径 `pr-assets/session-reference-answer.png`，提示文字「当前平台或文件系统无法安全执行此操作，未修改文件」。
