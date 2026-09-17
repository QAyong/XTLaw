# ADR 0267: Restore User-Resizable Expanded Sidebar Width

- Status: Accepted
- Date: 2026-09-16
- Amends: [ADR 0238](0238-three-column-width-priority.md) / D408
- Related: [ADR 0141](0141-sidebar-width-resize.md) ·
  [ADR 0226](0226-reserve-chat-width-for-composer-controls.md) ·
  [01-ui-ia](../spec/04-ux/01-ui-ia.md) ·
  [07-ui-design-system §10](../spec/04-ux/07-ui-design-system.md) ·
  [08-component-spec §1](../spec/04-ux/08-component-spec.md) ·
  [09-interaction-patterns §8](../spec/04-ux/09-interaction-patterns.md) ·
  E2E-168 · E2E-LAYOUT-three-column-width-priority

## Context

The three-column priority work in ADR 0238 fixed the expanded sidebar at its
275px default and disabled the existing resize path. That removed an important
way to fit long project and session labels, and it also made the right edge
appear non-interactive even though the sidebar component still contained its
pointer, keyboard, cancellation, and accessibility behavior.

The MainChat floor and work-panel budget remain necessary. Restoring the
explicit user preference must not make the native window grow or allow the
composer to fall below its supported minimum.

## Decision

1. The expanded sidebar defaults to `275px` and accepts a rounded, clamped
   preferred width from `200px` through `520px`. The preference remains in
   renderer-owned local storage under `pi.desktop.sidebarWidth`.
2. The existing right-edge ARIA separator is the only sidebar width control.
   Pointer preview stays anchored to the pointer-down position and is applied
   on animation frames; pointer release commits one clamped value. ArrowLeft,
   ArrowRight, Home, and End commit immediately. Escape, cancellation, lost
   pointer capture, and unmount restore the pointer gesture's starting width.
3. Collapsing the sidebar changes only its presence. Reopening restores the
   preferred expanded width rather than the `48px` icon rail width.
4. ADR 0238's `450px` MainChat floor, live work-panel budget, user-controlled
   sidebar state under panel pressure, and fixed native-window bounds remain
   unchanged. If the panel reaches the budget, it is capped before the
   expanded sidebar changes state; explicit sidebar collapse and reopen remain
   separate user actions.

## Consequences

- Long labels can be inspected without changing the native window or host
  protocol.
- Sidebar width survives collapse and relaunch, while the collapsed rail stays
  compact and independent from the preference.
- The renderer remains the owner of sidebar width; no IPC, SQLite, plugin, or
  permission contract changes are required.
- E2E-168's rendered drag and relaunch journey remains the acceptance path for
  the restored affordance.
