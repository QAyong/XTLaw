# 上游集成记录索引

这里集中保存手动上游集成记录，保留原文件名和历史结论。本次整理不改变移植决定、迁移编号或验证结论。

## 查阅入口

- [集成基线](../upstream-baseline.json)：自动化及人工流程读取的已检查提交，保留原位置。
- [自动预备记录](../upstream-auto-20261016-integration.md)：由自动化生成，暂留原位置，避免改变脚本的固定路径。
- [文档总索引](../README.md)：返回项目文档入口。

## 按日期查阅

- [上游集成记录：2026-10-22（第六轮）](upstream-20261022-6-integration.md)
- [上游集成记录：2026-10-22（第五轮）](upstream-20261022-5-integration.md)
- [上游集成记录：2026-10-22（第四轮）](upstream-20261022-4-integration.md)
- [上游集成记录：2026-10-22（第三轮）](upstream-20261022-3-integration.md)
- [上游集成记录：2026-10-22（第二轮）](upstream-20261022-2-integration.md)
- [上游集成记录：2026-10-22](upstream-20261022-integration.md)
- [上游集成记录：2026-10-19](upstream-20261019-integration.md)
- [上游集成记录：2026-10-19（第二轮）](upstream-20261019-2-integration.md)
- [上游集成记录：2026-10-18](upstream-20261018-integration.md)
- [上游集成记录：2026-10-17](upstream-20261017-integration.md)
- [上游集成记录：2026-10-17（第二轮）](upstream-20261017-2-integration.md)
- [2026-10-16 上游集成：主题引擎（仅引擎）](upstream-20261016-theme-engine-integration.md)
- [2026-10-16 上游集成：按上游顺序分轮](upstream-20261016-integration.md)
- [2026-10-14 上游集成：插件兼容性提示](upstream-20261014-integration.md)
- [2026-10-13 上游集成：第 1–4 批](upstream-20261013-integration.md)

## 早期分轮记录

- [上游更新第一轮选择性移植](upstream-round-1-integration.md)
- [上游剩余更新选择性集成](upstream-remaining-integration.md)
- [上游更新第四轮选择性移植（第一批至第五批）](upstream-round-4-integration.md)

## 后续维护

- 新的手动集成记录放在本目录，沿用现有文件名格式，不重编号历史记录。
- 基线文件和自动预备报告继续使用原路径；本次没有修改自动化脚本或工作流。
- 历史记录中的命令、构建输出位置和验证状态按当时的情况理解，不代表当前环境。
- 文件移动提交后，可使用 `git log --follow -- <当前文件路径>`（跟随重命名查看历史的命令）追溯旧版本。

## 文件与术语说明

| 原名称 | 中文含义 | 用途 |
| --- | --- | --- |
| `docs/upstream/` | 手动集成记录目录 | 归档各轮移植、跳过及验证记录 |
| `docs/upstream-baseline.json` | 集成基线文件 | 保存已检查的上游提交，不随文档归档移动 |
| `upstream-YYYYMMDD-integration.md` | 按日期命名的集成记录 | 保持与现有历史文件一致的命名方式 |
