# Spec-001：XTLaw 简单改名

**日期：** 2026-09-21
**状态：** 已验收

## 1. 背景

当前项目基于 PI-Desktop 二次开发，产品计划改名为 `XTLaw`。本次只做简单品牌替换，让用户在应用界面和安装包中看到新名称，不进行大规模内部重构。

## 2. 目标

- 将用户可见的 `PI-Desktop` 改为 `XTLaw`。
- 将安装包、快捷方式和发布文件中的显示名称改为 `XTLaw`。
- 保持现有功能、数据目录、插件、运行时和协议不变。

## 3. 文件与术语说明

| 原名称 | 中文含义 | 本次处理 |
| --- | --- | --- |
| `APP_NAME` | 应用显示名称 | 改为 `XTLaw` |
| `productName` | Electron 安装包产品名 | 改为 `XTLaw` |
| `artifactName` | 安装包文件名模板 | 将产品名前缀改为 `XTLaw` |
| `shortcutName` | Windows 快捷方式名称 | 改为 `XTLaw` |
| `icon.svg` / `icon.ico` | 应用图标源文件和 Windows 图标文件 | 使用已提供的 XTLaw SVG，并生成 Windows 多尺寸图标 |
| `APP_ID` | 操作系统应用唯一标识 | 本次不改 |
| `pi-desktop/...` | 内部 IPC 通道名称 | 本次不改 |
| `@pi-desktop/*` | JavaScript 包作用域 | 本次不改 |
| `PI_DESKTOP_*` | 环境变量前缀 | 本次不改 |
| `~/.pi-desktop` | 用户数据目录 | 本次不改 |

## 4. 需求边界

### 4.1 包含

- 修改 `packages/shared/src/protocol.ts` 中的 `APP_NAME`。
- 修改 `apps/desktop/package.json` 中的产品显示名称、安装包显示名称和快捷方式名称。
- 修改英文和中文界面中的用户可见品牌文案：
  - `packages/i18n/src/locales/en/index.ts`
  - `packages/i18n/src/locales/zh-CN/index.ts`
  - 其他语言目录中的同类文案。
- 修改设置页、托盘、启动提示、帮助和输入框占位符中的产品名。
- 同步更新首页和侧边栏使用的前端品牌资源：
  - `apps/desktop/src/assets/brand/logo-dark.png`
  - `apps/desktop/src/assets/brand/logo-light.png`
- 修改 macOS 辅助说明文件中的用户可见名称。
- 修改 README 中当前产品名称；历史说明和外部软件名称不强制替换。
- 使用已提供的 XTLaw SVG 替换打包图标源，并生成各平台所需的图标资源。
- Windows 图标需要生成包含多个尺寸的 `.ico` 文件，至少覆盖 `16x16`、`24x24`、`32x32`、`48x48`、`64x64`、`128x128` 和 `256x256`。
- 所有语言目录中的当前产品文案同步替换为 `XTLaw`。

### 4.2 不包含

- 不改 `APP_ID`，避免改变操作系统安装身份。
- 不改 `~/.pi-desktop` 数据目录，避免造成数据迁移问题。
- 不改 `PI_DESKTOP_*` 环境变量。
- 不改 `@pi-desktop/*` 包名和 import。
- 不改 `pi-desktop-host-core` Rust 二进制名。
- 不改 `pi-desktop/...` IPC 通道。
- 不改插件市场、插件 SDK 和上游运行时名称。
- 不修改 `AGENTS.md` 和 `CLAUDE.md` 中的本地规则。
- 本次不重命名 macOS 辅助文件，先只修改其中的显示文案。
- 本次不更新 README 中的 GitHub 链接，保留当前仓库关系说明。

## 5. 主要修改位置

### 5.1 应用名称

文件：`packages/shared/src/protocol.ts`（共享应用常量和 IPC 定义）。

```ts
export const APP_NAME = "XTLaw";
```

只修改 `APP_NAME`，保留 `APP_ID` 和所有 `pi-desktop/...` 通道名称。

### 5.2 安装包名称

文件：`apps/desktop/package.json`（Electron Builder 打包配置）。

重点检查并按需修改：

- `productName`
- macOS 的 `artifactName`
- Windows 的 `executableName`、`shortcutName` 和 `artifactName`
- Windows portable 包的 `artifactName` 和 `unpackDirName`
- Linux 包的显示名称和 artifact 文件名

`appId` 保持当前值，避免把“改名”扩大为安装迁移。

### 5.3 界面文案

文件：`packages/i18n/src/locales/`（多语言文案目录）。

替换启动、菜单、帮助、设置、托盘、版本信息和输入框占位符中的 `PI-Desktop`。以下名称属于外部兼容对象，不替换：`Claude Desktop`、`Codex`、`Cursor` 和 `opencode`。

首页和侧边栏的 `BrandLogo`（前端品牌图标组件）继续使用 `logo-dark.png` 与 `logo-light.png` 两个 `192×192` 资源；这两个文件从同一份 `icon.svg` 生成，避免首页图标和安装包图标再次分叉。

### 5.4 文档和辅助文件

按需修改以下文件中的当前品牌名称：

- `README.md`
- `README.zh-CN.md`
- `apps/desktop/PI-Desktop-macOS-opening-help.txt`
- `apps/desktop/PI-Desktop-macOS-open.command`
- 当前发布流程中用于显示产品名的文字

macOS 辅助文件的文件名是否重命名，暂不强制；如果只改文件内容，改动更小。

### 5.5 应用图标

