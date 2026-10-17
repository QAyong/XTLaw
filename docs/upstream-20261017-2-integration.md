# 上游集成记录：2026-10-17（第二轮）

分支：`codex/upstream-20261017-2`，基于本地 `master` 的 `2225cf7f`。

检查范围：`792a30ac..da16402e`，共 8 个提交，与 [Issue #7](https://github.com/QAyong/XTLaw/issues/7) 一致。机器人未移植任何提交；本轮沿用机器人的冲突报告，补查语义依赖后，经用户确认全部移植。

## 已移植

按上游顺序逐个 cherry-pick，所有提交使用英文（中文）说明并保留来源行；检查中产生的修复已归入对应移植提交。

| 上游提交 | 本地提交 | 内容与整合方式 |
| --- | --- | --- |
| `17674889` | `47991a4b` | 再次点击触发器关闭可搜索下拉框。沿用本地已替换的调用点与文案，吸收上游受控状态、输入框/清除按钮等豁免及测试；保留本地插槽参数透传，使用 `useSlots()` 避免上游无参插槽类型限制 |
| `250081aa` | `e1142be9` | 链接打开方式支持应用内／系统浏览器，默认应用内。配置、持久化、翻译与资源面板采用上游逻辑；设置页保留本地作用域样式。聊天和旁白保留本地 `externalLinkMode=host` 与文件预览路由，通过 ChatContent 注入的资源面板动作统一遵循设置，避免重复处理链接；执行详情保留来源会话和运行标识。保留本地聊天、身份迁移等测试，补充设置持久化、非法值拒绝、运行中切换及无任务时系统打开的测试 |
| `a1263b8b` | `eac5aa0b` | 状态弹窗工具名溢出修复。保留本地作用域样式，工具项可换行、名称截断、计数保持完整 |
| `49565eb8` | `3b808cfb` | 浏览器交互按权限模式审批，不再按按钮文字强制确认提交类动作；保留人工敏感输入阻止、目标过期校验及执行前复验。吸收任务授权边界提示词，保留 XTLaw 品牌和中文 Markdown 规则 |
| `41af0b69` | `2ad3e794` | 凭据库失败阶段、原因和白名单系统错误码进入结构化诊断；同步接入启动、备份与同步调用。默认数据目录仍为 `.xtlaw/buddy`，错误文案使用 XTLaw。初次移植保留的旧 RPC 诊断回调及 `causeCode` / `causeType` 已在后续清理中移除，统一使用上游凭据库内部结构化上报；保留日志导出脱敏测试和 Windows 文件模式位断言豁免 |
| `d45b38ce` | `13484421` | 审批详情及路径审查内容高度限制为 `min(24rem, 40vh)` 并内部滚动。本地 `cf76882e` 已有等价规则；初次移植重复增加的 CSS 已在后续清理中删除，保留本地原有规则、卡片样式与操作区 |
| `333a187c` | `69d453c5` | 设置控件右侧对齐：外观页下拉框使用内置 loading，移除外置 spinner 并改为单列；共享设置行吸收上游单列修复，保留本地外观插槽和布局 |
| `da16402e` | `c4179fd0` | 浏览器加载、输入事件、工具参数说明与打开回调时序修复。保留本地响应式预览框、childrenOnly 及人工操作夹具；隐藏时保留框尺寸和响应式视口变换，避免隐藏触发布局重置 |

## 跳过与依赖

- 无跳过，8 个提交全部移植。
- `d45b38ce` 在 `49565eb8` 后整合审批卡片；`da16402e` 在 `49565eb8` 后整合浏览器工具契约与扩展。
- 本区间无数据库迁移、依赖清单、Rust 或工作流变更，未执行 `pnpm install`。
- 未照搬上游版本号、发布配置、品牌或数据目录，未改内置智能体身份。
- 新增行品牌检查：无面向用户的 Lexora 品牌文案；`LexoraConfigPatch` 等类型名、`lexora_` 工具名、测试临时目录和隔离世界名称是代码标识，保持不变。

## 验证

- 最终 `pnpm --filter @uselexora/lexora-buddy type-check` 通过。
- 改动涉及的 spec 首轮 259 个用例全部通过。
- 补充回归覆盖本地聊天与旁白链接、聊天活动、浏览器人工操作、浏览器会话及 IPC、诊断日志读取与导出；并重跑新补充的资源面板测试。
- 两轮按测试文件去重：29 个文件，373 个用例通过，2 个原有用例跳过，0 失败。跳过项均为 `BrowserIntegration.spec.ts` 的 adapter endpoint 所有权测试。
- `git diff --check` 通过；每个移植提交的来源行均已核对。
- 本轮没有测试失败，无须重新生成已知失败基线；未跑全量测试、Playwright E2E、开发预览或打包，未验证真实浏览器页面视觉和原生输入交互。

## 自有 PR 回流核对与清理

- [#351](https://github.com/useLexora/Lexora/pull/351)：源自本地 `5881962c`；维护者追加 `f3ad428b` 完善下拉框交互与状态同步，本轮吸收最终合并版。
- [#357](https://github.com/useLexora/Lexora/pull/357)：源自本地 `316b5093`；维护者追加 `6677e220`，将诊断下沉到凭据库并完善覆盖、结构化数据与脱敏。本轮后续清理删除了 `DesktopRuntimeHost` 的旧 RPC 失败上报、`registerCredentialHostRpc` 的 `onFailure` / `CredentialHostFailure` / 失败描述适配，以及无人使用的 `causeCode` / `causeType`，RPC 仅转换安全错误码，凭据库统一上报。
- [#362](https://github.com/useLexora/Lexora/pull/362)：源自本地 `cf76882e`，功能本地已有；后续清理删除重复 CSS，滚动规则只保留一份。
- 清理后 `registerCredentialHostRpc.ts` 与上游 `da16402e` 完全一致；XTLaw 品牌、数据目录和安全错误返回不变。
- 清理验证：Buddy 类型检查通过；CredentialVault、ApplicationLogReader、applicationDiagnosticBundle、applicationDiagnostic 共 4 个相关测试文件、57 个用例全部通过。其中 RPC 加密不可用／加密失败用例断言诊断仅上报一次，且安全返回不包含凭据文本；解密失败测试断言不再保留旧错误描述字段。
- 清理未跑全量测试、E2E 或打包。

## 状态

`docs/upstream-baseline.json` 的 `lastChecked` 已推进到 `da16402ebc9a4f0d78a5da030b55fd7b5d395c25`。本轮经用户明确确认，以合并提交 `8028db96` 合并到 `master` 并推送，包含 8 个移植提交、集成记录和后续清理提交 `5f5ab848`。随后按用户要求远端发布 XTLaw 0.2.2，结果见下文。未在本地打包，未修改远程 Issue。

## XTLaw 0.2.2 远端发布日志

核对时间：2026-10-17 20:16（北京时间，UTC+8）。以下状态来自 GitHub Actions、Release 和标签 API，不以本地等待命令是否结束判断远端结果。

### 版本与来源

- 版本提交：`e9975b05c551f04b508e4effc9088d3632e0bfae`，提交说明为 `Prepare XTLaw v0.2.2 release (准备 XTLaw v0.2.2 发布)`，已推送到 `origin/master`。
- 仅更新 5 个版本文件及构建时间戳：根 `package.json`、`apps/buddy/package.json`、`apps/buddy/buddy.version.json`、`apps/buddy/native/pet/Cargo.toml`、`apps/buddy/native/Cargo.lock`，不含依赖变更。
- 版本一致性、发布标签匹配、递增版本迁移检查均通过；迁移检查使用完整的前后提交 SHA。
- 发布标签：`xtlaw-v0.2.2`，已核对指向上述版本提交。
- [发版工作流 39030004517](https://github.com/QAyong/XTLaw/actions/runs/39030004517)：`completed / success`。
- [正式发布页面](https://github.com/QAyong/XTLaw/releases/tag/xtlaw-v0.2.2)：名称 `XTLaw 0.2.2`，不是草稿，也不是预发布。

### 时间与校验结果

- 工作流创建：2026-10-17 19:46:59（北京时间）。
- 正式发布：2026-10-17 20:09:05（北京时间）。
- 工作流最终完成：2026-10-17 20:10:20（北京时间）。
- 共 11 个任务全部成功：发布来源校验；Ubuntu x64 / ARM64 构建校验；Arch 构建及安装校验；Windows x64 / ARM64 构建校验；macOS 15 ARM64 安装及 macOS 26 ARM64 兼容校验；发布；公开文件校验。
- `Verify public assets` 已通过，包含工作流配置中的公开安装包、校验和及来源证明校验。本次未另行下载所有安装包做本地安装测试。

### 已公开文件

GitHub Release 返回共 7 个文件，大小单位为字节。

| 文件 | 大小 |
| --- | ---: |
| `XTLaw-0.2.2-windows-x64.exe` | 175460649 |
| `XTLaw-0.2.2-windows-arm64.exe` | 167986046 |
| `XTLaw-0.2.2-linux-amd64.deb` | 157402992 |
| `XTLaw-0.2.2-linux-arm64.deb` | 150229956 |
| `XTLaw-0.2.2-arch-x86_64.pkg.tar.zst` | 186244492 |
| `XTLaw-0.2.2-macos-arm64.dmg` | 196851037 |
| `SHA256SUMS.txt` | 574 |

GitHub Release API 返回的 Windows x64 安装包 SHA256：`83d46b8276b05ca7ffc51ad7b019a6282b203b076919df380327a877f94f865c`；该值为远端资产元数据，本次未在本地重新计算。

上述发布状态于 2026-10-17 20:16 核对并补记；日志核对时未创建提交或推送。后续日志提交不改变发布内容，不移动、不覆盖已发布标签。
