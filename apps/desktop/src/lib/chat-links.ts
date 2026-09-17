/**
 * Detection and resolution of file/URL references in chat content so the
 * transcript can preview them: HTML in the work-panel browser, other files
 * with the OS default handler, URLs in the embedded browser.
 *
 * File detection is deliberately conservative: a bare token only counts as a
 * file when it carries a known extension, so ordinary dotted identifiers in
 * prose (`store.messages`) stay plain text. Explicit `@path` tokens from the
 * composer (D124 / D320) are accepted even when quoted or absolute.
 *
 * Path tokens recognize Unicode letters and digits, so non-ASCII filenames
 * (CJK above all) link exactly like ASCII ones. Absolute and `~/` tokens are
 * captured whole and then resolved by the same workspace rules: a path under
 * the root resolves normally, and one outside it — or any home path — stays
 * plain text instead of rendering a chip that could never open. Links still
 * cannot escape the workspace (D322).
 *
 * Relative paths are workspace-rooted unless they start with `./` or `../`,
 * in which case they resolve against an optional markdown-file directory and
 * still cannot escape the workspace (D322).
 *
 * Windows-shaped paths are first-class here. `\` separators are normalized to
 * `/`, a drive path (`C:\…`, `D:/…`) is an absolute path like any other, and a
 * token that starts at the workspace root is captured whole even when the root
 * itself contains spaces: `D:\pi Agent\PI-Desktop\src\a.ts` used to be cut into
 * a tail chip (`Agent/…` or just `a.ts`) that previewed a *different* file.
 * Two boundaries stay as they were: a path outside the root is still plain
 * text (#235), and a bare token mid-prose may not contain spaces — a file name
 * with spaces travels as the composer's quoted `@"path with spaces"` token, or
 * as a whole token inside inline code.
 */

const KNOWN_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "css", "scss", "less",
  "html", "htm", "md", "mdx", "txt", "rs", "py", "go", "rb", "sh", "zsh",
  "bash", "yml", "yaml", "toml", "sql", "swift", "kt", "java", "c", "h",
  "cpp", "hpp", "cs", "php", "vue", "svelte", "xml", "ini", "cfg", "conf",
  "env", "lock", "svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "pdf",
  "csv", "tsv", "log",
]);

const KNOWN_BARE_NAMES = new Set([
  "Makefile",
  "Dockerfile",
  "LICENSE",
  "README",
  "CHANGELOG",
]);

/** The bare names as a regex alternation, for the root-anchored scan below. */
const BARE_NAME_SOURCE = [...KNOWN_BARE_NAMES].join("|");

const FILE_TOKEN_RE =
  /^(?:[A-Za-z]:\/)?(?:~\/|\/)?(?:\.{1,2}\/)?[\p{L}\p{N}_@+.-]+(?:\/[\p{L}\p{N}_@+.-]+)*(?::\d+(?::\d+)?)?$/u;

const AT_QUOTED_RE = /^@\"([^\"\n]+)\"$/;
const AT_UNQUOTED_RE = /^@(\/?[^\s]+)$/;

/** Chat tokens may use either separator; this module works in POSIX form. */
function toPosixPath(value: string): string {
  return String(value ?? "").replaceAll("\\", "/");
}

/** `C:/x`, `D:\x`, or `/x` — an absolutely anchored path token. */
function isAbsoluteChatPath(value: string): boolean {
  return value.startsWith("/") || /^[A-Za-z]:\//.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The part of `posixPath` below `root`, or null when it is not below it. The
 * comparison tolerates either separator and either letter case: the host may
 * report the root With backslashes (`D:\pi Agent\PI-Desktop`) and Windows and
 * macOS both compare paths case-insensitively. A host whose filesystem is
 * case-sensitive (Linux) only widens the net here — the main process still
 * completes the reference against real files before anything opens.
 */
function relativeUnderRoot(posixPath: string, root: string): string | null {
  const cleanRoot = toPosixPath(root).replace(/\/+$/, "");
  if (!cleanRoot) return null;
  const prefix = `${cleanRoot}/`;
  if (posixPath.startsWith(prefix)) return posixPath.slice(prefix.length);
  return posixPath.toLowerCase().startsWith(prefix.toLowerCase())
    ? posixPath.slice(prefix.length)
    : null;
}

export function isHttpUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim());
}

export function isHtmlFilePath(path: string): boolean {
  return /\.html?$/i.test(path);
}

function stripLineRef(path: string): string {
  return path.replace(/:\d+(?::\d+)?$/, "");
}

function leafName(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || path;
}

