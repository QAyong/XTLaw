# Spec-003：模型图标适配（Composer 与设置页接入点）

- 状态：**已实现**（2026-09-21 在 XTLaw 落地）
- 日期：2026-09-21
- 归属：个人文档（`docs/specs/`，编号 003）
- 决定记录（2026-09-21）：恢复这套图标 · 粒度保持厂商级 · 引入生成脚本 ·
  颜色跟随设计令牌 · PiLaw 参考实现中 `ToolRow` 那处不一致不处理

## 1. 背景

PI-Desktop / XTLaw 支持接入多家 AI 供应商（Anthropic、OpenAI、Google、DeepSeek、Kimi 等，
也支持第三方中转站）。同一个模型在不同供应商下 id 写法不同，用户很难一眼看出
「我现在选的是哪家的模型」。

模型图标适配（model icon adaptation）解决的就是这件事：**给模型配一个单色小图标，让人凭图标认出厂商**。
本文覆盖输入框（Composer）区域与设置页的 4 个接入点；聊天记录里的图标不在范围内（见 §3）。

XTLaw 此前统一使用机器人图标（`IconBot`），本次改动把它替换为按厂商解析的真实图标。

## 2. 术语与文件说明

| 原名称 | 中文含义 | 用途 |
|---|---|---|
| `ModelIcon` | 模型图标组件 | 唯一的图标入口；给一个位置画一个厂商图标 |
| `resolveModelIconSymbol()` | 图标符号解析函数 | 根据 provider 与模型文本，算出该用哪张图 |
| `PROVIDER_ICONS` | 供应商图标映射表 | provider id → sprite 中的符号名（45 个 id → 30 个符号） |
| `MODEL_ICON_RULES` | 模型名匹配规则表 | 用 10 条正则从模型 id/名称里认出厂商 |
| `provider-icons.svg` | SVG 图标精灵（sprite） | 一个文件装 30 张厂商图形，位于 `apps/desktop/public/` |
| sprite / symbol | 精灵 / 符号 | `<symbol id="...">` 是 sprite 里的其中一张图 |
| `currentColor` | 跟随文字颜色 | SVG 用当前 CSS 文字颜色上色，实现单色与主题联动 |
| `--ds-text-muted` | 次级文字色令牌 | 图标颜色来源；暗/亮主题各有取值，自动跟随主题 |
| `scripts/provider-icons/` | 图标源图与生成脚本目录 | 源图 `vendors/*.svg` + 生成器 `build.mjs` |
| Composer | 输入框区域 | 用户输入提示词、选择模型与思考等级的那一栏 |
| transcript | 聊天记录 | 对话正文与过程展示区（**本文不涉及**） |
| `vendorKey` | 供应商类型键 | 供应商标识，如 `anthropic`、`deepseek`；比用户自定义名字更适合查表 |

## 3. 需求边界

**包含（本次实现的 4 个接入点）：**

- 输入框右侧工具区「模型 · 思考等级」胶囊按钮上的图标
- 该胶囊展开后的浮层里，「模型」入口行的图标
- 进入「模型」子菜单后，模型列表中每一行的图标
- 设置页「模型选择面板」左栏模型列表每一行的图标

**不包含（明确排除）：**

- 聊天记录区域的 4 个图标接入点（参考实现 PiLaw 的位置：`shared.tsx:576`、`shared.tsx:601`、
  `ActivityGroup.tsx:431`、`ProcessDetailsGroup.tsx:166`）。它们共用同一套解析机制，
  区别只是不传 `modelName`。其中 `ToolRow.tsx:637` 那处未传 `providerId`/`modelId`
  的不一致，按决定**不处理**。
- 应用自身的品牌图标（`build/icon.ico`、托盘图标、Dock 图标等）。
- 插件自定义图标（`src/lib/plugin-view-icons.ts`），属于另一套机制。

## 4. 解析机制：图标怎么被选出来（4 个接入点共用）

入口组件定义在 `apps/desktop/src/lib/model-icons.tsx`：

```tsx
<ModelIcon provider={...} modelId={...} modelName={...} size={14} />
```

`resolveModelIconSymbol()` 按固定顺序决定用哪张图：

1. **先按模型文本匹配**：把 `modelId` 与 `modelName` 拼成一段文本，用 `MODEL_ICON_RULES`
   的 10 条正则依次测试，命中即用该厂商图标。规则覆盖 Claude/Anthropic、GPT/Codex、
   Gemini/Gemma、DeepSeek、Grok、Qwen/通义、GLM/智谱、Mistral、Kimi/Moonshot、MiniMax。
