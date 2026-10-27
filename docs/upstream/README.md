# 上游集成记录索引

这里集中保存手动上游集成记录，保留原文件名和历史结论。本次整理不改变移植决定、迁移编号或验证结论。

## 查阅入口

- [集成基线](../upstream-baseline.json)：自动化及人工流程读取的已检查提交，保留原位置。
- [自动预备记录](../upstream-auto-20261016-integration.md)：由自动化生成，暂留原位置，避免改变脚本的固定路径。
- [文档总索引](../README.md)：返回项目文档入口。

## 当前记录

- [上游集成记录：2026-10-27](upstream-20261027-integration.md)
- [上游集成记录：2026-10-26](upstream-20261026-integration.md)
- [上游集成记录：2026-10-25](upstream-20261025-integration.md)（另有 [第二轮](upstream-20261025-2-integration.md)、[第三轮](upstream-20261025-3-integration.md)）
- [上游集成记录：2026-10-24](upstream-20261024-integration.md)（另有 [第二轮](upstream-20261024-2-integration.md)、[第三轮](upstream-20261024-3-integration.md)）

## 已归档

2026-10-23 及更早的记录已移到 [`../archive/upstream/`](../archive/upstream/)，文件名不变，目录里没有单独的索引，按文件名日期查找。早期分轮记录也在其中：`upstream-round-1`、`upstream-remaining`、`upstream-round-4`。

## 后续维护

- 新的手动集成记录放在本目录，沿用现有文件名格式，不重编号历史记录。超过一周的记录移入 `docs/archive/upstream/`。
- 基线文件和自动预备报告继续使用原路径；本次没有修改自动化脚本或工作流。
- 历史记录中的命令、构建输出位置和验证状态按当时的情况理解，不代表当前环境。
- 文件移动提交后，可使用 `git log --follow -- <当前文件路径>`（跟随重命名查看历史的命令）追溯旧版本。

## 文件与术语说明

| 原名称 | 中文含义 | 用途 |
| --- | --- | --- |
| `docs/upstream/` | 手动集成记录目录 | 归档各轮移植、跳过及验证记录 |
| `docs/upstream-baseline.json` | 集成基线文件 | 保存已检查的上游提交，不随文档归档移动 |
| `upstream-YYYYMMDD-integration.md` | 按日期命名的集成记录 | 保持与现有历史文件一致的命名方式 |
