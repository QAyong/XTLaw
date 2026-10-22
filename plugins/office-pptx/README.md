# Office PPTX 插件：Slides 编辑器移植

**版本：** 0.4.11（XTLaw 预装插件：打开、编辑、保存、引用到聊天）。0.4.11：上游 GenOffice 从 `1f306a2a` 升到 `58dfd0b5`。带入：图表自带工作簿（PowerPoint 里「编辑数据」可用）、重新解析后的幻灯片保留未保存标记、真 3D 模型（按 PowerPoint 的方式存储，可在编辑器里旋转）。3D 引入 `three`，`slides.js` 约增大 0.85 MB；「插入 3D 模型」依赖原生文件选择器，插件里未接入，只能查看和调整已有的 3D 模型。只做了构建与包校验，没有在桌面实机打开验收。0.4.10：不再声明 `localResources`（编辑器不选择本地文件，只读回退预览里的“选择文件”按钮随之不可用，改由文件管理器打开）。0.4.9：商店卡片上的简介缩短到两行以内：简介过长时卡片会弹出完整简介的悬浮提示，与其他插件不一致；完整功能说明见本文件。

## 当前状态

- 点击文件管理器中的 PPTX，在 context 面板用 GenOffice Slides 的原编辑器界面打开，显示全部幻灯片、缩略图、备注栏和功能区。
- 编辑：文本、形状、图片、表格、幻灯片管理、撤销/重做等上游编辑能力都在页内执行（上游主进程处理器直接运行），宿主不参与。
- 保存：保存按钮和 Ctrl+S 经 `selectedResourceWrite` 写回当前 PPTX，宿主检查文件版本、目录授权和内容变化；外部修改会拒绝覆盖，编辑器保留未保存状态并提示。保存前对生成的包再做一次有界 ZIP 校验。
- 自动保存：文件管理器打开的 PPTX 默认开启，沿用上游每 30 秒及失去焦点时检查修改的机制；开关选择随页状态保存。
- 另存为（Ctrl+Shift+S；与 DOCX 一致，顶部没有「文件」标签）：导出一份副本（系统保存窗口，`resourceExport`），当前文档仍绑定原文件，修改状态不变，保存后在面板底部提示。
- 引用到聊天：在幻灯片画布上选中文本框文字，或选中一个或多个元素后右键，在原菜单末尾出现唯一一项「引用到聊天」（多个聊天窗格时展开目标子菜单）。引用内容是选中文字，或所选元素（形状、表格、分组）的文字；每条引用记录来源 PPTX、幻灯片序号（0 起）和文件内容哈希，单次最多 20000 字符并沿用宿主的数量与总长度限制。点击聊天里的引用卡片会重新打开源 PPTX，暂不跳转到对应幻灯片。图片等无文字元素不产生引用。
- 确认类对话框（例如图表简化确认）由插件页内的对话框承载。
- 已隐藏 Genspark AI 助手、AI 美化/事实核查/配图等入口（`slides-overrides.css`，不改上游代码）。AI、云生成、账号、放映同步、PDF/图片导出、字体下载、项目存储均未接入。
- 编辑器启动失败时自动回退到只读预览（`preview.js`，基于 pptx-preview）。
- 读取前做有界 ZIP 校验（`pptx.js`）：最大 64 MiB，解压合计最大 128 MiB，条目不超过 10000，不支持 ZIP64 或加密文件，必须含 `ppt/presentation.xml`。

## 实现方式

上游 Slides 的文档逻辑在 Electron 主进程（约 150 个 IPC 处理器，含撤销历史）。插件不重写它，而是把上游的 preload、`slides-main.ts` 和渲染层打进同一个浏览器 bundle，把 `electron` 模块换成页内垫片：`ipcMain.handle` 只登记处理器，`ipcRenderer.invoke` 直接调用并按结构化克隆传值。`node:fs` 换成内存文件，宿主交来的字节放在虚拟身份 `document/<id>/<name>` 下。垫片和空桩在 `apps/buddy/extensions/office-pptx/lexora-build/`，上游源码不改。

