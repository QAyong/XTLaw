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

## GitHub 远端打包与发布

远端任务使用 GitHub 上选定提交的源码，不会读取本机的未提交改动。以本地 `master` 为基准发布时，应先确认本地修改，再经确认提交并同步到 GitHub；运行任务后，在 Actions 详情核对提交 ID，确保它对应本次要发布的源码。

### 只生成安装包

在 `QAyong/XTLaw` 的 Actions 中手动运行 **XTLaw Package Verification**，选择源码分支，`platform` 可选 `all`、`windows` 或 `linux`，并开启 `upload-artifacts`。成功后从任务的 Artifacts 下载安装包；此流程不创建发布标签或 Release。macOS 单独运行 **XTLaw macOS Package Verification**，默认选择 `ad-hoc` 签名。

### 正式发布版本

1. 确保 GitHub 的 `master` 已包含本次确认的源码，且各处产品版本一致，可用 `pnpm release:version:check` 检查。
2. 首次发布现有 `0.1.0` 时，无需增加版本号。后续版本先在 `master` 上运行 **Prepare XTLaw Release**，填写更高版本（如 `0.1.1`），检查并确认合并它生成的版本 PR。
3. 在 `master` 上手动运行 **XTLaw Release**，填写与源码一致的版本号。更新版本文件或合并 PR 不会自动发布。
4. 所有平台打包和安装验证通过后，工作流检查产物、创建标签、上传安装包并发布 Release。`xtlaw-release` 环境若配置了审批人，会在发布前等待审批。

软件版本显示为 `0.1.0`；发布标签使用 `xtlaw-v0.1.0`，与上游标签分开，应用更新检查使用相同规则。已存在的标签或 Release 会阻止重复发布，不会自动覆盖。仅生成过 Actions 安装包不代表已正式发布。

准备版本的工作流需要创建 PR；使用前应在仓库 Settings → Actions → General 中启用 **Allow GitHub Actions to create and approve pull requests**。首次直接发布已有版本不需要运行准备工作流。

## 校验

```bash
pnpm release:version:check
pnpm --filter @uselexora/lexora-buddy lint
pnpm --filter @uselexora/lexora-buddy type-check
pnpm --filter @uselexora/lexora-buddy test
pnpm check:buddy
```

`check:buddy` 是本地完整预检，包含质量检查、当前平台安装包构建和测试。
