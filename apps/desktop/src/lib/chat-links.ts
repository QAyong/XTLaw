/**
 * Detection and resolution of file/URL references in chat content so the
 * transcript can preview them: HTML in the work-panel browser, other files
 * with the OS default handler, URLs in the embedded browser.
 *
 * File detection is deliberately conservative: a bare token only counts as a
 * file when it carries a known extension, so ordinary dotted identifiers in
 * prose (`store.messages`) stay plain text. An extension is a short ASCII run,
 * and a token carrying a separator is a path whatever its extension: a
 * composer's `@` reference may carry Windows `\` separators, while a bare
 * prose token is scanned on `/` only. Documents, archives and media count as
 * known extensions too, because a chat attaches them. Explicit `@path` tokens
 * from the composer (D124 / D320) are accepted even when quoted or absolute.
 *
 * Path tokens recognize Unicode letters and digits, so non-ASCII filenames
 * (CJK above all) link exactly like ASCII ones. Absolute and `~/` tokens are
 * captured whole and then resolved by the same workspace rules: a path under
 * the root resolves normally, and one outside it — or any home path — stays
 * plain text instead of rendering a chip that could never open. An absolute
 * `@` token keeps its own spelling, so the chip and the attachment the file
 * was pasted as name the same path. Links still cannot escape the workspace
 * (D322).
 *
 * CJK prose runs into a reference with no separator (`看 @docs/a.md，然后呢`),
 * so an `@` token is chipped up to its reference — at the character a path
 * cannot carry, or at its extension — and the rest stays literal text.
 *
 * Relative paths are workspace-rooted unless they start with `./` or `../`,
 * in which case they resolve against an optional markdown-file directory and
 * still cannot escape the workspace (D322).
 */

const KNOWN_EXTS = new Set([
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "css", "scss", "less",
  "html", "htm", "md", "mdx", "txt", "rs", "py", "go", "rb", "sh", "zsh",
  "bash", "yml", "yaml", "toml", "sql", "swift", "kt", "java", "c", "h",
  "cpp", "hpp", "cs", "php", "vue", "svelte", "xml", "ini", "cfg", "conf",
  "env", "lock", "svg", "png", "jpg", "jpeg", "gif", "webp", "ico", "pdf",
  "csv", "tsv", "log",
  // A chat attaches documents, archives, media and screenshots as often as it
  // names source files, so those count as bare-name files too. Short word-like
  // extensions that read as prose (`ai`, `key`, `pages`, `numbers`) stay out.
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "rtf", "odt", "ods", "odp",
  "epub", "zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz",
  "mp3", "wav", "m4a", "flac", "aac", "ogg", "mp4", "mov", "mkv", "avi",
  "webm", "wmv", "bmp", "tif", "tiff", "heic", "psd",
]);

const KNOWN_BARE_NAMES = new Set([
  "Makefile",
  "Dockerfile",
  "LICENSE",
  "README",
  "CHANGELOG",
]);

const FILE_TOKEN_RE =
  /^(?:~\/|\/)?(?:\.{1,2}\/)?[\p{L}\p{N}_@+.-]+(?:\/[\p{L}\p{N}_@+.-]+)*(?::\d+(?::\d+)?)?$/u;

const AT_QUOTED_RE = /^@"([^"\n]+)"$/;
const AT_UNQUOTED_RE = /^@(\/?[^\s]+)$/;

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

/** A short ASCII extension; prose glued to a reference is not one. */
const EXT_RE = /^[a-z0-9]{1,8}$/;

function isLikelyFilePath(path: string): boolean {
  // A Windows separator is a separator: `C:\work\报告.docx` is as much a path
  // as `C:/work/报告.docx` and is resolved the same way.
  const normalized = path.replaceAll("\\", "/");
  const base = normalized.split("/").pop() ?? "";
  const dotIndex = base.lastIndexOf(".");
  const ext = dotIndex > 0 ? base.slice(dotIndex + 1).toLowerCase() : "";
  if (!EXT_RE.test(ext)) return KNOWN_BARE_NAMES.has(base);
  return normalized.includes("/") || KNOWN_EXTS.has(ext);
}

/**
 * Returns the cleaned path when `text` plausibly names a file (trailing
 * `:line[:col]` refs are stripped), otherwise null. A leading `@` — the
 * composer's file-reference sigil (D124) — is accepted and stripped so
 * `@src/a.ts` previews like `src/a.ts`.
 */