沙箱对插件的限制（无 WebAssembly、无 Worker、无 eval、无原生文件访问）决定了几处替换：

- 字体度量：上游用系统字体扫描和 harfbuzz，这里改为 canvas `measureText`，与渲染层绘制用的同一套字体栈。只影响显示换行，不写入 PPTX。
- TIFF 图片：保留 utif2 解码，PNG 编码改用 pako 自写编码器（pngjs 依赖 Node 流）。
- 字体：随包 Carlito（Calibri 的度量兼容字体）和 Noto Sans CJK SC 子集（`fonts/`，仅在系统没有微软雅黑/苹方时作为简体中文兜底，覆盖常用字）。其他字体用系统字体；上游的字体下载和安装未接入。

## 构建

产物（`slides/`）已入库，来源与哈希见 `provenance.json`。重新生成需要 GenOffice 检出（锁定提交见 `build.mjs`，不符会失败）：

```powershell
git clone https://github.com/genspark-ai/genoffice.git; cd genoffice; git checkout 58dfd0b5b5eb3710efac0029b0452c61dba69035
npm ci --ignore-scripts
npm i --no-save --ignore-scripts path-browserify buffer
cd <Lexora>; node apps/buddy/extensions/office-pptx/build.mjs <genoffice 路径> plugins/office-pptx
```

不给 Lexora 仓库加依赖。升级上游提交前必须重新审核垫片和空桩。

## 限制与风险

- 在浏览器里用 GenOffice 测试样例（含中文、阿拉伯文、表格）在模拟扩展 CSP 的页面里验证过打开、编辑、保存、冲突拒绝、另存为副本；阶段二尚未在 Lexora 桌面实机验收。
- 未验证：大文件性能、图表/SmartArt/嵌入媒体、录制（麦克风）。
- 保存后再撤销时，上游的“是否有修改”判断仍为否，自动保存不会写出撤销后的状态；手动保存会正确写出。
- 没有关闭页签、禁用插件或退出应用时的未保存保护（与 DOCX 插件一致），关闭前请先保存。
- 不支持新建演示文稿、异常退出的草稿恢复（上游的崩溃恢复副本只写内存，已跳过）。
- 剪贴板：元素复制粘贴依赖页内状态，不跨文档/应用；系统剪贴板读取在沙箱中可能被拒绝。
- 顶部没有「文件」标签（与 DOCX 一致）：保存用工具栏按钮或 Ctrl+S，另存为用 Ctrl+Shift+S；打开、PDF/图片导出、打印没有宿主实现；演示者视图在编辑器窗口内运行，没有第二块观众屏幕；录制（麦克风）和嵌入媒体未验证。

## 文件

| 文件 | 说明 |
|---|---|
| `extension.json` | 插件身份与最小权限；ID `…office-pptx` 沿用 |
| `view.js` | 读取并校验文件，交给编辑器；失败时回退到预览 |
| `slides/` | 构建产物：`slides.js`、`slides.css`、Carlito 字体与图标 |
| `slides-overrides.css` | 外壳样式与 AI 入口隐藏 |
| `office-toolbar-navigation.js` | 与 DOCX 插件相同的功能区紧凑分页（标签行固定，命令行左右翻页），样式在 `slides-overrides.css` |
| `selection-menu.js` | 在编辑器右键菜单追加「引用到聊天」及目标子菜单，并去掉仅服务 AI 的菜单项 |
| `fonts/` | Noto Sans CJK SC 子集（SIL OFL） |
| `preview.js`、`preview.css`、`vendor/pptx-preview.js` | 只读回退预览（pptx-preview 1.0.7，ISC，见 `provenance-preview.json`） |
| `pptx.js`、`vendor/fflate.js` | 有界 ZIP 校验 |

许可：GenOffice 为 Apache-2.0（`LICENSE`、`NOTICE`）；随包 Carlito 与 Noto Sans CJK SC 字体为 SIL OFL（`LICENSE-OFL.txt`）；第三方依赖各自许可保持不变。
