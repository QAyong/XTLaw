# 目标

把「AI 输出消息」的渲染从**能用**提到 **Claude Code / Codex / Cursor 那种阅读体验**，中文优先。你给的关键词是「过长，根本不好看」——我核对代码后确认这就是根因，而且是可以量化的。

不改 Markdown 解析引擎（它已经很扎实：增量 block 缓存、Shiki 增量高亮、Mermaid、KaTeX、sanitize）。**只改"读"的这一层**：行宽、行高、段落节奏、层级、以及中日韩排版补偿。

---

# 诊断（实测，不是猜测）

| 项 | 现状 | 问题 |
|---|---|---|
| 正文行宽 | `.thread-content` = `min(100%, 760px)` 再减 `padding: 32px` ×2 → **有效 696px**（`chat-shell.css:48,247,253`） | 中文 14px → **每行约 50 个汉字**。舒适区是 30–40。这就是「过长」 |
| 行高 | `.prose-chat` = `--text-base` 14px / `--leading-prose` 1.6（`prose.css:17-18`） | 拉丁 1.6 合适；中日韩字形是方块，需要 1.7–1.75 |
| 段间距 | `p { margin: 0.65em 0 }`、`p + p { margin-top: 0.8em }`（`prose.css:35-41`） | 14px 下只有 9px / 11px。中文没有首行缩进，段间这么近 → 一整坨 |
| 中文标点 | 无 `text-spacing-trim`、无 `line-break: strict`、无 `text-wrap: pretty` | 全角标点左右各吃一个 em，视觉上又长又散；且容易出现孤行 |
| 层级 | h1 20 / h2 18 / h3 16 / h4 15 / **h5 = h6 = 14px**，`margin: 1.25em 0 0.45em` | 模型最爱用 `#### 1. …`，而四级以下和正文一样大、上方留白只有 1.25em → 没有层级感 |
| 消息内部节奏 | `.message-col { gap: 4px }`（`messages.css:25`） | 正文段落、工具调用卡、meta、操作按钮全部只隔 **4px**。工具卡等于贴在段落上，把回答切碎 |
| 助手容器 | `.message-bubble` `padding: 0`、`background: transparent`（D323 冻结） | 回答没有左侧视觉锚点，和工具行、meta 齐平 |
| 中文字族 | `--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`（`tokens.css:277`）**没有 CJK 层** | 只有系统隐式回退。而 `lib/fonts.ts:14` 已有 `CJK_FALLBACK`，仅追加给「用户自选字体」——默认栈漏了 |
| spec 与代码不符 | spec §8.7 声称 prose 有 "pretty wrapping" | 实际 `prose.css` 里只有 heading 的 `text-wrap: balance`，正文没有 `pretty` |

---

# 范围

**改（Phase 1 — 助手回答的阅读面）**
- `.prose-chat`：行宽、行高、段落/标题/列表节奏、CJK 排版补偿
- `.message-user-text`：行高与行宽对齐（中文提问也是中文）
- `.message-col` 内部节奏（正文 ↔ 工具活动组 ↔ meta ↔ 操作栏）
- `--font-sans` 默认栈补齐 CJK 层
- 代码块 / 表格 / Mermaid / 图片 **保持整行宽**（只有文字块收窄）——这正是 Codex / Claude 的做法

**明确不改（避免扩大爆炸半径）**
- 不重写 `Markdown.tsx` 的解析/流式管线（D152 增量 block 缓存不动）
- 不给助手回合加左侧竖线或底板（**D323 明令禁止**，我尊重这条冻结决策）
- 不动 `.message-row { padding: 12px 0 }`（回合间距 24px 已经够；你要的是"回合内更松、回合间不更挤"）→ 也保住了 `transcript-style.test.mjs` 的既有断言
- 不动滚动/贴底/虚拟窗口（ADR 0065 / 0149 / 0242 / 0130）、不动作弊 minimap、不动 composer、sidebar、tool-row 内部结构
- 不改 14px 基准（spec §5.2 明确「有意为之」，且 D343 给了用户 Font size 缩放）

---

# 具体数值方案

## 1. 新增/修改 token（`apps/desktop/src/styles/tokens.css`）

沿用 D343 的 `calc(px * var(--font-scale))` 模式，字号放大时行宽同步放大：

| Token | 值 | 用途 |
|---|---|---|
| `--measure-read`（新） | `calc(576px * var(--font-scale))` | 文字块行宽。14px 下 ≈ **41 个汉字/行**（当前 ~50） |
| `--measure-row`（新） | `720px`（不乘 scale，作为上限） | 代码/表格/图的行宽，等价于现值，规格化 |
| `--leading-reading`（新） | `1.7` | 正文与思考区行高 |
| `--leading-prose` | 1.6（**保持不变**） | 其他 consumer 不受影响 |
| `--indent-list`（新） | `1.35em` | 列表缩进，替代散落的裸值 |
| `--font-sans` | 末尾插入 CJK 层 | 与 `lib/fonts.ts` 的 `CJK_FALLBACK` **完全一致**：`…, "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif` |

