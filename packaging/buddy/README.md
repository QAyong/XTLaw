# XTLaw Packaging

本目录提供 XTLaw 桌面安装包与独立桌宠的构建入口。产品说明见 [`apps/buddy/README.md`](../../apps/buddy/README.md)。

## 构建

| 产物 | 命令 |
| --- | --- |
| Ubuntu x64 / ARM64 deb | `pnpm --filter @uselexora/lexora-buddy package:deb` |
| Arch Linux x64 pacman | `pnpm --filter @uselexora/lexora-buddy package:arch` |
| Windows x64 / ARM64 NSIS | `pnpm --filter @uselexora/lexora-buddy package:windows` |
| macOS 15+ ARM64 DMG | `pnpm --filter @uselexora/lexora-buddy package:macos` |
| Linux x64 / ARM64 独立桌宠 | `pnpm --filter @uselexora/lexora-buddy package:pet` |

产物写入 `apps/buddy/.output/artifacts/`。桌面安装包内置 fd、ripgrep 与原生组件，Linux 还内置 Shell 沙箱 helper。构建需要 Rust 工具链；Linux 还需要 C 编译器、Meson、Ninja、libcap 开发包，运行沙箱需要 socat，包校验需要 `bsdtar`。Windows 构建需要 MSVC C++ Build Tools 与 Windows SDK；macOS 需要 Xcode Command Line Tools。各平台安装包在对应系统和 CPU 架构上构建和验证。

macOS 默认使用 ad-hoc 签名，无需 Apple 开发者证书。将 DMG 中的 `xtlaw.app` 拖入「应用程序」后，在终端运行以下命令，再打开应用。仅对从本项目 Release 下载或自行构建的应用执行：

```bash
xattr -r -d com.apple.quarantine "/Applications/xtlaw.app"
```

安装包未经过 Apple 公证；更新后如再次被系统阻止，重新执行上述命令。

## GitHub 自动发布（XTLaw）

发布源仅为 `QAyong/XTLaw` 的 `master`。采用**手动启动、自动构建和发布**：普通代码推送、合并版本 PR 或创建 tag 都不会触发正式发布。产品版本与上游 Lexora 独立；首次 `0.1.0` 通过当前源码快照校验，不要求它高于历史沿用的 `0.9.4`。后续准备版本仍必须递增。

### 首次启用

1. 将发布工作流和相关脚本提交、推送到自己的 `master`。
2. 在仓库 Settings → Actions → General 确认 Actions 可用，并允许工作流创建 Pull Request（使用版本准备流程时需要）。工作流已显式声明所需 token 权限，不需要在本地上传 GitHub 凭据。
3. 在 Settings → Environments 创建 **`xtlaw-release`**，限制仅 `master` 可以部署；仓库方案支持时配置 Required reviewers，在构建通过后人工批准发布。未设置审核规则的环境不会自动要求审批；受保护环境和产物证明的可用性取决于 GitHub 仓库可见性及方案，需要在仓库侧确认。
4. 确认 `v0.1.0` tag 和 Release 均未被占用；发布流程不自动删除、重写旧 tag 或覆盖已有 Release。

### 发布当前版本（首次为 0.1.0）

在 Actions → **XTLaw Release** → Run workflow 中选择 `master`，填写 `0.1.0`（不带 `v`）。输入必须与所选提交的产品版本完全一致，不会在发布时临时改版本。

工作流将依次：

- 验证所有产品版本一致、发布仓库和提交身份正确，检查 tag / Release 尚未存在；
- 构建并验证 Windows x64 / ARM64、Ubuntu x64 / ARM64、Arch x64、macOS ARM64 安装包；使用现有原生测试、安装与 GUI smoke 校验，不跳过失败平台；
- 所有平台通过后进入 `xtlaw-release` 环境，遵循仓库侧的审批规则；
- 为验证过的提交创建 `v0.1.0`，生成产物证明并创建 `XTLaw 0.1.0` Release，上传 6 个安装包和 `SHA256SUMS.txt`，再将草稿转为正式发布；
- 重新下载公开附件核对 SHA256。公开附件验证失败时，发布可能已经存在，需检查实际状态，不能视为尚未发布。

macOS 默认采用 ad-hoc 签名，不需要 Apple 签名凭据，但仍有上文所述首次安装限制。Windows 本流程未新增代码签名证书，不代表安装包已获得受信任签名。工作流需要相应 GitHub 托管 runner 的可用额度；未实际运行前，本地检查不能证明多平台发行验收通过。

### 仅远端打包（不发布）

在 Actions → **XTLaw Package Verification** → Run workflow 中选择 `master`，保持 `upload-artifacts` 开启。工作流构建并验证 Windows、Ubuntu 和 Arch 安装包，成功后可从本次运行的 Artifacts 下载；不会创建 tag 或 Release。macOS 使用 **XTLaw macOS Package Verification** 的手动入口，选择 `ad-hoc`，产物同样上传到 Actions。

这条入口不占用发布标签，适合正式发布前的安装验收，也适用于目标标签已经被历史版本占用时先构建当前源码。Artifacts 默认保留 7 天，不等于永久公开下载的 Release 附件。

当前远端继承的 `v0.1.0` 已指向旧上游提交 `6be2e72012da36a06313c0aa347d01792f1fc342`，并非 XTLaw 独立版本起点；正式发布入口会拒绝覆盖它。首次正式发布前需由维护者决定标签隔离策略，不自动删除或重写历史标签。

### 准备下一个版本（例如 0.1.1）

可在 Actions → **Prepare XTLaw Release** → Run workflow 中选择 `master`，填写 `0.1.1`。工作流验证版本递增、更新 5 个版本文件和构建时间戳，并创建 `codex/release-v0.1.1` 分支与版本 PR；无需预先创建 `skip-changelog` 标签。由维护者审核并合并到 `master` 后，再运行 **XTLaw Release**，填写 `0.1.1`。

也可以在本地使用 `pnpm release:version:set 0.1.1` 和 `pnpm release:version:check`，按正常约定提交版本变更并推送，再手动启动发布。不要重新运行版本准备流程来发布已在 `master` 中的相同版本；首次 `0.1.0` 直接走发布入口。

### 失败处理与应用更新

构建失败不会创建正式 Release，可修复后从 `master` 重新发起。若已经创建 tag 或草稿 Release，重新发起会因版本身份已占用而停止；先检查失败步骤与附件，不自动覆盖或删除发布身份。

正式 Release 使用 `vX.Y.Z` 标签，不勾选预发布。应用检查的是本仓库中版本号最高的稳定 Release，并打开发布页供用户手动下载安装；此流程**不等于应用内自动下载安装升级**，也未增加 `latest.yml` 升级器协议。原安装版 `0.9.4` 需手动切换到独立起点 `0.1.0`；若仓库中存在旧 `v0.9.x` 稳定 Release，还需先规划旧更新源的隔离。

## 校验

```bash
pnpm release:version:check
pnpm --filter @uselexora/lexora-buddy lint
pnpm --filter @uselexora/lexora-buddy type-check
pnpm --filter @uselexora/lexora-buddy test
pnpm check:buddy
```

`check:buddy` 是本地完整预检，包含质量检查、当前平台安装包构建和测试。
