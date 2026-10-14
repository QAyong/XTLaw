# Feature-032：XTLaw 插件市场

**日期：** 2026-10-14
**状态：** 已实现

## 目标

重新开放插件页的远程市场，但不再指向上游 `useLexora/plugins`，改为 XTLaw 自己的插件仓库。首个上架插件是从上游移植的“标题自动生成”。

## 实现

- 市场目录地址 `EXTENSION_CATALOG_URL` 改为 `https://raw.githubusercontent.com/QAyong/xtlaw-plugins/main/catalog/v1/index.json`（`apps/buddy/shared/extensions/extensionCatalog.ts`）。
- `registerExtensionIpc.ts` 去掉 `catalogUrl: null`，插件服务使用上述默认地址。
- 内置 Office 插件照常预装。市场中与内置插件 ID 相同的条目会被隐藏，内置插件仍以本地目录为准。
- 安装包下载只接受 HTTPS 地址，并按目录登记的 SHA256 和大小校验；安装前照常显示权限审核。

## 插件仓库

[`QAyong/xtlaw-plugins`](https://github.com/QAyong/xtlaw-plugins)（公开，MIT）：

- `plugins/<name>/`：插件源码。
- `catalog/v1/index.json`：市场目录，由 `scripts/build.mjs` 生成。
- 安装包发布在同名 GitHub Release（`<name>-v<version>`）。

构建脚本使用与 XTLaw 内置编译器相同的 TypeScript 选项，并固定压缩包内的文件时间，同一份源码生成相同的 SHA256。发布顺序：先上传 Release 安装包，再推送目录。

## 标题自动生成（`lexora.auto-title` 1.2.2）

- 移植自 `useLexora/plugins` 的 `auto-title` 1.2.2（MIT）。插件 ID、权限、设置项和代码与上游一致，编译产物与上游发布的 `extension.js` 逐字相同。
- 只改清单：`engines.lexora` 改为 `>=0.1.1 <1.0.0`，按 XTLaw 版本号判断兼容；`author` 改为 `XTLaw`。
- 权限：调用模型、读取触发任务的消息文本、修改任务标题。默认开启，与上游一致；开启后每个新任务额外调用一次模型。
- 首个版本安装包 SHA256：`504132ea4961b5d1a817170c35ecc3792d6284004f03593c85386f4549b4ee62`，5,024 字节。

## 未采用的做法

- 没有直接指回上游市场：上游插件清单带有本地未实现的主题字段（`permissions.themeManagement`、`contributes.themes`），版本范围按上游 Lexora 版本号声明，在 XTLaw 中都会被拒绝；上游两个主题插件也依赖本地没有的主题引擎。
- 没有把标题插件做成内置：放在市场里，插件更新不需要重新发布 XTLaw 安装包。

## 验证

- 用 XTLaw 的 `ExtensionCatalogService` 与 `ExtensionPackageStore` 在临时目录中完成列出、下载、校验、审核和安装，目录显示为兼容，权限与上游一致。
- 线上目录与 Release 安装包可匿名访问，SHA256 与大小同目录登记一致。
- 插件相关单元测试：146 个用例中 143 通过，3 个失败为 `docs/known-test-failures.md` 中已记录的符号链接权限限制。`vue-tsc -b` 无错误，改动文件 ESLint 通过。
- 未在桌面窗口中实际安装并触发标题生成。

## 后续

- 上游标题插件更新时，在每轮上游集成中检查并同步到插件仓库。
- 上游 `7e0e301f`（插件兼容性提示）仍待单独成轮；市场开放后，它对不兼容条目的提示更有用。
