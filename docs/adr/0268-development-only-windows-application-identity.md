# ADR 0268: Development-Only Windows Application Identity

- Status: Accepted
- Date: 2026-09-17
- Amends: D141 (canonical Windows native application identity) · D121
  (development host identity)
- Related: [01-product-scope](../spec/01-product/01-product-scope.md) ·
  [01-ipc-protocol](../spec/03-runtime/01-ipc-protocol.md) ·
  [07-ui-design-system](../spec/04-ux/07-ui-design-system.md) ·
  [09-interaction-patterns](../spec/04-ux/09-interaction-patterns.md) ·
  [06-release-runbook](../spec/06-delivery/06-release-runbook.md) ·
  E2E-065 · E2E-067 ·
  E2E-BRANDING-development-run-does-not-own-the-shipped-windows-identity

## Context

D141 registers the canonical `com.pi-desktop.app` AppUserModelID in every
Windows run, packaged or not, so native notifications and taskbar groups never
fall back to the stock Electron identity. Windows resolves a window's shell
identity from that ID: the notification platform creates a Start Menu shortcut
for the AppUserModelID of the process that shows a toast, names and icons the
shortcut after that process's own executable, and the shell then answers the
window's taskbar name and icon from that shortcut.

A development run executes the stock Electron host. Registering the shipped ID
therefore produced an `Electron`-branded Start Menu shortcut that carried
`com.pi-desktop.app`, and the shell presented the installed app in the taskbar
as `Electron` with Electron's default icon — even though the packaged
executable, its embedded icon, the window icon, and the NSIS shortcut were all
correct. A development-only artifact must never be able to own the identity the
installed app answers to.

## Decision

1. `packages/shared/src/protocol.ts` exports the development identity
   `DEV_APP_ID = "com.pi-desktop.app.dev"` beside the shipped
   `APP_ID = "com.pi-desktop.app"`.
2. Electron Main registers the shipped ID only when `app.isPackaged`. An
   unpackaged Windows run registers the development identity instead.
3. The development identity is the value already used as the macOS development
   bundle identifier (`scripts/dev-electron.mjs`), so development has one
   identity across platforms. A source-contract test keeps the two literals
   aligned.
4. Packaged behavior is unchanged: `appId`, executable name, NSIS shortcut
   identity, native notification attribution, notification settings, and
   taskbar grouping keep D141's contract.
5. Development shell surfaces are development-only by design. A development run
   does not appear as the installed app, and the Windows shell surfaces that
   carry `PI-Desktop` branding in development come from the installed package.
6. The Windows acceptance path verifies the invariant directly: no Start Menu
   shortcut other than the installed app's may carry `com.pi-desktop.app`.

## Consequences

- A development run can no longer create an `Electron`-branded shortcut that
  owns the installed app's notifications, taskbar group, taskbar name, or
  taskbar icon.
- Development notifications and taskbar grouping are attributed to the
  development identity, matching the macOS development host bundle; Windows
  development still launches the stock electron-vite executable (D121).
- Residue created before this change stays on the machine. A Start Menu shortcut
  that carries `com.pi-desktop.app` while targeting anything other than the
  installed executable must be removed once, and the shell re-resolves a
  window's identity when the app or the shell restarts.
- No protocol, storage, permission, plugin, or packaging contract changes.
