# Feature-023：聊天欢迎页品牌适配

**状态：** 已实现；2026-10-14 起聊天欢迎页改为与上游一致，不再显示字标，见文末“后续调整”。

## 目标

让聊天窗口欢迎页与欢迎语设置预览统一呈现 XTLaw 品牌，不再展示桌宠插画；明暗主题下均保证字标清晰，并保持简洁、偏极客的表达。

## 实现

- 聊天欢迎页与设置页风格卡片统一显示横向 XTLaw 字标；浅色主题用黑字标，深色主题用白字标，均保留蓝色点缀和透明背景。
- 字标从 `packages/assets/sources/xtlaw/` 的完整字标 SVG 派生，裁切为横向画布并移除原背景矩形，不改动字形路径。
- 欢迎标题与设置预览文案使用应用系统 UI 字体（`--buddy-font-ui`）。
- 移除欢迎标题下方的黄色曲线与星点装饰。
- 保留“无”和“随机”选项及三种欢迎语偏好；设置卡片预览与聊天欢迎页使用同一套本地化文案。

## 欢迎语

| 偏好 | 中文 | English |
| --- | --- | --- |
| writing | 把复杂推到极简 | Turn complexity into simplicity |
| planning | 探索边界，直到问题解决 | Explore the frontier until problems are solved |
| orchestrating | 不止于回答，持续进化 | Beyond answers, always evolving |

## 相关资源

- `packages/assets/brand/xtlaw-wordmark-light.svg`
- `packages/assets/brand/xtlaw-wordmark-dark.svg`
- 源文件：`packages/assets/sources/xtlaw/xtlaw-black-on-white.svg`、`packages/assets/sources/xtlaw/xtlaw-white-on-black.svg`

## 验证

对聊天欢迎组件、设置页欢迎语预览组件及中英文聊天文案运行定向 ESLint，检查通过。

## 后续调整（2026-10-14）

- 移植上游 `5f5eba09` 后，设置页的风格卡片已由可编辑的欢迎语列表取代，上表三条成为默认欢迎语。
- 应用户要求，聊天欢迎页改为与上游一致：不显示 XTLaw 字标；时段问候在上、欢迎标题在下；标题使用 `--buddy-font-ui`，字重 500，字号 `clamp(1.4rem, 2.8cqw, 1.85rem)`，矮窗口时缩小。问候和标题都关闭时不显示欢迎区。
- 字标资源保留，启动画面仍在使用。
- 上游通过主题系统提供的欢迎插画未引入，本地没有主题系统。
