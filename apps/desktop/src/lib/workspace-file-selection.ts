import { codeFenceFor } from "./selection-quote";

/** Keep a selected file excerpt from consuming the whole model context. */
export const MAX_WORKSPACE_FILE_SELECTION_CHARS = 12_000;

export type WorkspaceFileSelection = {
  path: string;
  text: string;
  startLine?: number;
  endLine?: number;
  language?: string | null;
};

function clipSelection(text: string): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n?/g, "\n").trim();
  if (normalized.length <= MAX_WORKSPACE_FILE_SELECTION_CHARS) {
    return { text: normalized, truncated: false };
  }

  const cut = normalized.slice(0, MAX_WORKSPACE_FILE_SELECTION_CHARS);
  // Do not leave a lone high surrogate at the end of the prompt.
  const whole = /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
  return { text: whole.trimEnd(), truncated: true };
}

function lineLabel(startLine?: number, endLine?: number): string {
  const valid =
    Number.isInteger(startLine) &&
    Number.isInteger(endLine) &&
    startLine! > 0 &&
    endLine! >= startLine!;
  if (!valid) return "selected content";
  return startLine === endLine
    ? `line ${startLine}`
    : `lines ${startLine}-${endLine}`;
}

function fileLocation(path: string, startLine?: number, endLine?: number): string {
  const valid =
    Number.isInteger(startLine) &&
    Number.isInteger(endLine) &&
    startLine! > 0 &&
    endLine! >= startLine!;
  if (!valid) return `@${path}`;
  return `@${path}:${startLine}${startLine === endLine ? "" : `-${endLine}`}`;
}

/**
 * Turn one explicit file selection into ordinary prompt text. The existing
 * Composer prefill path then handles draft retention, focus, and dispatch.
 */
export function serializeWorkspaceFileSelection({
  path,
  text,
  startLine,
  endLine,
  language,
}: WorkspaceFileSelection): string {
  const relativePath = path.trim();
  const clipped = clipSelection(text);
  if (!relativePath || !clipped.text) return "";

  const languageTag =
    language?.trim().replace(/[^A-Za-z0-9_+.-]/g, "") || "text";
  const fence = codeFenceFor(clipped.text);
  const body = [clipped.text];
  if (clipped.truncated) {
    body.push(
      "",
      `[Selection truncated after ${MAX_WORKSPACE_FILE_SELECTION_CHARS} characters.]`,
    );
  }

  return [
    "Here is selected content from a workspace file:",
    "",
    `File: ${relativePath} (${lineLabel(startLine, endLine)})`,
    `Location: ${fileLocation(relativePath, startLine, endLine)}`,
    "",
    `${fence}${languageTag}`,
    ...body,
    fence,
  ].join("\n");
}
