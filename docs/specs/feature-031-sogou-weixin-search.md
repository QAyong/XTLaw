# Feature-031：搜狗微信公众号文章搜索

**日期：** 2026-10-14
**状态：** 已实现并验收通过（2026-10-14）；§11 的频率测试待做
**范围：** XTLaw 桌面端（`apps/buddy`）
**参考：** [搜狗微信搜索](https://weixin.sogou.com/)；与 [Feature-030](feature-030-pkulaw-legal-retrieval.md) 的关系见 §1

## 1. 定位

搜狗微信搜索是**公众号文章的检索入口**，不是通用搜索引擎，也不是权威法律库。

| 环节 | 谁来做 |
|---|---|
| 通用问题、找官方来源 | 现有网页搜索（Bing / Google 等） |
| 找律师、律所、医患纠纷评述等公众号文章 | 本功能 |
| 法条原文、是否有效、案例是否真实 | 北大法宝（Feature-030），**不是**本功能 |

- 公众号文章是任何人都能发布的内容，只能当线索和观点，不能当作法条或案例原文引用。
- Feature-030 把"微信搜索"排除在法律检索之外，本功能不改变这一点：它是网页搜索的一个来源，不属于法律检索。

## 2. 做什么

1. 网页搜索新增来源 `sogou-weixin`（搜狗微信）：**只在模型显式指定时使用，不参与自动降级**。
2. 搜索结果直接返回 `mp.weixin.qq.com` 的真实文章地址，不返回搜狗跳转链接。
3. `lexora_web_fetch` 能读取微信文章正文。
4. 设置页"网页搜索"列表新增一行，默认开启。

## 3. 不做什么（本期）

- 不绕过验证码，不换 IP，不做代理池；被搜狗拦截一律返回 `WEB_CHALLENGE`。
- 不返回图片（正文图片和搜索缩略图都不返回），不做 OCR。
- 不搜公众号，不做公众号历史文章和翻页。
- 不做后台渲染兜底。

## 4. 设计决定

### 4.1 不进自动降级链

现有逻辑是"按用户排序依次尝试，第一个成功的就返回"（`WebCapabilityService.search`）。公众号搜索对任何问题都会"成功"，却不一定相关：排在 Bing 之前会污染通用搜索，排在之后又永远轮不到。

- `provider` 不传或为 `auto` 时，排除 `sogou-weixin`。
- 模型传 `provider: 'sogou-weixin'` 时才调用，已有规则"显式调用不会静默切换来源"不变。
- 开启后 `availableProviders` 中会出现它，并在搜索工具描述里说明用途，模型才知道什么时候该用。

### 4.2 搜索阶段就解析跳转链接，需要会话 Cookie

搜狗结果链接是 `weixin.sogou.com/link?url=...`，没有会话 Cookie 请求会被 `302` 到 `/antispider/`。实测（2026-10-14）：

| 请求带什么 | 结果 |
|---|---|
| 无 Cookie、无 Referer | `302` → antispider |
| 只带 Referer | `302` → antispider |
| 只带 Cookie（搜索页下发的 `SUID`、`SNUID`、`ABTEST`） | `200`，页面里用 `url += '...'` 拼出真实地址 |

结论：必须有 Cookie，Referer 不需要。用另一次搜索下发的 Cookie 也能解析，Cookie 不绑定具体查询。

跳转链接直接交给 `lexora_web_fetch` 或用户点击都会撞到验证码，所以搜索阶段就解析成真实地址。

### 4.3 Cookie：复用宿主独立会话，只对 `*.sogou.com` 打开

现状：宿主网络层（`electron/main/network/requestThroughHost.ts`）固定 `credentials: 'omit'`、`useSessionCookies: false`，响应里的 `set-cookie` 也被删掉。公共请求是刻意无状态的。

宿主已有一个独立的内存会话（`registerWebHostRpc.ts` 里的 `isolated`，随机分区，退出时清理）。做法：

- 对 `*.sogou.com` 的请求把 `credentials` 从 `'omit'` 改为 `'include'`，让 Electron 会话自己存取 Cookie。
- 其他域名行为完全不变；不新增协议字段、不自建 Cookie 罐。
- Cookie 只在宿主进程内存里，服务层读不到，不落盘。

**已在真实 Electron（44.4.5）里验证**，条件与 `requestThroughHost` 一致（独立内存分区、`redirect: 'manual'`、`net.request`）：

| 配置 | 会话里的 Cookie | `/link` 结果 |
|---|---|---|
| `credentials: 'omit'`（现状） | 无 | `302` → antispider |
| `credentials: 'omit'` + `useSessionCookies: true` | 无 | `302` → antispider |
| `credentials: 'include'` | `ABTEST`、`SNUID`、`SUID` | `200`，解析出 `mp.weixin.qq.com` 地址 |

注意：只改 `useSessionCookies` 无效，Electron 文档写明"指定了 `credentials` 时该选项不生效"，而现状已指定 `credentials: 'omit'`，所以必须改 `credentials`。

## 5. 搜索行为

```
lexora_web_search { query, provider: 'sogou-weixin' }
  1. GET weixin.sogou.com/weixin?type=2&ie=utf8&query=<query>
  2. 解析 ul.news-list > li，取前 5 条
  3. 依次 GET 每条的 /link?url=...，从 url += '...' 拼出真实地址
  4. 解析失败的条目丢弃，不返回跳转链接
  5. 返回 sources
```

| 字段 | 来源 |
|---|---|
| `title` | `.txt-box h3 a` 文本 |
| `url` | 第 3 步解析出的真实地址 |
| `snippet` | `公众号名 · 发布日期 · 摘要`，总长 ≤ 1500 |

- 页面结构（实测）：`.s-p > span.all-time-y2` 是公众号名；`.s-p > span.s2` 里是脚本 `document.write(timeConvert('<unix 秒>'))`。日期从脚本里取出 unix 秒转成 `YYYY-MM-DD`，不能直接取 `.s-p` 的 `textContent`，否则脚本文本会混进 `snippet`。
- 解析跳转页：正则收集全部 `url\s*\+=\s*['"]([^'"]+)['"]`，拼接后去掉 `@`；结果不以 `https://mp.weixin.qq.com/` 开头就丢弃。
- 顺序执行，不并发；最多 1 次搜索 + 5 次解析请求，沿用现有 15 秒尝试超时，不重试。
- 拦截判据（搜索页和跳转页都检查）：最终 URL 含 `antispider`，或正文含 `seccoderight`，或正文含 `anti.min.css`。前者识别 `302`，后两者识别状态码 `200` 的验证码页。
- 错误：
  - 命中拦截判据，或搜索成功但全部链接解析失败 → `WEB_CHALLENGE`
  - 页面结构不是预期结构 → `WEB_INVALID_RESPONSE`
  - 正常结果页但 0 条 → 空结果

## 6. 读取行为

实测：文章页 `200`，约 3.5 MB，正文在静态 HTML 的 `#js_content`，但它带行内样式 `visibility: hidden; opacity: 0`（由页面脚本再显示）。现有 `extractHtml` 的 Readability 把它当成不可见内容，三篇样本全部返回 `WEB_RENDER_REQUIRED`；去掉这两个样式后同一份 HTML 能提取约 3.5k 字的干净 Markdown。

处理：在 `extractHtml` 中，URL 属于 `mp.weixin.qq.com` 时，先去掉行内的 `visibility:hidden` 和 `opacity:0` 再走原有流程。不新建专项读取器，标题等沿用通用提取。

- 图片消息（小绿书，`window.item_show_type = '8'`）：没有 `#js_content`，通用路径只会读到"微信扫一扫可打开此内容"的外壳却返回成功。2026-10-14 补充处理，仍在 `extractHtml` 内：
  - 正文取 `meta[name=description]`（还原字面 `\x0a` 等转义），标题取 `og:title`，`acquisitionIncomplete: true`。
  - 如果它由文章转换而来，从 `convert_appmsg_link` 取原文，写入 `warnings`（`Original article: "<标题>" <https 地址> - read this URL with lexora_web_fetch ...`）。只接受 `mp.weixin.qq.com/s`，不取页内的推广卡片 `appmsg_link`。
  - 不自动跟进原文，由模型根据 `warnings` 再调一次 `lexora_web_fetch`；`lexora_web_fetch` 的描述里已说明。
  - 既无文字说明又无原文时返回 `WEB_EMPTY_CONTENT`。
  - 其他类型的外壳页（已删除、需客户端打开等）仍未处理。
- 图片：微信正文图片只有 `data-src`，提取后整体丢失，AI 读不到图，也不知道有图。本期接受。
- 搜索结果里的链接带 `signature`，是临时链接，过期后读取会失败，让模型重新搜索即可。

## 7. 设置

"网络 → 网页搜索"列表新增一行 `搜狗微信`：

- 作为普通一行复用现有的开关和说明组件，说明沿用其他来源的统一文案"可用性受网络、限流和验证码影响。"
- **默认开启**，与 Bing、Google 等来源一致。
- 该来源不参与自动降级，所以拖动它改变顺序没有实际效果，本期接受，不为此改列表逻辑。

数据模型：`sogou-weixin` 加入 `WEB_SEARCH_PROVIDERS`，复用 `search` 数组的开关、校验和快照。`DEFAULT_WEB_SETTINGS` 对除 Tavily 以外的来源都默认开启，所以不需要额外处理；旧设置缺少该项时由 `WebSettingsService.get()` 按默认值自动补齐（现有逻辑已支持），升级后的老用户同样是开启状态。

## 8. 实现位置

| 内容 | 位置 |
|---|---|
| provider 常量 | `shared/network/webProtocol.ts` |
| `*.sogou.com` 的 `credentials` 改为 `'include'` | `electron/main/network/requestThroughHost.ts` |
| 搜索与跳转解析 | 新文件 `service/src/web/sogouWeixinSearch.ts`（不并入 `PUBLIC_SEARCH` 配置表：它不是单次请求 + 选择器） |
| 自动降级排除、显式调用 | `service/src/web/WebCapabilityService.ts` |
| 搜索工具描述 | `service/src/web/webExtension.ts` |
| 去掉微信隐藏样式 | `service/src/web/webContent.ts`（`extractHtml`） |
| 名称与说明文案 | `src/i18n/locales/{zh-CN,en-US}/settings.ts`（`desktop.web.sogou-weixin`、`desktop.web.sogou-weixinSearchDescription`） |

## 9. 测试

固定样本放进 `__tests__/fixtures/`（搜索结果页、跳转页、文章页各一份），不依赖真实网络。

| 用例 | 断言 |
|---|---|
| 搜索页解析 | 5 条结果的标题、公众号名、日期、摘要正确；脚本文本不进 `snippet` |
| 跳转页解析 | 从 `url += '...'` 拼出完整地址；缺失或不以 `https://mp.weixin.qq.com/` 开头时丢弃该条 |
| 拦截识别 | `302` 到 `/antispider/`，或 `200` 正文含 `seccoderight` / `anti.min.css` → `WEB_CHALLENGE`，不重试 |
| 自动降级 | `auto` 时不调用 `sogou-weixin`，即使已开启；显式指定且已开启时可调用，关闭时 `WEB_PROVIDER_UNAVAILABLE` |
| 文章提取 | 带 `visibility:hidden` 的微信样本能提取正文，不影响其他站点 |

## 10. 验收

用真实问题各跑一遍：

1. 默认状态下让 AI 搜索"未告知尸检的法律后果是什么"：模型使用 `sogou-weixin`，返回 ≥ 3 条 `mp.weixin.qq.com` 来源，带公众号名和日期。
2. 让 AI 读取其中一篇：返回正文 Markdown，不触发后台渲染。
3. 关闭开关后：模型不能调用，通用搜索照常。
4. 连续快速搜索 10 次：遇到拦截时返回 `WEB_CHALLENGE`，不重试、无重试风暴。

### 验收记录（2026-10-14）

- 开发预览（真实 Electron 会话）中人工验收通过：设置页出现"搜狗微信"并默认开启，对话中显式调用可搜索并读取公众号文章。
- 真实网络自测（Node 出口加仅对 `*.sogou.com` 生效的 Cookie 罐）：
  - 搜索"车辆被人为损坏 保险赔不赔"：1 次搜索 + 10 次跳转解析 + 10 篇文章读取全部成功，无验证码，均为 `mode: http`，未触发后台渲染。
  - `auto` 不会调用 `sogou-weixin`；直接给出 `mp.weixin.qq.com/s/<id>` 永久链接可读取，不依赖搜狗。
  - 图片消息（小绿书）返回文字说明，并在 `warnings` 中给出原文链接，原文可继续读取。
- 第 4 项只以"一次搜索后连续读取 10 条结果"代替，没有做 10 次连续搜索，频率阈值仍未知，见 §11。
- 搜狗排序每次不同，转载造成来源同质化，公众号结论之间可能互相矛盾；它只能作线索，核实仍走北大法宝（Feature-030）。

## 11. 已确认与后续

已确认（2026-10-14）：

1. **默认开启**，不默认关闭。
2. **版权提示**：设置页不增加额外提示，沿用统一说明文案。
3. **图片**：本期不考虑，不返回。

后续：

0. **外壳页**：已删除、需微信客户端打开的文章仍会返回"成功但只有外壳文字"（图片消息已处理）。可在提取后对 `mp.weixin.qq.com` 的过短内容返回 `WEB_EMPTY_CONTENT`。
1. **Cookie 有效期与频率阈值**：实测只覆盖短时间的少量请求，搜狗的触发阈值未知。实现后单独做一轮连续请求测试，再决定是否需要限速或缓存。2026-10-17 起 `legal-research` 不再限制检索次数（以收敛为止，见 [Feature-030](feature-030-pkulaw-legal-retrieval.md) §8），同一问题的搜索量会增加，这项测试更有必要；被拦截时 skill 要求记为"微信渠道未能检索"。
2. **图片**（如需要再做）：把 `data-src` 转成可读链接，并让工具结果支持图片内容块，同时按模型视觉能力和体积设上限；实测 `mmbiz.qpic.cn` 图片不带 Referer 可正常下载，带非微信 Referer 只返回约 2 KB 的占位图。
