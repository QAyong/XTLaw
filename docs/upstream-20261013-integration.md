# 2026-10-13 上游集成：第 1 批伙伴主体

## 范围与状态

- 预评估区间：`df0f9369..a270927d`，16 个上游提交；本批只移植 `d3caa74554de99996868ea1a753ebadc4a69d39f`。
- 工作分支：`codex/upstream-20261013`；本地原基线为 `065b1b48`，已知失败基线记录提交为 `51823089`。
- 本批代码、检查和移植提交已完成；未合并到 `master`、未推送、未打包。
- 第 2–4 批尚未开始，待用户确认；上游后续修复不混入本批。

## 已完成的本地接入

- 接入伙伴资料管理、多角色执行、子智能体委派、执行详情和受监督 shell；保留本地 Office、浏览器、选区引用、任务布局及应用/数据目录隔离。
- 保留本地 v23/v24 顺序，v26 接在 v25 后；新建默认伙伴及恢复默认资料均为“晓晓”。默认头像与头像预设使用本地晓晓图，不包含上游 `actor-lexora.webp`。
- 聊天身份按实际运行的伙伴读取资料。移除“外观 → AI 身份”入口及公共配置里的 `agentProfile`。
- 主进程在首次读取伙伴资料时，将旧 TOML 的名称/头像迁入内置伙伴；跟随用户资料时解析用户自定义资料及系统资料。图片通过 Electron 转为 256×256 PNG。成功写入数据库后才清理旧配置，失败保留原资料。目标伙伴已被修改时不覆盖；重启和迁移重试不会复原旧身份。
- 伙伴入口放在任务侧栏底部：设置、插件、自动化、伙伴、通知。伙伴页沿用本地返回任务按钮。
- 新上游组件保留 UnoCSS 类名，在 `uno.config.ts` 映射到本地主题变量；本地已有组件保留作用域样式。模型选择器保留本地单文件实现并补齐忙碌禁用逻辑；聊天画布保留本地实现。
- 执行详情接到本地工作区、浏览器链接及资源预览接口，未引入上游独立面板最大化机制。执行画布按本地保留的连线逻辑接入。
- 会话引用文本转换补齐 `actor_ref`；保留本地会话级授权和选区/资源引用。
- 保留本地系统提示词品牌和权限约定，按伙伴可用工具生成相关段落。
- 修正新增测试写死 POSIX 路径及 `bash` 的平台假设，以及本地 Skill 版本字段的差异。

## 验证

- 类型检查：`pnpm --filter @uselexora/lexora-buddy type-check` 通过。
- Windows 原生编译：`cargo check --locked --manifest-path apps/buddy/native/host/Cargo.toml --target-dir apps/buddy/.output/build/native --lib --bin lexora-buddy-process-control` 通过。
- UnoCSS：新增组件所需主题类名、导航状态及快捷样式可生成；验证输出保留在 `apps/buddy/.output/upstream-uno.css`。
- 相关测试共 48 个文件、407 个用例。首次检查后，仅重跑修正平台假设的失败文件；最终合并结果为 **398 通过、3 受环境限制失败、6 跳过**。没有重跑全量测试。

### Windows 环境限制

以下 3 个用例均在准备符号链接时发生 `EPERM`，未执行到对应功能断言，不能算验证通过。未提权、未修改本机权限或为消除失败而跳过测试。

| 测试文件 | 用例 | 与基线的关系 |
| --- | --- | --- |
| `service/src/agent/execution/__tests__/BuddyTurnLauncher.spec.ts` | `buddyTurnLauncher rejects a Space root that resolves to a different directory at launch` | `docs/known-test-failures.md` 已记录的基线失败 |
| `service/src/buddies/__tests__/buddiesExtension.spec.ts` | `keeps mutations behind write permission and rejects avatar symlinks outside grants` | 本批新增，属于同一 Windows 符号链接权限限制 |
| `service/src/agent/extensions/__tests__/mutationToolExecution.spec.ts` | `authorized mutation execution serializes overlapping grants across different working directories and preserves root, child and resumed root diffs` | 本批新增，属于同一 Windows 符号链接权限限制 |

### 真实旧库副本迁移

- 以只读方式打开旧 XTLaw 的 v25 数据库，用 SQLite backup 创建包含已提交 WAL 数据的临时副本。原库未执行迁移。
- 在副本上调用本批实际 `openBuddyDatabase()` 升级到 v26，完整性检查为 `ok`，外键检查无错误；重复打开成功，内置伙伴不重复创建。
- 对 15 张关键表的原有字段计算逐行摘要核对：131 个会话、24,514 条消息、1,064 个运行，以及分支、附件、333 个文件产物、61 条审批、空间、自动化、草稿、模型服务和技能安装记录保留。
- 会话原模型设置全部迁入 `conversation_members`，21 条排队消息正确增加默认伙伴路由；默认伙伴名称为“晓晓”。
- 临时副本与核对记录保留在 `apps/buddy/.output/upstream-v26-database-20261013/`，不纳入 Git。

## 尚未移植及下一批

- 第 2 批：`ed95b426` → `082fea3c` → `5cc3f108` → `8b79995a`。
- 第 3 批：`5f5eba09` → `09e07b44`（只取头像集合及 v28，保留 XTLaw 品牌）。
- 第 4 批：`4f959579` → `11161a78` → `9ab5f713`。
- 插件兼容 `7e0e301f` 暂缓：依赖未取的主题系统，并与本地 Office 内置插件目录冲突。
- `6411d8ee` 空提交、`84bbcec7` 欢迎语合并提交、`ee7d60e6` 上游版本发布、`b915b87d` 主题插件元数据、`a270927d` 上游图标修复不在本批移植范围，理由沿用预评估。

## 未验证部分及最小手动验收

- 未启动新版桌面应用进行交互验收，未生成安装包；真实旧库的验证仅针对临时副本。
- 后续启动新版时，点击任务侧栏底部“伙伴”，确认可查看/修改晓晓，并可返回任务；修改后聊天显示对应伙伴的名字和头像。
- 使用隔离的旧配置/数据副本首次启动，确认旧自定义身份迁入晓晓；再次启动后修改不被覆盖。不要把测试应用指向日常使用的原数据库。
- 在可创建符号链接的环境中，只重跑上表 3 个用例；预期越界引用被拒绝，重叠文件写入受到正确约束。
