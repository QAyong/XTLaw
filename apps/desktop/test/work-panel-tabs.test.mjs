import assert from "node:assert/strict";
import test from "node:test";

const {
  activateWorkPanelTabState,
  browserPluginTab,
  closeWorkPanelTabState,
  emptyWorkPanelContext,
  fileWorkPanelTab,
  isDocxFilePath,
  isKnownWorkPanelTab,
  isToolWorkPanelTab,
  normalizeWorkPanelFilePath,
  newWorkPanelTab,
    NO_SESSION_WORK_PANEL_CONTEXT,
    officePluginTab,
  openWorkPanelTabState,
  pluginWorkPanelTab,
  replaceWorkPanelTabState,
  resetWorkPanelContextState,
  sanitizeWorkPanelTabsState,
  shouldOpenReviewArtifact,
  switchWorkPanelContextState,
  toolWorkPanelTab,
} = await import("../src/lib/work-panel-tabs.ts");

test("work panel tabs open on demand and deduplicate by resource", () => {
  const empty = { tabs: [], activeTabId: null };
  const review = openWorkPanelTabState(empty, toolWorkPanelTab("review"));
  const file = openWorkPanelTabState(review, fileWorkPanelTab("src/App.tsx"));
  const reopened = openWorkPanelTabState(file, toolWorkPanelTab("review"));

  assert.deepEqual(reopened.tabs.map((tab) => tab.id), ["review", "file:src/App.tsx"]);
  assert.equal(reopened.activeTabId, "review");
});

test("new tabs are unique launcher pages and replace themselves with a tool", () => {
  const first = newWorkPanelTab();
  const second = newWorkPanelTab();
  assert.equal(first.kind, "new");
  assert.equal(second.kind, "new");
  assert.match(first.id, /^new:/);
  assert.notEqual(first.id, second.id);

  const state = openWorkPanelTabState(
    openWorkPanelTabState({ tabs: [], activeTabId: null }, first),
    second,
  );
  const replaced = replaceWorkPanelTabState(
    state,
    second.id,
    browserPluginTab("https://example.com"),
  );

  assert.deepEqual(replaced.tabs.map((tab) => tab.id), [first.id, "plugin:pi.browser/browser"]);
  assert.equal(replaced.activeTabId, "plugin:pi.browser/browser");
  assert.equal(replaced.tabs.find((tab) => tab.id === first.id)?.kind, "new");
});

test("selecting an already-open tool removes only the source launcher tab", () => {
  const browser = browserPluginTab("https://example.com");
  const launcher = newWorkPanelTab();
  const state = {
    tabs: [browser, launcher],
    activeTabId: launcher.id,
  };
  const replaced = replaceWorkPanelTabState(state, launcher.id, browser);

  assert.deepEqual(replaced.tabs, [browser]);
  assert.equal(replaced.activeTabId, browser.id);
});

test("file tabs normalize lexical paths and remain distinct by resource", () => {
  const first = fileWorkPanelTab("src\\App.tsx");
  const equivalent = fileWorkPanelTab("./src//components/../App.tsx");
  const second = fileWorkPanelTab("test/App.tsx");

  assert.equal(first.id, "file:src/App.tsx");
  assert.equal(equivalent.id, first.id);
  assert.notEqual(first.id, second.id);
  assert.equal(normalizeWorkPanelFilePath("../src/../App.tsx"), "../App.tsx");
  assert.equal(normalizeWorkPanelFilePath("/repo/./src/../App.tsx"), "/repo/App.tsx");
});

test("DOCX files address the bundled Office editor", () => {
  assert.equal(isDocxFilePath("docs/Report.DOCX"), true);
  assert.equal(isDocxFilePath("docs/Report.doc"), false);
  assert.deepEqual(officePluginTab("docs/Report.docx"), {
    id: "plugin:pi.office/editor",
    kind: "plugin",
    resource: "pi.office/editor",
    location: "docs/Report.docx",
  });
});

