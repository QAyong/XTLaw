# Office PDF 插件：GenOffice PDF 编辑器移植

**版本：** 0.1.6（XTLaw 官方插件，打开、批注、填写表单、编辑文字、页面操作、保存、引用到聊天）。0.1.6：图标换成 Wikimedia Commons 上的现成图标（`icon.svg`，来源 File:Icon pdf file.svg，Koreller，CC0，来自 Wikimedia Commons；去掉了 SVG 里的 DOCTYPE、元数据等，图形没有改动）。0.1.5：聊天引用卡片的“定位来源”会翻到引用所在页并高亮引用的文字（`references.onReveal`，见 Feature-043）；文字不在那一页时返回未找到，页面仍会翻到。0.1.4：图标里的“PDF”字母加宽色块、拉开间距，不再挤在一起。0.1.3：图标改为与 DOCX、PPTX、XLSX 一致的彩色样式（原来的线框图标用 `currentColor`，作为图片显示时是黑色，深色主题下几乎看不见）。0.1.2：工具栏加入与其他 Office 插件一致的“自动保存”开关；收起工具栏时翻页箭头不再残留成空按钮，收起后点分类标签能一次展开。只做了构建、包校验和无头浏览器里的模拟宿主冒烟，没有在桌面实机验收。

## 当前状态

- 点击文件管理器中的 PDF，在 context 面板用 GenOffice PDF 的原界面打开：缩略图、大纲、搜索、双页、夜间模式、缩放。工具栏与其他 Office 插件一致：分类行固定，命令行单行并可左右翻页，点击当前分类收起或展开。
- 批注：高亮、下划线、删除线、手绘、矩形、椭圆、箭头、便签、手写签名与图章。
- 编辑：编辑已有文字、插入文字（含中文，用 PDFium 与随包字体写入）、插入图片、编辑图片、水印。
- 表单：填写、保存表单值；表单设计（文本框、日期、复选框、单选、下拉、签名域、自动识别）。
- 页面：旋转、删除、插入空白页、导入页面、替换页面、裁剪、页面大小、倒序、拆分、合并、抽取本页、合并页面、拆分页面。
- 保存：Ctrl+S 或编辑器的保存按钮经 `selectedResourceWrite` 写回当前 PDF，宿主检查文件版本、目录授权和内容哈希；外部修改会拒绝覆盖，编辑器保留未保存状态。自动保存沿用上游每 30 秒及失去焦点的机制（有未保存修改时才写回），并在撤销、重做按钮右侧提供与 DOCX、PPTX、XLSX 一致的“自动保存”开关：默认开启，选择随页状态保存；关闭后只在手动保存时写回。上游编辑器自己没有这个开关，插件页发布 `window.__lexoraPdfAutoSave`，构建时由 `gateAutoSave`（`apps/buddy/extensions/office-pdf/build.mjs`）让上游的自动保存逻辑读取它。
- **页面操作立即写回**：插入、删除、替换、裁剪等和上游单机版一样直接改文件，不进入“未保存”状态。写回失败时文档保持原样。
- 另存为（Ctrl+Shift+S）：导出一份副本，当前文档仍绑定原文件。拆分、抽取、合并页面、导出图片同样走系统保存窗口（`resourceExport`），多文件结果打包成 ZIP。
- 引用到聊天：用鼠标选中文字后，编辑器自带的选区弹窗（高亮、下划线、删除线那一排）里有“引用”按钮，在原“问 AI”的位置；只有一个聊天输入框时直接加入，多个时展开目标菜单。键盘选区不会出现弹窗，也就没有引用入口。引用加入、重复或超限的结果由 Lexora 主程序提示，与其他 Office 插件一致，插件自己不弹提示，只在按钮的悬停提示里说明无法引用的原因。引用记录页码，不触发保存、不替换输入框正文、不发送消息。页码是文件原页序，删除或插入页面后重新选中文字再引用。
- 定位来源：点聊天里引用卡片的“定位来源”，宿主打开这份 PDF 后，插件翻到引用所在页，在该页文字层里找到引用的文字并高亮（忽略空白差异；引用跨到下一页时用第一行再找一次）。高亮保持到下一次点击或按键。文字不在那一页（文件被改过）或页码超出时返回未找到，宿主提示“已打开文件，但没能定位到原来的位置”。
- 没有文件时（从插件入口打开）显示“选择 PDF”。选择的文件没有写回权限，以只读方式打开，修改请用“另存为”。
- 读取前检查：文件头必须含 `%PDF-`，最大 64 MiB。加密 PDF 可输入密码查看，但不能保存（上游 pdf-lib 不写加密文件）。

