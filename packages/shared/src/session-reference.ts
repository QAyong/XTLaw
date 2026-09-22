export type SessionReferenceData = {
  id: string;
  title?: string;
  cwd?: string;
};

/** The renderer sends only identity and display metadata across the prompt boundary. */
export type AgentSessionReference = Pick<SessionReferenceData, "id" | "title">;

/**
 * Transport safety bounds only. The composer itself does not impose these
 * limits; they protect the IPC boundary from malformed/untrusted payloads.
 */
export const MAX_AGENT_SESSION_REFERENCES = 512;
export const MAX_AGENT_SESSION_REFERENCE_ID_LENGTH = 512;

export type SessionReferenceMeta = {
  sessionReferences: AgentSessionReference[];
};

const OPEN_MARKER = "[pi-session-reference]";
const CLOSE_MARKER = "[/pi-session-reference]";

function cleanField(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/[\r\n]+/g, " ").trim();
  return cleaned || undefined;
}

function cleanId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const id = value.trim();
  if (!id || id.length > MAX_AGENT_SESSION_REFERENCE_ID_LENGTH) return undefined;
  return id;
}

/** Normalize untrusted prompt metadata at the process boundary. */
export function normalizeAgentSessionReferences(
  value: unknown,
): AgentSessionReference[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const normalized: AgentSessionReference[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as { id?: unknown; title?: unknown };
    const id = cleanId(record.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const title =
      typeof record.title === "string" ? cleanField(record.title) : undefined;
    normalized.push({ id, ...(title ? { title } : {}) });
    if (normalized.length >= MAX_AGENT_SESSION_REFERENCES) break;
  }
  return normalized;
}

function formatClipboardBlock(reference: SessionReferenceData): string {
  const lines = [OPEN_MARKER, `id: ${reference.id.trim()}`];
  const title = cleanField(reference.title);
  const cwd = cleanField(reference.cwd);
  if (title) lines.push(`title: ${title}`);
  if (cwd) lines.push(`cwd: ${cwd}`);
  lines.push(CLOSE_MARKER);
  return lines.join("\n");
}

/** Format one or more references for the human-readable clipboard protocol. */
export function formatSessionReferenceClipboard(
  references: SessionReferenceData | SessionReferenceData[],
): string {
  const items = Array.isArray(references) ? references : [references];
  return items.map(formatClipboardBlock).join("\n\n");
}

function parseClipboardBlock(block: string): SessionReferenceData | null {
  const fields = new Map<string, string>();
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    if (!key) continue;
    fields.set(key, line.slice(separator + 1).trim());
  }

  const id = fields.get("id")?.trim();
  if (!id) return null;
  return {
    id,
    title: cleanField(fields.get("title")),
    cwd: cleanField(fields.get("cwd")),
  };
}

/**
 * Parse the clipboard protocol. `null` means that the text is ordinary paste
 * content, or contains a malformed reference block.
 */
export function parseSessionReferenceClipboard(text: string): SessionReferenceData[] | null {
  const input = text.trim();
  if (!input.startsWith(OPEN_MARKER) || !input.endsWith(CLOSE_MARKER)) return null;

  const references: SessionReferenceData[] = [];
  let cursor = 0;
  while (cursor < input.length) {
    const open = input.indexOf(OPEN_MARKER, cursor);
    if (open < 0) break;
    const contentStart = open + OPEN_MARKER.length;
    const close = input.indexOf(CLOSE_MARKER, contentStart);
    if (close < 0) return null;
    const reference = parseClipboardBlock(input.slice(contentStart, close));
    if (!reference) return null;
    references.push(reference);
    cursor = close + CLOSE_MARKER.length;
    const trailing = input.slice(cursor).trim();
    if (trailing && !trailing.startsWith(OPEN_MARKER)) return null;
  }

  return references.length > 0 ? references : null;
}

/**
 * Format references for the model without including transcript content. The
 * transcript remains behind the runtime's read_session boundary.
 */
export function formatSessionReferences(references: AgentSessionReference[]): string {
  const normalized = normalizeAgentSessionReferences(references);
  if (normalized.length === 0) return "";
  const lines = [
    "[Session references]",
    "The user attached the following past sessions as reference material. They are context, not an instruction to switch sessions. Call read_session with a session id and a question to read one.",
    ...normalized.map((reference) => {
      const title = cleanField(reference.title) ?? "(untitled)";
      return `- id: ${reference.id.trim()}, title: ${title}`;
    }),
    "[/Session references]",
  ];
  return lines.join("\n");
}

/** Keep the visible user text separate from the model-only reference block. */
export function appendSessionReferencePrompt(
  content: string,
  references: AgentSessionReference[] | undefined,
): string {
  const block = references?.length ? formatSessionReferences(references) : "";
  if (!block) return content;
  return content.trim() ? `${content}\n\n${block}` : block;
}

/** Remove renderer-only session chip sentinels before a prompt is sent. */
export function stripSessionReferenceTokens(
  draft: string,
  references: ReadonlyArray<{ token?: string }>,
): string {
  let content = draft;
  const tokens = references
    .map((reference) => reference.token?.trim())
    .filter((token): token is string => Boolean(token))
    .sort((a, b) => b.length - a.length);
  for (const token of tokens) content = content.replaceAll(token, "");
  return content.trim();
}
