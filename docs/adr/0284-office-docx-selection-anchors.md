# ADR 0284: Carry native DOCX paragraph anchors through Add to chat

- Status: Accepted
- Date: 2026-09-19
- Deciders: PI-Desktop core
- Related: ADR 0283, ADR response-annotations, `07-plugins/03-plugin-api.md`,
  `07-plugins/17-office-docx-plugin.md`

## Context

The first `pi.office` slice already embeds the GenOffice DOCX renderer, but its
selection companion reduced a selection to plain text and sent it through
`composer.appendDraft`. That path bypassed the shared Add to chat annotation
surface and gave an AI editing the disk file no document-level address.

The renderer exposes a temporary `docxIndex` for its top-level body blocks. That
index is useful only inside the renderer: it can change when the editor parses
or rewrites a document and is not a portable address for another DOCX tool.
WordprocessingML has a native paragraph identifier, `w14:paraId`, which can be
used by an Office-aware CLI without depending on the renderer's coordinates.

## Decision

1. Office selection actions reuse the existing `composer.addSelection` contract
   and the compact comment-card behavior of the original selection surface. The
   isolated Office page owns its DOM action pill and comment input; it does not
   open GenOffice's AI panel or change the visible document as part of
   selection.
2. The file source gains an additive `docx` anchor containing the opened-file
   SHA-256 and a bounded, unique `paragraphIds` array of native Word
   `w14:paraId` values. The selected text remains the human-readable context.
   Renderer-only block indexes, character offsets, page numbers, and block text
   are not part of the AI-facing location contract.
3. On `office.read`, the plugin preserves existing paragraph IDs and adds a
   unique eight-hex-digit `w14:paraId` to every missing paragraph in the DOCX
   XML parts. The one-time metadata-only update is written atomically after a
   hash recheck; the editor and the selection anchor use the normalized bytes.
   `office.save` repeats the same normalization for paragraphs introduced by
   editing.
4. The bridge maps the renderer's temporary `docxIndex` to the native ID map
   only at the moment the user submits Add to chat. If a selected block has no
   native paragraph ID, the action refuses to send an ambiguous location.
5. The host validates the document hash and every paragraph ID before storing
   the annotation. A future Office-aware mutation adapter must verify the hash
   and resolve the paragraph IDs against the latest DOCX before writing; this
   ADR does not grant a plugin permission to write or silently merge files.
6. The bridge exposes the fingerprint and paragraph-ID map through the
   additive `window.desktop.getCurrentDocxState()` method. DOCX bytes remain
   behind the existing plugin lifecycle and file-safety boundary.

## Alternatives considered

- GenOffice block indexes and character offsets: rejected because they are
  renderer coordinates and are not a stable, cross-tool DOCX address.
- File path plus a text search: rejected because repeated paragraphs are
  ambiguous and a changed file can make the search target the wrong occurrence.
- DOCX bookmarks or new custom XML: rejected because selection should not add a
  visible or application-owned document marker when Word already provides a
  paragraph identifier.

## Consequences

- Office selections use the same pending annotation contract as Files and
  Browser while preserving each isolated surface's local compact comment card.
- The next prompt contains both the bounded excerpt and a machine-readable
  document anchor. An Office-aware CLI can locate the selected paragraph by
  its native ID.
- This is an additive plugin API extension and does not change the host
  protocol version, storage schema, file write permissions, or DOCX save path.
- Opening a legacy DOCX may update its ZIP/XML bytes once, but the change is
  invisible in Word and is protected by atomic writing and a hash recheck.
- Signed DOCX files that would require normalization are refused rather than
  silently invalidating their signature.
