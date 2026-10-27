# Bug：文件菜单关闭时跳到左上角及代码选区引用需要重复操作

**日期**：2026-10-17<br>
**状态**：源码修复与定向检查通过；用户反馈开发预览测试通过<br>
**环境**：Windows，当前开发分支；未打包安装

## 1. 现象与根因

### 文件树右键菜单关闭时跳到左上角

在文件管理器右键打开菜单，点击空白处关闭，菜单先移到应用左上角再消失。

`WorkspaceExplorer.vue`（文件树与操作菜单组件）用同一个可空状态保存显示状态、选中节点和坐标。关闭时将状态清空，使菜单在退场动画期间同时收到隐藏指令和坐标 `(0, 0)`。选择菜单项也走相同的关闭逻辑。

修复：把坐标独立保存在 `menuPosition`（最后一次打开位置）中；关闭仅清空菜单状态，保留动画锚点；再次打开才更新坐标。

### Monaco 引用需要先后点击两层菜单

在代码或纯文本编辑器选中文字，原生菜单先显示“引用”；点击后，另弹“引用到对话”，需要再次点击。

`useMonacoResourceQuote.ts`（代码编辑器引用适配器）的旧动作只捕获选区并调用公共下拉菜单，不直接执行添加。Markdown 预览直接显示引用目标菜单，不经过 Monaco 原生菜单，因此入口不一致。

修复按用户确认的 Office 插件交互实施：

- 保留 Monaco 原生复制等操作，不替换整个菜单。
- 单个可用目标：原生菜单内点击“引用到对话”直接添加。
- 多个可用目标：同一个原生菜单入口展开目标子菜单，默认目标排在前面；不再关闭原菜单后另弹独立菜单。
- 没有目标或引用无效时提供禁用项；沿用公共引用服务的来源、目标身份、去重与长度校验。
- Markdown 预览菜单不变。文件编辑、只读文本预览及使用相同适配器的内置文本产出均接入新入口。

### 初次改造后点击引用却没有卡片

开发预览中，用户发现点击引用后，输入框上方没有出现引用卡片。

Monaco 的菜单动作在执行前先隐藏菜单并恢复编辑器焦点；新增的焦点监听立即重建菜单、注销待执行命令，导致引用没有真正写入草稿，而非卡片样式未渲染。

修复：移除焦点恢复触发的刷新，保留选区变化、右键或键盘打开菜单及响应式来源/目标变化时的更新。每次捕获使用独立命令标识，防止旧菜单错误执行新目标的动作；编辑器销毁时释放菜单、命令与监听。

## 2. 上游对照与技术约束

- 当日读取上游 `master`，文件树菜单仍存在“清空菜单时坐标回退为零”的相同写法；这属于源码核对，未运行上游界面复现。
- 上游 Monaco 适配器仍为先点原生“引用”、再打开公共下拉菜单；该文件最近修改为 `1c2c9db4`。所查已合入代码未包含本次原生子菜单优化，不排除未合并分支或 PR。
- 原始链接：[文件树菜单](https://github.com/useLexora/Lexora/blob/master/apps/buddy/src/modules/files/explorer/WorkspaceExplorer.vue)、[Monaco 引用适配器](https://github.com/useLexora/Lexora/blob/master/apps/buddy/src/shared/ui/selection/useMonacoResourceQuote.ts)。
- Monaco 公共 `addAction()`（注册编辑动作的接口）不支持原生子菜单。本轮使用其内部菜单与命令注册接口，最小类型声明集中在 `monacoMenuInternals.d.ts`；未来升级 Monaco 时需回归菜单显示、键盘操作和命令生命周期。
- 本次不改引用协议、数据迁移、发送行为、目录授权或安装版数据；不新增依赖。

## 3. 验证记录与证据边界

| 检查 | 结果与范围 |
| --- | --- |
| 文件树组件回归 | `WorkspaceExplorer.spec.ts` 2 项通过，覆盖点击空白处及选择命令关闭后坐标保留、重新打开更新位置 |
| 原生菜单适配回归 | `useMonacoResourceQuote.spec.ts` 最终 8 项通过，覆盖单目标、原生子菜单、目标更新、鼠标/键盘入口、编辑器隔离与销毁清理 |
| 焦点恢复回归 | 上述 8 项中的单屏、多屏两个用例，在移除焦点监听前均失败，修改后通过；模拟菜单恢复焦点后再查找并执行命令 |
| 引用组件回归 | `ResourceReferenceUi.spec.ts` 最终 8 项通过，含直接添加不弹第二层菜单、多分屏默认排序和只写选定草稿、来源变化拒绝旧动作 |
| 公共路由 | `workbenchSelectionReferences.spec.ts` 8 项通过，覆盖身份变化、去重及保留最新正文 |
| 文件视图 | `fileViewIdentity.spec.ts` 6 项通过，验证编辑器与资源身份的既有行为 |
| 静态检查 | 类型检查、修改源码与测试的 ESLint、差异格式检查通过 |
| 用户开发预览 | 用户在焦点修复后反馈“测试通过”，据此记录开发预览确认，不推断逐项执行了哪些场景 |

最终焦点修复后执行的三个引用测试文件共 24 项通过；文件树与文件视图测试沿用先前对应输入的通过结果。本轮未运行全量测试、完整预检、打包或安装，不将模拟焦点顺序的单元测试等同于真实 Electron 自动化；用户预览也不扩展为跨平台或所有格式逐项验收。

## 4. 相关文件与术语

| 原名称 | 中文含义与用途 |
| --- | --- |
| `apps/buddy/src/modules/files/explorer/WorkspaceExplorer.vue` | 文件树操作菜单，分离关闭状态与坐标 |
| `apps/buddy/src/shared/ui/selection/useMonacoResourceQuote.ts` | 将引用目标贡献到 Monaco 原生菜单 |
| `apps/buddy/src/shared/ui/selection/ResourceSelectionQuoteMenu.vue` | 公共引用组件，提供捕获目标及执行添加的动作；保留 Markdown 下拉菜单 |
| `apps/buddy/src/shared/ui/monaco/monacoMenuInternals.d.ts` | 内部菜单接口的最小类型声明 |
| `MenuRegistry` / `CommandsRegistry` | Monaco 菜单项与命令注册表，生命周期必须与编辑器对应 |
| `WorkbenchSelectionReferences` | 工作台公共引用服务，重验来源与目标后追加到选定草稿 |

功能规则同步记录在 [Spec-013](../../specs/feature-013-workbench-selection-reference.md) 与 [Spec-019](../../specs/feature-019-file-manager-basics.md)。用户授权在当前分支本地提交，不推送、不合并分支；提交标识以 Git 历史为准。
