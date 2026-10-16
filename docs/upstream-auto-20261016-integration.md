# 2026-10-16 上游自动预备

上游检查范围：`3ca97e2e..0223ed89`，共 8 个新提交。

- 已按顺序移植：2 个
- 自动跳过：0 个
- 停下待人工处理：1 个（4a0ab562）
- 停下后未处理：5 个

## 已移植（等你审查）

| 上游提交 | 说明 | 文件数 |
|---|---|---|
| [`c249ed7c`](https://github.com/QAyong/XTLaw/commit/c249ed7c787cb4c945e1fce41a235800a3fb22ab) | fix(buddy): 优化工具探索与编排 | 13 |
| [`660506cb`](https://github.com/QAyong/XTLaw/commit/660506cba9207b185617cd0c94f47fbf3e63b977) | fix(buddy): 修复推理用量漏计 | 4 |

## 停在这里，需要人工

[`4a0ab562`](https://github.com/QAyong/XTLaw/commit/4a0ab5629384200fa5c66371180cb427d5a0f26c) feat(buddy): 支持 Mermaid 图表

- 依赖或包配置变更
- 试合并冲突数：1

后面的提交可能依赖它，所以不再往下自动处理。处理完后更新 `docs/upstream-baseline.json`。

## 停下后未处理（仅预评估，不保证可按序移植）

| 上游提交 | 说明 | 试合并冲突 | 需关注 |
|---|---|---|---|
| [`c242d689`](https://github.com/QAyong/XTLaw/commit/c242d6896cc2a42152a5669b739eeffe2a083709) | chore(release): 发布 v0.13.0 | 5 | 发版提交，只改版本号，届时自动跳过 |
| [`f7794178`](https://github.com/QAyong/XTLaw/commit/f7794178617be3509473d2e3383917ff34807b6c) | chore: 简化 Issue 模板 | 1 | 新增行含 Lexora 字样，需检查品牌：.github/ISSUE_TEMPLATE/bug_report.yml |
| [`248f8b5b`](https://github.com/QAyong/XTLaw/commit/248f8b5bd107b316122541952c0242e62efc7e03) | fix(buddy): 修复 Windows 大文件测试超时 | 0 | — |
| [`02af8afb`](https://github.com/QAyong/XTLaw/commit/02af8afb5b9b1b526a207bf936c1d69e1ec45aad) | fix(buddy): 修复推理与回复顺序 | 1 | — |
| [`0223ed89`](https://github.com/QAyong/XTLaw/commit/0223ed892479bb7d2b2895bc602e59b5c4fbd898) | feat(community): 完成插件社区首次迁移 | 2 | 改动 .github/workflows（Actions 令牌无权推送）；涉及迁移；依赖或包配置变更；文件数 2396 超过 100（大功能，单独成轮）；新增行含 Lexora 字样，需检查品牌：apps/api/src/auth/providers.ts、apps/web/index.html、apps/web/src/App.vue、apps/web/src/i18n/index.ts、apps/web/src/utils/axios.ts |
