# Bug：文件资源附带宿主元数据导致预览失败和插件文件上下文丢失

**日期**：2026-10-17<br>
**优先级**：高（阻断文件预览，并影响插件获取当前文件）<br>
**状态**：源码已修复，相关测试与类型检查通过；尚未打包，待安装版界面验收<br>
**代码基准**：`master` @ `cf76882e`<br>
**环境**：Windows，XTLaw 安装版 `0.2.0`；用户截图中的工作区为本仓库。

## 1. 现象与证据边界

本次确认两个同源问题：

| 问题 | 实际结果 | 证据 |
| --- | --- | --- |
| 文件视图渲染失败 | 右侧目录树正常，选中 `README.md` 后，左侧显示“视图加载失败。”及重试按钮 | 用户截图；组件回归测试在修复前抛出字段校验异常 |
| 插件丢失当前文件上下文 | 在普通文件或只读预览视图中执行插件命令，传给插件的文件参数变为 `null`（无当前文件） | 两种视图的命令调用测试均在修复前失败，实际收到空值而非文件目标 |

诊断日志中最近 12 次目录列表请求成功返回，与截图中正常显示的目录树一致。这不能证明全部文件操作正常，也不能单凭该日志确定前端异常；直接根因由代码和回归测试确认。

## 2. 复现步骤与预期结果

### 文件视图

1. 在已启用工作台选区引用功能的应用中，打开项目文件管理器。
2. 选择一个文本文件，例如 `README.md`。
3. 文件资源带有 `canonicalRoot`（宿主记录的规范根目录），编辑器渲染时生成引用来源。
4. 修复前抛出 `ZodError`（字段校验异常），错误内容为 `Unrecognized key: "canonicalRoot"`，工作台错误边界将其替换为通用失败界面。

预期：文件正常显示，选区引用只携带合法的文件目标字段，不携带宿主内部元数据。

### 插件命令

1. 启用一个注册工作台命令的插件。
2. 在 `file`（普通文件）或 `file-preview`（只读文件预览）视图中打开文件。
3. 执行该插件命令。
4. 修复前，宿主对文件资源的校验返回失败，仍执行命令，但当前文件参数为 `null`。

预期：插件收到当前文件的空间、目录、版本和相对路径；内部根目录字段不传给插件。无效文件目标和非文件视图仍不得被识别为有效文件。

## 3. 根因及提交来源

文件资源的 `resource.data`（工作台资源数据）除了文件目标，还包含宿主内部元数据。严格的 `spaceFileTargetSchema`（文件目标校验规则）只接受：

- `spaceId`：空间标识；
- `directoryId`：目录标识；
- `revision`：目录授权版本；
- `path`：文件相对路径。

直接校验整个资源数据，会把合法文件误判为非法对象。

### 文件视图：本地集成遗漏

- 本地 `9eaff71c` 新增文件和 Markdown 选区引用，引用来源使用严格解析。
- 本地 `c636db80` 移植上游 `f6e2818a` 的文件管理改动，为文件资源增加 `canonicalRoot`。
- 上游 `1c2c9db4` 的文件编辑器已经使用 `.strip().parse()`（先剔除额外字段，再校验目标）；本地移植提交 `2d2f8ec9` 保留了旧的严格解析，遗漏该适配。

因此，第一处问题是移植后组合产生的回归，不能归为所对照上游版本中的同一个缺陷。

### 插件命令：所检查上游版本也存在

本地 `useExtensionContributions.ts`（插件贡献接入模块）对整个文件资源调用严格的安全解析，失败后传空值。所检查的上游基准 `792a30acd0af792074d975a78b9ceee7641dcc47` 中也存在相同写法。

这是对仓库中已取得的上游提交的检查，不代表查询了此后远程仓库的最新状态。

## 4. 最小修复与约束

仅在宿主资源转换为文件目标的两个出口剔除额外字段：

| 文件 | 修改 |
| --- | --- |
| `apps/buddy/src/modules/files/widgets/DesktopFileEditor.vue` | 引用来源改为 `spaceFileTargetSchema.strip().parse(...)` |
| `apps/buddy/src/app/workbench/useExtensionContributions.ts` | 插件命令的文件上下文改为 `spaceFileTargetSchema.strip().safeParse(...)` |

不修改公共目标规则，不放宽跨进程接口输入校验，不移除资源中的根目录信息，不改目录授权或文件读写权限。

检查了文件读写、普通预览、选区引用、文件操作服务及插件文件上下文的相关转换入口。本轮未确认其他同类缺陷，不构成对整个仓库无其他问题的保证。

## 5. 测试与验证

修复前：

- 新增文件视图用例，提供带根目录元数据的资源并启用选区引用，捕获到上述字段校验异常。
- 新增插件命令用例，普通文件和只读预览均收到空文件参数，两个用例失败。

修复后，以下四个相关测试文件共 45 项通过：

- `src/modules/files/widgets/__tests__/fileViewIdentity.spec.ts`：文件视图与语义标识；新增带元数据、启用选区引用的渲染用例。
- `src/app/workbench/__tests__/useExtensionContributions.spec.ts`：插件贡献接入；新增两种文件视图的命令目标用例，并确认无效版本、非文件资源仍传空值。
- `src/app/workbench/__tests__/desktopSelectionReferences.spec.ts`：桌面选区引用行为。
- `src/app/workbench/__tests__/FileOperationService.spec.ts`：文件操作服务。

命令（在仓库根目录执行）：

```powershell
pnpm --filter @uselexora/lexora-buddy exec vitest run src/app/workbench/__tests__/useExtensionContributions.spec.ts src/modules/files/widgets/__tests__/fileViewIdentity.spec.ts src/app/workbench/__tests__/desktopSelectionReferences.spec.ts src/app/workbench/__tests__/FileOperationService.spec.ts --maxWorkers=2
pnpm --filter @uselexora/lexora-buddy type-check
git diff --check
```

新增插件测试首次类型检查发现测试描述缺少必填的 `multiple`（是否允许多个视图）字段；补齐后，该文件 16 项测试重新通过，类型检查和差异格式检查均通过。其他三个测试文件的输入未再变化，沿用上述通过结果。

未运行全量测试或打包。组件测试对 Markdown、Monaco 编辑器和引用菜单的部分实现使用替身，验证的是字段转换和视图挂载，不代替真实界面、选区交互或实际插件的端到端验收。

## 6. 待验收与恢复

- [ ] 安装包含本修复的新包后，打开项目中的文本与 Markdown 文件，不再出现通用视图失败。
- [ ] 文件选区可以加入聊天引用，引用内不出现内部根目录字段。
- [ ] 从普通文件及只读预览执行文件相关插件命令，插件能取得正确的当前文件。
- [ ] 无效或已撤销的目录授权仍按原有规则拒绝。

当前安装版不会因源码修改自动更新。本次无依赖、配置、数据或迁移变更；回退两个解析调用即可恢复旧行为，但会重新引入本文缺陷。

## 7. 文件与术语说明

| 原名称 | 中文含义 | 用途 |
| --- | --- | --- |
| `canonicalRoot` | 规范根目录 | 宿主内部文件操作定位，不属于文件目标契约 |
| `resource.data` | 工作台资源数据 | 同时容纳文件目标和内部元数据 |
| `spaceFileTargetSchema` | 文件目标校验规则 | 校验空间、目录、版本和相对路径 |
| `.strip()` | 剔除额外字段 | 在宿主转换出口提取合法目标，不绕过必需字段校验 |
| `.parse()` / `.safeParse()` | 抛错解析／返回结果的安全解析 | 前者异常使视图失败，后者失败在旧逻辑中被转换为空值 |