export function parseFileRef(text: string): string | null {
  let raw = text.trim();
  if (!raw || raw.length > 512) return null;
  if (raw.startsWith("@")) raw = raw.slice(1);
  if (!raw || !FILE_TOKEN_RE.test(raw)) return null;
  const path = stripLineRef(raw);
  return isLikelyFilePath(path) ? path : null;
}

/**
 * Unwrap a composer-serialized `@path` / `@"path with spaces"` token into the
 * canonical path. Quoted paths keep interior whitespace; unquoted tokens stop
 * at whitespace. Returns null when the token is not an `@` file reference.
 */
export function unwrapAtFileRef(text: string): string | null {
  const raw = text.trim();
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
 * fs panel IPC. Absolute paths must live under the workspace root.
 * Unprefixed relative paths are workspace-rooted. `./` and `../` resolve
 * against `baseDir` (the viewed markdown file's directory) when provided,
 * otherwise against the workspace root. `~`, parent escapes, and paths
 * outside the root return null.
 */
export function toWorkspaceRel(
  path: string,
  root?: string | null,
  baseDir?: string | null,
): string | null {
  if (!path) return null;
  if (path.startsWith("~")) return null;

  let rel: string;
  if (path.startsWith("/")) {
    if (!root) return null;
    const cleanRoot = root.replace(/\/+$/, "");
    if (path === cleanRoot) return null;
    if (!path.startsWith(cleanRoot + "/")) return null;
    rel = path.slice(cleanRoot.length + 1);
  } else if (isDotRelative(path)) {
    const base = (baseDir ?? "").replaceAll("\\", "/").replace(/\/+$/, "");
    rel = base ? `${base}/${path}` : path;
  } else {
    rel = path;
  }

  return normalizeWorkspaceRel(rel);
}

export type ChatPreviewTarget =
  | { kind: "file"; path: string }
  | { kind: "url"; url: string };

/** A Windows drive-absolute path, as the composer serializes one. */
const DRIVE_PATH_RE = /^[A-Za-z]:[\\/]/;

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
    // they keep the spelling the composer wrote: a Windows drive path stays
    // `C:\…`, so the chip names exactly the attachment it was pasted as.
    if (at.startsWith("/") || DRIVE_PATH_RE.test(at)) {
      return { kind: "file", path: at };
    }
    const rel = toWorkspaceRel(at, root, baseDir);
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
      /**
       * The scan shortened the token to reach this reference
       * (`看 @docs/a.md，然后呢`), so the chip is a guess about where the
       * reference ends. The transcript verifies it like a bare candidate
       * instead of trusting it the way an explicit composer ref is trusted.
       */
      trimmed?: true;
    };

// Unicode-aware scan (#235). `~`- and `/`-prefixed paths are captured whole
// so the resolver sees the real anchor: under-root absolutes resolve, while
// outside absolutes and home paths fail resolution and stay plain text
// instead of chipping a suffix that could never open. The extension tail
// uses `(?![A-Za-z0-9_])` rather than `\b`: in unicode mode `\b` treats CJK
// letters as word characters, which would stop `App.tsx文件` from linking.
const SCAN_RE =
  /@"[^"\n]+"|@[^\s]+|https?:\/\/(?=[^\s<>"'()[\]{}])|(?:~\/)?\/?\.{1,2}\/(?:[\p{L}\p{N}_@+.-]+\/)*[\p{L}\p{N}_@+.-]+(?::\d+(?::\d+)?)?|(?:~\/)?\/?(?:[\p{L}\p{N}_@+.-]+\/)+[\p{L}\p{N}_@+.-]+(?::\d+(?::\d+)?)?|[\p{L}\p{N}_@+-][\p{L}\p{N}_@+.-]*\.[A-Za-z0-9]{1,8}(?![A-Za-z0-9_])/gu;

/**
 * Characters a URL body may carry unescaped (RFC 3986 plus `%`). The scan
 * stops at the first character outside this set rather than at the next
 * whitespace, because CJK prose follows a pasted URL with no separator:
 * `https://host/doc，路径为桌面文件夹@C:\…` is one URL token in `SCAN_RE`, so
 * a whitespace-delimited scan linked the whole sentence — file reference
 * included — as a single URL (D320 keeps HTTP(S) URLs text links).
 * `'` `[` `]` `{` `}` stay out even though a URL may carry them, matching the
 * prose wrappers the transcript already treats as delimiters. A path that is
 * not percent-encoded therefore ends the link at its first non-ASCII
 * character; ASCII and percent-encoded CJK (`%E4%B8%AD`) stay whole.
 */
