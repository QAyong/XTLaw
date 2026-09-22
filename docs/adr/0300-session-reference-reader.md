# ADR 0300: Read referenced sessions through a local auxiliary tool

- Status: Accepted for implementation
- Date: 2026-09-22
- Deciders: PI-Desktop core
- Related: ADR 0011 (host-owned storage and RPC), ADR 0120 (bounded session history windows)

## Context

The composer needs to let a user point the agent at another conversation
without copying that conversation into the active model context. A direct
transcript injection would leak unrelated history into the parent request,
make large sessions expensive, and turn arbitrary historical text into model
instructions. The host remains the only owner of canonical session data.

## Decision

1. The sidebar copies a structured `[pi-session-reference]` block containing
   the session id and display metadata. The renderer turns pasted blocks into
   atomic chips, deduplicates by session id, and stores only `{ id, title }`
   in the prompt transport and durable user-message metadata.
2. The Node runtime exposes a built-in `read_session` tool in every mode. A
   tool call is accepted only for an id explicitly present in the current
   user turn, and the current session is always rejected. The host permission
   classifier treats the tool as low risk and contract modes allow it as a
   read-only capability.
3. `read_session` reads the canonical transcript through host-core's
   `session.get` RPC. It requests the complete default read and follows host
   pagination as needed; there is no product-visible page, message, or
   character cap. Only visible user and assistant text is retained. Tool
   payloads, thinking, and image data stay outside the auxiliary context.
4. The reader asks an independent auxiliary model to answer a focused
   question. It reuses the configured subagent provider when available and
   falls back to the current model. The auxiliary request derives its input
   and output budgets from the selected model's actual context window and
   output capacity, segments large transcripts, and recursively merges
   summaries. Historical transcript text is marked as untrusted evidence.
   The parent receives only the extracted answer and structured read details.
5. On replay, persisted `sessionReferences` metadata reconstitutes the
   model-only reference block while the visible user message remains clean.
   A missing reference is represented by a gray renderer chip; archived
   sessions remain valid and readable until deleted.

## Consequences

- The parent model never receives the raw referenced transcript, so one
  session cannot silently enlarge or steer another session's context.
- A reference read adds an auxiliary model request and may require several
  passes for a large transcript; the returned details make that work
  observable for diagnostics.
- The open JSON message metadata remains backward-compatible and needs no
  schema migration. Older messages simply have no reference metadata.
- Durable queued prompts reuse the existing JSON payload column for reference
  metadata, while legacy attachment-only rows remain readable without a
  migration.
- The feature is deliberately not supported by native Pi sessions, whose
  continuation contract is text-only.

## Alternatives rejected

- Injecting the selected transcript directly into the parent context was
  rejected because it violates the cross-session data boundary and has no
  safe, model-aware budget for large history.
- Making the renderer read sessions and summarize them was rejected because
  it would bypass host-core persistence ownership and move agent execution
  into the renderer.

## Validation

Shared protocol tests cover normalization, model-only prompt formatting, and
renderer-token removal. Runtime tests cover visible-line filtering,
model-budget segmentation, auxiliary extraction, and host-read accounting.
Host-core tests cover metadata round-tripping. The desktop E2E scenario is
documented separately and remains pending until an explicitly authorized E2E
run.
