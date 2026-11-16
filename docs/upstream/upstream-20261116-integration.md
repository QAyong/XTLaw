# Upstream integration 20261116 (20261116 上游集成记录)

- 本地分支：`codex/upstream-20261116`
- 本地基线：`df782f24c1e4848a5a868c35f623dbf5ea40bf82`（当时等于本地 `master`）
- 检查到的 `upstream/master`：`ea0435c3fba15180be6fa3802eaaebe858657867`
- 移植按上游顺序执行；每个被移植提交各对应一个保留 `-x` 来源行的本地提交。

## 逐项结论

| 上游提交 | 处理结果 |
| --- | --- |
| `c24f9b5e16e778c3041de6118f73591ab49775ec` | 本地等价，跳过。`master` 的 `1576d120d66a493499195d388fb680eb97ec5802` 已覆盖图片查看器与头像对比度。 |
| `b54c468c7b8203537c080606deba3037769aadb8` | 暂缓，不移植。该提交涉及 Android 与本地服务解耦，改动约 890 个文件，并存在迁移编号冲突。 |
| `e98c408e808fc137177fc2963edde7a70909ef62` | 本地等价，跳过。`master` 的 `6b2094fed9aa80c97728b77cecf65baa24e2d39c` 已把归档清理转圈放到按钮上。 |
| `2167b0577dcfa8b346dc1e376d687e3d3c145690` | 移植到本地提交 `0c5ceebc91e8fa726475d9bb43d76043cbb665b1`：使用 `TextEditorPool`，将 Monaco 创建延后一轮，关闭 `automaticLayout` 并单独观察布局；时间线通过 `reconcileTimelineEventBuckets` 只重算脏 run。保留本地引用选区、`copy.blocked` 只读判断，以及插件文档、Office 和预览打开路径。 |
| `7eedb55a15ae95635e59763264b137c7db3fb619` | 跳过。上游改动是网站微信群二维码，本地对应文件已删除。 |
| `ea0435c3fba15180be6fa3802eaaebe858657867` | 移植到本地提交 `dd1450221d7f8c0abdbe6a2215db0ace9376d894`：自定义服务支持 `api_key` 或 `none`，免认证时不要求密钥。保留 XTLaw 的 HostCredentialStore、服务结构、设置页和作用域样式。数据库仍为本地 schema v44；只在现有迁移流程末尾幂等补上 `provider_configs.authentication`，未引入迁移版本或改变 schema lineage。 |

## 冲突取舍

2167 的 `.playwright/scripts/__tests__/transcript-history.e2e.mjs` 在本地基线不存在，该测试文件是在被跳过的 `b54c468c` 之后加入，故丢弃 2167 对它的上游修改，没有为了保留该测试引入 b54。新增的 `.playwright/scripts/fixtures/renderer-responsiveness.mjs` 只包含通用键盘探针和 trace 文件读取逻辑，不依赖 b54，予以保留。

Provider 冲突仅吸收免认证需要的配置、校验和界面行为；保留本地插件能力、HostCredentialStore、设置组件结构与 scoped 样式。数据库冲突只保留 `completeProviderAuthenticationSchema` 的导入和末尾调用，未采用上游 schema 42 / v43Persistence 分支。
