# Office DOCX plugin

> Status: Accepted for the first vertical slice
> Related: ADR 0283 · ADR 0104 · ADR 0241 · `E2E-OFFICE-docx-open-edit-save`

## Scope

PI-Desktop ships a bundled `pi.office` plugin for opening, previewing, and
editing existing `.docx` files in the work panel. The editor is the browser
renderer extracted from the pinned GenOffice commit recorded in
`apps/desktop/resources/plugins/pi.office/UPSTREAM.md`.

The first slice does not include GenOffice's Electron shell, AI providers,
accounts, remote services, MCP integrations, new-document creation, or Save As.
The host continues to own work-panel tabs and file-reference resolution; the
plugin owns DOCX parsing, rendering, editing, serialization, and file bytes.

## Desktop-shell exclusions

The PI Office view keeps GenOffice's editor commands intact while applying a
PI-owned compact toolbar layout. The category row is fixed and stays separate
from command navigation. The command row is a single compact line, including
nested paragraph, clipboard, table, and style controls, and uses fixed
left/right arrow controls to page through the command row at complete control
boundaries instead of exposing a bottom scrollbar. The work-panel tab shows the
opened DOCX filename, while the editor keeps its own Word commands below it.
The paging arrows are always present on the left and right edges of the command
row; they become disabled at the corresponding page boundary instead of
disappearing. Clicking the active category tab toggles the command row between
expanded and collapsed states; selecting another category keeps the command row
expanded and replaces its page content. Switching categories must not move or
remove the paging controls, cover the document title, or overlap the command
content.
PI also removes desktop-shell surfaces that are outside the plugin boundary:
the Genspark and other AI entry points, the assistant dock, the top-level file
tab and file pane, and document-tab window controls. The PI work-panel/file
manager remains the entry point for opening documents.

These visual integration rules live in the PI-owned
`views/pi-office-overrides.css`; the generated vendor renderer is not patched in
place.

## Runtime flow

```text
project file manager `.docx` click or chat/file attachment
  → host resolves the file reference
  → pi.office/editor work-panel tab
  → browser renderer calls pluginBridge
  → pi.office/main.js reads or atomically saves the DOCX
```

The work-panel location is a relative workspace path for the primary project
folder and an absolute path for a host-selected external or sibling-folder
file. The plugin resolves relative paths against `pi.workspace.get()` and
applies the same credential-path and containment checks to both forms.

## File lifecycle

- `office.read` returns bounded DOCX bytes plus path, size, mtime, SHA-256, and
  a paragraph-ID map indexed by the editor's internal document-body order. On
  the first read, the plugin preserves every existing Word `w14:paraId` and
  adds a unique eight-hex-digit ID to paragraphs that do not have one. This is
  an invisible OOXML metadata change, written atomically only after the file is
  re-read and its hash is confirmed unchanged. The returned hash is the hash
  of the normalized bytes that the editor actually opened.
- `office.save` applies the same paragraph-ID normalization before writing, so
  paragraphs introduced by an edit also receive native IDs.
- `office.save` refuses silent overwrite when any expected mtime, size, or hash
  differs from the opened file. A manual save may explicitly confirm an
  overwrite in the plugin view; autosave remains blocked on conflict.
- While a DOCX is open, the view checks the opened file fingerprint periodically
  and when the work-panel window regains focus. If the editor has no unsaved
  changes, an external disk update is reloaded through the existing GenOffice
  open lifecycle. If the editor is dirty, the view does not replace the
  in-memory document; autosave remains blocked and the existing save conflict
  flow remains authoritative.
- Text selected inside the DOCX editor reuses the file-view selection action
  pattern. The action keeps the same floating pill and inline comment editor,
  then sends the excerpt through `composer.addSelection` so it appears above
  the Composer as the same pending annotation used by Files and Browser. The
  annotation source carries the DOCX path, the opened-file SHA-256, and the
  native Word paragraph IDs for the selected paragraphs. The selected text is
  still included as the short human-readable context; the paragraph IDs are
  the machine-readable location an external DOCX tool can use.
- The DOCX anchor is resolved from the open editor's temporary `docxIndex` to
  the native paragraph-ID map at send time. The editor's block indexes,
  character offsets, page numbers, and block text are never sent as the
  location contract. The host validates the hash and every eight-hex-digit
  paragraph ID before it enters renderer-owned annotation state. Existing
  plugins may continue to send the older `{ file: { path, startLine?,
  endLine? } }` source shape.
- When the work-panel width changes, the view locks the currently visible page
  and its viewport offset while GenOffice recalculates fit-to-width zoom. The
  anchor is corrected in the rendering cycle throughout the resize and once
  after it settles; the lock is cancelled if the user starts a scroll or
  editing gesture during that interval.
- Writes go to a same-directory temporary file, call `fsync`, preserve the
  existing mode, and replace the destination.
- `office.recovery` stores a private crash-recovery copy under the plugin data
  directory and never writes beside the user's document.
- The plugin rejects non-DOCX paths, credential-like paths, directories, and
  files larger than 64 MiB.

## Compatibility boundary

The renderer page has no Node or Electron access. `views/bridge-shim.js`
implements only the subset of GenOffice's `window.desktop` contract needed for
open, edit, save, theme, locale, and lifecycle behavior. Unsupported desktop
features resolve to safe no-op or explicit unsupported results. The view CSP
blocks network connections and the manifest declares no network domains.

The host routes `.docx` chat references and attachment opens to `pi.office`
when its view is available, and otherwise preserves the existing file-tab
fallback. The bundled file manager uses the same host route when its read
action encounters a `.docx`, so opening a Word file from the project browser
enters the Office editor directly. Existing non-DOCX routing is unchanged.
