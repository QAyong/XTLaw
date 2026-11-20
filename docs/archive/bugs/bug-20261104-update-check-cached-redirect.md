# Bug：GitHub 偶发一次 301 被 Chromium 永久缓存，之后每次检查更新都失败

**日期**：2026-11-04
**优先级**：中（P2。不丢数据，但检查更新会永久失败，界面和日志都看不出原因，用户无法自救）
**状态**：已修复（2026-11-04），随下个版本发布。已安装的 0.5.2 不含修复，受影响的机器需要手动清缓存，见“已安装版的恢复办法”。上游 `useLexora/Lexora` 有同样的代码路径，已提 [useLexora/Lexora#562](https://github.com/useLexora/Lexora/pull/562)。
**范围**：桌面端“检查更新”（`checkForDesktopUpdate`）。与 Clash、系统代理、TUN、应用内代理设置无关。

## 现象

“检查更新”一直提示“暂时无法检查更新”。关闭或切换 Clash 的 TUN、系统代理，以及应用里的“系统代理 / 直连 / 自定义”，结果都一样。`updates.json` 里 `checkFailed: true`，最后一次成功停在 2026-11-01 11:40；日志里只有 `update.background.failed`，错误码 `UPDATE_CHECK_FAILED`，没有任何原因。

## 原因

检查更新请求 `https://api.github.com/repos/QAyong/XTLaw/releases?per_page=100`，走的是 `requestThroughHost`（Electron `net.request`，`session.defaultSession`）。这条路径有三个特点叠在一起：

1. 请求经过 Chromium 的 HTTP 磁盘缓存。
2. `redirect: 'manual'`：收到重定向不跟随，直接把 30x 当作响应返回。
3. `checkForDesktopUpdate` 对 `!response.ok` 一律抛 `UPDATE_CHECK_FAILED`。

2026-11-01 07:34 GMT（北京时间 15:34），GitHub 对这个地址回过一次 `301`，`Location` 为 `https://api.github.com/repositories/1389466826/releases?per_page=100`（这个 ID 就是 `QAyong/XTLaw` 本身）。这条响应没有 `Cache-Control`、`Expires`，Chromium 对没有过期时间的 301 视为永久新鲜，写进了磁盘缓存。之后 GitHub 早已恢复返回 200，但每次检查都直接读到缓存里的 301，请求根本没有发到网络上，于是永远失败。当时 GitHub 为什么回 301 没有查明（常见于仓库改名或转移的短暂窗口）。

证据：

- 用 `--log-net-log` 抓到的网络日志里，`api.github.com` 的请求经过 `HTTP_CACHE_OPEN_OR_CREATE_ENTRY`（opened），读出 3716 字节缓存条目后立刻触发 `URL_REQUEST_DELEGATE_RECEIVED_REDIRECT`，没有任何网络连接事件。
- 缓存文件 `device/chromium/Cache/Cache_Data/data_2` 里有这条 `HTTP/1.1 301` 及其 `location`。
- 同一台机器上用全新缓存跑应用真实的 `DesktopNetwork` + `checkForDesktopUpdate`，自定义代理下 1.9 秒拿到最新版；`curl` 直接访问也是 200。

## 排查中排除的方向

留给以后少绕弯：

- Clash 的 TUN / 系统代理 / 关闭：请求不出本机，与它们无关。
- 应用配置里残留的 `proxy.server = http://127.0.0.1:7897`：Clash Verge 实际混合端口是 7900，7897 无人监听。选“自定义”填 7897 确实会立刻 `net::ERR_TUNNEL_CONNECTION_FAILED`，但这不是本次的原因。
- GitHub 响应过大或格式不对：218 KB、14 个 release，真实解析代码通过。
- 限流：未触发。

## 修复方案（已实施）

改在 `apps/buddy/electron/main/desktopUpdateService.ts`，只有这一个源文件：

- 请求头加 `cache-control: no-cache`，每次都向 GitHub 重新验证。在 Electron 44.9.3 里用本地服务器验证：缓存了 301 之后服务端改回 200，普通请求命中缓存仍得 301（网络命中 0 次）；加 `no-cache` 后请求到达服务端并得 200，并且缓存条目被 200 覆盖，坏缓存自愈。
- 对 `api.github.com` 同域的 301/308 跟随，最多 2 次；跳到别的域名或跳不完都按失败处理。这样仓库改名后的真实 301 也能正常检查。

`DesktopNetwork.ts`、`requestThroughHost.ts` 与上游基本一致，没有改，避免新增与上游的分歧。

新增 3 个测试（`apps/buddy/electron/main/__tests__/desktopUpdateService.spec.ts`）：带 `no-cache` 头；跟随同域 301；拒绝跨域和循环重定向。

## 已安装版的恢复办法

完全退出 XTLaw（托盘里退出，关窗口不够），把 `%USERPROFILE%\.xtlaw\device\chromium\Cache` 改名备份（本机用的是 `Cache.bak-20261104`），再启动。Chromium 会重建缓存，只是插件包和安装包的下载缓存要重新下载。

## 验证到哪一步

- 本机：改名缓存并重启后，2026-11-04 21:33:59 发起的检查在 21:34:00 成功（`checkFailed: false`，最新版 0.5.2）。
- 代码：更新和网络相关的 8 个测试文件共 69 个测试通过，ESLint 和 `tsconfig.node.json` 类型检查无问题。
- 没有验证：修复没有打包进安装包，没有在打包后的应用里实测；Windows 打包要在 Windows 本机做。

## 遗留

- **失败原因仍然不进日志。** 诊断日志的 schema 没有放 HTTP 状态码或网络错误码的字段，`update.background.failed` 只有固定的 `UPDATE_CHECK_FAILED`，手动检查失败则完全不记录。这次只能靠 `XTLaw.exe --log-net-log=<路径>` 抓网络日志才查出来（必须先彻底退出旧实例，否则单实例锁会吞掉参数）。要改善需要先扩 schema，单独处理。
- 缓存里还有插件目录、公告等地址，说明它们也走 Chromium 缓存；是否同样可能被缓存的重定向卡住，没有逐一排查。
