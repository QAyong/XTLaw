# 文档处理器契约

本文说明插件如何接管一种文件格式（DOCX、PPTX、XLSX，也可以是 CSV、PDF、Markdown 等），并与聊天、保存和导出协作。格式本身由插件负责；宿主不认识任何具体格式，只做授权、版本检查、大小限制和结果校验。新增格式只需要新增插件，不需要修改宿主。

## 能力编号与查询方式（先读）

这些能力是 **XTLaw 扩展能力**，不是上游 Lexora 的公开标准。上游目前只支持 API 1–3；本地清单把 `apiVersion` 定为 4 来承载这组能力，将来上游可能发布含义不同的 API 4。因此：

- **以能力目录里的能力名为准**。用 `lexora_plugin_capabilities`（`kind: "runtime"`）查询当前宿主支持哪些能力，每项给出 `since`（首次出现的 XTLaw 应用版本）和 `requires`（需要的权限与清单字段）。能力名一经发布不再改义。
- `apiVersion: 4` 只是这些清单字段的开关，不要把它当作“支持某能力”的判断依据；插件的 `engines.lexora` 应覆盖能力的 `since` 版本。
- 在上游也发布 API 4 之前，本地不会改动 `apiVersion` 的数值含义；若上游的 API 4 与本地冲突，将以能力名迁移并在本文标注，不会静默改变已发布能力的行为。

| 能力名（目录 target） | 含义 | 首次出现 |
| --- | --- | --- |
| `documents.handler` | 视图 `accepts.extensions` 接管文件格式 | XTLaw 0.2.0 |
| `documents.writeBack` | `selectedResourceWrite` 写回当前文件 | XTLaw 0.2.0 |
| `documents.reference` | `composerReference` 把选区引用到聊天草稿 | XTLaw 0.2.0（DOCX）；通用 `extension` 格式 0.2.3 起 |
| `documents.export` | `resourceExport` 另存为 / 导出 | XTLaw 0.2.0 |
| `documents.webAssembly` | `webAssembly` 在视图页运行包内 WebAssembly | XTLaw 0.2.3 起，仅内置/官方插件 |

0.2.3 尚未发布，以实际发布的应用版本为准。

## 1. 接管文件

- 视图声明 `resource: "selected-file"`、`location: "context"`、`accepts: { "extensions": ["csv"] }`，并让清单 `apiVersion: 4`。扩展名为小写字母和数字，每个视图最多 16 个，不含点号。**`accepts.extensions` 是宿主选择视图的唯一依据**；宿主不看 MIME、文件内容或作者名。
- 用户在文件管理器、资源引用卡片或命令里打开文件时，宿主在**已启用且与当前应用版本兼容**的插件中查找声明了该扩展名的视图。
- **多个视图声明同一扩展名**（包括同一插件的两个视图）：视为歧义，宿主**不替用户选择**，文件留在内置预览。目前没有“选择默认打开方式”的界面，需要作者与用户通过启用/停用插件避免冲突。没有匹配时同样走内置预览。
- 匹配结果随插件安装、更新、启用、停用实时变化；停用插件后同一文件回到内置预览。
- 宿主以只读句柄 `context.resource` 把文件交给视图；句柄不含路径。

## 2. 读取、写回、另存为

三个动作职责不同，权限不同，不会互相放大：

| 动作 | 权限 | 宿主做的事 | 不做的事 |
| --- | --- | --- | --- |
| 读取 | `selectedResource: "read"` | `resources.readBytes(context.resource,{offset,length})`：单次最多 128 KiB，整个文件最多 64 MiB；每次读取重新检查目录授权；读取过程中文件变化则失败；顺序读完整个文件后记录文件版本和 SHA-256，供后续写回和引用使用 | 不提供路径，不列举目录，不能读别的文件 |
| 写回当前文件 | `selectedResourceWrite: true`（需读取权限） | `resources.saveFile({name,data,resource:context.resource})`：最多 64 MiB，以 128 KiB 以内的块上传；写回前检查目录授权、文件版本和内容哈希（须与本视图读完整文件时记录的一致）；文件在外部已变化则**拒绝覆盖**；写入成功才返回，并更新本视图记录的版本；同一视图最多 2 个并发写入；句柄只能写本视图打开的那一个文件 | 不能写其他文件，不能在未读完整文件时写回，不静默覆盖外部修改 |
| 另存为 / 导出 | `resourceExport: true` | `resources.saveFile({name,data})`（不带 `resource`）：每次弹出系统另存为窗口，由用户选目标，取消返回 `false` | 不授予对原文件的覆写权限 |

