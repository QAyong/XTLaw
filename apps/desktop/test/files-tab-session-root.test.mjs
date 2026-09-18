import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/**
 * Source contract for the Files tab of a path-less conversation (ADR 0270):
 * with no project open it browses the session's own scratch directory
 * (ADR 0124), and every project-shaped path stays exactly as it was.
 */
const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [filesTab, apiClient] = await Promise.all([
  read("../src/components/workpanel/FilesTab.tsx"),
  read("../src/lib/api.ts"),
]);

test("the files tab falls back to the session scratch directory as its root", () => {
  assert.match(filesTab, /const root = workspace\?\.path \?\? sessionRootPath;/);
  assert.match(
    filesTab,
    /const usingSessionRoot = !workspace\?\.path && Boolean\(sessionRootPath\);/,
  );
});

test("a resolved scratch path only counts for the session that owns it", () => {
  // A session switch must not serve the previous conversation's directory
  // while the next one is still loading (ADR 0270).
  assert.match(
    filesTab,
    /sessionRoot && sessionRoot\.sessionId === activeSessionId\s*\?\s*sessionRoot\.path\s*:\s*null;/,
  );
  assert.match(
    filesTab,
    /setSessionRoot\(path \? \{ sessionId: activeSessionId, path \} : null\);/,
  );
});

test("the session scratch path is resolved only while no project is open", () => {
  // A project conversation must not even ask for a scratch directory.
  assert.match(
    filesTab,
    /if \(workspace\?\.path \|\| !activeSessionId\) \{\s*setSessionRoot\(null\);\s*return;\s*\}/,
  );
  assert.match(
    filesTab,
    /const res = await api\.getSessionScratchPath\(activeSessionId\);/,
  );
  assert.match(filesTab, /}, \[workspace\?\.path, activeSessionId\]\);/);
});

test("the session id reaches list, read and reveal only for that fallback", () => {
  const sessionIds = filesTab.match(
    /const sessionId = usingSessionRoot \? \(activeSessionId \?\? undefined\) : undefined;/g,
  );
  assert.equal(sessionIds?.length, 2);
  assert.match(filesTab, /if \(!root\) return;/);
  assert.match(filesTab, /api\.fsList\(rel, sessionId\)/);
  assert.match(filesTab, /api\.fsRead\(rel, mimeType, sessionId\)/);
  assert.match(
    filesTab,
    /void api\.fsReveal\(\s*selected,\s*usingSessionRoot \? \(activeSessionId \?\? undefined\) : undefined,\s*\)/,
  );
});

test("a chat file request outside the tree opens without a tree root", () => {
  assert.match(filesTab, /if \(!fileRequest\) return;/);
  assert.match(filesTab, /if \(!root && !isExternal\) return;/);
  assert.match(
    filesTab,
    /handledFileRequestSeq = fileRequest\.seq;\s*if \(!isExternal\) \{/,
  );
});

test("the viewer renders before the empty no-workspace state", () => {
  const viewerAt = filesTab.indexOf("if (selected !== null) {");
  const noWorkspaceAt = filesTab.indexOf('t("panel.files.noWorkspace")');
  assert.ok(viewerAt > -1, "the viewer branch is present");
  assert.ok(noWorkspaceAt > -1, "the no-workspace state is present");
  assert.ok(
    viewerAt < noWorkspaceAt,
    "a file opened without a tree root still renders",
  );
});

test("the api wrappers forward the session id only when it is defined", () => {
  assert.match(
    apiClient,
    /fsList: \(path\?: string, sessionId\?: string\) =>\s*invoke<\{ entries: FsEntry\[\] \}>\(IPC\.invoke\.fsList, \{\s*path: path \?\? "",\s*\.\.\.\(sessionId \? \{ sessionId \} : \{\}\),\s*\}\)/,
  );
  assert.match(
    apiClient,
    /fsRead: \(path: string, mimeType\?: string, sessionId\?: string\) =>\s*invoke<FsReadResult>\(IPC\.invoke\.fsRead, \{\s*path,\s*\.\.\.\(mimeType \? \{ mimeType \} : \{\}\),\s*\.\.\.\(sessionId \? \{ sessionId \} : \{\}\),\s*\}\)/,
  );
  assert.match(
    apiClient,
    /fsReveal: \(path: string, sessionId\?: string\) =>\s*invoke\(IPC\.invoke\.fsReveal, \{\s*path,\s*\.\.\.\(sessionId \? \{ sessionId \} : \{\}\),\s*\}\)/,
  );
});
