# 2026-10-31 上游自动预备

上游检查范围：`bb4c76c6..8b874a1c`，共 3 个新提交。

- 已按顺序移植：1 个
- 自动跳过：0 个
- 停下待人工处理：1 个（126c3225）
- 停下后只读评估：1 个（可移植 0、等待 0、需人工 0、冲突 1、自动跳过 0、未评估 0）

## 已移植（等你审查）

| 上游提交 | 说明 | 文件数 |
|---|---|---|
| [`a171f294`](https://github.com/QAyong/XTLaw/commit/a171f294110c6f8c1f4e2330266065b57e4b18b3) | fix(buddy): 修复兼容服务模型列表同步 | 2 |

## 停在这里，需要人工

[`126c3225`](https://github.com/QAyong/XTLaw/commit/126c322529d072a0f7b5c4bf528eacf4429cd68f) feat(buddy): 输入框附件栏支持鼠标滚轮横向滚动

- cherry-pick 冲突 3 个文件
- 冲突文件：apps/buddy/src/modules/prompt-input/components/DesktopChatComposerFrame.vue、apps/buddy/src/modules/tasks/widgets/materials/ChatInputMaterialStrip.vue、apps/buddy/src/workbench/browser/WorkbenchResourcePanel.vue

后面的提交不会自动移植（可能依赖它），基线停在它之前。处理完后更新 `docs/upstream-baseline.json`。

## 停下后的提交评估（只读，供确认“移植 / 跳过”清单）

「可移植」只表示与停下的提交没有文件重叠、对前面可移植的提交试合并无冲突；语义依赖（调用了前面新增的类型或接口）无法机械判断，仍需你确认，并以类型检查为准。

| 上游提交 | 说明 | 建议 | 依据 |
|---|---|---|---|
| [`8b874a1c`](https://github.com/QAyong/XTLaw/commit/8b874a1cd8f3f541156261c6c426825d71b4725e) | feat(buddy): 优化用量趋势查看体验 | 冲突 | 与当前分支试合并冲突 1 处 |
