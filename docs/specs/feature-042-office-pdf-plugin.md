# Feature-042：Office PDF 插件

**日期：** 2026-10-30
**状态：** 0.1.4 已实现并完成包校验与模拟宿主冒烟；未在宿主里实测，未做桌面实机验收；未上架市场
**范围：** `plugins/office-pdf`、`apps/buddy/extensions/office-pdf`（构建脚本）
**承接：** [Feature-033 文档插件契约](feature-033-document-plugin-contract.md)、[Feature-032 插件市场](feature-032-xtlaw-plugin-market.md)

## 1. 背景与决定

Office 的 DOCX、PPTX、XLSX 三个插件各管一种格式，都基于 GenOffice，没有 PDF。上游 `useLexora/plugins` 在 2026-10-25 发布的 Lexora Office 是一个插件覆盖四种格式并带 Agent 工具和文档库，与我们的结构不同。

**已定（2026-10-30）：** 保留现有三个 Office 插件，按它们的做法**新增一个 PDF 插件**，不整体换成上游的 Lexora Office，也不带 Agent 工具、技能和文档库。上游 PDF 的写法只作参考，不直接搬：它的控制层与多格式的文件库、Agent 耦合，宿主接口也用的是 `references.capture/commit`，而我们的文档插件用 `composer.captureQuote/addQuote`。

## 2. 做法

- 与 DOCX、PPTX、XLSX 一致：compiled 包、API 4、一个 `selected-file` 视图接管 `.pdf`、一个 `resource: none` 视图、空的宿主入口 `extension.js`，逻辑都在视图页里。
- 编辑器来自 GenOffice `apps/pdf`，锁定提交与 Office DOCX 相同（`58dfd0b5`）。构建脚本 `apps/buddy/extensions/office-pdf/build.mjs` 用 vite 在检出里构建，源码改动写在 `lexora-build/vite.config.mjs`，带断言，上游文本变了就构建失败。
- 上游把保存、文字与图片编辑、页面操作放在 Electron 主进程。这里把这些模块和渲染层打进同一个 bundle，由 `lexora-build/entry.ts` 实现页内的 `window.pdfApi`；`fs`、`electron`、`node:crypto` 等由 `shims/` 替代。PDFium 与 HarfBuzz 的 wasm、字体在启动时从包里取到内存。
- pdf.js 的 worker 由宿主的 `context.workers.create` 启动。
- 界面：工具栏沿用其他 Office 插件的紧凑分页样式，`office-toolbar-navigation.js` 与 DOCX、PPTX 的同一份，样式取自 PPTX 的 `slides-overrides.css`。
- 引用到聊天：编辑器没有可扩展的右键菜单（DOCX、PPTX、XLSX 的入口是右键菜单里的一项）。**已定（2026-10-30）：** 放进编辑器自带的选区弹窗，在原“问 AI”按钮的位置（与上游 Lexora Office 相同）。构建时在弹窗里留一个空的 `.lexora-quote-slot`，`selection-quote.js` 往里放按钮，用 `document-kit/quote.js` 的通用引用，`kind: pdf-page`，`location: { page }`。缺点是只有鼠标选中文字才有弹窗，键盘选区没有入口。
- 保存：写回用 `saveFile({ resource })`，另存为与导出用不带 `resource` 的 `saveFile`。页面操作先写文件、成功后才更新内存，失败时文档保持原样，避免编辑器保留的待保存修改被重复应用。

## 3. 与上游 Lexora Office 的 PDF 的差别

| | 上游 Lexora Office | 本插件 |
|---|---|---|
| 形态 | 四种格式合一，带文档库 | 只有 PDF，从文件管理器打开 |
| 构建 | esbuild，补丁文件加 `src/` 下约 6000 行 TypeScript | vite，一份 `entry.ts` 与几处带断言的源码改写 |
| 引用到聊天 | `references` 权限，补丁给 App 加 `office-bridge`，选区带坐标 | `composerReference`，选区弹窗里的按钮，只记页码 |
| Agent | 读、改、渲染、导出等工具和 PDF 技能 | 无 |
| GenOffice 版本 | `8ab58a51` | `58dfd0b5` |

