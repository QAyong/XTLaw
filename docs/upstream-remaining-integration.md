# 上游剩余更新选择性集成

## 完成范围

**更新日期：** 2026-10-09

在 XTLaw 当前 `master` 完成三轮选择性集成；本记录详述后两轮，第一轮见下方链接。三轮代码、测试、依赖补丁和文档纳入同一笔本地提交，没有合并整个 `upstream/master`，不推送远端或生成安装包。XTLaw 版本号、品牌和应用身份不跟随上游 v0.10.0 发布元数据。

提交标题：`Integrate upstream desktop and runtime improvements (集成上游桌面与运行时改进)`。本文件随该提交保存；可用 `git log -1 --oneline -- docs/upstream-remaining-integration.md` 定位提交，不在同一提交内硬编码自身哈希。

主要来源：

- `9f22bf75`：资源面板空间联动。
- `eb542b7c`：新版会话引用。
- `9885f130`：Pi 1.1.0、Codemode、Provider 兼容和工具运行改进。
- `87e1431f`：MCP 管理与工具接入。

第一轮记录见 [upstream-round-1-integration.md](upstream-round-1-integration.md)。

## 功能

### 空间联动

- 资源面板支持按任务、按空间和独立浏览三种模式。
- 同一空间共享资源标签与选中状态；没有空间的任务/草稿仍隔离。
- 资源仍由原任务/草稿拥有，关闭任务不会删掉其他任务的资源。
- 保留本地面板打开/关闭记忆；增加按空间保存和恢复，草稿提交仍保留任务模式的打开状态。
- 保留本地面板最大化、换位、拖放临时显示、Office 文件切换及选区引用逻辑。

### 会话引用

- 输入中的会话 token、引用元数据、剪贴板、候选分组和点击导航统一接入新版机制。
- 新增 `lexora_session_search` 和 `lexora_session_read`，支持消息分页、邻近上下文、附件与交付物。
- 只读当前请求明确引用的会话；删除会话、猜测来源、文件变化和取消会撤销或阻断相应访问。
- 文件读取仍走正常权限分类与执行前校验，不把会话引用当成文件访问授权。
- 保留本地 `lexora_session_ask` 兼容入口、冻结选区/网页元素引用和关闭前草稿保护。
- 增加会话 token 与冻结选区引用共存、伪造字面量 marker 转义的回归。

### Pi / Codemode / MCP

- Pi AI 与 coding agent 升级到 1.1.0，接入对应 Pi/Codemode 补丁；已执行 `pnpm install`。
- Codemode 接入工具发现、授权、并发与计算预算、取消、嵌套工具清理。
- MCP 增加工具命名空间，以及 deferred/direct/codemode/hidden 暴露策略。
- MCP 管理对话框可从设置和会话入口打开，并保留执行确认、凭据隔离和连接生命周期约束。
- 修复 MCP Windows 启动错误：保留先收到的具体 ENOENT 错误，避免 SDK 随后的通用 connection-close 把它覆盖成服务器不可用。
- 保留第一轮“停止期间新旧队列均暂停，取消结束不自动继续”的行为。

## 数据库兼容

不能把上游的 v23 Provider 迁移直接覆盖 XTLaw 已发布的 v23 检查点迁移。

实际采用：

| XTLaw 版本 | 迁移内容 |
| --- | --- |
| v23 | 原有运行事件检查点与失效触发器，保持原文件/编号不变 |
| v24 | Azure Provider 来源标识转换、消息 run_id 索引 |
| v25 | MCP tool_namespace、tool_exposure 和唯一命名空间索引 |

- v15 补充迁移调整到后续迁移之前，保证历史数据库缺失的 Provider 表/列先补齐。
- 增加真实旧版 XTLaw v23 数据库回归：保留已有检查点、消息 rowid、MCP 凭据引用与连接配置，转换 Azure 来源；再次打开数据库不重复迁移。
- 所有迁移验证使用测试临时数据库，未打开或修改用户正在使用的生产数据库。
- 首次以新版本运行前应保留数据库备份。迁移到 v25 后，旧二进制不能直接打开该库；回滚需要恢复升级前备份，而不是倒改迁移版本号。
- 兼容目标是 XTLaw 的历史数据库，不是把上游同名版本号的数据库冒充成本地历史库导入。

## 验证结果

最终分批验证共 **62 个不同测试文件，617 通过、4 跳过、0 失败**：

- 46 个改动相关文件：508 通过、4 跳过。
- 16 个本地定制/兼容补测文件：109 通过。
- 覆盖运行服务集成、任务切换、停止队列、重复工具 ID、Pi 运行与恢复、Codemode、MCP、会话搜索/读取、数据库升级、空间联动、选区引用和真实 Office 插件构建契约。

其他检查：

- Buddy 全量 TypeScript/Vue 类型检查通过。
- 全部改动代码文件 ESLint 通过（先检查 197 个文件，再检查最后两个测试文件）。
- `git diff --check` 通过。
- `pnpm --filter @uselexora/lexora-buddy build:desktop` 通过。
- `node packaging/buddy/release/verify-electron-bundle.mjs` 通过。

验证中的环境处理：

- 本机代理会改变 localhost 连接拒绝的 fetch 结果；MCP HTTP 测试仅在测试子进程设置 `NO_PROXY=127.0.0.1,localhost,::1`，没有修改持久代理配置。
- 4 个跳过用例为 POSIX 设备/管道、POSIX chmod 拒绝、两个需要 Windows 文件符号链接权限的用例。未提权、未改 ACL；符号链接用例只有实际收到 Windows EPERM 才跳过。
- 敏感文件、缺失文件、取消请求的正常读取授权另有不依赖符号链接的回归，已通过。
- Windows 配置文件测试不再把 POSIX mode 位当成 ACL；Office 包测试修正为本地现有 `XTLaw官方` / `0.1.1` 元数据，未改 Office 插件本体。
- 测试仍有 Vue 和 AWS SDK 非失败警告。

## 交付状态与边界

- 按用户要求将三轮代码与更新后的文档提交到本地 `master`；未推送、切分支或生成安装包。
- 同步更新根目录中英文 README、Buddy README、架构概览及会话引用/停止/面板状态规格，区分当前实现与历史首版记录。
- 原有 `upstream-pr-plan.md` 未修改。
- 第一轮之后的源码备份、三方合并计划和验证日志位于 `.git/upstream-remaining-20261009-124023/`；合并计划是最初的计划状态，不代表最终仍有未解决冲突。
- 构建输出位于 `apps/buddy/.output/build/electron/`，不是可分发 Windows 安装包。
- 未运行全仓库测试套件或桌面可视/E2E 验收，因此本记录不声称所有桌面交互已经手工验证或已经完成发布。

建议发布前做隔离数据目录的桌面冒烟：快速切换/失败重试、停止后发送与明确继续、空间模式切换/成员变更、引用搜索与附件打开、Codemode 取消、MCP 确认/暴露策略、Office 切换未保存保护、通知定位和面板焦点。
