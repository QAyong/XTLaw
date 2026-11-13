# 来源与归属

本目录基于 useLexora 官方插件仓库 `useLexora/plugins` 中的 `plugins/legacy-task-cleanup`。源码固定到提交 [`d430627f162fe087dc4fb2bb1743d7b938cfabfa`](https://github.com/useLexora/plugins/commit/d430627f162fe087dc4fb2bb1743d7b938cfabfa)，提交信息为 `feat(cleanup): 新增任务残留清理`，父提交为 `96b190284670f5cf5ab30bf01c61c9bd6c31200c`。本文件列出的 blob SHA 来自该提交的 GitHub Contents API；原始文件链接均使用提交 SHA，不依赖可变的 `main`。

## 文件来源

| 文件 | 固定来源 Git blob SHA | 本目录处理 |
| --- | --- | --- |
| `README.md` | `f006cdb7d96bd80e02f23dfe537763f83e038e8a` | 为 XTLaw 版本与构建流程改写；使用与上游一致的功能描述。 |
| `extension.json` | `39e0dfb24bedde19fa5453ecd2ae516e4215f150` | 保留插件 ID、名称、Lexora 作者、贡献 ID、权限和入口；版本升至 `1.0.1`，最低宿主版本改为 `>=0.5.6`。 |
| `lexora.d.ts` | `2238f699080e56e65efeddedbaa86bc0db9450f6` | 固定提交中的 API 类型快照；含 task cleanup 740 调用类型。 |
| `main.ts` | `2c819507b35922a406300c27da6cdacda49275dd` | 上游原文件。 |
| `state.ts` | `b0a0770b91614a9ab7a48c86a73243dcce29c92d` | 上游原文件。 |
| `style.css` | `1945ea8fd8d5184455dd2bf52816020114f8027e` | 上游原文件；使用宿主公开的 `--lexora-*` 语义变量。 |
| `view.ts` | `dcc0e1025f261dbf26683a4699309756f35e31b5` | 上游原文件。 |
| `LICENSE` | `4ae7a695fd8fee03f218503eb6504dbad017c22c` | 从同一固定提交的仓库根目录复制 MIT 全文；插件子目录自身没有单独 LICENSE 文件。 |

## 许可证与署名

插件目录在该固定提交中没有独立许可证文件，因此保留仓库根目录提供的 MIT License 全文，并将其随插件包分发。版权声明为 `Copyright (c) 2026 Lexora contributors`。清单保留原作者署名 `Lexora`；没有将上游作者替换为 XTLaw、QAyong 或当前维护者。

## 可复现检查

从上游仓库获取时，将 `d430627f162fe087dc4fb2bb1743d7b938cfabfa` 作为 `ref` 请求 `plugins/legacy-task-cleanup` 目录及根目录 `LICENSE`，再按上表比对 Git blob SHA。该固定源提交创建了插件；适配仅改变清单兼容声明/补丁版本和 README，行为代码保留原文件。
