# 上游集成记录：2026-10-30（第三轮）

单独移植 `9d3fd48dd`（图像增强与 OCR 服务，85 个文件）。分支 `codex/upstream-20261030-3`，基于 `codex/upstream-20261030-2`（第二轮语音，再往前是第一轮下载代理，都尚未合并），用 `git cherry-pick -x`。三个分支是叠在一起的：先合第一轮，再合第二轮，最后合这一轮。

## 已移植

| 上游提交 | 本地提交 | 内容 |
| --- | --- | --- |
| `9d3fd48dd` | `71a4c1889` | 图像读取路由、图像模型类型和 OCR 服务 |

具体有：
- 模型类型多了 `image-generation`（OpenAI images 接口）和 `image-reading`（能读图的模型）。
- 图像策略按操作区分：`understand` / `extract` / `document` / `generate` / `edit`，每种可选 `native`（默认，当前对话模型）、`auto`、`selected`，另有最多 4 个后备模型。
- `read` 工具读图时按策略交给视觉模型或 OCR，结果带来源说明并存成可续读的文本材料；生图经 `RoutedImageGateway` 路由，在本地原有的 `OpenAiImageGenerationService` 前面加了一层，原有的生图工具仍然可用。
- 设置 → 模型 里新增“图像”配置（`DesktopImageSettings`）；模型选择器支持多选（`multiple`、`max`）。
- 可选的独立 OCR：用户填一个 PaddleOCR 协议的 HTTP 地址和可选 Bearer 令牌（令牌存进本地凭据库），只用于“提取文字”。**默认关闭**：`ocrEnabled` 和 `extract` 都没配置时视为关，策略默认 `native`，不配置时行为与现在一致。

## 迁移编号

上游 v38 `ImageModels` 登记为本地 v40，`BUDDY_SCHEMA_VERSION` 改为 40（上游 v37 在本地是 v39，本地 v38 仍空着）。迁移文件和表结构与上游一致。新增的 `imageModelsMigration.spec.ts` 直接执行两个迁移的 SQL，与版本号无关。

## 冲突解决（4 处）

- `schema.ts`：迁移列表在语音那一轮的基础上追加 `{ v38ImageModels, version: 40 }`。
- `backupSettings.ts`：桌面设置备份键加入 `images`。
- `LexoraConfigStore.ts`：加入 `desktop.images`。与语音一样，`update` 在当前值和补丁都没有 `images` 时不写空表，避免现有配置用例多出空字段。
- `DesktopModelPicker.vue`：本地是作用域样式，上游是 UnoCSS；保留本地写法，加入多选（`multiple`、`selectedModelIds`、`max`）、`searchPlaceholder`、`emptyText`、`selection` 插槽和“不可用”提示，样式用 `.is-multiple` 修饰类。

## 没有一起移植 / 需要知道的

- 图像路由里的 `kind: 'plugin'` 目标（插件提供的图像读取或生成模型）和语音一样，本地没有插件能力层，当前走不到，代码原样保留。
- 本地没有 `Lexora` 用户可见文案新增；新增的 `Lexora` 只是类型名，以及一条注释里提到上游 `useLexora/plugins` 的字体来源。
- 样式：新增界面里的类名（`text-danger`、`border-b-border` 等）本地都已有，不需要补映射。

## 检查

- 迁移：有（上游 v38 到本地 v40）；依赖：无；Rust：无；`.github/workflows`：未改。
- WSL 本机：`vue-tsc -b` 通过；改动文件 eslint 通过；unit 项目 313 个文件通过；runtime + platform 项目 433 个文件通过（8 个跳过）。
- 两个失败用例不是这一轮造成的：`bundledPlugins.spec.mjs` 和 `BundledExtensionCatalog.spec.ts` 数到工作区里多出一个 Office 插件，来自本机未提交的 `plugins/office-pdf` 和 `apps/buddy/extensions/office-pdf`（不在任何分支里），没有在干净的工作区里复核。
- 未跑：Playwright E2E、开发预览、打包；真实的 OCR 服务调用；用服务商的 `/images/generations`、`/images/edits` 真实生图；迁移在真实开发库上的运行（本地 v39 到 v40）；设置页“图像”配置和模型多选的真实窗口表现。
- 行为差异要留意：策略保持默认 `native` 时，读图交给当前对话模型；如果当前模型不支持图片输入，`read` 读图会返回“不支持”，不会自动换模型。本地之前对这种情况的处理没有逐项对照，实际表现待验证。
- 隐私：开启独立 OCR 后，图片会发到用户填的地址；用服务商模型读图或生图，内容发给对应服务商。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 仍是 `b31b0ed3d`（第一轮已越过本提交），不用动。上游这个区间的提交至此全部处理完：移植 `919caef9a`、`b31b0ed3d`、`c2c3978a9`、`9d3fd48dd`，跳过 `be832d45f`。