## 验证情况

在 WSL 里用无头 Chromium 加一个模拟宿主页面（`context` 的读取、保存、导出、Worker、聊天引用都是假的）做过冒烟，验证了：

- 2 页 PDF 加载、渲染和文字层；AI、打印、转换、涂黑、证书签名入口确实不显示。
- 选中文字后选区弹窗里出现“引用”按钮（单个和两个聊天目标都试过），点击后以 `kind: pdf-page`、`location: { page }` 调用引用接口。
- 高亮后 Ctrl+S，写回的文件是有效 PDF 且带批注。
- 插入含中文的文字（PDFium、HarfBuzz 子集化和 Noto 字体），文字能被 pdf.js 读出；插入图片后页面里有图片对象。
- 插入空白页、改页面大小立即写回，页数正确。
- Ctrl+Shift+S 通过导出接口交出副本，没有走写回。
- 定位来源（0.1.5）：模拟宿主提供 `references.onReveal`，在加载中就到达的请求会等文档挂载完；翻到第 1、2 页并高亮文字（空白差异不影响）；引用跨页时用第一行；文字不在该页、页码超出、没有位置信息、位置类型不对都返回未找到且不留旧高亮；点击后高亮清除。模拟宿主不是真实宿主，没有验证宿主侧的打开与等待，也没有验证很多页的大文件里页面是否按需创建。

没有验证：编辑已有文字、水印、表单填写与设计、导入、替换、合并、拆分等要选文件的页面操作、加密 PDF、接近 64 MiB 的大文件。上面这些界面是上游原有的，但本版没有逐项操作过。

没有在宿主里实测：宿主页面的 CSP 与不透明来源对 pdf.js 的 Worker、PDFium wasm 和字体加载是否有额外限制，以及与真实聊天引用、写回冲突检查的配合。Windows 桌面实机验收、安装包验证未做。

## 没有的功能

这些入口在构建时去掉或被样式隐藏，界面里看不到：

- AI 助手、AI 总结、AI 要点、AI 填表、选中文字后的“问 AI”。插件没有 AI、账号和云服务。
- 打印（含 Ctrl+P）和 “PDF 转换”（转 Office）。两者需要主进程。
- 涂黑区域（永久涂黑）和证书签名。前者需要写出涂黑副本，后者需要系统证书库。
- 新建空白 PDF、OCR、图片搜索与生成。

保存的手写签名只在当前页保留，关闭后不保存。

## 实现方式

上游 PDF 应用把保存、文字与图片编辑、页面操作放在 Electron 主进程（`apps/pdf/src/main`），渲染层通过 `window.pdfApi` 调用。插件不重写这些逻辑，而是把渲染层和这些主进程模块打进同一个浏览器 bundle，用 `entry.ts` 实现一份页内的 `window.pdfApi`：

