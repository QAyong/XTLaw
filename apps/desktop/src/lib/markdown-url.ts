/**
 * The URL policy the chat transcript hands to react-markdown as `urlTransform`.
 *
 * react-markdown's default transform only vouches for a fixed protocol list
 * (http/https/irc/ircs/mailto/xmpp) and empties every other href. That default
 * is wrong for this transcript in two ways:
 *
 * - a Windows drive-letter destination (`D:/pi Agent/PI-Desktop/src/a.ts`) is
 *   read as the protocol `D:` and blanked, so the anchor loses its href and the
 *   click handler has nothing left to resolve;
 * - the inline annotation markers travel on the chat's own
 *   `annotation:<n>` scheme, which the default does not know either, so every
 *   marker href was dropped before `Anchor` could turn it into a numbered
 *   reference.
 *
 * So this runs as an allowlist: known-safe schemes, rooted and relative paths
 * survive unchanged; everything else — the executing schemes (`javascript:`,
 * `data:`, `vbscript:`, `blob:`, `file:`, `about:`) and any scheme we cannot
 * vouch for — becomes an empty href. Unknown values without a scheme prefix are
 * kept, because a bare `apps/desktop/src/a.ts` or `#section` is a path, not a
 * protocol. Control characters are stripped before the decision, so
 * `"java\nscript:alert(1)"` cannot smuggle a scheme past the check.
 *
 * Pure module: no React and no browser globals, so it is unit-tested directly.
 */

/** Href scheme the annotation markers travel on through the markdown pipeline. */
export const ANNOTATION_MARKER_SCHEME = "annotation:";

/** ASCII control characters, including NUL and DEL, used for obfuscation. */
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/** A Windows drive-letter absolute path (`D:/x`, `C:\x`), not a protocol. */
const DRIVE_LETTER_PATH = /^[A-Za-z]:[\\/]/;

/** A leading `scheme:` prefix, per RFC 3986's scheme grammar. */
const SCHEME_PREFIX = /^([A-Za-z][A-Za-z0-9+.-]*):/;

/**
 * Schemes this transcript actually opens. `annotation` is the chat's own marker
 * scheme; the rest are the destinations main hands to the OS or the embedded
 * browser.
 */
const ALLOWED_SCHEMES = new Set(["http", "https", "mailto", "annotation"]);

/**
 * ReactMarkdown `urlTransform`: return the url when it is safe to keep, `""`
 * when it must not become an href. Never throws.
 */
export function chatUrlTransform(value: string): string {
  // Defensive: react-markdown always passes a string, but an odd caller must
  // not be able to make this throw.
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CONTROL_CHARS, "").trim();
  if (!cleaned) return "";
  // Drive letters and rooted paths are filesystem destinations, not protocols.
  if (DRIVE_LETTER_PATH.test(cleaned) || cleaned.startsWith("/")) return value;
  const match = SCHEME_PREFIX.exec(cleaned);
  // No scheme prefix at all: a relative path, `./x.md`, `../y`, or `#section`.
  if (!match) return value;
  return ALLOWED_SCHEMES.has(match[1].toLowerCase()) ? value : "";
}
