# Bug：重启后关掉 Office 插件标签页，它会自己再打开一次

**日期**：2026-11-03
**优先级**：低（P3。多开一个编辑器标签页，抢走焦点；不丢数据，再关一次就不弹了）
**状态**：已修复（2026-11-03）。用户在 Windows 开发预览里看过，反馈没有问题；预览是最新 master 加本修复，没有逐条记录各验收项的结果。原因是读代码得出的推断，没有在修复前的版本上复现过；“原因”一节写明依据和没验证的部分，“修复方案”一节写明做了什么和验证到哪一步。
**范围**：所有按 `accepts.extensions` 接管文件的文档插件，在“文件管理器标签页旁边打开文档标签页”这条路径上的重复打开：DOCX、XLSX、PPTX，以及同样声明了 `accepts` 的 Office PDF。判断入口是 `ExtensionDocumentRouter.isDocument`，不是写死的扩展名。原因与具体插件无关。

## 现象

关掉 Office 插件（DOCX/XLSX/PPTX）的文档标签页后，同一个文档过一会儿又被自动打开一次。再关一次就不会再弹了，所以表现为“重复打开一次”。

用户在 2026-11-03 先是以为自己看错了；起因不明，没有记下是否刚重启过。

## 原因

文件管理器标签页选中 Office 文件时，由 `apps/buddy/src/app/workbench/DesktopWorkbenchArea.vue` 里的一个 watcher 负责在它旁边打开文档标签页：

- watcher 盯的是 `fileTab.value?.target`，也就是“当前活动的文件管理器标签页的 target”。
- 为了避免“回到文件管理器标签页时又跳进编辑器”，它用组件内的 `documentSelections`（`Map<标签页 id, target>`）记下已经打开过的 target，下次拿到的 target 与记录是**同一个对象**（`===`）就不再打开。
- 这个 Map 只在内存里，只有这个 watcher 自己打开过文档才会写入。

关闭 Office 标签页后，`useContextPanelTabs.ts` 的 `close` 会选中相邻标签页（`tabs[index + 1] ?? tabs[index - 1]`）。Office 标签页开在文件管理器标签页旁边，所以活动页变回文件管理器标签页，`fileTab` 从 `null` 变成该标签页，watcher 触发。此时：

- **本次运行里自己点开的文档**：Map 里有这个 target，直接返回，不会重开。这是预期行为。
- **重启后恢复出来的文档**：标签页（含选中的路径）由 `useTaskContextPanel.restoreSnapshot` 从快照恢复，Office 视图由 `restoreWorkbenchLayout` 恢复，但 Map 是空的。关掉 Office 标签页后 watcher 找不到记录，调用 `openFile(target, tabId)`，`createFile` 里查不到现存的 Office 视图（刚被关掉），于是新开一个，并把 target 写进 Map。第二次关闭就命中记录，不再弹出。

这和“只重复一次”的描述吻合。

同一原因还会带出一个相关现象：重启后，只要活动页是停在 Office 文件上的文件管理器标签页，watcher 的 `immediate` 首次触发也会找不到记录，直接打开 Office，即使上次退出前用户已经把它关了（关掉的视图不在快照里，但文件管理器标签页的选中路径在）。

### 没验证的部分

- 没有在界面里复现。WSL 里不能跑桌面应用的界面，预览要回 Windows 本机做。
- 没找到本次运行内会让 Map 失配的路径：`DesktopWorkbenchArea` 在 `DesktopShell.vue` 里不被条件卸载，所以切页面不会清空 Map。如果用户是在没重启的情况下遇到的，说明还有别的路径，需要补复现步骤。
- 重启后“上次关了仍自动弹出”这一条同样是读代码推断。
- `DesktopWorkbenchArea.vue` 没有单元测试。

## 修复方案（已实施）

目标：重启恢复出来的文件管理器标签页，在被激活或被关掉相邻标签页后，不自动打开文档；用户在本次运行里点文件才打开。