const URL_BODY_RE = /[A-Za-z0-9\-._~!$&()*+,;=:@/?#%]/;

/** Scan once, keeping URL parentheses but stopping at a closing prose wrapper. */
function scanUrl(text: string, start: number): string {
  let depth = 0;
  let end = start;
  for (; end < text.length; end += 1) {
    const character = text[end];
    if (character === "(") {
      depth += 1;
      continue;
    }
    if (character === ")") {
      if (depth === 0) break;
      depth -= 1;
      continue;
    }
    if (!URL_BODY_RE.test(character)) break;
  }
  // Sentence punctuation belongs to the surrounding prose, regardless of
  // whether the URL itself ends with a parenthesized path segment.
  return text.slice(start, end).replace(/[.,!?;:，。！？；：]+$/u, "");
}

/** Characters an `@` reference may carry between its separators, any script. */
const PATH_CHAR_RE = /[\p{L}\p{N}_@+.\-\\:/]/u;

/**
 * The reference candidates of one `@` token, longest first.
 *
 * CJK prose runs into a reference with no separator, and the composer's token
 * is everything up to the next space: `看 @docs/a.md，然后呢` names one file,
 * not a file called `a.md，然后呢`. A path cannot carry `，`, so that character
 * ends the reference, and an ASCII extension ends it when CJK letters follow
 * (`@docs/a.md然后`). The whole token is tried first, so a real name that does
 * carry those characters (`@报告（终稿）.md`) keeps resolving as itself.
 *
 * A candidate ending at a separator is a directory prefix, not the file the
 * writer named: `@C:\work\app.v2\说明，谢谢` must not chip `C:\work\app.v2`.
 */
function atTokenCandidates(raw: string): string[] {
  if (!raw.startsWith("@") || raw.startsWith('@"')) return [raw];
  const body = raw.slice(1);
  const candidates = [raw];
  const add = (candidate: string) => {
    if (candidate.length > 1 && !candidates.includes(candidate)) candidates.push(candidate);
  };
  let cut = 0;
  while (cut < body.length && PATH_CHAR_RE.test(body[cut])) cut += 1;
  if (cut > 0) add(`@${body.slice(0, cut)}`);
  const anchored = /^[\s\S]*?\.[A-Za-z0-9]{1,8}/.exec(body)?.[0];
  if (anchored && !/^[\\/]/.test(body.slice(anchored.length))) add(`@${anchored}`);
  return candidates;
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
  const scanner = new RegExp(SCAN_RE);
  for (let match = scanner.exec(text); match; match = scanner.exec(text)) {
    const start = match.index;
    const raw = /^https?:\/\//i.test(match[0])
      ? scanUrl(text, start)
      : match[0];
    scanner.lastIndex = start + raw.length;
    let used = raw;
    let target: ChatPreviewTarget | null = null;
    for (const candidate of atTokenCandidates(raw)) {
      const resolved = resolvePreviewTarget(candidate, root, baseDir);
      if (!resolved) continue;
      used = candidate;
      target = resolved;
      break;
    }
    if (!target) continue;
    if (used !== raw) scanner.lastIndex = start + used.length;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start) });
    const label =
      target.kind === "file" ? leafName(target.path) : used;
    segments.push({
      kind: "target",
      text: used,
      label,
      target,
      ...(used === raw ? {} : { trimmed: true as const }),
    });
    last = start + used.length;
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
 * The markdown URL of a file target.
 *
 * A relative path travels as itself, but an absolute one cannot travel as a
 * URL at all: react-markdown's transform and the rehype sanitize schema both
 * drop a value whose scheme they do not know, which left `C:\work\报告.docx`
 * as an inert link. Percent-encoding the whole path leaves a scheme-less
 * single segment that both layers keep, and the transcript's anchor decodes
 * it back before opening — the same trick local images already use.
 */
function markdownFileUrl(path: string): string {
  return /^(?:[a-z]:[\\/]|\/)/i.test(path) ? encodeURIComponent(path) : path;
}

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
              : markdownFileUrl(segment.target.path);
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
