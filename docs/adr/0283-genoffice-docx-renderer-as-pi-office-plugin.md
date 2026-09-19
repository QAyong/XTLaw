# ADR 0283: Extract the GenOffice DOCX renderer into `pi.office`

- Status: Accepted
- Date: 2026-09-18
- Deciders: PI-Desktop core
- Related: ADR 0104 · ADR 0169 · ADR 0241 ·
  [Office DOCX plugin spec](../spec/07-plugins/17-office-docx-plugin.md)

## Context

PI-Desktop needs a Word-compatible DOCX editing and preview surface. GenOffice
already contains a DOCX engine and a browser-rendered editor, but its desktop
application also contains an Electron shell, AI/account flows, remote
services, MCP integrations, and native file dialogs. Embedding that shell would
duplicate PI-Desktop's lifecycle and violate the plugin view ownership model.

The PI plugin channel already supports isolated work-panel views and a plugin
process with private data storage. The missing piece is a narrow file lifecycle
adapter that lets the extracted renderer use PI's path resolution, conflict
policy, and atomic-save rules.

## Decision

1. Ship a bundled `pi.office` work-panel plugin. Its view is a generated
   browser renderer built from the pinned GenOffice commit in `UPSTREAM.md`;
   the GenOffice Electron shell and unrelated enterprise code are excluded.
2. Adapt the renderer with `views/bridge-shim.js` instead of exposing Node,
   Electron, or host internals to the page. The shim translates the small
   open/save/lifecycle subset of `window.desktop` into `pluginBridge` calls.
3. Keep DOCX file access in the plugin process. `main.js` accepts only DOCX
   paths, rejects credential paths and containment escapes, bounds reads, uses
   mtime/size/SHA-256 optimistic conflict checks, and performs same-directory
   temporary-file writes with `fsync` and replacement.
4. Route resolved `.docx` chat references and attachment opens to the Office
   view when it is installed and enabled. Non-DOCX paths and an unavailable
   Office plugin keep the existing behavior.
5. Do not declare network domains. AI, accounts, remote services, MCP, new
   document creation, and Save As remain outside this first slice.

## Consequences

- PI reuses the maintained GenOffice editor rather than creating a second DOCX
  layout engine or a reduced editor.
- The generated renderer is a sizeable bundled asset and must be refreshed
  only from the pinned upstream commit after reviewing its browser/network
  boundary.
- The first slice is intentionally focused on opening and saving existing
  DOCX files. New-document and Save As flows need a PI-owned file-picker
  contract before they can be added safely.
- The plugin process owns a filesystem path jail, as allowed by the existing
  bundled file-manager precedent. A defect in that jail is a plugin security
  defect and must be fixed in the plugin rather than bypassed through a wider
  host permission.

## Alternatives considered

### Reimplement DOCX editing in PI-Desktop

Rejected. It duplicates GenOffice's OOXML parsing, layout, pagination, and
round-trip serialization work and creates a second compatibility surface.

### Embed the complete GenOffice Electron application

Rejected. It would introduce a second desktop lifecycle, native file-dialog
ownership, AI/account surfaces, and remote-service behavior inside PI.

### Vendor only the DOCX engine and write a new editor

Deferred. The engine is useful independently, but a new editor would not
deliver Word-like preview and pagination quickly enough for the first slice.
