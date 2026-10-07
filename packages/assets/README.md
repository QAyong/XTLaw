# XTLaw Assets

`packages/assets` 存放 XTLaw 跨应用复用的品牌与产品资产。这里的文件是应用可直接消费的最终资产或可追溯参考源。

## 当前结构

- `brand/xiaoxiao-avatar.png`：默认 AI 助手“晓晓”的头像，使用用户最后确认的白底、黑框眼镜长发少女图片；运行时副本位于 `apps/buddy/resources/brand/xiaoxiao-avatar.png`，发布校验保证字节一致。用户自定义名称和头像仍优先于默认值。
- `brand/lexora-avatar.png`：保留的旧高清品牌头像，不再用于默认 AI 助手或启动页。
- `brand/lexora-avatar-light.png`：白底、黑色 XT 的浅色品牌头像。
- `brand/lexora-avatar-closeup.png`：原项目保留的未使用参考资源，不作为 XTLaw 运行时资源。
- `brand/app-icon.png`：当前通用应用图标真源，采用浅色版（白底、黑色 XT、原蓝色 `#003FFE`），与 `app-icon-light.png` 一致。
- `brand/app-icon-light.png`：白底、黑色 XT 的浅色应用图标真源；Windows 专用图标从它及开发/测试浅色变体派生。
- `brand/xtlaw-wordmark-light.svg`：透明底浅色横向字标，用于浅色界面；由 `sources/xtlaw/xtlaw-black-on-white.svg` 派生，保留黑色字形与蓝色点缀。
- `brand/xtlaw-wordmark-dark.svg`：透明底深色横向字标，用于深色界面；由 `sources/xtlaw/xtlaw-white-on-black.svg` 派生，保留白色字形与蓝色点缀。
- `sources/xtlaw/`：用户提供的 XTLaw 深浅色完整字标与 XT 简化标志 SVG 源文件。
- `sources/default-reference.png`：默认 Buddy 的初始参考原图，带粉色背景，不是运行时资源。
- `buddy/pets/default/pet.png`：透明静态角色图，用于桌宠预览和动画身份参考；它是派生物，不是 native 桌宠运行时入口。
- `buddy/pets/default/manifest.json`：Buddy 默认形象的帧尺寸、sheet 布局和语义动画契约；`animations` 是数组，每个动作条目包含 `name`、`description`、`row` 和自己的 `frames`。
- `buddy/pets/default/spritesheet.webp`：Buddy 默认形象的运行时雪碧图，native 桌宠加载它并按帧裁切。

启动页与聊天欢迎页复用深浅主题横向字标；助手头像与应用品牌分离。最终设计、维护步骤与验收范围见 [Feature-025](../../docs/specs/feature-025-brand-ui-and-startup.md)。

## 边界

- 未被产品直接消费的原图、可编辑源和参考材料放在 `sources/` 下。
- 应用直接消费的最终品牌与身份资产放在 `brand/`。
- 派生出的 Buddy 运行时资源放在 `buddy/pets/<id>/`。
- `apps/buddy/resources/brand/lexora-avatar.png` 是保留的旧品牌头像副本；发布校验仍保证它与 `brand/lexora-avatar.png` 字节一致。启动页改为消费深浅主题横向字标，不再消费此头像。
- `apps/buddy/resources/icons/app-icon.png` 是 Buddy 自有的通用应用图标副本，Renderer、macOS/Linux 安装包与 pet 从这里消费。发布校验保证它与 `brand/app-icon.png` 字节一致。
- Windows Electron 与安装包使用 `apps/buddy/resources/icons/app-icon-windows.png`，开发/测试运行使用对应的 `app-icon-dev-windows.png` / `app-icon-test-windows.png`。由 `packaging/buddy/windows/generate-icons.ps1` 从浅色图标裁掉外围透明边距并缩放为 512×512；Windows 多尺寸 ICO 仍由 electron-builder 在打包时生成。托盘图标不受此调整影响。
- 本地候选图、私有源、临时 sheet 和生成脚本不是最终资产，不放在这个包的公开结构里。
