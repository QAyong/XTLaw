# 上游更新第一轮选择性移植

后续两轮已完成，最新整体状态和验证边界见 [upstream-remaining-integration.md](upstream-remaining-integration.md)。下文保留第一轮当时的范围与记录。

## 范围与状态

第一轮完成时直接修改现有 master 工作区，未合并 upstream/master、提交、推送或打包。2026-10-09，用户要求将三轮集成代码及文档一起提交到本地 master；后续验证和交付边界见上方链接。原有未跟踪文件 upstream-pr-plan.md 不纳入提交且未修改。

本轮不升级 Pi，不引入 Codemode、MCP 新管理功能、空间联动、新版会话引用或数据库迁移，也不沿用上游发布版本号。

## 已移植

### 1. 即时切换与加载界面

来源：上游 de2cfe81、d28c88ba。

- 保留 ActiveTaskProjection.resource，并增加从活动资源派生的 taskId；侧栏、资源面板和通知导航统一使用即时任务 ID。
- TaskWorkspacePool 区分初始化中的对象与已就绪对象，peek 只返回已就绪对象。
- 已存在任务尚未就绪或初始化失败时，不强制重新初始化才能关闭；已就绪任务仍保留输入关闭确认。
- DesktopTaskContribution 使用加载版本防止过期结果覆盖当前加载。
- 内容加载与输入/工作区恢复并行，保留模型选择恢复时的导航与用户选择校验。
- 增加 DesktopTaskLoading，提供标题与操作入口、进度提示、失败重试和减少动画偏好支持。

### 2. 停止队列保护

来源：上游 8c0bb956。

- chat.cancel 经 ChatQueueService.cancelRun 进入取消流程。
- 去重同一运行的取消请求，取消前后暂停队列。
- 取消期间阻止派发、steer 和 follow-up，并在异步校验后重复检查取消状态。
- 保留取消期间提交的新消息，但不自动继续；需通过现有队列操作明确继续。
- 旧运行的停止请求不暂停较新运行的队列；取消失败后释放保护。
- 保留本地立即结束展示、取消失败恢复展示、跨任务/分支隔离与资源选区引用发送逻辑。
- stoppingRunId 不再依赖已经被立即停止展示隐藏的 activeRun，避免清理尚未完成时误启动另一轮。

用户可见行为变化：停止期间提交的消息进入暂停队列，取消完成后不会自行执行。

### 3. 工具历史与事件压缩

来源：上游 9885f130 中与 Pi 升级无关的事件处理部分。

- 重复使用工具调用 ID 时保留前一次工具节点，并赋予新的展示节点 ID。
- 审批结果匹配具体审批 ID，避免旧审批结果影响新执行。
- 同时适配后端持久事件压缩和前端内存快照压缩，保留识别复用调用所需的 preparing/updated 事件。
- 回归覆盖事件压缩、回放及被拒绝执行的历史保留。

### 4. 资源面板小交互

参考：上游 2ebaa6e4，按本地状态模型适配。

- 面板尺寸变化后，重新滚动显示当前资源标签。
- 最大化按钮使用悬浮提示，保留本地 headerActions 插槽、图标和按钮位置。
- 标题栏换位操作保留键盘焦点。
- 最大化状态下拖拽任务时临时显示工作区；取消拖拽还原，成功投放后保留工作区可见。
- 切换到设置等其他页面时显示主工作区，但不清除任务自身的最大化偏好。
- WorkbenchHost 对隐藏主工作区中的视图传递正确的可见性。

## 保留的二开逻辑

- 按会话保存资源面板开关状态。
- 按任务保存面板左右位置、最大化状态及标题栏入口。
- Office DOCX 返回文件管理标签的防跳转保护、预装流程和插件内容。
- 文件、浏览器和产物选区引用，以及仅引用内容的发送支持。
- 通知打开等待消息定位确认的机制，未改为上游固定时长高亮。
- XTLaw 品牌、应用标识、数据目录隔离、原有数据库 v23 迁移。

改动涉及的 useDesktopWorkbench.ts 中另有一处已有 Office try/return 同行写法改为多行，仅为通过定向 ESLint，不改变逻辑。

## 验证结果

使用现有依赖，未安装或升级依赖。分批定向验证以下 14 个测试文件，共 164 项通过：

- instantTaskSwitch.spec.ts：1
- instantTaskSwitchRecovery.spec.ts：4
- DesktopTaskLoading.spec.ts：1
- useTaskCapability.spec.ts：29
- useChatTurnExecution.spec.ts：16
- ChatQueueService.spec.ts：34
- chatRunTranscriptProjector.spec.ts：13
- chatRunEventBuckets.spec.ts：6
- chatStreamingMessage.spec.ts：27
- WorkbenchResourcePanel.spec.ts：4
- WorkbenchHost.spec.ts：7
- contextPanePlacement.spec.ts：4
- useContextPanePresentation.spec.ts：5
- useDesktopNavigation.spec.ts：13

本轮 28 个源码/测试文件的定向 ESLint 通过；git diff --check 通过。

首轮定向测试暴露两处问题，均已恢复验证：前端事件快照压缩的配套改动缺失；上游通知用例需要适配本地定位确认机制。useTaskCapability 既有用例输出 Vue effect-scope 警告，测试通过。

未运行全量测试、全项目类型检查、构建、打包或桌面端视觉/E2E 实测。单元及服务测试通过不代表这些未执行项目已经通过。

## 后续桌面实测建议

1. 连续快速点击多个历史会话，确认侧栏高亮、资源面板归属和聊天内容对应同一任务；加载失败后能切走并重试。
2. 带草稿切换任务，确认已有输入关闭保护仍生效。
3. 运行中点击停止并立即提交新消息，确认展示立即结束、新消息保留但不自动执行；点击队列继续后才执行。
4. 资源面板最大化后拖拽任务，分别取消和完成投放；切换到设置再返回，确认任务布局偏好保留。
5. 换位与调整窗口大小后，确认键盘焦点、当前资源标签和内置浏览器状态保持。
6. 确认 Office 文档切换、各类选区引用和通知消息定位仍正常。

## 上游来源

- https://github.com/useLexora/Lexora/commit/de2cfe81f5cda4bcb5afcadd6bf02a1fc965f014
- https://github.com/useLexora/Lexora/commit/d28c88badfb44e8799209ded5f0bb4796f0d05ab
- https://github.com/useLexora/Lexora/commit/8c0bb9568e92a663fe7ee12542d20a777a7f6718
- https://github.com/useLexora/Lexora/commit/9885f130a20b9ecc1abe606c09ef433b7b6a1cf6
- https://github.com/useLexora/Lexora/commit/2ebaa6e4301ced632ead5a6c99d82d542d9aba1e
