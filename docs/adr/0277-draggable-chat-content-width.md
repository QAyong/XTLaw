# ADR 0277: Draggable Chat Content Width

- Status: Accepted
- Date: 2026-09-18
- Deciders: PI-Desktop desktop UI maintainers
- Amends: D058, D101, and the collapsed-sidebar chat-width rule
- Related: `04-ux/07-ui-design-system.md`, `04-ux/08-component-spec.md`,
  `04-ux/09-interaction-patterns.md`, D439, and
  `E2E-CHAT-content-width-handles`

## Context

The transcript, empty home, and Composer used separate fixed width caps. That
made the reading surface too narrow on a wide display and allowed the message
prose cap to stop scaling when the surrounding chat band grew. A collapsed
sidebar also overwrote the user's effective width with a separate 640px cap.

## Decision

The three surfaces share one persisted `AppSettings.chatContentMaxWidth`
preference, defaulting to 760px. The live band is the smaller of that
preference and the available pane after 24px edge gutters. Two centered edge
handles update the same value, with a 560px drag floor when the pane permits
it. The handles support pointer drag, Arrow keys, Home/End, Escape cancellation,
and double-click reset to 760px.

Assistant, tool, permission, review, and outcome rows consume a prose-width
variable that follows the same band. Sidebar collapse changes the transition
timing only; it does not replace the saved preference with a fixed width.

This is renderer UI state persisted through the existing settings contract. It
does not change the host schema, IPC protocol, or agent runtime.

## Consequences

- Existing users keep the default 760px band until they resize it.
- A wide saved preference compresses cleanly while a work panel or sidebar
  makes the pane narrower, then becomes available again when space returns.
- The handles are keyboard-accessible separators and remain quiet at rest.
