# Feature-025：品牌界面、默认助手与简洁启动页

**状态：** 已实现源码与资源更新；定向检查通过，尚未重新打包验证。

## 1. 最终确认的设计

本规范记录本轮调整的最终状态，替代 [Spec-022](feature-022-xtlaw-rebrand.md) 中关于助手默认身份和启动页方形品牌头像的旧方案。未涉及的数据隔离、发布身份、许可证和上游来源策略保持不变。

### 应用品牌与图标

- 产品名称仍为 **XTLaw**；标题栏保留 XTLaw 文字菜单，移除菜单前的小应用图标。
- 应用图标采用已有浅色版本：白底、黑色 XT、原蓝色 `#003FFE`。
- 不采用试验过的浅蓝、Codex 蓝或 IBM 蓝品牌图标方案；纯白不改为灰白。
- 不修改用户素材库原文件。聊天控件的蓝色与品牌标志的蓝色可以不同，不做全局替换。

### Windows 专用图标

- 通用浅色图标画布为 512×512，可见区域为 480×480，四边各有 16px 透明留白。
- Windows 派生图裁掉外围透明边距，再缩放到 512×512；可见区域放大约 6.7%，保留字形、颜色与圆角。
- 正式版：`apps/buddy/resources/icons/app-icon-windows.png`。
- 开发/测试版：`app-icon-dev-windows.png`、`app-icon-test-windows.png`，保留对应环境标识。
- `electron/main/app/desktopIcons.ts` 仅在 `process.platform === 'win32'` 时选择这些资源。
- `electron-builder.config.cjs` 的 `win.icon` 使用正式版 Windows 专用 PNG；多尺寸 ICO 由 electron-builder 在打包时生成。
- 其他平台图标、托盘图标和 pet 的图标引用不受此专用适配影响。

重新生成 Windows 资源：

```powershell
# 仓库根目录；Windows PowerShell / PowerShell，依赖 System.Drawing
& ./packaging/buddy/windows/generate-icons.ps1
```

### 默认 AI 助手

- 默认名称为 **晓晓**，中英文界面统一使用该名称。
- 默认头像为用户最后确认的黑框眼镜、长发少女图片，保留原图 1254×1254 尺寸。
- 资源名称：`xiaoxiao-avatar.png`。
- 品牌资源真源：`packages/assets/brand/xiaoxiao-avatar.png`。
- 应用副本：`apps/buddy/resources/brand/xiaoxiao-avatar.png`，与真源字节一致。
- `BRAND_ASSET_URLS.chatAvatar` 引用新头像；`desktop.chat.agentName` 提供名称回退。
- 持久化配置仍允许 `name = ""`、`avatar = ""`，空值回退到新默认身份，不进行用户配置迁移。
- 自定义身份和“同步用户头像与名称”继续优先，已有用户配置不覆盖。
- 助手身份与应用品牌、应用图标、启动标志相互独立。

## 2. 聊天与设置界面

### 推理强度滑杆与快速模式

- 普通模式为纯蓝填充 `#3B82F6`、灰色底槽、白色圆形滑块。
- 可见轨道和滑块同高（1.5rem），避免轨道在滑块上下突出。
- 蓝色填充结束在滑块中心；白色滑块覆盖边界。
- 去掉原来的能量场渐变、星点、光晕和波纹渲染；滑杆不再调用 `DesktopReasoningFieldCanvas`。
- 快速模式开启时，蓝色填充范围内显示 16 个细小粒子，由左向右匀速高速流动；关闭时不渲染粒子。
- 动画不会进入灰色未选区域，也不改变滑块、档位选择或提交行为。
- 粒子周期为 0.35～0.63 秒，错开起始时间；系统启用 `prefers-reduced-motion: reduce` 时隐藏粒子。
- 快速模式闪电图标与选中背景使用同一蓝色系，不再使用金黄色。
- 旧 Canvas 渲染相关文件保留，但不代表当前滑杆仍显示那些效果。

