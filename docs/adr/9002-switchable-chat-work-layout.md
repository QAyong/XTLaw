# ADR 9002: Switchable Chat and Work Layout

- **Status:** Accepted
- **Date:** 2026-09-23
- **Amends:** ADR 0238, for the optional Work layout only

## Context

The desktop shell currently places the conversation between the project
sidebar and the work panel. Contract review benefits from placing the work
panel in the center and keeping a usable conversation and composer on the
right. The shell already owns both panes, their renderer state, work-panel
session state, and the measured rectangle used to position native plugin
surfaces.

## Decision

1. Keep the existing Chat layout as the default. Add an application-level
   renderer preference that can switch the Chat and Work panes while both are
   visible. Apply it only on the chat page; other routes keep their current
   layout.
2. Reorder the keyed pane elements in the DOM when switching, so keyboard
   traversal follows the visible order and the mounted chat/work components
   retain their state. Do not change the Electron, IPC, database, or plugin
   contracts.
3. Persist the selected layout and its Work-layout chat target in renderer
   local storage. Keep the existing Chat-layout work-panel width preference
   independent. The Work-layout chat target defaults to and has a 450px floor,
   matching MainChat in the default layout; the center work area keeps at least
   300px. If the expanded sidebar
   would violate either floor, it yields first. These are renderer layout
   bounds and never change native window bounds.
4. Keep work-panel visibility and resource tabs scoped to the active session.
   Hiding the right chat pane is transient. Closing the panel restores the
   right chat pane without changing the saved layout preference.
5. The fixed top-right control toggles whichever pane is on the right. The
   layout switch is shown only when both panes are visible. `Cmd/Ctrl + J`
   continues to toggle the work panel in both layouts. Work-panel maximize
   remains a separate temporary state and restores the prior layout.
6. In Work layout, place the shared divider on the work panel's right edge and
   resize the right chat target. Keyboard resizing, ARIA bounds, cancellation,
   and reset use that same target. Re-measure native plugin view bounds after a
   position-only layout change.

## Consequences

- Existing users retain the current default layout and its 450px MainChat
  floor. ADR 0238 continues to govern that layout.
- Work layout preserves the same 450px chat floor as the default layout and
  at least 300px for the work area. The expanded sidebar yields first when the
  available width is constrained.
- Layout preference is global, while open panel state and resources remain
  session-scoped. Pane visibility and user-authored chat/work content are not
  coupled to the selected layout.
- The renderer remains responsible for layout. Native plugin surfaces follow
  the work pane's measured bounds and no new native reservation is introduced.

## Alternatives

- Use CSS visual ordering only: rejected because tab order would not match the
  visible pane order.
- Use a 320px floor only in Work layout: rejected because the chat pane should
  remain equally readable when its position changes.
- Persist the layout in host-core or add an IPC setting: rejected because this
  is a local renderer preference with no cross-device or shared-data need.