## 3.1 自动保存开关与工具栏收起（0.1.1、0.1.2）

- **自动保存开关：** 上游 PDF 编辑器有“每 30 秒及窗口失去焦点”的自动保存，但没有开关，也不把“是否自动保存”告诉宿主。**已定（2026-10-30）：** 与 DOCX、PPTX、XLSX 一致，在撤销、重做右侧加“自动保存”开关，默认开启，选择随页状态保存（`context.setState`）。开关由插件页 `auto-save-toggle.js` 画出，状态发布为 `window.__lexoraPdfAutoSave`；上游的自动保存逻辑读取它，所以对编译好的包里的辅助函数做了一处改写：`build.mjs` 的 `gateAutoSave` 在构建后按精确文本改写并断言只命中一处，换上游提交时会在这里失败，需要人工复核。手动保存不受影响。
- **只读打开不显示开关**（该文件不能写回）。
- **工具栏收起（两处问题）：** ① 这个编辑器收起或展开时，会把功能区根节点的整个 `class` 重写一遍，分页脚本加上去的 `pi-office-toolbar-host`、`pi-office-ribbon-collapsed` 被一并清掉，要等脚本下一次刷新才补回来；这期间样式按这些类名匹配不上，收起后留下的翻页箭头没有样式，成了两个并排的空按钮，过一会儿才消失。`pdf-overrides.css` 里分页相关的规则改为按“功能区里有脚本加上的箭头元素”（`:has(> .pi-office-toolbar-nav)`）和编辑器自己的 `ribbon-collapsed` 匹配，类名被重写也不受影响。② 收起后点分类标签，编辑器自己会展开，脚本又展开一次，结果变回收起。`office-toolbar-navigation.js` 加了选项 `tabPressExpands`（默认关闭，其他三个插件不受影响），PDF 打开它。
- 验证：用真实的编辑器包加一个模拟宿主，在无头 Chromium 里验证了开关的位置与点击、收起（箭头立即隐藏，功能区高度从 80px 变为 36px）、一次点击展开并恢复布局，以及改写后的自动保存辅助函数在开关为开、关、未设置时的行为。模拟宿主不提供真实文件系统和授权，没有验证真正写回；没有在桌面应用里实测。

## 4. 没有的功能

AI 相关入口、打印、PDF 转换（转 Office）、永久涂黑、证书签名、新建空白 PDF、OCR、图片搜索与生成；保存的手写签名不跨会话保留。这些入口在构建时被标记、由样式隐藏，打印的 Ctrl+P 快捷键被去掉。

## 5. 包与权限

- ID `pd2ec0b9018e6402d8ada6873f7fa8721.office-pdf`，与其他 Office 插件同前缀；作者 `XTLaw官方`；`engines.lexora` 为 `>=0.4.2 <1.0.0`。
- 权限：`selectedResource: read`、`selectedResourceWrite`、`composerReference`、`localResources`、`resourceExport`、`webAssembly`。
- 约 20 MB 展开、11 MB 压缩包，222 个文件，在包预算内。
- 随包的 Noto Sans CJK SC 子集不在 GenOffice 里，取自 `useLexora/plugins` 的 Office 插件，哈希记在 `provenance.json`。

## 6. 验证

构建、`node extensions/tools-run.mjs check/pack` 通过，eslint 通过。在 WSL 里用无头 Chromium 加模拟宿主做了冒烟：加载渲染、选区引用、高亮后写回、插入含中文的文字、插入图片、插入空白页与改页面大小立即写回、另存为走导出。结果与未验证项见 [`plugins/office-pdf/README.md`](../../plugins/office-pdf/README.md) 的“验证情况”。

**未做：** Windows 桌面实机验收；宿主 CSP 与沙箱对 Worker、wasm、字体加载的影响；编辑已有文字、水印、表单、导入替换合并拆分、加密 PDF、大文件。

## 7. 后续

- 在宿主里装一次，验证 Worker、wasm 加载和真实的写回、引用。
- 评估是否加“新建空白 PDF”和 Agent 读写（与是否整体接入上游 Lexora Office 一并决定）。
- 上架市场：升 `extension.json` 版本后 `pnpm market:sync`，再按市场仓库流程发布；本次没有执行。
