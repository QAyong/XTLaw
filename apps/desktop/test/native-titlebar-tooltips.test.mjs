import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const source = (relativePath) =>
  readFileSync(join(here, "../src", relativePath), "utf8");

function tooltipButtonBlock(contents, marker) {
  const markerIndex = contents.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Expected to find ${marker}`);
  const start = contents.lastIndexOf("<TooltipButton", markerIndex);
  const end = contents.indexOf("</TooltipButton>", markerIndex);
  assert.ok(start >= 0 && end >= markerIndex, `Expected a TooltipButton for ${marker}`);
  return contents.slice(start, end);
}

test("work-area tooltips use native titles while other tooltips avoid native surfaces", () => {
  const ui = source("components/ui.tsx");
  assert.match(ui, /nativeTooltip\?: boolean/);
  assert.match(ui, /nativeTooltip \? "" : label/);
  assert.match(ui, /title=\{nativeTooltip \? label : undefined\}/);
  assert.match(ui, /!nativeTooltip && tooltip\.open && tooltip\.position/);
  assert.match(ui, /subscribeNativeSurfaceRects/);
  assert.match(ui, /overlapArea\(candidate, width, height, surface\)/);
  assert.match(ui, /const belowTop = position\.bottom/);
  assert.match(ui, /surface\.left - width - margin/);
  assert.match(ui, /surface\.right \+ margin/);
  assert.match(ui, /candidateShift < preferredShift/);

  const pluginView = source("components/workpanel/PluginViewTab.tsx");
  assert.match(pluginView, /setNativeSurfaceRect\(/);
  assert.match(pluginView, /setNativeSurfaceRect\(occlusionId, null\)/);

  const sidebar = tooltipButtonBlock(
    source("components/Sidebar.tsx"),
    'data-nav="toggle-sidebar"',
  );
  assert.doesNotMatch(sidebar, /nativeTooltip/);

  const chrome = source("features/app/chrome.tsx");
  assert.match(chrome, /nativeTooltip\?: boolean/);
  assert.equal((chrome.match(/nativeTooltip=\{nativeTooltip\}/g) ?? []).length, 2);

  const workPanel = source("components/workpanel/WorkPanel.tsx");
  for (const className of ["work-panel-new-tab", "work-panel-maximize"]) {
    assert.match(tooltipButtonBlock(workPanel, `className="${className}"`), /nativeTooltip/);
  }

  const shell = source("features/app/AppShell.tsx");
  assert.match(
    shell,
    /sidebarLeadingActions=[\s\S]*?<CollapsedTitlebarActions[\s\S]*?nativeTooltip/,
  );
  assert.match(
    tooltipButtonBlock(shell, 'className="app-chat-work-layout-toggle no-drag"'),
    /nativeTooltip=\{workAreaToolbarOverlaid\}/,
  );
  assert.match(
    tooltipButtonBlock(shell, 'className="app-work-panel-toggle no-drag"'),
    /nativeTooltip=\{workAreaToolbarOverlaid\}/,
  );
  assert.match(shell, /<WindowControls nativeTooltip=\{workAreaToolbarOverlaid\} \/>/);

  const windowControls = source("components/WindowControls.tsx");
  assert.equal((windowControls.match(/nativeTooltip=\{nativeTooltip\}/g) ?? []).length, 3);
});
