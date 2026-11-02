# Bug：资源面板在左时开合任务侧栏，插件视图和内置浏览器错位

**日期**：2026-11-02
**优先级**：中（P2。只是显示错位，不丢数据；但所有插件视图和内置浏览器都受影响，文件预览、Office 插件和网页都会盖住侧栏或聊天区）
**状态**：已修复，未提交；控制器单元测试已通过，Windows 桌面实测未跑
**范围**：`apps/buddy/src/workbench/browser/surfaces/SurfaceLayoutController.ts` 对固定定位视图（插件 iframe、内置浏览器 `<webview>`）位置的测量。不改任务侧栏的动画，也不改插件和浏览器宿主。

## 现象

资源面板与聊天区交换位置后（资源面板在左，聊天区在右），再收起或展开任务侧栏，插件视图（视频播放器、Office PPTX 等）停在旧位置：

- 视频播放器盖住了侧栏，字幕列表右边空出一块，没有铺满资源面板。
- PPTX 编辑器的右边压在聊天区上，聊天文字被盖住。
- 内置浏览器的网页同样停在旧位置（现象由使用者确认，源码里走的是同一个控制器，见下）。

这些都是资源面板在左。再开合一次侧栏或拖动窗口大小，视图会重新对齐。

## 原因

插件视图是 `position: fixed` 的 iframe，由 `SurfaceLayoutController` 测量它所在面板（锚点）的位置后摆过去。内置浏览器也一样：`DesktopBrowserGuestHost.vue` 把装 `<webview>` 的外框用 `layout.attach(frame, …)` 挂到同一个控制器上，位置全靠它测量。

文件管理器、文件预览和文本编辑器（`files.preview`、`files.editor`）是普通 Vue 组件，直接在资源面板的 DOM 流里，侧栏动画平移面板时浏览器布局会带着它们走，不受影响。

控制器只在这些情况重新测量：

- 锚点或其祖先元素的尺寸变化（`ResizeObserver`）
- 它们的 `hidden`、`inert`、`class`、`style` 属性变化（`MutationObserver`）
- 窗口缩放
- 滚动

任务侧栏开合是一个 240ms 的宽度动画（`WorkbenchLayout.vue` 的 `.desktop-workbench-layout__sidebar`，`transition: width 240ms`）。

- **默认布局**（聊天区在左，资源面板在右）：资源面板贴着窗口右边，位置不动，侧栏只改变聊天区的宽度，不受影响。
- **交换后**（资源面板在左）：资源面板紧挨着侧栏，左边位置等于侧栏宽度。动画把它整个平移，但它自己的宽度由 `--buddy-context-panel-width` 固定，尺寸不变；侧栏也不是它的祖先，它的 class 变化没人监听。尺寸观察器和属性监听都不触发。
- 动画开始时的那一次测量发生在面板还没动的时候；动画结束后没有任何事件，iframe 就停在旧位置。

交换本身不会错位：它改了 class，属性监听会立刻重新测量，而且没有动画。

## 复现

用真实的 `SurfaceLayoutController` 在无头 Chromium 里搭最小布局（侧栏 190px、240ms 宽度动画；资源面板固定宽 700px，排在侧栏后面）：

| 步骤 | 面板左边 | iframe 左边 |
|---|---|---|
| 初始 | 190 | 190 |
| 收起侧栏后 | 0 | 190（错位） |

这是最小布局，不是真实应用。

## 修法

在控制器里监听 `transitionrun`、`transitionend`、`transitioncancel`（`document` 捕获阶段）：有过渡在运行时每帧调用 `invalidate()`，全部结束后再测一次。最小复现里，加上之后收起和展开都对齐。

不只监听 `transitionend`：动画期间 iframe 会落后，结束时才跳一下。

实现上的几点：

- **只跟踪影响几何的属性**（`width`、`height`、`left`/`top`/`right`/`bottom`、`inset`、`margin`、`padding`、`flex`、`gap`、`grid`、`transform`、`translate`、`scale`、`rotate` 等）。hover 变色、`opacity` 这类过渡不会引发每帧测量。伪元素上的过渡也忽略。
- **按元素计数，不按属性名记集合。** 同一属性重新触发时，旧过渡的 `transitioncancel` 和新过渡的 `transitionrun` 顺序不保证，计数不受影响。
- **每帧清掉已脱离文档的元素。** 元素在过渡中途被移除时，`transitionend` 和 `transitioncancel` 可能到不了 `document`，不清理会让每帧循环停不下来。
- `dispose()` 取消待执行的帧、清空计数并移除三个监听。

只改了 `SurfaceLayoutController.ts`，插件视图和内置浏览器都走它，宿主组件没动。

## 验证

已做：

- `SurfaceLayoutController.spec.ts` 新增 5 个用例：锚点只平移不改尺寸时 iframe 逐帧跟随并在结束时落到最终位置；多个过渡叠加；非几何过渡不触发；元素被移除后停止；`dispose()` 后停止。前两个在原控制器上失败（`190px` 不等于 `100px`），其余是反向保护。
- 该文件 10 个用例全过；`src/workbench/browser`、`src/platform/browser`、`src/modules/extensions/widgets` 共 104 个用例全过。
- eslint、`vue-tsc -b` 无报错（`vue-tsc` 默认堆会内存溢出，需要 `NODE_OPTIONS=--max-old-space-size=6144`）。

未做（WSL 做不了，回 Windows 本机）：

- 资源面板在左时开合侧栏，看视频、PPTX 和内置浏览器是否跟着移动；默认布局下不退化。

## 备注

- 这个文件是从上游移植的，上游的控制器与本地一致，也有同样的问题。已提交上游 PR：useLexora/Lexora#540（分支 `codex/fix-surface-layout-transitions`，基于上游 master，只含控制器和测试）。PR 合并后，按 AGENTS 对比上游最终版本与本地实现，把差异同步回来。
- 上游布局自带箭头按钮，开合时会切换根节点的 `is-sidebar-transitioning`，动画结束时触发一次重新测量，所以那条路径只是动画期间滞后。永久错位出在不经过它的路径（非 `full` 导航布局的标题栏按钮、打开 `additional-directories` 入口时展开侧栏）。本地布局没有用这个类，所以所有开合方式都会永久错位。这是读代码的结论，没在上游完整应用里复现。
- 在一个自制的视频播放器插件上先发现，换成 Office PPTX 也同样出现，说明与具体插件无关。
