# ADR 0231: Ideographic Comma Opens the Composer Slash Menu

- Status: Accepted
- Date: 2026-09-11
- Deciders: PI-Desktop desktop UI maintainers
- Amends: D123, D139, ADR 0024

## Context

The composer `/` menu mirrors the pi CLI grammar: the trigger is the ASCII `/`
as the very first character of the draft. A Chinese IME produces `、` (U+3001,
ideographic comma) for that keystroke, so a user writing in Chinese has to
switch to ASCII input before they can reach the command menu, then switch back.
The menu already ignores in-flight IME composition (D139), so the missing piece
is only the alias itself.

Every other trigger character in the grammar is deliberate: `@` opens the file
menu, and a `/` anywhere but the first character is ordinary prose. The alias
must not turn legitimate punctuation into commands.

## Decision

1. A `、` committed as the first character of an empty composer draft is
   rewritten to `/` before trigger detection runs. Afterwards the draft is an
   ordinary slash invocation: the same menu opens, the same filtering applies,
   and the same send path handles it.
2. Only that position is rewritten. The composer requires the draft to have been
   empty before the keystroke, so a `、` that appears later — including at the
   start of a draft that already holds text — stays ordinary punctuation.
3. The rewrite is a pure string function in the shared composer-trigger module,
   unit tested next to the trigger grammar it feeds. The `@` file menu is
   unaffected.

## Consequences

- A Chinese IME user reaches `/new`, `/compact`, the mode aliases, template
  commands, plugin commands, and Skills without leaving the input method.
- A message that genuinely starts with `、` in an empty composer is rewritten.
  The menu opens with `/` and the user can keep typing prose, which keeps the
  substitution visible instead of silently altering text mid-sentence.
- No IPC, storage, or autocomplete-source change is required.

## Alternatives considered

- **Accept `、` as an additional trigger character in `detectTrigger`:** rejected
  because the draft would keep a character the send path and transcript chip
  would then have to understand, and the menu would open on a mark the pi CLI
  grammar does not define.
- **Rewrite on every `、`, not just the first character:** rejected because it
  would corrupt ordinary prose, where `、` is the standard list separator.
- **A toolbar button for commands:** rejected as a duplicate entry point to a
  menu that already exists (see D123).

## Amendment (D447, 2026-09-19) — `、` is the leading slash trigger

The alias was implemented only as a rewrite of the committed input event, gated
on the draft having been empty and relying on the renderer repainting the
editable before trigger detection ran. That covered a narrower set of states
than `/` itself: a draft that already held text, and any input path whose
rewrite did not reach the editable, left the mark as ordinary punctuation with
the menu closed.

1. `detectTrigger` accepts `、` as the same command-mode trigger as `/`: either
   character opens the menu as the first character of the draft while the
   cursor is still inside that first whitespace-free token. The alternative
   rejected below — "accept `、` as an additional trigger character" — is
   therefore adopted for detection, and one rule now serves both characters.
2. Its stated objection is answered by leaving the insertion path unchanged:
   accepting a row still inserts `/name `, so the draft, the transcript chip,
   and the send path only ever see an ordinary slash invocation.
3. The leading mark is still normalized to `/` on input, which keeps a typed
   `、new` sending the same slash invocation as before. That normalization is no
   longer restricted to a previously empty draft; the position rule — first
   character of the draft, no whitespace before the cursor — is now the only
   condition, which is exactly the condition `/` follows.
4. A `、` anywhere else in the draft remains ordinary punctuation, and the `@`
   file menu still never reacts to the mark.
