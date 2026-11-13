# 行为验证记录

验证对象：固定上游实现移植后的本地插件源码；宿主 API 使用 740 移植中的公开 `LegacyTaskCleanupCommandApi` 类型契约。验证不会调用真实删除服务或读取用户数据库。

## 契约核对

- `cleanup` 只接受本插件 `extension.actions` 菜单入口，并将当前调用的 `taskCleanup` 对象直接传给 `run`。
- `confirm(preview, signal)` 使用唯一 request ID，只有匹配当前确认且未取消时才返回 `true`；否则返回 `false`。
- 取消按钮、面板关闭/隐藏和视图销毁通过当前 request ID 取消未确认操作；原确认 signal 或扩展停用会终结等待。宿主进度达到终态会解除遗留确认。
- 清理命令仍活动时重复调用只重新显示当前 placement；`show-progress` 只显示 placement。
- 每条进度快照保留宿主的 `deleted`、`pending`、`failed`、`skipped` 独立计数；最终 `result.summary` 覆盖进度快照。请求结果未知时状态转为 `interrupted`，保留最后真实计数并不自动重试。

## 隔离验证

在 XTLaw 源码仓库根目录运行 `node --test packaging/market/legacy-task-cleanup.test.mjs`：10 项测试通过。脚本在内存中转译并执行真实 `main.ts`、`state.ts`，另以 `linkedom` 呈现真实 `view.ts`。`taskCleanup.run`、命令注册、placement 和进度都使用 mock，不连接真实数据库或删除服务。覆盖匹配 request ID 确认/取消、视图隐藏/关闭/销毁与原 signal/停用取消、重复入口只显示当前 placement、查看结果不调用 `run`、进度及最终 summary 的分项计数、未知结果保留最后计数、状态校验和 UI 分项呈现。开发测试保存在仓库 `packaging/market/`，不进入插件安装包。

## 源码与包检查

通过仓库 `readExtensionPackage`、`buildExtensionDirectory`、`packExtensionDirectory` 实际函数检查：读取 10 个插件源码/说明文件；转译构建产出 9 个文件，含 `main.js`、`state.js`、`view.js`、CSS、许可证及来源/验证说明；安装包含许可证、provenance 与验证记录，不含测试。临时构建目录与安装包已删除；临时 API 验证包不作为最终市场产物，最终 SHA-256 以市场目录和 Release 为准。清单兼容谓词验证拒绝 `0.5.5`、接受 `0.5.6`。

**限制：**运行 `tools.mjs check` 的 Node 26 CLI 在加载宿主源码时因无扩展名 TS 导入而失败；直接使用已安装 Vite 的 SSR loader 加载相同仓库构建 API 后，源码读取、转译和打包均通过。本文件只记录源码层验证，不将 mock 结果当作真实宿主验收。Windows 隔离测试宿主的安装、确认与清理结果，以及最终安装包的哈希，由 XTLaw 仓库集成记录及本版本 Release 单独记录。
