# Known test failures in this checkout

This record lists test failures that are **expected** in this checkout. Do not
re-investigate them as regressions, and do not "fix" them by weakening a test.

Scope: the XTLaw fork on **Windows**, after the 2026-09-23 upstream sync
(`merge: sync upstream main (26dc6563a) into the XTLaw fork`). If a failure is
not listed here, treat it as new and investigate it.

## How these were confirmed

Every entry was run twice on this machine: once against the pre-sync commit
`99b72adb6` in an isolated worktree with its own `pnpm install` and
`pnpm -r --if-present build`, and once against the merged tree. Entries marked
**platform** fail for a capability Windows does not provide (the assertion or
error text names it); entries marked **pre-existing** produced identical
failures in both runs; entries marked **upstream-inbound** did not exist before
the sync and live entirely in upstream code and tests.

Re-run any of these with:

```bash
node docs/scripts/check-docs.mjs
node docs/scripts/check-locales.mjs
node scripts/check-agent-policy-sync.mjs
cd apps/desktop && node --test test/*.test.mjs
cargo test -p host-core --locked
```

## Desktop suite

`cd apps/desktop && node --test test/*.test.mjs` reports 2668 tests with 49
failures. They group into the files below.

| Test file | Kind | Reason |
| --- | --- | --- |
| `macos-signing-diagnostics.test.mjs` | platform | Drives `codesign`, `security`, `notarytool`; macOS-only |
| `macos-signing-watchdog.test.mjs` | platform | Watches a macOS signing stage that never starts here |
| `macos-release-verification.test.mjs` | platform | Verifies a notarized Developer ID app and DMG |
| `packaging-footprint.test.mjs` | platform | Counts a signed macOS release payload |
| `agent-runtime-bundle-package.test.mjs` | platform | Runs a generated POSIX `sh` script |
| `remote-host-ssh-password.test.mjs` | platform | OpenSSH on Windows refuses password auth without an askpass helper |
| `remote-host-ssh-transport.test.mjs` | platform | Spawns `ssh` fixtures and a POSIX `sh` |
| `remote-host-bootstrap-script.test.mjs` | platform | Asserts the generated bootstrap script is POSIX shell |
| `transcript-style.test.mjs` | pre-existing | "user-message file chips reuse the composer chip node" |
| `composer-paste-files.test.mjs` | pre-existing | "composer converts oversized text paste and materializes clipboard files" |
| `settings-import-page.test.mjs` | pre-existing | "import is one workbench per kind instead of four stacked scan cards" |
| `logger-routing.test.mjs` | pre-existing | "logger bounds and redacts messages, paths, credentials, and arbitrary data" |
| `plugin-fs-scope.test.mjs` | pre-existing | Posix symlink and permission semantics ("a symlink inside the workspace cannot carry a read out of it", "the project's other folders are not an escape hatch") |
| `anthropic-oauth-retry.test.mjs` | pre-existing | "cancelling the Desktop login during rate-limit wait removes only its new row" (10 s timeout) |

On Windows some of these tests also make `sh` resolve to the WSL launcher,
which pops an unexpected prompt. That is the same platform limitation, not a
dependency or proxy problem.

## Package suites

| Suite | Kind | Reason |
| --- | --- | --- |
| `packages/shared` → `github-feedback.test.ts` | pre-existing | Asserts the issue template says `PI-Desktop`; this fork ships `XTLaw` |
| `packages/agent-runtime` → `runtime.test.ts` → "keeps the first agent request on core tools plus discovery" | pre-existing | Deferred tool-catalog assertion |
| `packages/agent-runtime` → `native-pi-session.test.ts` → "never deletes a foreign publication and classifies the failure path-free" | pre-existing | Native fork fixture |
| `packages/host-runtime` → `launch-resolver.test.ts` → "resolves the session's provider, its secret, the shell, skills and project memory" | pre-existing | Shell and skills lookup |
| `apps/pi-host` → `config.test.ts` (3 tests) | pre-existing | Flag parsing, host identity, device/pairing storage |
| `apps/pi-host` → `host-operations.test.ts` (2 tests) | pre-existing | Session mapping and directory browsing |

## Rust host-core

`cargo test -p host-core --locked` reports 628 passed, 6 failed. Four of those
failed identically before the sync; the other two are upstream-inbound.

| Test | Kind | Reason |
| --- | --- | --- |
| `mcp_servers::tests::a_global_server_moves_into_a_project_with_its_state` | pre-existing | File move across project scopes |
| `user_skills::tests::a_global_skill_moves_into_a_project` | pre-existing | Same move |
| `user_skills::tests::imports_a_directory_with_skill_md_in_link_mode` | pre-existing | Link mode needs symlink privileges |
| `user_skills::tests::imports_a_file_in_link_mode` | pre-existing | Link mode needs symlink privileges |
| `sessions::fork_files::tests::copies_structured_and_compacted_inputs_and_rolls_back_until_committed` | upstream-inbound | Upstream normalizes `\` to `/` in the reference text but asserts native separators |
| `sessions::tests::fork_preserves_referenced_pasted_files_independently` | upstream-inbound | Same separator mismatch |

Both upstream-inbound tests arrived with upstream `8ffb30e70` and only exercise
its new `sessions/fork_files.rs` path; the fork has no pasted-file fork logic of
its own.

## Upstream-inbound test that cannot run here

| Test | Kind | Reason |
| --- | --- | --- |
| `packages/agent-runtime/src/hosted-search-compaction.test.ts` | upstream-inbound | Resolves `@earendil-works/pi-coding-agent` and searches the entry path for `/dist/`; `fileURLToPath` returns backslashes on Windows, so it throws "cannot locate the dist root" |

## What is green and should stay green

These gates pass in this checkout, so a new failure in them is a real
regression:

- `node docs/scripts/check-docs.mjs` — 520 pages
- `node docs/scripts/check-locales.mjs` — 81 English/Chinese pairs
- `node scripts/check-agent-policy-sync.mjs`
- `apps/desktop` targeted feature tests for the fork's own work: branding,
  model icons, session references, office plugin, auto-update

## When to revisit this list

- On Linux or macOS most **platform** entries disappear, so a failure there is
  meaningful.
- If the fork ever unifies its branding with `PI-Desktop`, the
  `github-feedback` entry disappears.
- When upstream fixes the Windows portability of its own tests, the
  **upstream-inbound** entries disappear.