2. **再按 provider id 查表**：`PROVIDER_ICONS` 收录 45 个 provider id、映射到 30 个符号，
   并处理别名与区域变体，例如 `openai-codex` → `openai`、`moonshotai-cn` → `moonshot`、
   `amazon-bedrock` → `aws`、`xiaomi-token-plan-*` → `xiaomimimo`、`ant-ling` → `antgroup`。
   查表前做 `trim()` 与小写化。
3. **都不命中则回退机器人图标** `IconBot`，不会出现空白。

> 为什么「先文本、后 provider」很重要：第三方中转站（如 SiliconFlow）里的模型 id 是
> `deepseek-ai/DeepSeek-V3.2`，供应商却是中转商。先按文本匹配才能显示 DeepSeek 图标，
> 而不是显示中转商的图标。

渲染与主题：

- 组件输出 `<svg><use href="./provider-icons.svg#符号名" /></svg>`。
  **相对路径是硬约束**：打包后 Vite 把 `public/` 拷到 `out/renderer/`，Electron 以 `file://`
  加载页面；写成 `/provider-icons.svg` 会被解析到磁盘根目录，图标全部丢失。
  该约束由测试断言守住。
- 颜色来自 `apps/desktop/src/styles/model-icons.css` 的 `--model-icon-color: var(--ds-text-muted)`。
  令牌本身分暗/亮两套取值，所以**不再需要在本文件里写 per-theme 覆盖**，也没有硬编码色值
  （`node scripts/check-style-tokens.mjs` 通过）。
- sprite 中每个 `<symbol>` 都带 `fill="currentColor"`。外部 sprite 根节点的属性不会传递到
  `<use>` 位置，若不显式声明，图形会画成黑色且不跟随主题。

## 5. 四个接入点（XTLaw 实际落点）

| 编号 | 界面位置 | 代码位置 | 传入参数 |
|---|---|---|---|
| A1 | 输入框右侧「模型 · 思考等级」胶囊按钮最左侧 | `apps/desktop/src/features/chat/composer/ComposerModelPicker.tsx:102` | `provider`=`selectedProviderId`，`modelId`=`selectedModelId ?? modelLabel`，`modelName`=`modelLabel`，`size`=14 |
| A2 | 胶囊展开后浮层第一行「模型」入口左侧 | 同文件 `:129` | 同 A1 |
| A3 | 「模型」子菜单每一行模型名左侧 | 同文件 `:223` | `provider`=`group.provider.id`，`modelId`=`model.modelId`，`modelName`=`optionTitle`，`size`=14 |
| A4 | 设置页模型选择面板左栏，每行模型 id 左侧 | `apps/desktop/src/components/settings/ModelSelectionPanes.tsx:404` | `provider`=`providerId`（组件参数），`modelId`=`row.id`，`modelName`=`row.displayName`，`size`=14 |

补充说明：

- A1/A2 显示**当前选中的模型**，换模型后图标立即变化；两者使用同一组 props。
- A3 的 `optionTitle = model.displayName || model.modelId`，这是「文本匹配」规则真正发挥作用的地方：
  中转站里叫 `Kimi K2` 之类的行，即使 id 看不出厂商，也能靠名称命中规则。
- A4 的 `providerId` 由两个设置弹窗传入，取的是供应商类型键：
  - 供应商设置弹窗 `ProviderSetupDialog.tsx:529`：`provider?.vendorKey ?? provider?.name ?? service`
  - 供应商账号弹窗 `VendorAccountDialog.tsx:136`：`provider.vendorKey ?? provider.name`
- A1–A3 不需要新增参数：`ComposerModelPicker` 原本就接收 `selectedProviderId`/`selectedModelId`。

## 6. 生成脚本与源图

图标不再手工维护：sprite 是**生成物**。

```text
scripts/provider-icons/
  NOTICE.txt         上游 MIT 许可文本，嵌入生成结果
  README.md          来源、刷新步骤、与 PiLaw 参考 sprite 的差异
  build.mjs          生成器：vendors/*.svg -> apps/desktop/public/provider-icons.svg
  vendors/<id>.svg   30 个上游单色 SVG（每个符号一个文件）
```

命令：

```bash
pnpm build:provider-icons     # 重新生成 sprite
pnpm check:provider-icons     # sprite 与源图不一致就失败（CI 用）
```

生成器强制三件事：① `model-icons.tsx` 里引用的每个符号都必须有源图文件（否则直接失败）；
② 每个 `<symbol>` 都带 `fill="currentColor"`（并保留上游的 `fill-rule`）；
③ 符号按名称排序输出，重复生成不会产生无意义 diff。
源图已归档在仓库内，因此**构建离线、可复现**，上游改图不会悄悄改变应用外观。

新增厂商的流程：把上游单色 SVG 放进 `vendors/<id>.svg` → 在 `PROVIDER_ICONS`
（或 `MODEL_ICON_RULES`）里映射 → 运行 `pnpm build:provider-icons` → 提交生成结果。

