# ADR 0269: Keep a work-panel context while no conversation is active

- Status: Accepted
- Date: 2026-09-17
- Deciders: PI-Desktop core
- Amends: ADR 0068, ADR 0195 (their no-active-session no-op clause), D128, D357
- Related: [0028](0028-session-scoped-work-panel-contexts.md) ·
  [0033](0033-internal-dock-work-panel.md) ·
  [0151](0151-internal-work-panel-dock.md) ·
  [0241](0241-vendored-updatable-file-view-plugin.md) ·
  [01-ui-ia](../spec/04-ux/01-ui-ia.md) ·
  [08-component-spec](../spec/04-ux/08-component-spec.md) ·
  [09-interaction-patterns](../spec/04-ux/09-interaction-patterns.md) ·
  E2E-056

## Context

The work panel is artifact-driven and session-scoped (D128, D142, ADR 0028).
ADR 0068 then added a keyboard entry point and ADR 0195 the pointer equivalent;
both were explicitly windowed so that they do nothing without a conversation:
*"With no active session the toggle is disabled and the shortcut does nothing."*

That clause assumes a conversation is always one click away. In practice the
renderer is in a session-less state in several ordinary situations, and none of
them is a corner case:

- **Launch.** Bootstrap deliberately opens on the empty home instead of
  restoring a transcript, so `activeSessionId` is `undefined` even when the
  sidebar is full of conversations (`apps/desktop/src/stores/app-store.ts`
  bootstrap block).
- **Opening or switching a project.** `activateProject` clears the visible
  conversation and resets the panel projection
  (`apps/desktop/src/stores/slices/project-slice.ts`), and clearing a project
  does the same.
- **Deleting the conversation that owned the panel.**

In all of them nothing can occupy the panel, because a session id is also the
write key for every panel mutation (`openWorkPanelTab`,
`openWorkPanelTabForSession`, `openFileInWorkPanel`, `replaceWorkPanelTab`, …).
So the panel cannot host its New launcher, the side browser, or the file view
of the project that is visibly open — and the disabled toggle reads as a defect
rather than as a deliberate boundary.

The session-scoped model does not actually require that gate. It requires that
panel state be *owned*, so that (a) a background artifact cannot steal the
visible panel, and (b) relative file and Browser resources are never
reinterpreted against another workspace. A session-less owner satisfies both:
it holds no `sessionId`, so nothing can address it as a background conversation,
and its tabs are exactly the ones the user opened there.

## Decision

1. "No active session" becomes an ordinary work-panel context slot, keyed by an
   empty context id (`NO_SESSION_WORK_PANEL_CONTEXT = ""` in
   `apps/desktop/src/lib/work-panel-tabs.ts`). Host session ids are UUIDs, so
   the key cannot collide. `switchWorkPanelContextState` projects that slot
   whenever there is no active session and writes the current projection back
   into the slot it came from, exactly as it already does for conversations.
2. The viewport-fixed toggle, `Cmd/Ctrl + J`, `+`, tab activate/close/replace,
   `openWorkPanel`, `collapseWorkPanel`, `openFileInWorkPanel`, and
   `openUrlInWorkPanel` operate on the visible owner, session-less included. The
   toggle loses its `disabled` condition. Settings is unchanged: it has no panel
   and no toggle.
3. Session-relative tab creation is unchanged. Artifact triggers (successful
   workspace Write/Edit → Review, plan/goal artifacts, side chats,
   BrowserPreview events) still address their own conversation's context, and
   background artifacts still never reveal, activate, resize, navigate, or
   focus the visible panel.
4. An explicit transition still hides the panel: the new
   `resetWorkPanelContextState` helper — used by `activateProject`,
   `clearProject`, deletion of the active conversation, and the pre-clear that
   runs before a new conversation is created — clears the visible projection and
   drops the session-less slot, while every conversation keeps its retained
   context. ADR 0028's "a workspace selection with no active conversation hides
   the panel" therefore still holds, and no relative resource can survive into
   another workspace.
5. Launch stays closed. The session-less slot starts absent, so startup renders
   no panel and retains no tabs; only the preferred panel width persists across
   launches, as before.
6. Nothing in host-core, the host RPC contract, preload IPC, the plugin SDK, or
   persistence changes. The session-less context is renderer runtime state and is
   discarded on relaunch.

## Consequences

- The panel can be revealed, collapsed, and populated without a conversation:
  the New launcher, the side browser, and the file view over the project that is
  visibly open are reachable from the empty home and from a project that has no
  active conversation.
- A conversation still projects only its own context, and a new conversation
  still begins with an empty context (D142): starting one from the session-less
  state closes the panel and clears its slot instead of adopting tabs it never
  produced.
- The session-less slot uses the visible workspace when it resolves relative
  file resources, and it is dropped on the next workspace change, so a stale
  relative resource cannot be reinterpreted against another project.
- Review rendered in the session-less state shows its "no recorded changes"
  empty state, because it reads the visible transcript, which has no messages.
- A plugin view opened with no calling session receives none. Each view keeps
  its own fail-closed behavior (ADR 0266); the host does not gain a
  session-less call path.
- D128's "no empty manual entry point" is untouched: the session-less panel is
  reachable only through the toggle and the shortcut that ADR 0068/0195 already
  introduced, and it lands on the already-accepted D224 no-resource launcher.

## Alternatives

### Keep the gate and require a conversation

Rejected. The session-less state is the application's launch state, and the file
view and browser are exactly what a user wants before starting a conversation.
The gate also blocked browsing a project that is plainly open, which is work the
panel already supports for a project conversation.

### Let the session-less context be adopted by the next conversation

Rejected. A new conversation would inherit tabs it never produced, contradicting
D142's "new and forked conversations begin with an empty context" and weakening
the artifact-driven model that D128 established.

### Keep the visible panel across an explicit workspace change

Rejected for this change. ADR 0028's rule exists so that relative resources are
never reinterpreted against another workspace; clearing on the explicit
workspace change is what makes decision 1 safe. The user can reopen the panel
immediately, and the cost is one click.

## References

- `apps/desktop/src/lib/work-panel-tabs.ts`,
  `apps/desktop/src/stores/slices/work-panel-slice.ts`,
  `apps/desktop/src/features/app/AppShell.tsx`,
  `apps/desktop/src/features/app/useAppShellRuntime.tsx`
- `docs/adr/0028-session-scoped-work-panel-contexts.md`,
  `docs/adr/0068-work-panel-keyboard-entry.md`,
  `docs/adr/0085-work-panel-shortcut-toggle.md`,
  `docs/adr/0195-viewport-fixed-work-panel-toggle.md`
- `docs/spec/04-ux/01-ui-ia.md`, `docs/spec/04-ux/08-component-spec.md` §5.3/§5.4,
  `docs/spec/04-ux/09-interaction-patterns.md` §1.8
- `docs/spec/06-delivery/04-e2e-test-plan.md` (E2E-056)
- `docs/spec/08-meta/decisions-log.md` (D128, D142, D207, D221, D224, D357, D436)