function isLikelyFilePath(path: string): boolean {
  const base = path.split("/").pop() ?? "";
  const dotIndex = base.lastIndexOf(".");
  const ext = dotIndex > 0 ? base.slice(dotIndex + 1).toLowerCase() : "";
  if (path.includes("/")) {
    if (ext && ext.length <= 8) return true;
    if (KNOWN_BARE_NAMES.has(base)) return true;
    return false;
  }
  if (KNOWN_BARE_NAMES.has(base)) return true;
  return KNOWN_EXTS.has(ext);
}

/**
 * Returns the cleaned path when `text` plausibly names a file (trailing
 * `:line[:col]` refs are stripped), otherwise null. A leading `@` — the
 * composer's file-reference sigil (D124) — is accepted and stripped so
 * `@src/a.ts` previews like `src/a.ts`. `\` separators are accepted and
 * normalized, so a Windows path previews like its POSIX spelling.
 */
export function parseFileRef(text: string): string | null {
  let raw = toPosixPath(text.trim());
  if (!raw || raw.length > 512) return null;
  if (raw.startsWith("@")) raw = raw.slice(1);
  if (!raw || !FILE_TOKEN_RE.test(raw)) return null;
  const path = stripLineRef(raw);
  return isLikelyFilePath(path) ? path : null;
}

/**
 * Unwrap a composer-serialized `@path` / `@\"path with spaces\"` token into the
 * canonical path. Quoted paths keep interior whitespace; unquoted tokens stop
 * at whitespace. Returns null when the token is not an `@` file reference.
 */
export function unwrapAtFileRef(text: string): string | null {
  const raw = toPosixPath(text.trim());
  if (!raw || raw.length > 512) return null;
  const quoted = raw.match(AT_QUOTED_RE);
  if (quoted) {
    const path = stripLineRef(quoted[1]);
    return path && isLikelyFilePath(path) ? path : null;
  }
  const unquoted = raw.match(AT_UNQUOTED_RE);
  if (unquoted) {
    const path = stripLineRef(unquoted[1]);
    return path && isLikelyFilePath(path) ? path : null;
  }
  return null;
}

/** Parent directory of a workspace-relative (or POSIX) file path. */
export function fileDirOf(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index <= 0 ? "" : normalized.slice(0, index);
}

export function safeDecodeUri(value: string): string {
  try {
    return decodeURI(value);
  } catch {
    return value;
  }
}

function isDotRelative(path: string): boolean {
  return (
    path === "." ||
    path === ".." ||
    path.startsWith("./") ||
    path.startsWith("../")
  );
}

