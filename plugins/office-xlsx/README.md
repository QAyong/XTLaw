# Office XLSX 插件：Sheets 编辑器移植（阶段二：编辑与保存）

**版本：** 0.2.2（尚未预装；用「安装插件包」或加载开发目录安装）

## 当前状态

- 点击文件管理器中的 XLSX，在 context 面板用 GenOffice Sheets 的原界面（Univer 表格 + 功能区）打开，显示全部工作表、样式、合并单元格、冻结窗格、数字格式；条件格式、图片与图表由上游界面支持，本版没有逐项验证。
- 计算引擎是上游的 Rust 引擎（calamine + IronCalc）编译成 WebAssembly，在页内 Worker 里运行。首次打开后只按可见范围读取单元格，大表滚动流畅。
- 编辑：单元格、样式、行列、工作表、条件格式、数据验证、表、透视等上游编辑能力都在页内执行（上游主进程处理器直接运行），宿主不参与；公式实时重算。
- 保存：保存按钮和 Ctrl+S 经 `selectedResourceWrite` 写回当前 XLSX，宿主检查文件版本、目录授权和内容哈希；外部修改会拒绝覆盖，编辑器保留未保存状态并提示"文件已被其他程序修改"。保存前对生成的包再做一次有界 ZIP 校验。
- 保真：沿用上游的"只重写被编辑的工作表条目"逻辑，其余条目逐字节保持不变，并校验未改动条目的清单；工作簿设置 `fullCalcOnLoad`，所以 Excel 打开时会重算，保存文件里公式单元格的缓存值不会随编辑更新（上游行为）。
- 不支持：另存为（Ctrl+Shift+S 或另存为按钮会提示"暂不支持另存为"）、自动保存默认关闭（开关可用，打开后按上游机制保存）、新建工作簿、异常退出的草稿恢复。
- 已隐藏 Genspark AI 助手入口（`sheets-overrides.css`，不改上游代码）。AI、云、账号、PDF 导出与打印、屏幕捕获、MCP、项目存储均未接入。
- 读取前做有界 ZIP 校验（`xlsx.js`）：文件最大 64 MiB（宿主选中文件 API 的上限），解压合计最大 256 MiB（与上游一致），条目不超过 10000，不支持 ZIP64 或加密文件，必须含 `xl/workbook.xml`。只接受 `.xlsx`，不含 `.xls`、`.csv`、`.ods`、`.xlsm`。

## 权限

清单声明 `selectedResource: read`、`selectedResourceWrite: true`（保存当前文件）和 `webAssembly: true`。后者是宿主新增的按插件开放的权限：视图页 CSP 加 `'wasm-unsafe-eval'`（只允许编译随包的 `.wasm`，仍禁止 JS eval）和 `worker-src`（插件包路径加 `blob:`：沙箱页是不透明源，Worker 脚本不能按 URL 加载，页面把脚本取回后从 blob 启动；Worker 起不来时引擎退回页内运行）；安装确认里会单独提示。

## 实现方式

上游 Sheets 的文档逻辑在 Electron 主进程（约 50 个 IPC 处理器）。与 Office PPTX 插件相同，插件不重写它，而是把上游的 preload、`sheets-main.ts` 和渲染层打进同一个浏览器 bundle，`electron` 模块换成页内垫片，`node:fs` 换成内存文件。垫片和空桩在 `apps/buddy/extensions/office-xlsx/lexora-build/`，上游源码不改。

和 PPTX 插件不同的是引擎：

- 上游 `XlsxSidecarClient`（子进程 + stdio 行协议）换成 `shims/wasm-client.ts`，同样的接口，命令改为发给 Worker（`shims/engine.worker.ts`）。Worker 里的 wasm 用一个内存 WASI 文件系统（`@bjorn3/browser_wasi_shim`），宿主交来的 xlsx 字节放在 `/data`，引擎的缓存放在 `/tmp`。
- 引擎本身几乎不改：`wasm/wasm_api.rs`（约 50 行）暴露 `xlsx_alloc`、`xlsx_free`、`xlsx_handle`，内部调用上游现成的 `Engine::handle_line`。另外把 IronCalc 的 zip 依赖关掉 bzip2/zstd（C 代码，没有 wasm 的 C 工具链），并让 `NOW()`/`RAND()` 在 WASI 上走标准库而不是 js-sys。细节见 `build-wasm.mjs` 顶部注释。
- 浏览器没有跨源隔离，wasm 只能无线程运行：每个工作表在第一次读取时同步建完索引。放在 Worker 里，界面不会冻结，但大表首屏要等索引。
- Wasm 没有 panic 展开：引擎内部 panic 会让实例作废。`wasm-client.ts` 会丢弃 Worker 并通知上游的"引擎崩溃"流程，由渲染层重新打开文件。

