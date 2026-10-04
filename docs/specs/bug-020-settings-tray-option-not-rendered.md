# Bug-020：通用设置页没有显示关闭窗口托盘选项

**日期：** 2026-10-05  
**优先级：** 中  
**状态：** 已验收

## 复现步骤

1. 启动 Lexora Buddy 桌面应用。
2. 打开“设置”中的“通用”页面。
3. 查看窗口行为相关选项。

## 实际结果

页面没有显示“关闭窗口时最小化到托盘”开关。用户无法通过设置页面选择关闭窗口时退出应用，还是隐藏到系统托盘。

## 预期结果

通用设置页应在“窗口行为”分组中显示该开关，并将修改保存到桌面配置。关闭窗口时，桌面主进程根据保存的值决定退出或隐藏窗口。

## 影响范围

影响 Lexora Buddy 桌面应用的通用设置页面。托盘关闭行为和配置读写本身仍然存在，但用户无法从前端修改此选项。

## 根因

提交 `f9fe95c1` 将通用设置页迁移到设置注册表渲染。旧组件仍包含托盘开关，但当前页面只渲染注册表登记的字段；通用设置字段当时只登记了语言和上下文面板选项，因此托盘开关没有进入新页面。

## 修复方式

- 在 `settingsRegistry.ts` 中加入 `minimizeToTrayOnClose` 通用设置字段。
- 在 `builtinSettings.ts` 中登记该字段，并放入“窗口行为”分组。
- 在 `DesktopGeneralSettingField.vue` 中显示开关，并通过现有设置保存接口写入 `desktop.minimizeToTrayOnClose`。
- 在设置注册表测试中加入字段归属断言，防止页面迁移时再次漏登。

## 验证记录

- `pnpm --filter @uselexora/lexora-buddy type-check`：通过。
- `pnpm --filter @uselexora/lexora-buddy exec vitest run src/modules/settings/model/__tests__/settingsRegistry.spec.ts`：通过，5 项测试通过。
- `pnpm --filter @uselexora/lexora-buddy package:windows`：通过，生成 Windows x64 安装包。
- 用户于 2026-10-05 确认验收通过。