/** Collapse `.` / `..` and reject any walk that leaves the workspace. */
function normalizeWorkspaceRel(path: string): string | null {
  const segments: string[] = [];
  for (const segment of path.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.length > 0 ? segments.join("/") : null;
}

/**
 * Map a chat-mentioned path onto a workspace-relative path accepted by the
 * fs panel IPC. Absolute paths — POSIX (`/…`) or Windows (`C:\…`, `D:/…`) —
 * must live under the workspace root. Unprefixed relative paths are
 * workspace-rooted. `./` and `../` resolve against `baseDir` (the viewed
 * markdown file's directory) when provided, otherwise against the workspace
 * root. `~`, parent escapes, and paths outside the root return null.
 */
export function toWorkspaceRel(
  path: string,
  root?: string | null,
  baseDir?: string | null,
): string | null {
  if (!path) return null;
  const posix = toPosixPath(path);
  if (posix.startsWith("~")) return null;

  let rel: string;
  if (isAbsoluteChatPath(posix)) {
    if (!root) return null;
    const under = relativeUnderRoot(posix, root);
    if (under === null) return null;
    rel = under;
  } else if (isDotRelative(posix)) {
    const base = toPosixPath(baseDir ?? "").replace(/\/+$/, "");
    rel = base ? `${base}/${posix}` : posix;
  } else {
    rel = posix;
  }

  return normalizeWorkspaceRel(rel);
}

export type ChatPreviewTarget =
  | { kind: "file"; path: string }
  | { kind: "url"; url: string };

/** Resolve one raw chat token into a previewable target, or null. */
export function resolvePreviewTarget(
  text: string,
  root?: string | null,
  baseDir?: string | null,
): ChatPreviewTarget | null {
  const trimmed = text.trim();
  if (isHttpUrl(trimmed)) return { kind: "url", url: trimmed };
  const at = unwrapAtFileRef(trimmed);
  if (at) {
    // Scratch/attachment @refs stay absolute so fs/open can contain them, and
    // a drive path names an absolute location the same way.
    if (isAbsoluteChatPath(at)) return { kind: "file", path: at };
    const rel = toWorkspaceRel(at, root, baseDir);
    return rel ? { kind: "file", path: rel } : null;
  }
  // A whole token that is an absolute path under the root is exact evidence,
  // and it is the one shape the conservative parse below cannot spell when the
  // root contains spaces (`D:\pi Agent\…`). Outside the root it stays plain
  // text, exactly as before (#235).
  const posix = toPosixPath(trimmed);
  if (isAbsoluteChatPath(posix)) {
    const path = stripLineRef(posix);
    if (!path || path.length > 512 || !isLikelyFilePath(path)) return null;
    const rel = toWorkspaceRel(path, root, baseDir);
    return rel ? { kind: "file", path: rel } : null;
  }
  const file = parseFileRef(trimmed);
  if (!file) return null;
  const rel = toWorkspaceRel(file, root, baseDir);
  return rel ? { kind: "file", path: rel } : null;
}

/** Tool-call args → preview target (Read/Write/Edit paths, fetch URLs). */
export function getToolPreviewTarget(
  args: unknown,
  root?: string | null,
): ChatPreviewTarget | null {
  if (!args || typeof args !== "object") return null;
  const record = args as Record<string, unknown>;
  for (const key of ["path", "file_path", "filePath"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      const rel = toWorkspaceRel(value.trim(), root);
      if (rel) return { kind: "file", path: rel };
      return null;
    }
  }
  const url = record["url"];
  if (typeof url === "string" && isHttpUrl(url)) {
    return { kind: "url", url: url.trim() };
  }
  return null;
}

export type ChatTextSegment =
  | { kind: "text"; text: string }
  | {
      kind: "target";
      text: string;
      /** Compact leaf label for file chips; the raw token for URLs. */
      label: string;
      target: ChatPreviewTarget;
    };

// Unicode-aware scan (#235). `~`- and `/`-prefixed paths are captured whole
// so the resolver sees the real anchor: under-root absolutes resolve, while
// outside absolutes and home paths fail resolution and stay plain text
// instead of chipping a suffix that could never open. The extension tail
// uses `(?![A-Za-z0-9_])` rather than `\b`: in unicode mode `\b` treats CJK
// letters as word characters, which would stop `App.tsx文件` from linking.
const SCAN_RE =
  /@"[^"\n]+"|@[^\s]+|https?:\/\/[^\s<>"'()[\]{}]+|(?:~\/)?\/?\.{1,2}\/(?:[\p{L}\p{N}_@+.-]+\/)*[\p{L}\p{N}_@+.-]+(?::\d+(?::\d+)?)?|(?:~\/)?\/?(?:[\p{L}\p{N}_@+.-]+\/)+[\p{L}\p{N}_@+.-]+(?::\d+(?::\d+)?)?|[\p{L}\p{N}_@+-][\p{L}\p{N}_@+.-]*\.[A-Za-z0-9]{1,8}(?![A-Za-z0-9_])/gu;

/** Roots change when a project opens; a handful of compiled patterns suffice. */
const scanPatternCache = new Map<string, RegExp>();

/**
 * The prose scan, extended with a root-anchored alternative whenever the
 * workspace root is known.
 *
 * `SCAN_RE` stops at the first space, so a path whose root contains one
 * (`D:\pi Agent\PI-Desktop\src\a.ts`) was matched as its tail — a chip that
 * pointed at another file, or at nothing. Anchoring at the literal root fixes
 * that without loosening anything else: only a real root prefix can start this
 * alternative, and only its leaf segment must be space-free, so the prose that
 * follows a path is never swallowed. Because the alternative is the first
 * capture group and `SCAN_RE` has no groups of its own, `match[1]` says which
 * one fired.
 */
function scanPattern(root?: string | null): RegExp {
  const cleanRoot = root ? toPosixPath(root).replace(/\/+$/, "") : "";
  const cached = scanPatternCache.get(cleanRoot);
  if (cached) return cached;

  const leaf =
    `(?:[\\p{L}\\p{N}_@+-][\\p{L}\\p{N}_@+.-]*\\.[A-Za-z0-9]{1,8}|${BARE_NAME_SOURCE})(?![A-Za-z0-9_])`;
  const anchored = cleanRoot
    ? `(${escapeRegExp(cleanRoot).replaceAll("/", "[\\\\/]")}` +
      `[\\\\/](?:[^\\\\/\\n]*[\\\\/])*?${leaf}(?::\\d+(?::\\d+)?)?)`
    : null;
  const pattern = new RegExp(
    anchored ? `${anchored}|(?:${SCAN_RE.source})` : SCAN_RE.source,
    // Case-insensitive so a lowercased drive letter or `HTTPS://` still scans;
    // the converter below is what decides, this only widens the candidate set.
    "giu",
  );

  if (scanPatternCache.size >= 8) scanPatternCache.clear();
  scanPatternCache.set(cleanRoot, pattern);
  return pattern;
}

