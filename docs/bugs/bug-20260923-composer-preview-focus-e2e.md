# Bug：Composer 图片预览关闭后焦点恢复 E2E 失败

**日期：** 2026-09-23  
**优先级：** 低  
**状态：** 待分析

## 复现步骤

1. 在项目根目录运行 `pnpm test:e2e:composer-paste`（Composer 粘贴与图片预览的 Electron E2E 测试）。
2. 让测试打开 Composer 中的图片预览。
3. 使用测试注入的 `Escape` 关闭预览。
4. 等待预览对话框消失，检查原图片 chip 是否重新获得焦点。

## 实际结果

测试失败并报告：

```text
cancel did not close and restore attachment focus
```

在第一次运行中，隐藏 Electron 窗口还会导致测试等待不到 renderer 结果；改用 DevTools 键盘事件进行诊断后，测试可以进入上述焦点断言，但仍未通过。

## 预期结果

图片预览关闭后，焦点应恢复到打开预览的原图片 chip，Composer 的编辑位置也应保持不变。

## 影响范围

- 影响 `pnpm test:e2e:composer-paste` 的图片预览焦点断言。
- 当前没有证据表明会话引用功能或会话引用删除提示受到影响。
- 通用协议 E2E `pnpm test:e2e` 已通过 23/23 项。

## 初步判断

待分析。现有 E2E 使用隐藏的 Electron `BrowserWindow` 和合成键盘事件验证原生 `<dialog>` 的关闭与焦点恢复；测试窗口焦点、Chromium 原生 dialog 的焦点回收，以及 React 清理时序之间可能存在不稳定交互。图片预览相关源文件未被本次会话引用改动修改。

## 处理方式

不要在本记录创建的当前会话里直接 hotfix。后续应新开一个修复任务，先分别验证测试窗口焦点、原生 dialog 关闭时序和 `restoreFocus()` 的行为，再决定修复测试 harness 还是产品代码，并补充稳定的回归测试。