> 为什么是 576px：576 / 14 = 41.1 汉字/行，落在舒适区上沿；配合 `text-spacing-trim` 去掉标点冗余空白后，视觉字数约 42–44。拉丁约 82 字符/行，仍在可读范围。这个数字是本方案最需要你拍板的点。

## 2. `.prose-chat` 重排（`apps/desktop/src/styles/prose.css`）

**只对文字块收窄，不改行容器：**

```css
.prose-chat > p,
.prose-chat > ul, .prose-chat > ol,
.prose-chat > blockquote,
.prose-chat > h1, …h6 { max-width: var(--measure-read); }
/* pre.code-block / .table-wrap / .mermaid-block / figure 保持 --measure-row */
```

**CJK 排版补偿（Electron 43 ≈ Chromium 142，全部原生支持）：**

```css
.prose-chat {
  line-height: var(--leading-reading);   /* 1.7 */
  text-spacing-trim: trim-start;          /* 去掉全角标点多余空白，直接缩短视觉行长 */
  line-break: strict;                     /* 禁止行首出现收尾标点 */
  text-wrap: pretty;                      /* 消除孤行 */
  word-break: normal;
  overflow-wrap: break-word;
}
```

**段落与标题节奏：**

| 选择器 | 现在 | 改为 |
|---|---|---|
| `p` | `margin: 0.65em 0` | `margin: 0.85em 0` |
| `p + p` | `margin-top: 0.8em` | `margin-top: 1.05em` |
| `h1–h6` | `margin: 1.25em 0 0.45em` | `margin: 1.7em 0 0.5em`；`h2/h3` 用 `1.9em 0 0.55em` |
| `h4 + *` / `h5 + *` | 无 | 补 `.h6 + *` 已有的 0.4em 紧贴规则 |
| `li` | `margin: 0.28em 0` | `margin: 0.4em 0` |

**层级重建（四级以下用字重和留白区分，而不是字号）：**

| 级别 | 字号 | 字重 | 颜色 |
|---|---|---|---|
| h1 | `--text-lg-plus` 18px（原 20px） | semibold | primary |
| h2 | `--text-lg` 16px（原 18px） | semibold | primary |
| h3 | `--text-base-plus` 15px（原 16px） | strong 560 | primary |
| h4 | `--text-base` 14px（原 15px） | strong 560 | primary |
| h5 | `--text-base` 14px | medium-plus 520 | secondary |
| h6 | `--text-md-plus` 13.5px | medium 500 | secondary + tracking-wide |

## 3. 回合内节奏（`apps/desktop/src/styles/messages.css`）

- `.message-col { gap: 4px → 8px }`
- `.tool-activity-group { margin: 4px 0 }` → 正文与工具卡之间净 12px，工具卡自身仍紧凑
- `.message-actions { margin-top: 2px }`
- `.message-user-text { line-height: var(--leading-reading) }`、`max-width: var(--measure-read)`
- `.message-row { padding: 12px 0 }` **不动**

---

# 落地清单

**改动的代码**
1. `apps/desktop/src/styles/tokens.css` — 5 个 token
2. `apps/desktop/src/styles/prose.css` — 行宽、行高、CJK 属性、段落/标题/列表节奏、层级
3. `apps/desktop/src/styles/messages.css` — `.message-col` gap、活动组 margin、用户文本行高与行宽

**测试**
4. 新增 `apps/desktop/test/transcript-reading-typography.test.mjs` — 断言新 token 存在、文字块收窄且**窄于**行宽、代码/表格不受收窄影响、`--font-sans` 含完整 CJK 层、CJK 属性带 `@supports` 兜底
5. 更新 `apps/desktop/test/markdown-prose-style.test.mjs` — h1/h2 字号断言（第 22–23 行会红）
6. 更新 `apps/desktop/test/transcript-style.test.mjs` — 用户 plate 宽度断言（第 126 行 pin 了 720px）；`padding: 12px 0` 与 `thread-content` 断言保持不变
7. 收敛 `user-select` / `response-annotation-anchor` / `sidebar-collapse-animation` / `window-menu` 等 pin 了 `prose-chat` / `thread-content` 的测试（先跑全量再逐个核对，不为了让测试变绿而放宽断言）

**真视觉 E2E（当前缺口）**
8. 新增 `scripts/e2e-reading-typography.mjs` + fixture `scripts/e2e/reading-typography.tsx`，并在 root `package.json` 注册 `test:e2e:reading-typography`
   - 复用 `scripts/e2e-transcript-render.mjs` 的 Electron 无头模式与 `resolveElectronBinary`
   - 关键差别：**加载真实 CSS**（现有 harness 用 `loader: { ".css": "empty" }`，完全测不到排版）
   - 在真实 Chromium 里量：CJK 段落 **实测每行字数落在 36–46**、`computed line-height / font-size ≥ 1.68`、段间距 ≥ 11px、文字块宽度 ≤ 行宽、代码块宽度 == 行宽、`getComputedStyle` 解析出的字族命中 CJK 层
   - 这样把「过长」变成可回归的数值契约，而不是靠肉眼看
   - 同时输出 `reading-typography.html` 到会话 scratch，用 BrowserPreview 打开做前后对照

