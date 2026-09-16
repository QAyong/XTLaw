import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadStyles } from "./helpers/styles.mjs";

const stylesSource = await loadStyles();
const panelSource = await readFile(
  new URL("../src/components/workpanel/WorkPanel.tsx", import.meta.url),
  "utf8",
);

function styleBlock(selector) {
  return stylesSource.match(new RegExp(`(?:^|\\n)${selector} \\{[^}]*\\}`))?.[0] ?? "";
}

test("shell titlebar surfaces share the toolbar metric and borderless surface", () => {
  for (const selector of [
    "\\.main-titlebar",
    "\\.conversation-topbar",
    "\\.settings-titlebar",
  ]) {
    const block = styleBlock(selector);
    assert.match(block, /height:\s*var\(--ds-toolbar-height\);/);
    assert.match(block, /background:\s*var\(--ds-bg-primary\);/);
    assert.match(block, /border-bottom:\s*0;/);
  }
});

test("window chrome reserves the same titlebar height and native control band", () => {
  const controls = styleBlock("\\.window-controls");
  assert.match(controls, /height:\s*var\(--ds-toolbar-height\);/);
  assert.match(controls, /width:\s*var\(--ds-window-controls-width\);/);
  assert.match(stylesSource, /--ds-window-controls-width:\s*120px;/);
  assert.match(stylesSource, /--ds-toolbar-height:\s*46px;/);
});

test("window control hit targets match their visible button boxes", () => {
  const controls = styleBlock("\\.window-control-btn");
  assert.match(
    controls,
    /width:\s*var\(--ds-work-panel-toggle-size\);[^}]*height:\s*var\(--ds-work-panel-toggle-size\);/s,
  );
  assert.match(
    controls,
    /flex:\s*0 0 var\(--ds-work-panel-toggle-size\);/,
  );
  assert.match(controls, /border-radius:\s*var\(--radius-md\);/);
  assert.match(controls, /line-height:\s*0;/);
  assert.match(
    stylesSource,
    /\.window-controls\s*\{[^}]*justify-content:\s*flex-end;[^}]*gap:\s*4px;/s,
  );
});

test("window control band draws no boundary of its own", () => {
  // D297: the band paints only its active titlebar surface; no side seam.
  const controls = styleBlock("\\.window-controls");
  assert.doesNotMatch(controls, /border-bottom:/);
  assert.doesNotMatch(controls, /border-left/);
  assert.match(controls, /background:\s*var\(--ds-bg-primary\);/);
  assert.match(
    stylesSource,
    /\.app-shell:has\(\.work-panel\) \.window-controls\s*\{[^}]*background:\s*var\(--ds-bg-dock-raised\);/s,
  );
});

test("sidebar and work-panel headers use the shared toolbar metric", () => {
  assert.match(styleBlock("\\.sidebar-header"), /height:\s*var\(--ds-toolbar-height\);/);
  assert.match(styleBlock("\\.sidebar-header"), /flex:\s*0 0 var\(--ds-toolbar-height\);/);
  assert.match(styleBlock("\\.work-panel-header"), /height:\s*var\(--ds-toolbar-height\);/);
  assert.match(
    styleBlock("\\.settings-content"),
    /padding:\s*calc\(var\(--ds-toolbar-height\) \+ 8px\) 48px 56px 40px;/,
  );
});

test("work-panel header spans the full dock while its drag region stops before window controls", () => {
  const header = styleBlock("\\.work-panel-header");
  const dragRegion = styleBlock("\\.work-panel-header-drag-region");

  assert.doesNotMatch(header, /margin-right:/);
  assert.match(header, /-webkit-app-region:\s*no-drag;/);
  assert.match(dragRegion, /inset:\s*0;/);
  assert.match(dragRegion, /-webkit-app-region:\s*drag;/);
  assert.match(
    stylesSource,
    /:root\[data-platform="win32"\] \.work-panel-header,[\s\S]*?:root\[data-platform="linux"\] \.work-panel-header\s*\{[^}]*padding-right:\s*calc\([\s\S]*?var\(--ds-window-controls-width\)/,
  );
  assert.match(
    stylesSource,
    /:root\[data-platform="win32"\] \.work-panel-header-drag-region,[\s\S]*?:root\[data-platform="linux"\] \.work-panel-header-drag-region\s*\{[^}]*right:\s*var\(--ds-window-controls-width\);/,
  );
  assert.match(
    panelSource,
    /<div className="work-panel-header-drag-region" aria-hidden="true" \/>/,
  );
});
