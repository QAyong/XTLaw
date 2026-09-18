# ADR 0270: The file view lists a path-less conversation's own scratch directory

- Status: Accepted
- Date: 2026-09-17
- Deciders: PI-Desktop core
- Related: [0124](0124-temporary-session-scratch-workspace.md) ·
  [0059](0059-composer-clipboard-files-in-session-scratch.md) ·
  [0263](0263-project-folder-roots-for-plugin-views.md) ·
  [0266](0266-plugin-fs-root-follows-the-calling-session.md) ·
  [0241](0241-vendored-updatable-file-view-plugin.md) ·
  [03-tools-and-permissions](../spec/03-runtime/03-tools-and-permissions.md) §4b ·
  [08-component-spec](../spec/04-ux/08-component-spec.md) §5.3 ·
  E2E-019a, E2E-PANEL-session-scratch-browse

## Context

ADR 0124 gave every path-less ("temporary") conversation its own scratch
directory, `<data_dir>/scratch/<sessionId>/`, and made that directory the
conversation's tool workspace root. Files a temporary conversation produces
therefore exist on disk, and the host already serves them at the read layer:
Electron's `fs.read`, `fs.reveal`, and `fs.open` handlers tolerate a missing
project for absolute paths inside the allowed roots, and the renderer can ask
for the path through `session.getScratchPath`.

None of that reaches the user. The work panel's file surface cannot show those
files:

- `fs.list` refuses to run without an open project, so a directory cannot even
  be listed.
- The file tab roots its tree at the visible project, so with no project it
  renders its "open a project" empty state.
- A file reference in the transcript does resolve — the main process completes
  it against the project, then the session's scratch, then attachments — but the
  resulting absolute scratch path is handed to that same rootless file tab, so
  the click appears to do nothing.
- The bundled file view plugin is not the answer for this case: it derives the
  folders it may browse from the project (ADR 0263) and fails closed without
  one (ADR 0266).

The result is that "my temporary conversation wrote a file" has no visible
outcome in the app, and the disabled-looking file surface reads as a defect
rather than as a boundary.

## Decision

1. `fs.list`, `fs.read`, and `fs.reveal` accept an optional `sessionId`. When no
   project is open, a **relative** path resolves inside that conversation's own
   scratch directory (resolved through `session.getScratchPath`, never
   re-derived by the renderer). Absolute paths keep exactly the containment they
   have today.
2. The work panel's file tab roots its tree at the open project when one exists,
   and otherwise at the calling conversation's scratch directory. A project
   conversation's browsing is unchanged, and so is a temporary conversation's
   when a project is visible.
3. host-core creates the scratch directory lazily on the first mutating tool
   call, so listing a not-yet-created scratch directory is an **empty listing**,
   not an error. The file tab therefore shows its empty state instead of a
   failure before the conversation has produced anything. Every other listing
   failure — an unreadable directory, a link loop, a missing subfolder, an
   escape attempt — stays visible as an error.
4. A file that was referenced explicitly can be displayed even when there is no
   tree root: the viewer precedes the no-root empty state, and an absolute
   request already carries its own containment.
5. Containment is not weakened. A relative path still cannot leave the
   conversation's scratch directory; listing keeps the existing real-path check
   and its symlink filtering, and the channel does not become a general
   filesystem browse. The `<data_dir>/scratch` base containment that absolute
   `fs.read` paths already use is not widened. The session id that scopes the
   fallback is supplied by the renderer and resolved through host-core's
   `session.getScratchPath`, which validates the id's shape rather than proving
   the conversation still exists — the same trust the existing "open session
   path" action already has, on a surface plugin renderers cannot reach.
6. No new user-facing strings, no plugin change, and no change to the host RPC
   contract, storage, or the plugin SDK.

## Consequences

- A temporary conversation can browse, open, and reveal what it produced, which
  is the workflow ADR 0124 enabled on disk and ADR 0269 made reachable in the
  panel.
- A temporary conversation that runs while a project is visible still browses
  that project in the tree; its own scratch files stay reachable through the
  file references it produces, because those travel by absolute path.
- The renderer now holds one more piece of session-scoped state (the scratch
  path). It is fetched only when no project is open, discarded on session or
  workspace change, and never persisted.
- The listing channel becomes one channel wider in what it can ask for, scoped
  by the session id the caller names rather than by a proven-open conversation.
  Reading any scratch file by absolute path was already possible before this
  change and nothing here is reachable from a plugin renderer, but a renderer
  bug could still list the scratch names of a conversation whose id it names,
  including a deleted conversation's leftover directory.

## Alternatives

### Root a path-less conversation at its scratch even when a project is visible

Rejected for this change. It would take the project tree away from a user who
keeps a temporary chat open beside an open project, and the single-file case is
already covered by the reference path. Revisit only with evidence that users
want two trees at once.

### Let the renderer join the scratch root with the relative path

Rejected. String joining in the renderer breaks on Windows separators, UNC
paths, and roots that already end in a separator, and it would move containment
decisions out of the one place that already implements them.

### Accept any absolute path under `<data_dir>/scratch` in `fs.list`

Rejected. Reading a known absolute path is already allowed, but *listing* a
directory exposes names the caller never referenced. Scoping the new capability
to the calling conversation's own directory keeps the narrower boundary that
ADR 0266 established for plugin filesystem roots.

### Contribute a scratch location to `pi.file-manager`

Rejected for this change. It would add a host payload, a plugin change, and a
second jail model for a read-only browse case that the built-in file tab already
owns, since scratch references are already routed to it.

## References

- `apps/desktop/electron/main/ipc/workspace-ipc.ts`,
  `apps/desktop/electron/main/fs-panel.ts`,
  `apps/desktop/src/lib/api.ts`,
  `apps/desktop/src/components/workpanel/FilesTab.tsx`
- `crates/host-core/src/scratch.rs`,
  `crates/host-core/src/rpc/mod.rs` (`session.getScratchPath`)
- `docs/spec/03-runtime/03-tools-and-permissions.md` §4b
- `docs/spec/04-ux/08-component-spec.md` §5.3, §5.4
- `docs/spec/06-delivery/04-e2e-test-plan.md` (E2E-019a,
  E2E-PANEL-session-scratch-browse)
- `docs/spec/08-meta/decisions-log.md` (D114, D437)