### 其他界面调整

- 聊天顶部画布按钮采用矩形节点分支式思维导图图标，未采用圆形放射节点候选版。
- 画布/聊天切换功能不变，返回聊天仍使用聊天图标。
- 设置关于页移除 `Based on Lexora · AGPL-3.0-only` 这一行及其专用样式。
- 此调整仅移除该处界面显示，不修改许可证文件或授权条件。

## 3. 启动加载界面

- 中央显示静态横向 XTLaw 字标，不再显示品牌头像，也不重复显示可见的 XTLaw 标题。
- 浅色主题使用 `xtlaw-wordmark-light.svg`（黑色字形），深色主题使用 `xtlaw-wordmark-dark.svg`（白色字形）。
- 两份资源去掉原 SVG 的实色背景矩形和大量上下空白，保留原字形路径与蓝色点缀；透明横向画布为 2048×460。
- 使用 `data-buddy-theme` 切换字标。字标宽度为 `clamp(14rem, 40vw, 26rem)`，保持横向比例。
- 移除金色/蓝色椭圆星轨、呼吸光晕、闪烁星点和星座连线。
- 字标下方显示 3px 高的加载线；灰色底槽随主题变化，蓝色短段以 1.4 秒周期线性滑动。
- 加载线是**不确定进度**提示，不显示百分比，不伪装真实进度。
- 启动失败时隐藏加载线，显示失败说明，保留“重试”和“打开日志”操作。
- 减少动态效果模式下加载短段静止居中；字标始终不旋转、不缩放。
- 装饰元素对辅助技术隐藏；保留屏幕阅读器可访问的 XTLaw 标题、状态、忙碌标识与失败操作。

实现位置：

- `apps/buddy/src/app/bootstrap/DesktopStartupArtwork.vue`：静态字标及主题切换。
- `apps/buddy/src/app/bootstrap/DesktopStartupScreen.vue`：加载线、状态说明、失败操作。

## 4. 检查与预览

本轮已通过定向 ESLint、`git diff --check`、Buddy 类型检查，以及以下定向测试：

- `DesktopStartupScreen.spec.ts`：两份字标资源、无旧装饰、正常/失败加载线与按钮状态。
- `reasoningMeterFast.spec.ts`：快速模式粒子的出现/消失、填充范围与档位不变。
- `BuddyChatAgentIdentity.spec.ts`：晓晓默认身份、自定义身份、同步用户资料。

这些测试不等于已完成截图比对或安装包验收。尚未执行本轮完整 `pnpm check:buddy` 或重新生成 Windows 安装包。

```powershell
# 启动开发预览
pnpm --filter @uselexora/lexora-buddy dev

# 完整预检
pnpm check:buddy

# Windows 打包
pnpm --filter @uselexora/lexora-buddy package:windows
```

- 启动页需重新启动开发应用观察完整流程，不人为延长正常启动时间。
- 开发窗口的系统应用图标通常需重启后确认。
- 已安装版本需重新打包安装后验证；Windows 图标缓存可能影响旧快捷方式的即时显示。
- 打包产物位于 `apps/buddy/.output/artifacts/`。

## 5. 手工验收清单

以下为待执行的验收项，不表示已经全部完成：

- [ ] 浅色/深色启动页分别显示黑字/白字，无实色矩形背景。
- [ ] 正常启动仅加载短段运动，标志不动，无星轨等旧装饰。
- [ ] 启动失败不再出现加载线，重试和日志操作正常。
- [ ] 减少动态效果模式下启动线静止、快速粒子隐藏。
- [ ] 普通滑杆无粒子；快速模式粒子限于蓝色填充区；档位可正常切换。
- [ ] 未自定义身份显示晓晓和眼镜头像；自定义/同步身份不被覆盖。
- [ ] Windows 新安装包的快捷方式和任务栏使用放大后的浅色图标；其他平台和托盘不变。
