# ADR: Keep the thread composer in flow

- Status: Accepted
- Date: 2026-09-16
- Deciders: PI-Desktop core
- Related: ADR 0065, D287, D297
- Amends: ADR 0065 clause 4

## Context

The thread composer was positioned as an absolute bottom dock while the
transcript scroller occupied the full chat surface. The transcript reserved the
composer's measured height with bottom padding, which kept the newest turn
reachable but still allowed older content to scroll through the visual area
around the floating shell. With no full-width boundary, messages could appear to
leak behind or beside the input surface, especially on light backgrounds.

The input shell's Codex-style pill surface is still desirable. The layout
problem is the overlay relationship, not the shell's shape.

## Decision

1. In thread mode, the composer dock participates in the MainChat flex layout as
   a non-shrinking bottom sibling of the transcript.
2. The transcript scrollport ends at the top of that composer region. The
   transcript no longer reserves the dock's measured height with a document-level
   custom property.
3. The inner composer shell remains a rounded Codex-style elevated surface. Its
   own top edge, background, and shadow provide visual separation; no separate
   full-width divider is painted.
4. Floating transcript controls such as the minimap, jump-to-latest button, and
   annotation index use the transcript region's own bottom edge rather than
   positioning themselves above an overlay dock.

## Consequences

- Messages cannot paint or scroll beneath the thread composer.
- A multi-line draft naturally reduces the visible transcript viewport instead
  of covering it.
- The thread composer has less of an overlay appearance, but retains its pill
  shape and elevation.
- The empty-home composer remains a bottom-reserved sibling with its existing
  layout and visual behavior.

## Alternatives considered

### Keep the absolute dock and add a full-width scrim

Rejected because it would preserve the overlay relationship and add a visual
veil around a control that should have a clear layout boundary.

### Add only a horizontal divider

Rejected because a line would signal separation but would not prevent transcript
content from occupying the same visual region as the composer.
