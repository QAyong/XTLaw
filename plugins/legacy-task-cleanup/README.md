# 任务残留清理

清理旧版已移除任务留下的本地残留。插件以宿主提供的 `legacyTaskCleanup` 能力为唯一数据来源，不直接读取宿主数据库、文件目录或内部接口。

本 XTLaw 适配版保留官方插件身份 `p95e8d9a8d120433d9ba2058e1c844ed0.legacy-task-cleanup` 和作者署名 `Lexora`，版本为 `1.0.1`。要求 XTLaw `>=0.5.6`（API 4）。`0.5.5` 及更早版本不满足最低版本。许可证为 MIT，完整文本见本目录 `LICENSE`；来源与变更记录见 `PROVENANCE.md`。

## 使用

安装并启用后，在「插件」找到「任务残留清理」，选择「插件操作 → 清理任务残留…」。宿主扫描并冻结本轮范围，面板显示待清理数量、跳过数量及不可恢复提示。只有点击「删除」才提交清理。

- 取消确认、关闭/隐藏面板或确认 signal 被取消时，本轮不提交删除。重新打开只显示本会话最近状态，不恢复过期确认。
- 清理进行时再次点击「清理任务残留…」只恢复当前面板，不会提交第二次作业。「查看进度与结果」只打开面板，也不发起清理。
- 已确认的核心作业可能在后台继续。关闭面板或切换页面不会伪装成可以撤销；可从插件菜单重新查看本会话结果。
- 结果分别显示已删除、后台处理中、失败和跳过；后台处理中不代表已删除。遇到结果未知的错误时保留最后收到的真实计数，不自动重试。重启应用后不恢复假的进行中状态。
- 清理范围由宿主能力限定为旧版已移除任务的本地残留，不处理活动或已归档任务，不删除用户工作区及外部文件。具体扫描数量由宿主返回。

## 本地源码检查

在 Lexora/XTLaw 仓库根目录运行：

```sh
node apps/buddy/extensions/tools.mjs check plugins/legacy-task-cleanup
node apps/buddy/extensions/tools.mjs build plugins/legacy-task-cleanup /tmp/legacy-task-cleanup-build
node apps/buddy/extensions/tools.mjs pack plugins/legacy-task-cleanup /tmp/legacy-task-cleanup-1.0.1.lexora-extension
```

`check`/`build` 会依赖运行它们的宿主源码版本；在插件最低版本 `0.5.6` 尚未成为当前构建版本时，版本兼容预检应拒绝通过。不要通过降低插件最低版本来规避。市场发布由本仓库同步后按市场仓库 README 构建：先在 XTLaw 仓库运行 `pnpm market:sync --plugin=legacy-task-cleanup`，然后在市场仓库运行 `pnpm build`。发布前在真正提供 740 能力的 Windows 隔离测试宿主上安装验证，最终包与实测记录以对应 Release 和集成记录为准。
