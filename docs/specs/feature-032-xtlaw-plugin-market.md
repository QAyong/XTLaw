# Feature-032：XTLaw 插件市场

**日期：** 2026-10-14
**更新：** 2026-10-24（标题自动生成 1.3.0、多 Shell 1.0.0 上架）
**状态：** 已实现

## 目标

重新开放插件页的远程市场，但不再指向上游 `useLexora/plugins`，改为 XTLaw 自己的插件仓库。首个上架插件是从上游移植的“标题自动生成”。

## 实现

- 市场目录地址 `EXTENSION_CATALOG_URL` 改为 `https://raw.githubusercontent.com/QAyong/xtlaw-market/main/catalog/v1/index.json`（`apps/buddy/shared/extensions/extensionCatalog.ts`）。
- `registerExtensionIpc.ts` 去掉 `catalogUrl: null`，插件服务使用上述默认地址。
- 2026-10-21 决定：Office DOCX、PPTX、XLSX 改由市场按需下载，后续应用安装包不再携带和预装。`plugins/` 保留源码，但新增目录不再自动纳入应用；默认内置目录为空，已安装的插件、启用状态与配置不删除。
- 三个 Office 插件沿用原 ID 与版本，市场安装继续经过下载哈希校验与权限审核，XLSX 的 WebAssembly 按非内置插件限额检查。旧版应用仍优先自己的内置目录；需要使用取消内置后的新版应用才能改从远程市场获取同 ID 插件。
- 安装包下载只接受 HTTPS 地址，并按目录登记的 SHA256 和大小校验；安装前照常显示权限审核。

## 插件仓库

