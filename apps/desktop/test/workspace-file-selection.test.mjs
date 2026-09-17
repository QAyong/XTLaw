import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const [helper, overlay, filesTab] = await Promise.all([
  read("../src/lib/workspace-file-selection.ts"),
  read("../src/components/workpanel/FileSelectionQuoteButton.tsx"),
  read("../src/components/workpanel/FilesTab.tsx"),
]);

test("workspace file selections serialize the selected content with source context", () => {
  assert.match(helper, /MAX_WORKSPACE_FILE_SELECTION_CHARS = 12_000/);
  assert.match(helper, /codeFenceFor\(clipped\.text\)/);
  assert.match(helper, /File: \$\{relativePath\} \(\$\{lineLabel\(startLine, endLine\)\}\)/);
  assert.match(helper, /Location: \$\{fileLocation\(relativePath, startLine, endLine\)\}/);
  assert.match(helper, /Selection truncated after \$\{MAX_WORKSPACE_FILE_SELECTION_CHARS\} characters/);
});

test("the file viewer action uses the live selection and never sends it directly", () => {
  assert.match(overlay, /activeSelectionRange\(\)/);
  assert.match(overlay, /range\.toString\(\)\.replace\(\/\\r\\n\?\/g, "\\n"\)\.trim\(\)/);
  assert.match(overlay, /window\.getSelection\(\)\?\.removeAllRanges\(\)/);
  assert.match(overlay, /data-testid="file-selection-quote"/);
  assert.match(overlay, /t\("chat\.addToChat"\)/);
  assert.doesNotMatch(overlay, /sendPrompt/);
  // Add to chat fills in a comment beside the passage instead of sending it.
  assert.match(overlay, /selection-quote is-comment/);
  assert.match(overlay, /file-selection-quote-comment-input/);
  assert.doesNotMatch(overlay, /openResponseAnnotationEditor/);
});

test("adding a file selection attaches the excerpt with the comment it collected", () => {
  // The excerpt becomes a pending comment item, not draft text: the file viewer
  // follows the same "Add to chat" contract as the transcript selection pill.
  assert.match(filesTab, /addResponseAnnotation\(\{/);
  assert.match(filesTab, /messageId: "",/);
  assert.match(filesTab, /comment: selection\.comment,/);
  assert.match(filesTab, /source: \{\s*file: \{\s*path: selected,/);
  assert.doesNotMatch(filesTab, /appendComposerDraftText\(/);
  assert.match(filesTab, /data-file-line-number=\{i \+ 1\}/);
  assert.match(filesTab, /serializeWorkspaceFileSelection\(/);
  assert.match(
    filesTab,
    /canAddToChat=\{Boolean\([\s\S]*?activeSessionId[\s\S]*?isWorkspaceRelativePath\(selected\)/,
  );
  assert.match(filesTab, /file\?\.kind === "text"/);
});
