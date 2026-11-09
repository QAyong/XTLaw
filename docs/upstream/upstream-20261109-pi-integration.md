# 上游集成记录：2026-11-09 Pi 1.5.0

## 范围

只移植上一轮留下的依赖升级 `8d7411447892fd61764f9566f66c7ef8d9d980ba`。分支 `codex/upstream-pi-1.5.0` 从当时的本地 `master`（`d48efcfd2aa1504caad3f3093a0d9359f6ab9515`）切出。未合并 `master`，未推送。

## 已移植

| 上游提交 | 本地提交 | 内容 |
| --- | --- | --- |
| `8d7411447892fd61764f9566f66c7ef8d9d980ba` | `fa3ee9f0154edd35e8f2bf8ef71efe695b7bbec9` | Pi 1.4.0 升至 1.5.0，含三个 patch 改名和工具集合比对修正 |

本地 1.4.0 patch 与上游该提交的父版本一致，随上游改名并带入 1.5.0 的 patch 更新。`pnpm-lock.yaml` 是唯一冲突，按合并后的清单重新生成，没有手改冲突块。版本号仍是 `0.5.4`，没有照搬上游发版提交。

## 基线

`docs/upstream-baseline.json` 的 `lastChecked` 不在本分支推进。它仍是 `8229e0db07bb908e57fb6407d0cb158d46c5cf4a`。更早的 2026-11-09 产品移植记录在未合并的 `codex/upstream-20261109`，本分支不能越过那些尚未进入 `master` 的决定。下一轮看到 `8d7411447` 时，以本记录和 cherry-pick 来源行为准，不要再移植一次。

## 验证

- `pnpm install`：成功，锁文件只保留 Pi 1.5.0。
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @uselexora/lexora-buddy type-check`：通过。
- `SessionToolCapabilities.spec.ts` 与 `piToolValidation.spec.ts`：16 个用例通过。
- 未跑 Windows 预览、Playwright E2E、完整打包。
