import { readAppSource } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const sidebarSource = await readFile(
  new URL("../src/components/Sidebar.tsx", import.meta.url),
  "utf8",
);
const appSource = await readAppSource();
const globalStyles = await loadStyles();

test("the sidebar exposes an accessible pointer and keyboard resize handle", () => {
  assert.match(sidebarSource, /className=\{cx\("sidebar-resize-handle no-drag"/);
  assert.match(sidebarSource, /role="separator"/);
  assert.match(sidebarSource, /aria-orientation="vertical"/);
  assert.match(appSource, /loadSidebarWidth\(\)/);
  assert.match(appSource, /saveSidebarWidth\(nextWidth\)/);
  assert.match(sidebarSource, /onPointerDown=\{startSidebarResize\}/);
  assert.match(sidebarSource, /onPointerMove=\{moveSidebarResize\}/);
  assert.match(sidebarSource, /onPointerCancel=\{cancelSidebarResize\}/);
  assert.match(sidebarSource, /onLostPointerCapture=\{cancelSidebarResize\}/);
  assert.match(sidebarSource, /requestAnimationFrame\(\(\) =>/);
  assert.match(sidebarSource, /event\.key === "ArrowRight"/);
  assert.match(sidebarSource, /event\.key === "Home"/);
  assert.match(sidebarSource, /finishSidebarResize\(true\)/);
});

test("sidebar width is shell-owned and the resize affordance is edge-anchored", () => {
  assert.match(appSource, /loadSidebarWidth\(\)/);
  assert.match(appSource, /saveSidebarWidth\(nextWidth\)/);
  assert.match(appSource, /"--ds-sidebar-width": `\$\{sidebarWidth\}px`/);
  assert.match(globalStyles, /\.sidebar\s*\{[\s\S]*?position:\s*relative/);
  assert.match(globalStyles, /\.sidebar-resize-handle\s*\{[\s\S]*?right:\s*0;[\s\S]*?cursor:\s*col-resize/);
  assert.match(globalStyles, /\.sidebar-resize-handle\s*\{[\s\S]*?touch-action:\s*none/);
});

test("sidebar resize divider matches the work-panel edge feedback", () => {
  const marker = globalStyles.match(
    /\.sidebar-resize-handle::after\s*\{[^}]+\}/s,
  )?.[0] ?? "";

  assert.match(marker, /inset-block:\s*0;/);
  assert.match(marker, /right:\s*0;/);
  assert.match(marker, /width:\s*1px;/);
  assert.match(marker, /background:\s*var\(--ds-border-default\)/);
  assert.doesNotMatch(marker, /height:\s*32px/);
  assert.doesNotMatch(marker, /opacity:\s*0/);
  const interactiveDivider = globalStyles.match(
    /\.sidebar-resize-handle:hover::after,[\s\S]*?\.sidebar-resize-handle\.is-resizing::after\s*\{[^}]*\}/,
  )?.[0];
  assert.ok(interactiveDivider);
  assert.match(interactiveDivider, /width:\s*2px/);
  assert.match(interactiveDivider, /background:\s*var\(--ds-focus\)/);
  assert.doesNotMatch(globalStyles, /\.sidebar:hover\s+\.sidebar-resize-handle::after/);
  assert.match(
    globalStyles,
    /\.sidebar-resize-handle:focus-visible\s*\{[^}]*outline:\s*none/s,
  );
});

test("the chat reserves one row for unsqueezed composer controls", () => {
  assert.match(
    globalStyles,
    /\.main-pane\s*\{[\s\S]*?min-width:\s*var\(--ds-main-pane-min-width, 450px\);/,
  );
  assert.match(
    globalStyles,
    /\.composer-toolbar\s*\{[\s\S]*?flex-wrap:\s*nowrap;/,
  );
  assert.match(
    globalStyles,
    /\.composer-left,\s*\.composer-right\s*\{[\s\S]*?flex:\s*0 0 auto;/,
  );
  assert.match(
    globalStyles,
    /\.mode-chip\s*\{[\s\S]*?white-space:\s*nowrap;/,
  );
  assert.match(
    globalStyles,
    /\.mode-chip > span\s*\{[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
  );
});