## 构建

产物（`xlsx/`，含 wasm）已入库，来源与哈希见 `provenance.json`。重新生成需要 GenOffice 检出（锁定提交见 `build.mjs`，不符会失败）、Rust 工具链（带 `wasm32-wasip1` 目标）和可选的 Binaryen `wasm-opt`：

```powershell
git clone https://github.com/genspark-ai/genoffice.git; cd genoffice; git checkout 1f306a2a496227cae9194097897212c93d00a4e6
npm ci --ignore-scripts
npm i --no-save --ignore-scripts path-browserify buffer @bjorn3/browser_wasi_shim
cd <Lexora>
node apps/buddy/extensions/office-xlsx/build-wasm.mjs <genoffice 路径> <输出>/xlsx_engine.wasm [wasm-opt 路径]
node apps/buddy/extensions/office-xlsx/build.mjs <genoffice 路径> <输出>/xlsx_engine.wasm plugins/office-xlsx
```

不给 Lexora 仓库加依赖。升级上游提交前必须重新审核垫片、空桩和引擎改动。wasm 产物不保证逐字节可复现（编译路径会进二进制），以 `provenance.json` 里的哈希为准。

## 体积

当前 0.1.0：112 个构建文件约 24.0 MB（Univer 运行时一个 6.9 MB 的块、应用代码 4.3 MB、wasm 4.1 MB、Carlito 字体 4 个共 2.7 MB，其余为按需加载的小块），低于单文件 16 MiB、总量 64 MiB、512 个文件的限额。仅保留中文与英文界面语言包。

## 限制与风险

- 在浏览器里用模拟扩展 CSP（含 `'wasm-unsafe-eval'` 与包内 `worker-src`）的页面验证过：自建中文样例（合并、公式、冻结、日期格式、两个工作表）、100 万格 5 MB 文件、500 万格 25 MB 文件都能打开并显示。未在 Lexora 桌面实机验收；内置浏览器会拦截 `sandbox` 文档的子资源，所以模拟页没有带 `sandbox` 指令。
- 大文件：500 万格的合成样例首屏约 10 秒以上（引擎线程里建索引，界面可操作）；100 万格 5 MB 文件改一个单元格后保存约 30 到 50 秒（页内改写 36 MB 的工作表 XML），小文件保存在一秒内。
- 页面里每次加载 zod 会尝试 `new Function` 探测 eval，被 CSP 拒绝并在控制台留一条违规报告，不影响功能。
- 未验证：真实业务工作簿、图表与图片的显示细节、透视表、数据验证和条件格式的渲染细节、`.ods/.xls/.csv` 导入、复制粘贴到系统剪贴板、打印。
- 没有"文件"标签的行为定义：打开、PDF 导出、打印没有宿主实现。
- 跨表引用样例（`=销售明细!D11`）的结果在 Univer 里显示为空，引擎侧的重算结果是正确的（2414），原因未查。
- 没有关闭页签、禁用插件或退出应用时的未保存保护（与 DOCX、PPTX 插件一致），关闭前请先保存。
- 没有选区引用到聊天（`composerReference`），宿主的引用逻辑目前只认 DOCX 与 PPTX。

## 第三方组件

Univer（Apache-2.0）、React（MIT）、GenOffice（Apache-2.0，见 `LICENSE`/`NOTICE`）、calamine（MIT）、IronCalc（MIT 或 Apache-2.0）及其依赖、`@bjorn3/browser_wasi_shim`（MIT 或 Apache-2.0）、Carlito 字体（OFL，见 `LICENSE-OFL.txt`）。
