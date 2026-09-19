import { readStoreSourceSync } from "./helpers/source-contracts.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

/**
 * Bundled plugins (ADR 0104, ADR 0241).
 *
 * The point of shipping a panel surface as a plugin rather than host code is
 * that it proves the public contribution channel is sufficient. The file view
 * is now a vendored third-party plugin — the artifact the marketplace also
 * publishes — so these assertions guard both halves of that claim: it must be
 * an ordinary plugin any third party could have written, and the copy in this
 * repository must stay traceable to the release it came from.
 */

const read = (path) => readFileSync(resolve(path), "utf8");
const FILE_MANAGER = "resources/plugins/pi.file-manager";
const manifest = JSON.parse(read(`${FILE_MANAGER}/manifest.json`));
const fileManagerMain = read(`${FILE_MANAGER}/main.js`);
const view = read(`${FILE_MANAGER}/views/index.html`);
const viewBundle = read(`${FILE_MANAGER}/views/assets/index.js`);
const selectionActions = read(`${FILE_MANAGER}/views/selection-actions.js`);
const browserPicker = read("electron/main/browser-element-picker.ts");
const upstream = read(`${FILE_MANAGER}/UPSTREAM.md`);
const panelSource = read("src/components/workpanel/WorkPanel.tsx");
const hostProcessSource = read("electron/main/host-process.ts");
const packageJson = JSON.parse(read("package.json"));
const OFFICE = "resources/plugins/pi.office";
const officeManifest = JSON.parse(read(`${OFFICE}/manifest.json`));
const officeView = read(`${OFFICE}/views/index.html`);
const officeOverrides = read(`${OFFICE}/views/pi-office-overrides.css`);
const officeBridge = read(`${OFFICE}/views/bridge-shim.js`);
const officeSelectionActions = read(`${OFFICE}/views/selection-actions.js`);
const officeLayoutStability = read(`${OFFICE}/views/layout-stability.js`);
const officeMain = read(`${OFFICE}/main.js`);
const officeParagraphIds = read(`${OFFICE}/docx-paragraph-ids.cjs`);
const officeUpstream = read(`${OFFICE}/UPSTREAM.md`);
const officePackage = JSON.parse(read(`${OFFICE}/package.json`));

test("the file view ships as an ordinary plugin, not a privileged one", () => {
  assert.equal(manifest.id, "pi.file-manager");
  assert.deepEqual(manifest.contributes.views.map((v) => v.id), ["manager"]);
  // Exactly the permissions a third party would have to declare for the same
  // capability — nothing host-only.
  assert.deepEqual([...manifest.permissions].sort(), ["fs.read", "ui.view"]);
  assert.equal(manifest.fs.read.root, "workspace");
  assert.deepEqual(manifest.fs.read.scope, ["**"]);
  // A localized title, because the panel menu shows it to the user.
  assert.equal(typeof manifest.contributes.views[0].title.en, "string");
  assert.equal(typeof manifest.contributes.views[0].title["zh-CN"], "string");
  // Vendored from an MIT-licensed repository, so the license travels with it.
  assert.equal(manifest.license, "MIT");
  assert.ok(existsSync(resolve(`${FILE_MANAGER}/LICENSE`)));
});

