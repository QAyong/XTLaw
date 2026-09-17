import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ANNOTATION_MARKER_SCHEME,
  chatUrlTransform,
} from "../src/lib/markdown-url.ts";

const markdownSource = await readFile(
  new URL("../src/components/Markdown.tsx", import.meta.url),
  "utf8",
);

test("chatUrlTransform keeps windows drive-letter and rooted paths", () => {
  // The default urlTransform reads the drive letter as a protocol and blanks
  // the href, which left the anchor with nothing to open.
  for (const value of [
    "D:/pi Agent/PI-Desktop/src/a.ts",
    "C:\\Users\\x\\notes.md",
    "/rooted/notes.md",
  ]) {
    assert.equal(chatUrlTransform(value), value, value);
  }
});

test("chatUrlTransform keeps values that carry no scheme", () => {
  for (const value of [
    "apps/desktop/src/a.ts",
    "./x.md",
    "../spec/00-baseline.md",
    "docs/guide",
    "src/main.rs:42",
    "#section",
  ]) {
    assert.equal(chatUrlTransform(value), value, value);
  }
});

test("chatUrlTransform keeps the schemes the chat can open", () => {
  for (const value of [
    "https://example.com/a?b=1#c",
    "http://localhost:5173/",
    "mailto:someone@example.com",
    "annotation:3",
    `${ANNOTATION_MARKER_SCHEME}12`,
    "HTTPS://example.com",
  ]) {
    assert.equal(chatUrlTransform(value), value, value);
  }
});

test("chatUrlTransform blanks executing and unknown schemes", () => {
  for (const value of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:x",
    "blob:https://x/y",
    "file:///etc/passwd",
    "about:blank",
    // The allowlist covers schemes we cannot vouch for too, not just these.
    "ftp://example.com/a",
    "chrome://settings",
  ]) {
    assert.equal(chatUrlTransform(value), "", value);
  }
});

test("chatUrlTransform sees through control-character obfuscation", () => {
  for (const value of [
    " javascript:alert(1)",
    "  javascript:alert(1)  ",
    "java\nscript:alert(1)",
    "java\tscript:alert(1)",
    "\u0000javascript:alert(1)",
    "java\rscript:alert(1)",
    "d\u007fata:text/html,<script>",
  ]) {
    assert.equal(chatUrlTransform(value), "", JSON.stringify(value));
  }
});

test("chatUrlTransform handles empty and odd input without throwing", () => {
  assert.equal(chatUrlTransform(""), "");
  assert.equal(chatUrlTransform("   "), "");
  for (const value of ["\u0000", ":", ":::", "a".repeat(4096), "汉 字.md", "-x:1"]) {
    assert.equal(typeof chatUrlTransform(value), "string");
  }
});

test("the annotation marker scheme is defined once and shared", () => {
  assert.equal(ANNOTATION_MARKER_SCHEME, "annotation:");
  // Markdown.tsx keeps its exported helpers but owns no second definition.
  assert.doesNotMatch(markdownSource, /^(?:export )?const ANNOTATION_MARKER_SCHEME/m);
  assert.match(
    markdownSource,
    /import\s*\{[^}]*\bANNOTATION_MARKER_SCHEME\b[^}]*\}\s*from\s*"\.\.\/lib\/markdown-url";/,
  );
});

test("the markdown renderer passes the explicit url transform", () => {
  assert.match(markdownSource, /urlTransform=\{chatUrlTransform\}/);
  assert.match(
    markdownSource,
    /import\s*\{[^}]*\bchatUrlTransform\b[^}]*\}\s*from\s*"\.\.\/lib\/markdown-url";/,
  );
});

test("an unresolvable anchor click reports instead of falling through", () => {
  const start = markdownSource.indexOf(
    "const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {",
  );
  const end = markdownSource.indexOf("return (", start);
  assert.ok(start >= 0 && end > start, "Anchor onClick not found");
  const onClick = markdownSource.slice(start, end);

  // The href guard stays, but it is no longer the only outcome: the tail after
  // the workspace resolution has to do something visible.
  assert.match(onClick, /if \(!href\) return;/);
  assert.match(onClick, /const rel = toWorkspaceRel\(safeDecodeUri\(href\), root, baseDir\);/);
  assert.match(onClick, /if \(rel\) \{/);
  assert.match(onClick, /openFileRef\(rel, baseDir\);/);
  // An unresolved href never reaches openFileRef, where main could fuzzy-match
  // an unrelated same-named file.
  assert.equal((onClick.match(/openFileRef\(/g) ?? []).length, 1);
  assert.match(
    onClick,
    /showToast\(\s*t\("chat\.fileRefMissing", \{ name: safeDecodeUri\(href\) \}\),\s*\{\s*variant: "error",?\s*\},?\s*\);/,
  );
  // The report is the last thing the handler does, so nothing falls through to
  // the target="_blank" popup main denies.
  assert.match(onClick, /chat\.fileRefMissing[\s\S]*?\n\s*\};\s*$/);
});