读取限制以外的包体限制：单个包文件 16 MiB，整包 64 MiB。文档处理器若需要更大的数据，应分块读取并在视图里处理，不要把文档打进包里。

## 3. 引用到聊天

声明 `composerReference: true`（同样需要读取权限）后，视图可把选区作为文字快照加入用户选择的聊天草稿。引用不写入文档、不读取草稿正文、不发送消息。

通用格式（推荐新插件使用）：

```js
const capture = await context.composer.captureQuote(context.resource, {
  text: '选中的文字',          // 1–32768 个 UTF-16 字符，不能全是空白
  kind: 'range',               // 插件自定义位置类型，^[a-z][a-z0-9-]{0,31}$
  location: { sheet: 'A', rows: [3, 5] }, // 受限 JSON
})
// capture: { id, defaultId, targets: [{ id, label }] }
await context.composer.addQuote(capture.id, targetId) // added | duplicate | limit | unavailable
```

宿主校验并持久化的来源结构：`format: 'extension'`，`extension: { extensionId, kind, hash, location }`。其中 **`extensionId` 由宿主填入当前插件 ID，插件不能指定或冒用别的插件**；`hash` 是视图读完整文件时记录的 SHA-256。

`location` 是插件自定义的受限 JSON，限制全部由宿主强制，违反即拒绝整次引用：

| 限制 | 值 |
| --- | --- |
| 序列化后大小 | 不超过 4096 字节（UTF-8） |
| 嵌套深度 | 不超过 4 层容器 |
| 对象键总数 | 不超过 32 个；键名 `^[A-Za-z_][A-Za-z0-9_-]{0,31}$`，不能是 `__proto__`、`constructor`、`prototype` |
| 数组长度 | 单个数组不超过 64 项；全部节点合计不超过 256 个 |
| 字符串 | 单个不超过 512 个字符 |
| 数值 | 有限数值，不接受 NaN、Infinity、BigInt |
| 类型 | 只接受 JSON 基本类型、数组和普通对象；不接受函数、Symbol、undefined、Date、Map、类实例、循环引用、getter |

宿主既不解释 `kind` 也不解释 `location`；它们只在用户点击引用卡片时原样交还给同一个插件。发给模型的内容只含文字快照、文件标题和路径，以及 `kind` 标签，**不含 `location`**。

数量与长度限制沿用聊天引用的公共限制：每条消息最多 16 条引用（含网页和消息引用），文字合计不超过 131072 个字符，`location` 的序列化长度同样计入合计；单条文字上限为 `BUDDY_QUOTE_TEXT_LIMIT`（32768）。捕获有效期 2 分钟，每个视图同时最多保留 8 个未使用的捕获。加入前宿主重新检查文件授权、文件版本、源视图和目标草稿身份。

点击聊天里的引用卡片会重新打开源文件：宿主再次按 `accepts` 选择视图，打开后由该插件根据自己保存的 `location` 定位（宿主不解析 `location`）。插件被卸载、停用或不再接管该扩展名时，卡片回到“无法定位”状态，文字快照仍然可读。

只有**自己接管的文件类型**才能引用：宿主要求当前视图声明了对应 `accepts`、`resource: "selected-file"`、`location: "context"`，且文件由该视图打开。