## 7. 验证记录（2026-09-21 实际执行）

| 检查 | 命令 | 结果 |
|---|---|---|
| 模型图标测试 | `node --test test/model-icons.test.mjs`（`apps/desktop/`） | **3/3 通过** |
| 类型检查 | `node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`（`apps/desktop/`） | **0 错误** |
| 样式令牌 lint | `node scripts/check-style-tokens.mjs` | `style tokens OK` |
| 生成物未漂移 | `node scripts/provider-icons/build.mjs --check` | `sprite is up to date (30 symbols)` |
| 桌面端全量测试 | `node --test test/*.test.mjs`（`apps/desktop/`） | 2530 项：2475 通过 / 47 失败 |
| 文档结构校验 | `node docs/scripts/check-docs.mjs` | 504 页中 3 处既有 ADR/NAV 问题，与本次无关 |
| 中英镜像校验 | `node docs/scripts/check-locales.mjs` | 仅既有的 zh-CN 缺页 `07-plugins/17-office-docx-plugin.md` |
| dev server 提供 sprite | `GET http://localhost:5173/provider-icons.svg`（dev 实例运行中） | HTTP 200，39424 字节，含 `anthropic`/`deepseek`，31 处 `currentColor` |
| 人工预览 | `node scripts/dev-electron.mjs`（Windows，electron-vite HMR） | 2026-09-21 你确认功能预览通过 |

关于那 47 个失败：全部是 Windows 环境下跑不过的既有用例——macOS 签名/公证/DMG 系列、
Windows 临时目录 `EBUSY` 文件锁、以及日志里 `\` 与 `/` 路径分隔符差异。
**没有一个失败涉及本次改动的文件**（已按 `model-icons`、`ModelIcon`、`provider-icons`、
`ModelSelectionPanes`、`ComposerModelPicker` 检索确认）。需要说明的是：我没有在
未改动的干净检出上跑过基线，因此「既有失败」这一结论来自失败原因本身，而非基线对比。

同时更新的既有测试（原断言写死了 `IconBot`）：

- `apps/desktop/test/composer-model-thinking-menu.test.mjs`：断言改为图标槽内是 `ModelIcon` 且 `size={14}`
- `apps/desktop/test/composer-send-state.test.mjs`：同上（`modelTrigger` 内）

同步更新的仓库规格（原先写着「Bot icon」）：

- `docs/spec/04-ux/07-ui-design-system.md`（右侧工具栏触发器描述）
- `docs/spec/06-delivery/04-e2e-test-plan.md`（两处 E2E 预期）

未执行：`pnpm lint`（本机 shell 无 `pnpm`，改为直接跑等价的 `check-style-tokens.mjs`）、
全仓 `pnpm -r test`、`cargo` 相关检查（本次未触及 Rust），以及仓库的 `verify:ui:*`
自动化 UI 套件——我按你的要求启动了 dev 实例做人工预览，但没有跑这些脚本。

## 8. 验收标准

- [x] A1–A4 四处图标尺寸都是 14px，且都是单色（无厂商品牌彩色）。
- [x] 图标颜色取自 `--ds-text-muted` 设计令牌，暗/亮主题自动切换。
- [x] 引用的每个符号都存在于 sprite 中，且 sprite 与源图一致（测试 + 生成器自检守住）。
- [x] 未收录的供应商/模型回退 `IconBot`，不会出现空白或破图。
- [x] 类型检查与样式令牌 lint 通过。
- [x] **人工确认（2026-09-21）**：你在 dev 实例中预览通过，覆盖 A1–A4 的观感与
      中转站模型行的图标。

## 9. 未决事项

1. **6 个图形与 PiLaw 参考 sprite 不同，已按现状接受。** 源图取自
   `@lobehub/icons-static-svg@1.95.1`：`mistral`、`huggingface`、`aws` 只是路径拆分/取整差异
   （视觉一致），`openrouter`、`azure`、`antgroup` 是上游较新的图形。2026-09-21 预览通过，
   维持现状；将来若要换回旧图形，替换对应的 `vendors/<id>.svg` 后重新生成即可。
2. **粒度仍是厂商级**（本次按决定保持）：同厂商所有模型共用一张图，
   Claude 各代模型看起来一样。将来若要区分旗舰模型，需要给 `MODEL_ICON_RULES` 增加更细的符号。
3. **别名靠手工维护**：`openai-codex`、`xiaomi-token-plan-*` 这类映射在上游新增 provider 时可能漏；
   现有检查只能发现「引用了不存在的符号」，漏映射不会报错。
4. **E2E 场景**：`E2E-COMPOSER-model-provider-icons` 已补入英文计划与 zh-CN 镜像；
   2026-09-21 已在 dev 实例中人工走查通过（见 §7）。