test("closing the active tab selects its right neighbor then its left", () => {
  const state = {
    tabs: [
      toolWorkPanelTab("review"),
      fileWorkPanelTab("src/App.tsx"),
      browserPluginTab(),
    ],
    activeTabId: "file:src/App.tsx",
  };
  const middleClosed = closeWorkPanelTabState(state, "file:src/App.tsx");
  const endClosed = closeWorkPanelTabState(middleClosed, browserPluginTab().id);

  assert.equal(middleClosed.activeTabId, browserPluginTab().id);
  assert.equal(endClosed.activeTabId, "review");
});

test("closing an inactive tab preserves selection and the last close empties state", () => {
  const state = {
    tabs: [toolWorkPanelTab("review"), browserPluginTab()],
    activeTabId: "review",
  };
  const inactiveClosed = closeWorkPanelTabState(state, browserPluginTab().id);
  const empty = closeWorkPanelTabState(inactiveClosed, "review");

  assert.equal(inactiveClosed.activeTabId, "review");
  assert.deepEqual(empty, { tabs: [], activeTabId: null });
});

test("activation ignores stale tab ids", () => {
  const state = { tabs: [toolWorkPanelTab("review")], activeTabId: "review" };
  assert.equal(activateWorkPanelTabState(state, "missing"), state);
});

test("unknown retained tabs are discarded without losing a known selection", () => {
  const stale = { id: "removed", kind: "removed" };
  const selected = sanitizeWorkPanelTabsState({
    tabs: [stale, browserPluginTab(), toolWorkPanelTab("review")],
    activeTabId: browserPluginTab().id,
  });
  const staleSelected = sanitizeWorkPanelTabsState({
    tabs: [browserPluginTab(), stale, toolWorkPanelTab("review")],
    activeTabId: "removed",
  });

  assert.equal(isKnownWorkPanelTab(stale), false);
  assert.deepEqual(selected.tabs.map((tab) => tab.id), [
    browserPluginTab().id,
    "review",
  ]);
  assert.equal(selected.activeTabId, browserPluginTab().id);
  assert.equal(staleSelected.activeTabId, "review");
});

test("only plugin views are launchable tools", () => {
  assert.equal(isToolWorkPanelTab(browserPluginTab()), true);
  assert.equal(isToolWorkPanelTab(toolWorkPanelTab("review")), false);
  assert.equal(isToolWorkPanelTab(fileWorkPanelTab("README.md")), false);
  assert.equal(isToolWorkPanelTab(pluginWorkPanelTab("pi.file-manager", "manager")), true);
  assert.equal(isKnownWorkPanelTab({ id: "browser", kind: "browser" }), false);
  assert.equal(isKnownWorkPanelTab(newWorkPanelTab()), true);
});

test("review artifacts are recognized independently of the visible session", () => {
  const base = {
    toolName: "Write",
    isError: false,
    result: { details: { root: "workspace" } },
  };

  assert.equal(shouldOpenReviewArtifact(base), true);
  assert.equal(shouldOpenReviewArtifact({ ...base, toolName: "Edit" }), true);
  assert.equal(shouldOpenReviewArtifact({ ...base, toolName: "Bash" }), false);
  assert.equal(shouldOpenReviewArtifact({ ...base, isError: true }), false);
  assert.equal(
    shouldOpenReviewArtifact({
      ...base,
      result: { details: { root: "scratch" } },
    }),
    false,
  );
});

test("empty work panel context has no visible or retained resource state", () => {
  assert.deepEqual(emptyWorkPanelContext(), {
    open: false,
    tabs: [],
    activeTabId: null,
    fileRequest: null,
  });
});

test("switching work panel contexts isolates session tabs and visible state", () => {
  const sessionA = {
    open: true,
    tabs: [browserPluginTab(), fileWorkPanelTab("src/App.tsx")],
    activeTabId: "file:src/App.tsx",
    fileRequest: { path: "src/App.tsx", seq: 4 },
  };
  const sessionB = {
    open: false,
    tabs: [browserPluginTab()],
    activeTabId: browserPluginTab().id,
    fileRequest: null,
  };

  const toB = switchWorkPanelContextState(
    { "session-b": sessionB },
    "session-a",
    sessionA,
    "session-b",
  );
  assert.deepEqual(toB.contexts["session-a"], sessionA);
  assert.deepEqual(toB.visible, sessionB);

  const backToA = switchWorkPanelContextState(
    toB.contexts,
    "session-b",
    toB.visible,
    "session-a",
  );
  assert.deepEqual(backToA.contexts["session-b"], sessionB);
  assert.deepEqual(backToA.visible, sessionA);
  assert.notEqual(backToA.visible.tabs, toB.visible.tabs);
});