test("the file view is a sandboxed page over the public bridge", () => {
  // The two host-mediated actions, and the plugin's own panel channels. All of
  // them are public SDK surface: the page can reach nothing else.
  for (const channel of ["fs.openDefault", "fs.reveal", "fm.read", "fm.write"]) {
    assert.ok(
      viewBundle.includes(channel),
      `expected the view to call ${channel} over the bridge`,
    );
  }
  // Add to chat opens the host's comment editor: the view sends the excerpt
  // together with the file it came from instead of typing it into the draft.
  assert.match(selectionActions, /composer\.addSelection/);
  assert.match(selectionActions, /path: state\.path,/);
  assert.match(selectionActions, /clipboard\.writeText/);
  assert.match(viewBundle, /pluginBridge/);
  // No Node, no Electron, no host internals: it is a sandboxed page.
  assert.doesNotMatch(view, /require\(|import\s+.*from\s+["']node:|ipcRenderer/);
  assert.doesNotMatch(viewBundle, /require\(|ipcRenderer/);
  // The titlebar height is read, not hard-coded, so the same file also works
  // in a detached panel window.
  assert.match(viewBundle, /var\(--pi-plugin-titlebar-height, 0px\)/);
  assert.match(view, /meta name="pi-plugin-chrome" content="v2"/);
});

test("the file view routes DOCX reads to the Office work panel", () => {
  assert.match(fileManagerMain, /openWorkPanelFile/);
  assert.match(
    fileManagerMain,
    /application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document/,
  );
});

test("the Office view is a browser-only DOCX plugin over the public bridge", () => {
  assert.equal(officeManifest.id, "pi.office");
  assert.deepEqual(officeManifest.contributes.views.map((v) => v.id), ["editor"]);
  assert.deepEqual(officeManifest.permissions, ["ui.view"]);
  assert.equal(officeManifest.net, undefined);
  assert.equal(officePackage.type, "commonjs");
  assert.match(officeView, /bridge-shim\.js/);
  assert.match(officeView, /pi-office-overrides\.css/);
  assert.match(officeView, /selection-actions\.js/);
  assert.match(officeView, /layout-stability\.js/);
  assert.ok(
    officeView.indexOf("./assets/index-JQsJMU5H.css") <
      officeView.indexOf("./pi-office-overrides.css"),
    "PI Office overrides must load after the vendor stylesheet",
  );
  assert.match(officeOverrides, /\.ribbon-group:has\(\.ai-entry\)/);
  assert.match(officeOverrides, /\.rb-big:has\(\.ai-feature-icon\)/);
  assert.match(officeOverrides, /data-tip\*="AI"/);
  assert.match(officeOverrides, /\.ai-dock/);
  assert.match(officeOverrides, /\.ai-ask-pop/);
  assert.match(officeOverrides, /\.ctx-item:has\(\.copilot-badge\)/);
  assert.match(officeOverrides, /\.file-tab-wrap/);
  assert.match(officeOverrides, /\.files-edge-tab/);
  assert.match(officeOverrides, /button\[data-tip="文件"\]/);
  assert.match(officeOverrides, /\.files-pane/);
  assert.match(officeOverrides, /新建标签/);
  assert.match(officeOverrides, /切换标签/);
  assert.match(officeOverrides, /display: none !important/);
  assert.match(officeView, /connect-src 'none'/);
  assert.match(officeBridge, /office\.read/);
  assert.match(officeBridge, /office\.save/);
  assert.match(officeBridge, /getCurrentDocxPath/);
  assert.match(officeBridge, /getCurrentDocxState/);
  assert.match(officeBridge, /office\.checkConflict/);
  assert.match(officeBridge, /metadataOnly: true/);
  assert.match(officeBridge, /setInterval\(\(\) =>/);
  assert.match(officeBridge, /state\.dirty/);
  assert.match(officeBridge, /paragraphIds/);
  assert.match(officeSelectionActions, /\.ProseMirror/);
  assert.match(officeSelectionActions, /composer\.addSelection/);
  assert.match(officeSelectionActions, /__aidocs/);
  assert.match(officeSelectionActions, /docxIndex/);
  assert.match(officeSelectionActions, /paragraphIds/);
  assert.match(officeSelectionActions, /documentHash/);
  assert.match(officeSelectionActions, /commentPlaceholder/);
  assert.doesNotMatch(officeSelectionActions, /blockIndexes|blockTypes|blockText|startOffset\s*:|endOffset\s*:/);
  assert.match(officeLayoutStability, /pageAnchor/);
  assert.match(officeLayoutStability, /restoreAnchor/);
  assert.match(officeLayoutStability, /scheduleResizeLock/);
  assert.match(officeLayoutStability, /lastResizeAt/);
  assert.match(officeLayoutStability, /overflowAnchor/);
  assert.match(officeBridge, /aidocs\.showFiles/);
  assert.match(officeBridge, /aidocs\.showAi/);
  assert.doesNotMatch(officeBridge, /installAdaptiveRibbon/);
  assert.doesNotMatch(officeBridge, /piOfficeOverflow/);
  assert.doesNotMatch(officeBridge, /require\(|ipcRenderer/);
  assert.doesNotMatch(officeView, /require\(|ipcRenderer/);
  assert.match(officeMain, /mtimeMs/);
  assert.match(officeMain, /expectedHash/);
  assert.match(officeMain, /payload\?\.metadataOnly === true/);
  assert.match(officeMain, /handle\.sync\(\)/);
  assert.match(officeMain, /ensureDocxParagraphIds/);
  assert.match(officeParagraphIds, /w14:paraId/);
  assert.match(officeUpstream, /PI-owned stylesheet/);
  assert.match(officeUpstream, /d1280d153362071de433a6439ca31585af4af8f7/);
});

test("the vendored copy stays traceable to its upstream release", () => {
  assert.match(upstream, /github\.com\/Tioit-Wang\/pi-desktop-plugin-file-manager/);
  assert.match(upstream, /d36ebe9f7fb82ee71e87670b0a65403660b18a00/);
  // The version the manifest carries and the tag the record names are the same
  // release: a bump that skips the other one is a sync mistake.
  const tag = upstream.match(/`v(\d+\.\d+\.\d+)`/);
  assert.ok(tag, "UPSTREAM.md must name the vendored tag");
  assert.equal(manifest.version, tag[1]);
  // Every vendored file has its current checksum recorded, so a silent edit
  // cannot pass as the released artifact. Local patches are listed above.
  for (const file of [
    "main.js",
    "README.md",
    "views/index.html",
    "views/assets/index.js",
    "views/selection-actions.js",
  ]) {
    const hash = createHash("sha256")
      .update(readFileSync(resolve(`${FILE_MANAGER}/${file}`)))
      .digest("hex");
    assert.ok(
      upstream.includes(hash),
      `expected UPSTREAM.md to record the ${file} checksum`,
    );
  }
});

test("the host no longer bundles the old Files plugin", () => {
  // Its view is what this plugin replaced. host-core drops the stale registry
  // row through `drop_missing_builtin` on the first launch after the swap.
  assert.equal(existsSync(resolve("resources/plugins/pi.files")), false);
});

test("the host no longer offers Files or Browser as built-in tools", () => {
  assert.doesNotMatch(panelSource, /const HEADER_TOOLS/);
  assert.doesNotMatch(panelSource, /kind: "browser"/);
  assert.doesNotMatch(panelSource, /kind: "terminal"/);
  // Review and file remain artifact/resource surfaces the conversation opens.
  assert.match(panelSource, /activeTab\?\.kind === "file"/);
  assert.match(panelSource, /activeTab\?\.kind === "review"/);
});

test("Review still opens itself from workspace edit artifacts", () => {
  // Removing the launcher entry must not remove the way Review appears at all.
  const storeSource = readStoreSourceSync();
  assert.match(storeSource, /shouldOpenReviewArtifact\(\{/);
  assert.match(storeSource, /toolWorkPanelTab\("review"\)/);
});

test("Browser ships as an ordinary plugin over the public CDP API", () => {
  const browserManifest = JSON.parse(read("resources/plugins/pi.browser/manifest.json"));
  const browserMain = read("resources/plugins/pi.browser/main.js");
  const browserView = read("resources/plugins/pi.browser/views/browser.html");
  assert.equal(browserManifest.id, "pi.browser");
  assert.deepEqual(browserManifest.contributes.views.map((v) => v.id), ["browser"]);
  assert.deepEqual(
    [...browserManifest.permissions].sort(),
    ["agent.tool.register", "browser.cdp", "ui.view"],
  );
  assert.equal(typeof browserManifest.contributes.views[0].title.en, "string");
  assert.equal(typeof browserManifest.contributes.views[0].title["zh-CN"], "string");
  assert.match(browserMain, /pi\.agent\.registerTool/);
  assert.match(browserMain, /pi\.browser\.(navigate|snapshot|cdp)/);
  assert.match(browserView, /pluginBridge/);
  assert.match(browserView, /browser\.setBounds/);
  assert.match(browserView, /browser\.setElementPicker/);
  assert.match(browserView, /browser\.getElementPicker/);
  assert.match(browserPicker, /selection-quote/);
  assert.doesNotMatch(browserView, /require\(|ipcRenderer|webview/);
});

test("Browser declares plan-safe actions for Plan-mode URL inspection (ADR 0211)", () => {
  const browserMain = read("resources/plugins/pi.browser/main.js");
  // The planSafeActions list must be declared on the registered tool.
  assert.match(browserMain, /planSafeActions\s*:\s*PLAN_SAFE_ACTIONS/);
  // The list itself must declare the four read-only actions the user needs.
  assert.match(
    browserMain,
    /PLAN_SAFE_ACTIONS\s*=\s*\[\s*"navigate"\s*,\s*"snapshot"\s*,\s*"screenshot"\s*,\s*"console"\s*\]/,
  );
  // The mutating actions must NOT appear in PLAN_SAFE_ACTIONS, otherwise
  // Plan mode would be able to click/fill/evaluate arbitrary pages.
  const planSafeMatch = browserMain.match(/PLAN_SAFE_ACTIONS\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(planSafeMatch, "PLAN_SAFE_ACTIONS array must exist");
  for (const unsafe of ["click", "fill", "evaluate", "cdp"]) {
    assert.doesNotMatch(
      planSafeMatch[1],
      new RegExp('"' + unsafe + '"'),
      `mutating action ${unsafe} must not appear in PLAN_SAFE_ACTIONS`,
    );
  }
});


test("pi.thinking ships the adaptive thinking agent extension (ADR 0257)", () => {
  const manifest = JSON.parse(read("resources/plugins/pi.thinking/manifest.json"));
  assert.equal(manifest.id, "pi.thinking");
  assert.deepEqual(manifest.permissions, ["agent.extension"]);
  assert.deepEqual(manifest.contributes.agentExtensions, ["extension.js"]);
  const extension = read("resources/plugins/pi.thinking/extension.js");
  assert.match(extension, /name:\s*"get_thinking_level"/);
  assert.match(extension, /name:\s*"set_thinking_level"/);
  assert.match(extension, /pi\.setThinkingLevel\(/);
  assert.match(extension, /pi\.getThinkingLevel\(/);
  assert.match(extension, /pi\.getThinkingLevels\(/);
  assert.match(extension, /persist/);
});

test("Advisor is temporarily not bundled", () => {
  assert.equal(existsSync(resolve("resources/plugins/pi.advisor")), false);
});

test("bundled plugins are packaged and located at runtime", () => {
  assert.ok(
    packageJson.build.extraResources.some(
      (entry) => entry.from === "resources/plugins" && entry.to === "plugins",
    ),
    "resources/plugins must be copied outside the asar",
  );
  // host-core cannot know whether it runs from resources/ or a checkout, so
  // Electron resolves the directory and hands it over.
  assert.match(hostProcessSource, /function resolveBuiltinPluginsDir\(\)/);
  assert.match(hostProcessSource, /PI_DESKTOP_BUILTIN_PLUGINS_DIR/);
  assert.match(hostProcessSource, /join\(process\.resourcesPath \|\| "", "plugins"\)/);
});