- `fs`、`electron`、`node:crypto` 等换成 `shims/` 里的垫片：PDFium 与 HarfBuzz 的 wasm、Liberation 字体和 Noto Sans CJK SC 子集在启动时从包里取出放进内存，`readFileSync` 从内存读。
- pdf.js 的 worker 由宿主的 `context.workers.create` 启动，设为 `GlobalWorkerOptions.workerPort`。
- Electron 的 `nativeImage` 同步解码在页内没有对应物：保存前先把请求里要插入的图片解码并缓存（`prepareImage`）。
- 保存、另存为和页面操作都回到 `view.js`：写回走 `saveFile({ resource })`，另存走 `saveFile` 的导出。
- 源码改动都在 `apps/buddy/extensions/office-pdf/lexora-build/vite.config.mjs`，每处带断言并固定到上游提交；上游文本找不到时构建失败，必须重新审核。

## 权限

`selectedResource: read`（读取）、`selectedResourceWrite`（写回当前文件）、`composerReference`（引用到聊天）、`localResources`（选择要插入、替换或合并的 PDF）、`resourceExport`（另存为、导出）、`webAssembly`（PDFium 与 HarfBuzz）。

## 来源与可重现构建

本插件维护于本仓库 `plugins/office-pdf`。GenOffice 上游采用 Apache-2.0，锁定提交 `58dfd0b5b5eb3710efac0029b0452c61dba69035`（与 Office DOCX 相同），资源哈希记录在 `provenance.json`。

随包的 Noto Sans CJK SC 子集（SIL OFL）不在 GenOffice 里，取自 `useLexora/plugins` 的 Office 插件（`plugins/office/src/pdf-assets/`），哈希记在 `provenance.json` 的 `cjkFont`。

```sh
git clone https://github.com/genspark-ai/genoffice.git; cd genoffice; git checkout 58dfd0b5b5eb3710efac0029b0452c61dba69035
npm ci --ignore-scripts
cd <XTLaw>; node apps/buddy/extensions/office-pdf/build.mjs <genoffice 路径> plugins/office-pdf <NotoSansCJKsc-Regular-subset.otf 路径>
```

构建会重写 `editor/`、`provenance.json` 和许可文件，不改动其他文件。构建前如果检出里没有 `buffer` 包，会以固定版本（6.0.3，不执行安装脚本）装一次，因为保存代码用到 Node 的 `Buffer`。

| 文件 | 中文说明 |
|---|---|
| `extension.json` | 插件身份、入口与权限声明；ID 前缀与其他 Office 插件相同 |
| `view.js` | 读取并校验 PDF，挂载编辑器，处理写回、另存为和快捷键 |
| `selection-quote.js` | 往选区弹窗里的占位（`.lexora-quote-slot`，由构建时的源码改动留出）放“引用”按钮，并处理目标菜单 |
| `auto-save-toggle.js` | “自动保存”开关：放在撤销、重做右侧，编辑器重绘工具栏后自动回到原位，选择写入页状态 |
| `office-toolbar-navigation.js` | 与 DOCX、PPTX、XLSX 相同的工具栏分页脚本（只多一个选项 `tabPressExpands`，本插件打开：这个编辑器在收起时点分类标签会自己展开，脚本再展开一次就会变回收起）：分类行固定，命令行单行、左右翻页，点击当前分类收起或展开 |
| `pdf-overrides.css` | 外壳样式；隐藏 AI、打印、转换、涂黑和证书签名入口；紧凑分页工具栏样式（与 PPTX 的 `slides-overrides.css` 同一份） |
| `editor/` | 构建产物：`editor.js`、`editor.css`、`pdf-worker.js`、`pdfjs/`（字体映射与标准字体）、`runtime/`（wasm 与字体）。由 `build.mjs` 生成，勿手改 |
| `document-kit/` | 文档插件公共代码（整文件读取、引用），由 `document-kit/sync.mjs` 复制，勿手改 |
| `LICENSE`、`LICENSE-OFL.txt`、`LICENSE-pdfium.txt`、`LICENSE-harfbuzzjs.txt`、`LICENSE-pdfjs.txt`、`NOTICE` | 上游与第三方许可记录 |

Lexora 桥接与适配代码沿用本仓库许可；第三方代码保持各自许可和来源记录，不改变上游授权。