**规格同步（AGENTS.md §11 要求）**
9. 新增 ADR `docs/adr/cjk-first-transcript-typography.md`
   - 采用仓库已有的**语义化 ADR 文件名**惯例（`transcript-reading-ownership.md`、`message-quotes-and-side-chats.md` 等），不占用数字编号——仓库里已有另一个 agent 正在用 `0257`，避免撞号（AGENTS.md §17）
   - 说明：为什么引入 reading measure、为什么助手回合不加竖线（重申 D323）、`--font-sans` 补齐 CJK 层与 ADR 0083 的关系
10. `docs/spec/08-meta/decisions-log.md` 追加 `D-LOCAL-transcript-reading-typography`（沿用日志里 `D-LOCAL-*` 的本地决策惯例，不抢全局 D 计数）
11. `docs/spec/04-ux/07-ui-design-system.md` — §5.1（CJK 层）、§5.2（新 token）、§5.3（prose 段落）、§10 指标表（新增 reading measure 行）、§13 密度表（Max content width 行拆分）
12. `docs/spec/04-ux/08-component-spec.md` §8.7 — Prose 段落重写，并**修正**现有 "pretty wrapping" 与代码不符的描述
13. `docs/zh-CN/spec/04-ux/07-ui-design-system.md` + `08-component-spec.md` 同步
    - 注意：`docs/scripts/check-locales.mjs` 校验**整文件的表格形状与围栏数量**必须一致，所以英文侧每加一行表格，中文侧必须加对应的行（`pnpm docs:check` 会拦）
14. `docs/spec/06-delivery/04-e2e-test-plan.md` 新增场景 `E2E-CHAT-reading-typography`（AGENTS.md §17 语义化 ID，不用序号）+ zh-CN 镜像保持表格/围栏结构一致

---

# 验证

```powershell
pnpm lint                                        # biome + check-style-tokens（D072 守卫）
pnpm --filter @pi-desktop/desktop typecheck
pnpm --filter @pi-desktop/desktop test           # 渲染器单测（含新增 typography 测试）
pnpm build:js
pnpm test:e2e:reading-typography                 # 新增：真实 Chromium 排版度量
pnpm test:e2e:transcript                         # 既有：活动组渲染次数不回归
pnpm test:e2e:layout                             # 内容带宽属于布局面
pnpm test:e2e:theme-surfaces
pnpm docs:check                                  # 中英文档结构对齐
```

**人眼验证**：`pnpm dev` 起应用，用中文长回答（含 `#### 小标题`、嵌套列表、表格、代码块）实测。这是唯一能确认「好不好看」的判据——上面的数值只是把你的主观标准固化成可回归的契约。

不在本轮跑 `test:e2e:boot` / `subagents` / `mcp-*` 等无关套件。

---

# 风险与缓解

| 风险 | 缓解 |
|---|---|
| 576px 行宽太窄，代码/表格显得突兀 | 只有文字块收窄，代码/表格整行宽；先在 A/B 页里并排对比再定；`--measure-read` 是单点 token，改一个值即可整体调节 |
| 与另一个 agent 的 720px / 12px 断言互相踩 | 已确认会红的只有 `markdown-prose-style` 与 `transcript-style`；`.message-row` padding 刻意不动以缩小面积 |
| `--font-sans` 动到全局字体 | 只在**默认 token 栈**补 CJK 层，与 `lib/fonts.ts` 现有 `CJK_FALLBACK` 完全一致；用户自选字体仍整体覆盖 `--font-sans`（ADR 0083 行为不变） |
| Chromium 版本不支持某条 CJK 属性 | 每条属性带 `@supports` 或独立声明（无效声明自动被忽略，不会整体失效）；E2E 用 `getComputedStyle` 判定实际生效 |

**回滚**：全部改动都在 3 个 CSS 文件 + 文档/测试里，没有数据、协议、schema 改动。`git revert` 单个 commit 即完整回滚，无迁移、无兼容性影响。

---

# 交付边界（需要你明确）

按 AGENTS.md §4/§5：改动会落在**独立 worktree + 独立分支** `feat/transcript-reading-typography`（基于 `origin/main` @ `d23462fd`），绝不碰你当前主检出的未提交改动（`session-ipc.ts` / `provider-catalog.ts` / `session-launch.ts` 等，另有 3 个其他 agent 的 worktree 在跑）。

默认我做到：**分支内实现 + 全量验证 + 给你看结果 + 分支提交**。
**不会**自动合并进 `main`、不会 push——除非你明确说。合并进 main 后的 E2E（AGENTS.md §15 强制）我会在获得合并授权时按上面的套件跑，做不到就如实记 **E2E: NOT RUN** 并写明原因和残余风险。

---

# 待你确认的两个点

1. **行宽 696px → 576px（约 50 → 41 汉字/行）** 是否接受？这是观感变化最大的一项。
2. 字号维持 **14px + 行高 1.7**（配合 D343 的 Font size 缩放），还是把正文提到 **15px**？我推荐前者。
