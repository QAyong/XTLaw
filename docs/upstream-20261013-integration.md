# 2026-10-13 上游集成：第 1–3 批

## 范围与状态

- 预评估区间：`df0f9369..a270927d`，16 个上游提交；第 1 批移植 `d3caa74554de99996868ea1a753ebadc4a69d39f`，第 2 批移植 `ed95b426`、`082fea3c`、`5cc3f108`、`8b79995a`；第 3 批移植 `5f5eba09` 与 `09e07b44`（仅头像功能）。
- 工作分支：`codex/upstream-20261013`；本地原基线为 `065b1b48`，已知失败基线记录提交为 `51823089`。
- 第 1–3 批代码、检查和移植提交已完成；未合并到 `master`、未推送、未打包。
- 第 4 批尚未开始，待用户确认；没有把新上游区间混入本轮。

## 第 1 批：已完成的本地接入

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

## 第 1 批：验证

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

## 第 2 批：伙伴后续修复（2026-10-14）

按既定上游顺序逐条移植，每条保持一个本地提交与来源行。没有重新拉取并扩大上游范围。

| 上游提交 | 本地提交 | 内容及本地处理 |
| --- | --- | --- |
| `ed95b426` | `cc25c2ec` | 模型服务元数据同步与 v27，干净应用；保留本地 v23/v24 顺序。优先识别服务声明的名称、输入类型、思考档位及上下文/输出额度，保留手工覆盖。 |
| `082fea3c` | `7b2e9793` | 回同步我们会话引用 PR 的上游最终版。保留本地已完成的数字偏移接口、会话级授权及引用链；采用数据库直接定位消息的查询、剩余扫描额度限制，保留上游新用例。处理 3 个冲突文件。 |
| `5cc3f108` | `0c89635e` | 子智能体调度、报告/结果分页读取、结果交接和已交付消息去重。唯一冲突是测试导入，保留第一批 Windows 路径适配并加入 SessionManager。 |
| `8b79995a` | `81987a5f` | 沙盒本地通信；network.rs 的唯一冲突保留 XTLaw 名称，采用新 loopback 规则。沙盒 profile、过滤器 GUID、安装目录和数据目录保持 XTLaw 独立。 |

### 沙盒边界变化

- Windows：允许沙盒连接/监听本机 loopback TCP，包括宿主服务；其他网络目标仍按代理授权执行。
- Linux：新增可用性探测及私有 Unix socket/loopback 通信隔离，宿主服务和其他网络目标仍需代理授权；不支持新能力时沿用上游兼容路径。
- 同步本地系统提示词，明确 Windows loopback 的例外，避免旧的“host IPC 全部不可用”文案与实际新边界矛盾。文件授权、敏感目录隔离和禁止自动退回宿主执行的约定保持不变。
- 仅 Rust 清单/锁文件变化，没有 pnpm 清单或锁文件变化，未重新安装 JavaScript 依赖。

### 第 2 批验证

- 最终类型检查：`pnpm --filter @uselexora/lexora-buddy type-check` 通过。
- 相关测试：25 个文件、225 个用例，**207 通过、0 失败、18 跳过**。覆盖模型同步、旧迁移、深层会话翻页与授权、子智能体调度/结果、沙盒命令及依赖解析；未跑全量测试。
- 提示词检查：另按名称筛选 `sandboxPermissions.spec.ts` 的 Linux/Windows/macOS 三个平台边界用例，3 个通过；其余用例未选入本次范围。
- Windows 原生代码：`cargo check --locked --manifest-path apps/buddy/native/host/Cargo.toml --target-dir apps/buddy/.output/build/native --lib --bin lexora-buddy-process-control --bin lexora-buddy-sandbox` 通过。
- 原生隔离检查：`cargo test --locked --manifest-path apps/buddy/native/host/Cargo.toml --target-dir apps/buddy/.output/build/native --lib profiles_and_filter_keys_belong_only_to_xtlaw`，1 个通过。确认拒绝上游 profile 名称且 XTLaw 过滤器 GUID 与上游不同。
- 从第一批已验证的 v26 真实旧库副本，再通过 SQLite backup 创建独立临时库；实际升级到 v27，**57 张表的原有字段逐行摘要全部一致**，新增模型服务元数据列初始为空，完整性检查 `ok`、外键无错误，重复打开正常，晓晓身份保留。原库和第一批副本均未执行这次升级。
- 临时库及报告：`apps/buddy/.output/upstream-v27-database-20261014/verification.json`；测试结果：`apps/buddy/.output/upstream-batch2-test-results.json`。这些文件不纳入 Git。

### 第 2 批未验证部分

- 18 个跳过来自测试自身的平台/原生组件条件：依赖真实命名空间探测 1 个、会话资源重定向 1 个、真实 shell 进程归属 4 个、Linux 内核沙盒执行 12 个；没有为消除失败新增跳过条件。
- 当前为 Windows 环境，未执行 Linux `sandbox-ipc-linux` 原生运行用例；未安装/替换系统中正在使用的 Windows 沙盒组件，也未执行新版组件的实际 loopback/外部网络授权验收。
- 最小后续验收：准备新版隔离测试组件后，在 Windows 验证本机 TCP 服务可访问、其他网络仍经审批，过滤器清理正常；在 Linux 只运行 `sandbox-ipc-linux` 与对应 shellSandbox 原生用例，预期沙盒内部通信成功、宿主 socket 访问被隔离。

