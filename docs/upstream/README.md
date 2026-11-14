# 上游集成记录索引

这里集中保存手动上游集成记录，保留原文件名和历史结论。整理只调整文件位置和路径引用，不改变移植决定、迁移编号或验证结论。

## 查阅入口

- [集成流程](WORKFLOW.md)：每轮手动集成与自动预备的规则，长期有效，不属于集成记录，不随记录归档。
- [集成基线](../upstream-baseline.json)：自动化及人工流程读取的已检查提交，保留原位置。
- [自动预备记录：2026-10-16](../upstream-auto-20261016-integration.md)、[2026-11-03](../upstream-auto-20261103-integration.md)：由自动化生成，暂留原位置，避免改变脚本的固定路径。
- [归档目录说明](../archive/README.md)：已归档记录的存放规则和追溯方式。
- [文档总索引](../README.md)：返回项目文档入口。

## 当前记录

2026-11-07 及之后的记录留在本目录：

- [上游集成记录：2026-11-13](upstream-20261113-integration.md)：检查 19 项，累计移植六项；`670ca0cf6` 暂缓。分支未合并、未推送。
- [2026-11-13 任务归档与永久清理](upstream-20261113-archive-integration.md)：上游 `09e58acec`（150 个文件）单独成轮，映射到本地 `a3181b75b`。
- [2026-11-13 任务残留清理：宿主移植与插件市场发布](upstream-20261113-cleanup-integration.md)：`740e0bb27` 与 `legacy-task-cleanup` 插件适配、市场同步。
- [上游集成记录：2026-11-10](upstream-20261110-integration.md)：`1a28f12f5`、`2cedc5a2b` 等跳过；上轮遗留项复核为已等价实现。
- [上游集成记录：2026-11-09](upstream-20261109-integration.md)：五个产品移植，各自对应一个本地提交。
- [上游集成记录：2026-11-09 Pi 1.5.0](upstream-20261109-pi-integration.md)：Pi 1.4.0 升至 1.5.0。
- [上游集成记录：2026-11-08](upstream-20261108-integration.md)：预评估 6 个提交，移植 3 项、跳过 3 项。
- [上游集成记录：2026-11-07](upstream-20261107-integration.md)：引用作者、画布定位、独立阅读宽度；`b495b856f` 推理资源校验修复已确认暂缓，依赖前序插件推理功能。

## 已归档

2026-11-06 及更早的记录已移到 [`../archive/upstream/`](../archive/upstream/)，文件名不变，目录里没有逐文件索引，按文件名日期查找；归档规则见 [`../archive/README.md`](../archive/README.md)。早期分轮记录也在其中：`upstream-round-1`、`upstream-remaining`、`upstream-round-4`。

## 后续维护

- 新的手动集成记录放在本目录，沿用现有文件名格式，不重编号历史记录。超过一周的记录移入 `docs/archive/upstream/`，移动时同步修正指向被移动文件的相对链接。
- 基线文件和自动预备报告继续使用原路径；不要移动或改名，否则会影响 `.github/scripts/upstream-watch.mjs`。
- 历史记录中的命令、构建输出位置和验证状态按当时的情况理解，不代表当前环境。
- 文件移动提交后，可使用 `git log --follow -- <当前文件路径>`（跟随重命名查看历史的命令）追溯旧版本。

## 文件与术语说明

| 原名称 | 中文含义 | 用途 |
| --- | --- | --- |
| `docs/upstream/` | 手动集成记录目录 | 归档各轮移植、跳过及验证记录 |
| `docs/upstream-baseline.json` | 集成基线文件 | 保存已检查的上游提交，不随文档归档移动 |
| `upstream-YYYYMMDD-integration.md` | 按日期命名的集成记录 | 保持与现有历史文件一致的命名方式 |