/**
 * A static match that only caught the tail of a backslash path
 * (`…\src\lib\api.ts` → `api.ts`) would preview a different file, so a match
 * glued to a backslash or to a drive prefix stays literal text. It is not a
 * previewable reference; it is the middle of one that the token scan cannot
 * spell (a path outside the root, or a spaced root with no workspace open).
 */
function isPathTailFragment(text: string, start: number): boolean {
  const before = text.slice(0, start);
  if (before.endsWith("\\")) return true;
  return /[A-Za-z]:\\?$/.test(before);
}

/** A whole token that starts at the workspace root: exact, spaces included. */
function anchoredPathTarget(
  text: string,
  root?: string | null,
  baseDir?: string | null,
): ChatPreviewTarget | null {
  const path = stripLineRef(toPosixPath(text));
  if (!path || path.length > 512) return null;
  const rel = toWorkspaceRel(path, root, baseDir);
  return rel ? { kind: "file", path: rel } : null;
}

/**
 * Split plain chat text (user messages) into literal runs and previewable
 * references. Unresolvable candidates stay literal text. File targets carry a
 * leaf-name `label` so the transcript can render composer-like chips (D320).
 */
export function splitChatText(
  text: string,
  root?: string | null,
  baseDir?: string | null,
): ChatTextSegment[] {
  const segments: ChatTextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(scanPattern(root))) {
    const anchored = match[1];
    const raw = match[0];
    const start = match.index ?? 0;
    if (!anchored && isPathTailFragment(text, start)) continue;
    const target = anchored
      ? anchoredPathTarget(anchored, root, baseDir)
      : resolvePreviewTarget(raw, root, baseDir);
    if (!target) continue;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start) });
    const label =
      target.kind === "file" ? leafName(target.path) : raw;
    segments.push({ kind: "target", text: raw, label, target });
    last = start + raw.length;
  }
  if (segments.length === 0) return [{ kind: "text", text }];
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

/** Minimal mdast node the markdown rewriter understands. */
export type MdastNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MdastNode[];
};

const SKIP_MDAST = new Set([
  "code",
  "inlineCode",
  "link",
  "image",
  "definition",
  "html",
]);

/**
 * Turn bare file/URL tokens in markdown phrasing into link nodes so the
 * existing markdown Anchor handler can preview them. Skips fenced code,
 * inline code, and existing links/images.
 */
export function linkifyMdastTree(
  tree: MdastNode | null | undefined,
  root?: string | null,
  baseDir?: string | null,
): void {
  walk(tree, false);

  function walk(node: MdastNode | null | undefined, skip: boolean) {
    if (!node || typeof node.type !== "string") return;
    const nextSkip = skip || SKIP_MDAST.has(node.type);
    if (!node.children) return;
    const next: MdastNode[] = [];
    for (const child of node.children) {
      if (!child || typeof child.type !== "string") continue;
      if (!nextSkip && child.type === "text" && typeof child.value === "string") {
        const segments = splitChatText(child.value, root, baseDir);
        if (segments.length === 1 && segments[0].kind === "text") {
          next.push(child);
          continue;
        }
        for (const segment of segments) {
          if (segment.kind === "text") {
            next.push({ type: "text", value: segment.text });
            continue;
          }
          const url =
            segment.target.kind === "url"
              ? segment.target.url
              : segment.target.path;
          next.push({
            type: "link",
            url,
            children: [{ type: "text", value: segment.text }],
          });
        }
        continue;
      }
      walk(child, nextSkip);
      next.push(child);
    }
    node.children = next;
  }
}

/**
 * unified attacher for the chat file-link pass. `ReactMarkdown` / unified
 * call the plugin with options at freeze time and expect a transformer
 * back; returning the transformer itself makes unified invoke it with
 * `tree === undefined` and crash on `tree.type` when a session paints.
 */
export function remarkChatFileLinks(
  root?: string | null,
  baseDir?: string | null,
) {
  return function remarkChatFileLinksPlugin() {
    return (tree: MdastNode) => {
      linkifyMdastTree(tree, root, baseDir);
    };
  };
}