## 第 3 批：欢迎语与头像集合（2026-10-14）

| 上游提交 | 本地提交 | 内容及本地处理 |
| --- | --- | --- |
| `5f5eba09` | `2b5d2ccc` | 自定义欢迎语、随机/固定/不显示模式、欢迎区域和时段问候开关。对旧欢迎偏好做兼容读取；读取本地用户资料，并保留 XTLaw 文字标、原有主题/字体设置和聊天布局。 |
| `09e07b44` | 本记录所属头像集合提交 | 只移植 v28、预设头像标识及自定义头像集合的上传/选择/删除、存储和校验。保留晓晓预设和原有品牌资源。 |

### 本地适配与排除内容

- 欢迎页保留 XTLaw 的明暗文字标及作用域样式，不取上游 `peeking.png`、全局侧栏或欢迎插画开关。旧图文欢迎选择器替换为可编辑的欢迎语列表；弃用的旧欢迎插画及装饰组件随功能移除。
- 设置页保留本地主题和字体实现。新欢迎设置使用必要的上游行/分组组件及保存状态辅助函数，未引入主题插件系统；分段控件保留本地字重，只增加按选项禁用的支持。
- 时段问候通过本地 `userProfile` 实现读取姓名，没有恢复本地已删除的上游 `src/app/shell/userProfile.ts`。
- 保留本地聊天过程和引用相关测试及其行为；更新欢迎配置和用户资料的测试夹具。过程折叠用例补齐尚未加载伙伴目录时的上下文。
- 头像预设标识使用 `actor-xiaoxiao`，显示为晓晓；不接受上游 `actor-lexora` 或 `actor-classic` 作为本地预设。上传图片保存在伙伴的自定义集合中；恢复默认资料仍恢复为晓晓并保留集合。
- 排除上游品牌头像/应用及托盘图标、经典品牌头像、启动/窗口菜单的品牌调整、`packages/assets` 变更和品牌相关打包校验变化。与第 2 批基线 `81987a5f` 对比，这些品牌资源及配置没有变化。
- v28 按上游编号接在 v27 后面，保留既有本地 v23/v24 顺序。

### 第 3 批验证

- 最终类型检查通过。首次增量检查引用了已不存在且未跟踪的 `tmpSogouWechatProbe.spec.ts`；确认该临时文件不在仓库后，使用 `pnpm exec vue-tsc -b --force --pretty false` 重新扫描项目并通过，没有修改或重建该临时文件。
- 相关测试最终覆盖 17 个文件、148 个用例，**147 通过、1 个 Windows 符号链接权限失败、0 跳过**。覆盖配置兼容、欢迎语选择、时段问候、工作区状态、本地聊天行为、旧身份迁移、头像集合及数据库迁移。
- 唯一失败为 `buddiesExtension.spec.ts` 的 `keeps mutations behind write permission and rejects avatar symlinks outside grants`：在创建夹具符号链接时发生 `EPERM`，与第一批记录的同一用例/环境限制一致；未验证到该断言，不记为通过。
- UnoCSS 所需命名样式可生成；欢迎页 e2e 脚本语法检查通过，但没有启动桌面应用运行 e2e。
- 从第二批 v27 真实旧库的临时副本，再创建独立副本调用实际迁移升级至 v28：57 张表的原有字段摘要一致，旧头像逐个保存在新集合中，完整性检查 `ok`、外键无错误、重复打开正常，晓晓名称保留。原库和前两批副本不改动。
- 临时库及报告在 `apps/buddy/.output/upstream-v28-database-20261014/`；测试结果为 `apps/buddy/.output/upstream-batch3-test-results.json`，不纳入 Git。

### 第 3 批未验证部分及最小手动验收

- 未启动新版桌面应用进行交互验收，未打包。
- 外观设置中新增一条欢迎语，切到固定模式并新建任务：应显示 XTLaw 文字标、自定义文本及对应时段问候，没有小人插画；关闭欢迎区域后仅保留正常输入区。
- 在伙伴资料中上传两张图片，切换、删除并重启：集合和所选图片应正确保留；旧头像迁移后仍可选择，恢复默认应显示晓晓。
- 在可创建符号链接的测试环境只重跑上面的失败用例，预期越界头像路径被拒绝。

## 尚未移植及下一批

- 第 4 批：`4f959579` → `11161a78` → `9ab5f713`。
- 插件兼容 `7e0e301f` 暂缓：依赖未取的主题系统，并与本地 Office 内置插件目录冲突。
- `6411d8ee` 空提交、`84bbcec7` 欢迎语合并提交、`ee7d60e6` 上游版本发布、`b915b87d` 主题插件元数据、`a270927d` 上游图标修复不在本批移植范围，理由沿用预评估。

## 未验证部分及最小手动验收

- 未启动新版桌面应用进行交互验收，未生成安装包；真实旧库的验证仅针对临时副本。
- 后续启动新版时，点击任务侧栏底部“伙伴”，确认可查看/修改晓晓，并可返回任务；修改后聊天显示对应伙伴的名字和头像。
- 使用隔离的旧配置/数据副本首次启动，确认旧自定义身份迁入晓晓；再次启动后修改不被覆盖。不要把测试应用指向日常使用的原数据库。
- 在可创建符号链接的环境中，只重跑上表 3 个用例；预期越界引用被拒绝，重叠文件写入受到正确约束。
