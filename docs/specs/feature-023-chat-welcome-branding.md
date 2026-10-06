# Feature-023：聊天欢迎页品牌适配

**状态：** 已实现

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