做法：恢复完成后，把当时已有的所有文件管理器标签页的 `target` 先登记为“已处理”（只登记，不打开），之后沿用对象身份比较。

- 新增 `apps/buddy/src/app/workbench/DocumentSelections.ts`，把原来 `DesktopWorkbenchArea.vue` 里的内存 Map 抽成一个类：`claim(tabId, target)` 在该标签页第一次出现这个 target 时返回 true 并记下，`seed(tabs)` 只登记、不打开。比较前用 `toRaw` 去掉响应式包装，避免登记的原始对象和 watcher 拿到的只读代理对不上。
- `useDesktopWorkbench.ts` 持有这个实例（作为 `documentSelections` 返回）。`initialize()` 在 `restoreSnapshot` 和旧版标签页恢复之后、第一个 `await` 之前调用 `seed(resources.allTabs.value)`。放在第一个 `await` 之前，是为了让 watcher 在恢复后的第一次触发时就看到登记。
- `DesktopWorkbenchArea.vue` 改用 `documentSelections.claim(...)`，其余逻辑不变。

对象身份比较保持不变，不改成按值比较。用户关掉 Office 标签页后，在文件树里再点同一个文档会产生新 target 对象，仍会重新打开；按值比较会让这次点击没有反应。这一点由 `selectFile` 每次新建 target 对象保证，我读过代码，没有在界面里点过。

没改 `ContextTabProjection`、`closeView` 和 Office 插件本身。排查中看过，这几处的关闭与对账流程没有发现问题。

### 验证到哪一步

- 新增 `DocumentSelections.spec.ts`，6 个用例通过：同一 target 只打开一次；重新选同一文件（新对象）再次打开；不同标签页互不影响；恢复的 target 不重开，换文件仍打开；穿过 `readonly` 包装仍识别；非文件管理器标签页不登记。
- `src/app/workbench` 与 `src/workbench` 下 33 个 spec、280 个用例通过。
- `vue-tsc -b` 通过（默认堆 2 GB 会内存溢出，需要 `NODE_OPTIONS=--max-old-space-size=6144`）。涉及文件的 eslint 通过。
- **没有自动测试覆盖**“`initialize` 里确实调用了 `seed`”和“watcher 确实用了 `claim`”这两处接线，只有类型检查和 lint 把关。界面验证要回 Windows 预览做，见下面的验收。
- 需要在预览里留意一点：重启后文件管理器停在某个文档上时，现在不会再走 `openFile`，文件管理器里的内联预览依赖恢复出来的布局里已有的那个视图。正常情况下布局会连同它一起保存，没在界面里确认过。

## 验收

- 重启后，活动页是停在 docx/xlsx/pptx 上的文件管理器标签页：不自动打开 Office。
- 重启后，Office 标签页是活动页：关掉它，不会重新弹出。
- 本次运行里点开 Office 文档，关掉后切回文件管理器标签页：不重开（现有行为，保持）。
- 关掉 Office 标签页后，在文件树里再点同一个文档：重新打开。
- 在文件树里点另一个 Office 文档：打开，与之前一致。
- 上面各条在 Windows 预览（`D:\dev\Lexora-win`）里看过，用户反馈没有问题；本机 WSL 只跑了单元测试、类型检查和 lint。

## 相关记录

- 调用链：`DesktopWorkbenchArea.vue` 的 watcher → `useDesktopWorkbench.openFile` / `createFile` → `api.extensions.openFile`。
- 同一条路径上另有 `revealOpenOfficeDocument`（卡片点击时优先显示已打开的 Office 标签页），它不受本问题影响。
- 这个守卫最早是 `109394bc5`（2026-10-05，集成 Office DOCX 编辑）里的 `docxSelections`，只认 `.docx`；`041aacdab`（2026-10-18，PPTX 改由扩展视图打开）把它改名为 `documentSelections` 并去掉只认 `.docx` 的判断，随后 `3ba84f4ae` 改为按插件 `accepts` 路由。守卫本身（内存 Map + 对象身份比较）从一开始就没变。
