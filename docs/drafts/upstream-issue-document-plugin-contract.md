# 草稿：上游 Issue（未发布，等确认）

目标仓库：useLexora/Lexora，模板：功能建议（feature_request.yml）
标题：`[Feature] 统一文档插件契约：DOCX、PPTX、XLSX 等格式只靠插件接入，不再改本体`
标签：enhancement（由模板自动加）

---

### 你的建议 / Your suggestion

希望把“插件接管一种文件格式”做成一套统一、公开的契约，让 DOCX、PPTX、XLSX，以及以后的 CSV、PDF、Markdown 等格式，都只需要新增插件，而不用改本体。

我们在 XTLaw（Lexora 的一个下游分支）里做了三个文档插件：Office DOCX、Office PPTX、Office XLSX（XLSX 带 WebAssembly 引擎）。让它们工作时，本体里不得不写死格式名：

- 渲染层用 `docx|pptx|xlsx` 正则判断哪些文件交给插件；
- 聊天引用的来源格式是 `docx` / `pptx` / `xlsx` 三个固定枚举，每种格式一套位置字段；
- 扩展接口对引用输入做的是按格式的联合校验，扩展服务再按文件后缀选格式；
- 点击引用卡片重新打开文件时，也按格式名判断；
- 打包脚本逐个列出插件。

每多一种格式，就要同时改这五处。三个插件各自又重复实现了整文件读取、ZIP 校验和引用代码，行为已经开始分叉。这套东西目前没有登记进能力目录，插件创作文档和 `lexora_plugin_capabilities` 也查不到。

我们已经按下面的方式整理过一遍，并在 XTLaw 里跑通（上游目前最大的 API 是 3，我们把这组清单字段放在自己的 API 4 上，不是要求你们采用这个编号）：

1. **按能力名而不是 API 数字**声明和查询。我们登记了五项：`documents.handler`（视图用 `accepts.extensions` 接管文件）、`documents.writeBack`（写回当前文件）、`documents.reference`（选区引用到聊天）、`documents.export`（另存为）、`documents.webAssembly`（视图页运行包内 WebAssembly）。
2. **接管只看 `accepts.extensions`**：由已启用且兼容的插件的视图接管，唯一匹配才打开，多个匹配则留在内置预览，宿主不替用户选。
3. **通用聊天引用**：来源格式新增 `extension`，由插件自定类型名和受限 JSON 位置（大小、深度、键数、字符串长度都有上限，只接受纯 JSON），宿主自己填入插件 ID，插件只能引用自己接管的文件类型；旧格式继续可读。
4. **读 / 写回 / 另存为** 职责分开：写回要求视图已完整读过文件，保存前检查目录授权、文件版本和内容哈希，外部已改动则拒绝覆盖。
5. **WebAssembly** 只对视图页开放，仍禁止 JS eval，Worker 只能从 blob 启动；第三方包的 `.wasm` 有数量和总体积上限。
6. 提供共享工具包（整文件读取、ZIP 校验、引用）、一个只读 CSV 示例插件，以及检查契约的开发工具。

### 期望的体验（选填） / Desired outcome (optional)

- 第三方作者照着一份文档就能写出一个新格式的文档插件，安装后文件管理器里点该格式的文件就由它打开，也能引用到聊天，本体零改动。
- 插件和文档用“能力名 + 首次出现的应用版本”来声明需求，不依赖一个会被各分支各自理解的 API 数字。
- 官方的 Office 插件和第三方插件走同一套校验和权限提示；写回当前文件、运行编译代码这类权限，对非官方来源在安装确认里有明确的高风险提示。

### 补充信息（选填） / Additional context (optional)

想先听听维护者的意见，再决定怎么落地：

- 你们是否愿意有这样一套“文档插件契约”？如果愿意，能力名、`accepts` 的语义、通用引用格式是否需要调整，API 编号怎么对齐（我们担心自己定的 API 4 将来与上游的 API 4 含义冲突，所以文档里一律按能力名描述，并标注了这一风险）。
- 实现上不是简单的合并：上游的文件层后来已经重构（`NativeFileEngine`、文件操作记录），我们的“按字节读取 / 带版本和哈希检查的写回”要在新结构上重写，还包括 Rust 原生部分，不能直接 cherry-pick。如果方向可以，我们打算拆成几个阶段提 PR：清单与能力目录 → 按字节读取与写回 → 通用引用 → 文档插件源码。
- 另外三个 Office 插件的源码（带编辑器和 WASM 引擎，体积较大：约 12 MB、6 MB、7 MB）想放进插件仓库 `useLexora/plugins`，先听听这个仓库对体积和来源（基于 GenOffice，Apache-2.0，包内带 LICENSE 与 NOTICE）有什么要求。

参考（XTLaw 分支上的实现，均为公开仓库）：

- 契约文档：[document-processor.md](https://github.com/QAyong/XTLaw/blob/codex/document-plugin-contract/apps/buddy/service/resources/skills/plugin-creator/references/document-processor.md)
- 第三方作者指南：[extensions/README.md](https://github.com/QAyong/XTLaw/blob/codex/document-plugin-contract/apps/buddy/extensions/README.md)
- 示例插件：[csv-viewer](https://github.com/QAyong/XTLaw/tree/codex/document-plugin-contract/apps/buddy/extensions/examples/csv-viewer)
- 实现 PR（下游分支）：https://github.com/QAyong/XTLaw/pull/13
