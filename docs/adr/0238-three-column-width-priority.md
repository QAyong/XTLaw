# ADR 0238: Prioritize MainChat in the three-column shell

- Status: Accepted
- Date: 2026-09-13
- Amends: [ADR 0226](0226-reserve-chat-width-for-composer-controls.md) ·
  [ADR 0151](0151-internal-work-panel-dock.md) ·
  [ADR 0033](0033-internal-dock-work-panel.md) — the fixed `244..720px` clamp
  from D167/ADR 0033/ADR 0151 is replaced by the live budget below
- Related: [ADR 0033](0033-internal-dock-work-panel.md) ·
  [ADR 0151](0151-internal-work-panel-dock.md) ·
  [01-ui-ia](../spec/04-ux/01-ui-ia.md) ·
  [07-ui-design-system §10](../spec/04-ux/07-ui-design-system.md) ·
  [08-component-spec §1 and §5](../spec/04-ux/08-component-spec.md) ·
  [09-interaction-patterns §8](../spec/04-ux/09-interaction-patterns.md) ·
  E2E-LAYOUT-three-column-width-priority
- Amended by: [ADR 0267](0267-restore-sidebar-width-resize.md)

## Context

The renderer shell has three in-flow columns inside a fixed client area: the
expanded sidebar, MainChat and the work panel. ADR 0033 and ADR 0151 keep native
window bounds out of the panel's reach, but the shell still has no explicit
width priority. The 515px chat reservation of ADR 0226 and the fixed
`244px–720px` panel range left pointer resizing, keyboard resizing, sidebar
toggles and window resizing with different rules, and a narrow window could pin
MainChat to its floor while the expanded sidebar kept its full width.

## Decision

1. MainChat has a hard `450px` minimum, derived from the composer toolbar's
   unfolded row (plus button, mode and permission chips, model/thinking chip,
   enhance and send buttons) plus its margins. The work-panel maximum is the
   remaining client width after that floor and the expanded sidebar
   (`clientWidth - mainChatMinimum - expandedSidebarWidth`); there is no fixed
   pixel cap, so a wide window keeps spending width on the panel until MainChat
   reaches its floor. The shared renderer budget function is used by pointer
   preview, keyboard resize, panel presentation, sidebar changes and shell
   resize observation.
2. When the requested work-panel width would make MainChat reach the 450px
   floor, the renderer caps the panel at the remaining shared budget. The
   expanded sidebar remains in the user-selected state; opening, resizing, and
   closing the panel never collapse or restore it automatically. While a
   manually collapsed sidebar still occupies flex space during its mounted
   `sidebar-out` animation, the shared budget continues to count it so MainChat
   stays at or above 450px.
3. A manual sidebar reopen spends work-panel width first. It preserves the
   current MainChat width where possible; if the 450px floor would be crossed,
   it targets `460px`. This reopen path may persist a positive compact panel
   width below the ordinary `244px` presentation minimum.
4. Sidebar presence is changed only by an explicit user action. Manual sidebar
   collapse and reopen remain independent from work-panel presentation, and
   closing the panel preserves the user's last sidebar state.
5. The window itself stays fixed. No panel action requests a positive native
   reservation: the renderer keeps `window/setWorkPanelReservation` at zero and
   Main normalizes every valid request to `{ requested: 0, reserved: 0 }`
   without applying panel width or x-offset geometry (ADR 0033 / ADR 0151). The
   supported window minimum stays `1040×700`, which already exceeds
   `mainChatMinimum + panelMinimum`, so the panel minimum is satisfiable at
   every supported window size.
6. The panel header exposes a preview (maximize) toggle. While preview mode is
   on, MainChat is not rendered at all and the panel takes the whole client
   area beside the sidebar (`clientWidth - expandedSidebarWidth`); the 450px
   MainChat floor is therefore suspended by design, because there is no chat
   column to protect. Leaving preview mode restores the previous panel width
   and keeps whatever sidebar state the user chose last; the mode is transient
   (never persisted, ends with the panel) and never changes native bounds.
   Because MainChat is absent in this mode, AppShell supplies a window-level
   46px chrome row with New Task, sidebar, and native window controls.
   Collapsed-sidebar preview reserves 76px on the left for macOS traffic lights
   in windowed mode and 8px in fullscreen.
7. Content-focus swap uses a separate secondary-chat floor of `320px`. The
   work panel is capped against that floor while the panel remains the primary
   content surface; at the normal 1200px client profile, the exchanged Chat
   column remains the default `360px`. This floor applies only while the panel
   is swapped to the left and does not change the regular panel minimum or the
   persisted preferred width.

## Consequences

- MainChat cannot be compressed below 450px by any supported shell width
  change; the work panel is the column that yields before changing the
  user-controlled sidebar state.
- A constrained window shows a narrower work panel during the current layout,
  while the persisted preferred width remains available when space returns.
- Content-focus keeps the secondary Chat column usable at narrow supported
  widths by reserving 320px before growing the left-docked work panel; the
  panel's header reclaims its unused trailing safe lane in that mode.
- The composer toolbar now handles widths between 450px and its comfortable
  layout instead of relying on a 515px reservation, so its control groups
  ellipsize or reflow below that width.
- No host protocol, SQLite schema, plugin contract, security boundary or native
  window geometry changes.

## Alternatives rejected

### Keep the 515px chat reservation of ADR 0226

Rejected because it leaves side-dock priority implicit and cannot satisfy the
450px hard floor while keeping the sidebar state user-controlled. Capping the
panel at the live budget keeps MainChat usable in the fixed window.

### Let the sidebar resize continuously to preserve every column

Rejected because the sidebar remains a discrete expanded/collapsed column and
its user-selected state should not change as a side effect of work-panel
pressure. Explicit user resizing is restored by ADR 0267; the MainChat floor
and panel budget remain in force.

### Mirror the committed panel width into native window bounds

Rejected because expanding the application window is the outward behaviour
ADR 0033 and ADR 0151 removed. The window minimum already guarantees
`mainChatMinimum + panelMinimum`, so the budget is always satisfiable without
touching native bounds.

## References

- `apps/desktop/src/lib/work-panel-resize.ts`
- `apps/desktop/src/components/workpanel/WorkPanel.tsx`
- `apps/desktop/src/features/app/useAppShellRuntime.tsx`
- `apps/desktop/src/features/app/AppShell.tsx`
- `apps/desktop/src/styles/chat-shell.css`