兼容格式：DOCX/PPTX 传 `{text,indexes,from,to}`，XLSX 传 `{text,cells:{sheetIndex,sheet,range}}`，宿主仍支持并保持原有显示和重开行为，已保存的 `docx` / `pptx` / `xlsx` 引用不会迁移。新插件请使用通用格式，不要再依赖这些固定字段。

## 4. WebAssembly

`webAssembly: true` 的作用范围很窄：

- 只对**视图页**放开 `script-src 'wasm-unsafe-eval'` 和 `worker-src <插件包路径> blob:`；宿主页（extension.js）不受影响。
- 仍然**禁止 JS eval**（`eval`、`new Function`），Worker 只能从 `blob:` 或包内路径启动；沙箱视图是不透明源，不能按 URL 加载 Worker 脚本，需要从 blob 启动。
- `.wasm` 文件以 `application/wasm` 提供，必须随包发布；视图不能从网络加载代码（`connect-src` 仍只含包内和资源路径）。
- **仅内置/官方插件可用**：宿主在安装审查阶段拒绝非内置来源（本地 `.lexora-extension`/`.zip` 包、第三方目录）声明 `webAssembly`，错误码 `EXTENSION_WEBASSEMBLY_RESTRICTED`；开发目录加载（`development`）为方便作者调试允许。第三方开放与资源上限（内存、Worker 数量、wasm 体积）尚未确定，见设计说明。
- 安装时单独提示用户。

## 5. 权限矩阵与升级对比

| 目标 | `selectedResource` | `selectedResourceWrite` | `composerReference` | `resourceExport` | `localResources` | `webAssembly` |
| --- | --- | --- | --- | --- | --- | --- |
| 只读查看 | read | – | – | – | – | – |
| 编辑并保存当前文件 | read | ✓ | – | – | – | – |
| 编辑、保存并另存为 | read | ✓ | – | ✓ | – | – |
| 查看并引用到聊天 | read | – | ✓ | – | – | – |
| 完整文档编辑器（当前三个官方插件） | read | ✓ | ✓ | ✓ | DOCX、PPTX 目前声明 | 仅 XLSX |

- `selectedResourceWrite`、`composerReference` 在清单校验时要求 `apiVersion >= 4` 且 `selectedResource: "read"`；`accepts` 要求 `apiVersion >= 4`、`resource: "selected-file"`、`location: "context"`。
- `localResources` 不是文档处理器所必需；只有视图自己用系统选择器取文件时才声明。
- 用户在安装确认里看到每一项权限。**升级时宿主比较新旧清单**，把新增的权限（包括 `selectedResourceWrite`、`composerReference`、`resourceExport`、`webAssembly`）单独标为“新增”，用户确认后才能升级。第三方使用 `selectedResourceWrite` 时的强提示样式尚在设计中，不在本文承诺范围。

## 6. 稳定性与版本承诺

- **只增不减**：已发布的能力名、权限字段、清单字段和 API 方法不删除、不改义；新增能力只增加新名字。
- **废弃流程**：先在能力目录和本文标注“已废弃”并给出替代，至少保留两个 XTLaw 次版本，期间照常工作；移除前在插件安装审查里给出明确的不兼容原因。
- **首次出现版本**：每个能力的 `since` 是首次包含它的 XTLaw 应用版本。插件需要某能力时应让 `engines.lexora` 的下限不低于该版本。
- 已保存的聊天引用（`docx`/`pptx`/`xlsx`/`extension`）永久可读，不做数据迁移。

## 7. 与上游编号的关系和风险

- 上游 `apiVersion` 目前最大为 3；本地为 4，含义是上述文档处理器能力集合以及相关清单校验。
- 风险：上游以后可能发布自己的 API 4，含义不同。届时本地的 `apiVersion` 数值需要重新协调，**所以插件、文档和工具一律按能力名而不是数字判断**。
- 同步上游时，本地把这些能力登记在独立的能力目录文件里（`workbenchDocumentCapabilities`），不修改上游已有的目录结构，降低冲突。