本次使用已提供的黑底白色 `X` 与 `T` 几何标志作为 XTLaw 图标源。建议将源文件保存为 `apps/desktop/build/icon.svg`（打包图标源文件），然后生成：

- `apps/desktop/build/icon.png`：Linux 和通用资源使用的 PNG。
- `apps/desktop/build/icon.ico`：Windows 使用的多尺寸 ICO。
- `apps/desktop/build/icon.icns`：macOS 使用的 ICNS。

SVG 规格如下：

- `viewBox` 为 `0 0 1254 1254`。
- 背景为黑色 `#000`，使用带 `rx="180"` 的圆角 `<rect>`，四角保留透明区域。
- `X` 和 `T` 图形使用白色 `#fff`。
- 图标源代码为：

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 1254 1254"
>
  <!-- Background -->
  <rect x="42" y="42" width="1170" height="1170" rx="180" fill="#000"/>

  <!-- X -->
  <path
    fill="#fff"
    d="
      M207 351
      L384 574
      L492 576
      L197 903
      H372
      L524 733
      L662 903
      H834
      L638 656
      L723 559
      H551
      L387 351
      Z
    "
  />

  <!-- T -->
  <path
    fill="#fff"
    d="
      M670 347
      L525 491
      L534 503
      L792 505
      L791 805
      L864 903
      H913
      L913 504
      L1050 503
      V347
      Z
    "
  />
</svg>
```

- Windows ICO 需要从同一 SVG 渲染多个尺寸，不能只把单张低分辨率 PNG 改名为 `.ico`。
- Windows `icon.ico` 对白色 X/T 做约 `12%` 的光学放大补偿，用于修正任务栏中的视觉占比；`icon.svg`、首页资源和 macOS 图标保持原始比例。

图标文件的产品名和文件格式属于打包层改动，不影响 `APP_ID`、IPC 通道、数据目录和插件协议。

### 5.6 当前仓库关系

当前远程仓库关系已经明确：

- `origin`（当前开发和发布仓库）：`https://github.com/QAyong/XTLaw.git`。
- `upstream`（二开基础仓库）：`https://github.com/vastsa/PI-Desktop.git`。
- 当前 XTLaw 是基于 `upstream` 的下游二次开发版本，`origin` 用于维护 XTLaw 自己的代码和发布内容。
- 桌面应用的 `electron-updater` 更新源已切换到 `https://github.com/QAyong/XTLaw/releases/latest`，发布配置也指向 `QAyong/XTLaw`；上游仓库仍作为二开基础仓库保留。
- 插件市场相关地址仍可能指向上游的插件仓库或镜像；本次简单改名不改变这些仓库关系。

因此，本次只替换产品显示名称、界面文案和打包图标，不把上游关系仓库误改成 XTLaw，也不重写历史文档中的来源信息。

## 6. 实施顺序

1. 修改 `APP_NAME`。
2. 修改 `apps/desktop/package.json` 中的用户可见打包名称。
3. 修改英文和简体中文界面文案。
4. 同步替换其他语言文案中的当前产品名称。
5. 将已提供的 SVG 保存为图标源，并生成 PNG、ICO 和 ICNS 打包资源。
6. 修改 README 和 macOS 辅助说明中的当前产品名称。
7. 将桌面自动更新源和 GitHub Release 发布配置切换到 XTLaw 仓库。
8. 构建并检查窗口标题、设置页、安装包文件名、快捷方式名称和各平台图标。

## 7. 验收标准

- [x] 窗口标题和主要菜单显示 `XTLaw`。
- [x] 设置页、帮助、托盘提示和启动提示显示 `XTLaw`。
- [x] 所有支持语言界面中的当前产品名称已同步替换。
- [x] 安装包和快捷方式的显示名称为 `XTLaw`。
- [x] macOS、Windows 和 Linux 打包配置均使用新的 XTLaw 图标。
- [x] Windows `icon.ico` 包含多个标准尺寸，覆盖 `16x16`、`24x24`、`32x32`、`48x48`、`64x64`、`128x128` 和 `256x256`。
- [x] `APP_ID` 保持不变。
- [x] 桌面自动更新源指向 `QAyong/XTLaw`，与当前 `origin` 发布仓库一致。
- [x] `~/.pi-desktop` 数据目录保持不变。
- [x] `PI_DESKTOP_*` 环境变量保持不变。
- [x] `@pi-desktop/*` 包名和 `pi-desktop/...` IPC 通道保持不变。
- [x] 现有插件和数据无需迁移即可继续使用。
- [x] `pnpm build:js` 通过。
- [x] `pnpm --filter @pi-desktop/desktop typecheck` 通过。

## 8. 未决事项

当前没有新增未决事项。macOS 辅助文件名和 README GitHub 链接均不在本次改名范围内。

## 9. 执行记录

- 已完成 XTLaw 品牌文案、安装包名称、快捷方式、发布文件名、README 可见文案和多语言文案替换。
- 已生成 `icon.svg`、`icon.png`、多尺寸 `icon.ico`、`icon.icns`、macOS 托盘图标及 DMG 背景资源。
- 已用同一份 `icon.svg` 同步生成首页使用的 `logo-dark.png` 和 `logo-light.png`，并为 Windows `icon.ico` 增加约 `12%` 的任务栏视觉放大补偿。
- 已通过受影响的品牌、发布配置和 Linux ASAR 测试：40 项通过，1 项 macOS 专用测试在 Windows 上跳过。
- `pnpm build:js` 和 `pnpm --filter @pi-desktop/desktop typecheck` 均已通过；Windows 品牌资源测试也已通过，macOS 专用测试仍只在 Windows 环境跳过。
