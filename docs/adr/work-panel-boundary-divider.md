# ADR: Theme-aware work-panel boundary divider

- Status: Accepted
- Date: 2026-09-16
- Amends: D297

## Context

The docked work panel is an in-flow sibling of the chat pane. Its quiet inset
background is intentionally low contrast, and file-manager or plugin content
can use a white surface. In that state the chat/work-panel boundary is difficult
to read, especially in the light theme.

## Decision

Keep internal work-panel surfaces divider-free, but use the existing 10px
`.work-panel-resize` hit area to paint a centered 1px `--ds-border-default`
divider at rest. Promote the line to `--ds-focus` on hover, keyboard focus, and
active resizing. The divider remains an overlay, so it does not change the
three-column layout or the committed panel width.

The left navigation rail does not receive a matching line: its distinct
navigation surface and spacing already establish that boundary, and adding
both lines would over-frame the shell.

## Consequences

- Light and dark themes receive a visible, token-driven chat/work-panel seam.
- White nested views no longer visually erase the work-panel boundary.
- Resize hit testing, keyboard resizing, width persistence, and panel geometry
  remain unchanged.
- D297's divider-free rule remains in force for nested/in-panel content; this is
  a deliberate shell-boundary exception.