[`QAyong/xtlaw-market`](https://github.com/QAyong/xtlaw-market)（公开，MIT）。2026-10-25 由 `xtlaw-plugins` 改名；旧地址（目录和已发布安装包的下载地址）由 GitHub 自动重定向，已发布的客户端不受影响，所以不要再用旧名字新建同名仓库：

- `plugins/<name>/`：插件源码。
- `catalog/v1/index.json`：市场目录，由 `scripts/build.mjs` 生成。
- 安装包发布在同名 GitHub Release（`<name>-v<version>`）。

构建脚本使用与 XTLaw 内置编译器相同的 TypeScript 选项，也支持直接打包已编译的 Office 插件，以及没有入口文件的纯声明插件（如多 Shell；有入口时仍须是 TypeScript）；固定压缩包内的文件时间，同一份源码生成相同的 SHA256。发布顺序：先上传 Release 安装包，再推送目录。Office 的第三方许可证与来源记录完整保留。

## 标题自动生成（`lexora.auto-title` 1.2.2）

- 移植自 `useLexora/plugins` 的 `auto-title` 1.2.2（MIT）。插件 ID、权限、设置项和代码与上游一致，编译产物与上游发布的 `extension.js` 逐字相同。
- 只改清单：`engines.lexora` 改为 `>=0.1.1 <1.0.0`，按 XTLaw 版本号判断兼容；`author` 改为 `XTLaw`。
- 权限：调用模型、读取触发任务的消息文本、修改任务标题。默认开启，与上游一致；开启后每个新任务额外调用一次模型。
- 首个版本安装包 SHA256：`504132ea4961b5d1a817170c35ecc3792d6284004f03593c85386f4549b4ee62`，5,024 字节。

## 标题自动生成 1.3.0（2026-10-24 上架）

- 移植自 `useLexora/plugins` 的 `auto-title` 1.3.0（上游 10-16 发布，MIT）。Release [`auto-title-v1.3.0`](https://github.com/QAyong/xtlaw-market/releases/tag/auto-title-v1.3.0)；插件仓库提交 `1891bad`（源码）、`fca795a`（目录）。
- 行为变化：只给启用后创建的新任务命名，在主模型开始回复（`task:reply:started`）后后台生成；已有任务保留原名。待命名任务记在插件存储里（上限 1024 条）。动作改为后台执行，去掉了 `lexora.auto-title.runnable` 条件。申请的权限不变：调用模型、读取消息文本、修改任务标题。
- 兼容范围 `>=0.2.0 <1.0.0`：任务创建、回复开始等钩子与后台执行随 `a81daae80`（移植上游 `6251ba91`）首次发布在 XTLaw 0.2.0。上游写的是 `>=0.12.0`。
- 只改清单的 `author`（`XTLaw`）、`engines.lexora`，以及 README 里的版本要求和“来源与修改”。`extension.ts` 与上游一致，编译产物 `extension.js` 与上游发布的 1.3.0 逐字相同。
- 安装包 SHA256：`57e03ad0c43ed9a1b79a2869ea1c3b3dcf6c8ca210c44d471074b96de8c7d3b3`，5,248 字节。

## 多 Shell · 命令执行（`p9b8f69c8f1c74ce5afcd83dba94e44c8.multi-shell` 1.0.0，2026-10-24 上架）

- 移植自 `useLexora/plugins` 的 `multi-shell` 1.0.0（上游 10-23 发布，MIT）。Release [`multi-shell-v1.0.0`](https://github.com/QAyong/xtlaw-market/releases/tag/multi-shell-v1.0.0)；插件仓库提交同上。
- 纯声明插件：没有入口和命令，只申请 `shells` 权限。声明 Bash、Git Bash、Zsh、POSIX sh、PowerShell 7+、Windows PowerShell 5.1、cmd 七个候选，设置项挂在内置 `settings.runtime` 的“命令解释器”分组下。检测、选择文件和保存配置由 XTLaw 原生设置处理，命令仍由核心受控执行；所有候选默认不启用，优先级 0 表示保持平台默认。
- 兼容范围 `>=0.3.1 <1.0.0`：多 Shell 配置随 `2c4ff250a`（移植上游 `d6cd5ec3`）首次发布在 XTLaw 0.3.1。上游写的是 `>=0.15.0`。
- 改动：`author`、`engines.lexora`、清单描述和 README 中的产品名改为 XTLaw，新增与标题插件相同的 MIT `LICENSE`；插件 ID、权限、候选和设置项与上游一致。
- 市场构建脚本原本要求源码插件必须有 TypeScript 入口，现改为无入口时跳过该检查。
- 安装包 SHA256：`0a6a0d195c7bec580a7a9796510ff57c12e9532eccb5dbadccd8b442fbed8a63`，3,703 字节。

## 未采用的做法

- 没有直接指回上游市场：上游插件的 `engines.lexora` 按上游 Lexora 版本号声明（如 `>=0.12.0`、`>=0.15.0`），在 XTLaw 的 0.x 版本号下会被判为不兼容，所以上游插件要改成 XTLaw 的版本范围后才上架。
- 2026-10-14 初稿还写过另一个原因：上游清单带有本地未实现的主题字段（`permissions.themeManagement`、`contributes.themes`），上游两个主题插件也依赖本地没有的主题引擎。这一条自 XTLaw 0.2.0 起不成立：主题引擎已移植（只取引擎，见 [upstream-20261016-theme-engine-integration.md](../upstream/upstream-20261016-theme-engine-integration.md)），这些字段能通过清单校验。但上游的 `lexora.themes` 1.0.3 与鲸鱼娘 1.0.1 仍未上架：XTLaw 已内置同 ID 的 `lexora.themes`，两者的关系要先评估；主题插件在 XTLaw 下能否运行也还没验证。
- 没有把标题插件做成内置：放在市场里，插件更新不需要重新发布 XTLaw 安装包。

## 验证

- 用 XTLaw 的 `ExtensionCatalogService` 与 `ExtensionPackageStore` 在临时目录中完成列出、下载、校验、审核和安装，目录显示为兼容，权限与上游一致。
- 线上目录与 Release 安装包可匿名访问，SHA256 与大小同目录登记一致。
- 插件相关单元测试：146 个用例中 143 通过，3 个失败为 `docs/known-test-failures.md` 中已记录的符号链接权限限制。`vue-tsc -b` 无错误，改动文件 ESLint 通过。
- 未在桌面窗口中实际安装并触发标题生成。

2026-10-24 同步 1.3.0 与多 Shell：

- 重新生成的市场目录里，三个 Office 条目与上一版完全一致，只有标题插件更新、多 Shell 新增。
- 用临时 spec（已删除，未留作测试）在 XTLaw 0.3.2 的 `ExtensionCatalogService`、`ExtensionPackageStore`、`ExtensionService` 上跑了三项，全部通过：五个条目均显示兼容；版本下限生效（0.1.1 两者都不兼容，0.2.0 与 0.3.0 只有标题插件兼容，0.3.1 起两者都兼容）；两个包能下载、通过校验与权限审核并安装，权限审核分别新增 `taskMessages`、`agent`、`models`、`tasks:title` 与 `shells`；多 Shell 不启动插件入口即可检测出七个候选，配置默认全部未启用、优先级 0。
- 两个 Release 的安装包匿名下载后，大小与 SHA256 同目录登记一致；推送后从 `raw.githubusercontent.com` 取到的线上目录也与之一致。
- 未做：没有在桌面窗口里实际安装并操作两个插件；解释器检测用的是模拟结果，没有在真机上跑固定版本探针；版本下限依据提交历史推算，没有在旧版 XTLaw 上实际运行。

## 后续

- 上游标题插件更新时，在每轮上游集成中检查并同步到插件仓库。
- 上游 `7e0e301f`（插件兼容性提示）已在 `7b3c707ec` 移植，见 [upstream-20261014-integration.md](../upstream/upstream-20261014-integration.md)。
- 评估是否上架上游的 `lexora.themes` 与鲸鱼娘：先解决与内置同 ID 主题插件的关系，再验证主题插件在 XTLaw 下的表现。