test("switching to a session without context returns an isolated empty state", () => {
  const sessionA = {
    open: true,
    tabs: [toolWorkPanelTab("review")],
    activeTabId: "review",
    fileRequest: null,
  };
  const switched = switchWorkPanelContextState(
    {},
    "session-a",
    sessionA,
    "session-new",
  );

  assert.deepEqual(switched.contexts["session-a"], sessionA);
  assert.deepEqual(switched.visible, emptyWorkPanelContext());
  switched.visible.tabs.push(browserPluginTab());
  assert.deepEqual(switched.contexts["session-a"].tabs, sessionA.tabs);
});

test("a newer retained artifact is not overwritten by a stale visible projection", () => {
  const staleVisible = emptyWorkPanelContext();
  const retained = {
    open: true,
    tabs: [toolWorkPanelTab("review")],
    activeTabId: "review",
    fileRequest: null,
  };
  const switched = switchWorkPanelContextState(
    { "session-a": retained },
    "session-a",
    staleVisible,
    "session-b",
  );

  assert.deepEqual(switched.contexts["session-a"], retained);
  assert.deepEqual(switched.visible, emptyWorkPanelContext());
});

test("switching to no active session projects the retained session-less context", () => {
  const retained = {
    open: true,
    tabs: [browserPluginTab(), fileWorkPanelTab("src/App.tsx")],
    activeTabId: "file:src/App.tsx",
    fileRequest: { path: "src/App.tsx", seq: 2 },
  };
  const sessionA = {
    open: true,
    tabs: [toolWorkPanelTab("review")],
    activeTabId: "review",
    fileRequest: null,
  };
  const fromSession = switchWorkPanelContextState(
    { [NO_SESSION_WORK_PANEL_CONTEXT]: retained },
    "session-a",
    sessionA,
    undefined,
  );

  assert.deepEqual(fromSession.visible, retained);
  assert.deepEqual(fromSession.contexts[NO_SESSION_WORK_PANEL_CONTEXT], retained);
  assert.deepEqual(fromSession.contexts["session-a"], sessionA);

  // Without a current session the projection is retained in the session-less
  // slot instead of being dropped.
  const sessionless = switchWorkPanelContextState({}, undefined, retained, undefined);
  assert.deepEqual(sessionless.visible, retained);
  assert.deepEqual(sessionless.contexts[NO_SESSION_WORK_PANEL_CONTEXT], retained);
});

test("a newer retained session-less context is not overwritten by a stale projection", () => {
  const retained = {
    open: true,
    tabs: [toolWorkPanelTab("review")],
    activeTabId: "review",
    fileRequest: null,
  };
  const switched = switchWorkPanelContextState(
    { [NO_SESSION_WORK_PANEL_CONTEXT]: retained },
    undefined,
    emptyWorkPanelContext(),
    undefined,
  );

  assert.deepEqual(switched.contexts[NO_SESSION_WORK_PANEL_CONTEXT], retained);
  assert.deepEqual(switched.visible, retained);
});

test("an explicit workspace reset hides the panel and clears the session-less slot", () => {
  const sessionless = {
    open: true,
    tabs: [browserPluginTab()],
    activeTabId: browserPluginTab().id,
    fileRequest: null,
  };
  const sessionA = {
    open: true,
    tabs: [toolWorkPanelTab("review")],
    activeTabId: "review",
    fileRequest: null,
  };
  const reset = resetWorkPanelContextState(
    { [NO_SESSION_WORK_PANEL_CONTEXT]: sessionless, "session-a": sessionA },
    "session-a",
    sessionA,
  );

  assert.deepEqual(reset.visible, emptyWorkPanelContext());
  assert.deepEqual(reset.contexts[NO_SESSION_WORK_PANEL_CONTEXT], emptyWorkPanelContext());
  assert.deepEqual(reset.contexts["session-a"], sessionA);
});
