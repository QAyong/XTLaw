(function installOfficeSelectionActions() {
  "use strict";

  const MAX_CHARS = 12000;
  const ACTIONS_ID = "pi-office-selection-actions";
  let state = null;
  let refreshFrame = 0;

  const style = document.createElement("style");
  style.textContent =
    ".pi-office-selection-actions{position:fixed;z-index:2147483640;display:inline-flex;align-items:center;padding:3px;border:1px solid var(--border-strong,#555);border-radius:999px;background:var(--surface-raised,#292929);color:var(--fg,#f5f5f5);font:11px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28);animation:pi-office-selection-in 120ms ease-out}" +
    ".pi-office-selection-actions button{display:inline-flex;align-items:center;min-height:22px;padding:3px 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;white-space:nowrap;cursor:pointer}" +
    ".pi-office-selection-actions button:hover{background:var(--surface-hover,rgba(255,255,255,.1))}" +
    ".pi-office-selection-actions button:active{transform:scale(.96)}" +
    ".pi-office-selection-actions button:focus-visible{outline:2px solid var(--accent,#6d8cff);outline-offset:1px}" +
    "@keyframes pi-office-selection-in{from{opacity:0;transform:translateY(2px)}}" +
    "@media (prefers-reduced-motion:reduce){.pi-office-selection-actions{animation:none}}";
  document.head.appendChild(style);

  function invoke(channel, payload) {
    const pluginBridge = window.pluginBridge;
    if (!pluginBridge || typeof pluginBridge.invoke !== "function") {
      return Promise.reject(new Error("plugin bridge unavailable"));
    }
    try {
      return Promise.resolve(pluginBridge.invoke(channel, payload));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function elementForNode(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
  }

  function selectionRoot(range) {
    const start = elementForNode(range.startContainer);
    const end = elementForNode(range.endContainer);
    if (!start || !end) return null;
    const startRoot = start.closest(".ProseMirror");
    const endRoot = end.closest(".ProseMirror");
    return startRoot && startRoot === endRoot && startRoot.contains(range.endContainer)
      ? startRoot
      : null;
  }

  function currentPath() {
    const path = window.desktop?.getCurrentDocxPath?.();
    return typeof path === "string" ? path.trim() : "";
  }

  function pageNumber(node) {
    const page = elementForNode(node)?.closest(".doc-page");
    if (!page) return null;
    const pages = Array.from(document.querySelectorAll(".doc-page"));
    const index = pages.indexOf(page);
    return index >= 0 ? index + 1 : null;
  }

  function fenceFor(text) {
    let longest = 0;
    for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
    return "`".repeat(Math.max(3, longest + 1));
  }

  function serialize(selection) {
    const path = currentPath();
    const normalized = String(selection.text || "").replace(/\r\n?/g, "\n").trim();
    if (!path || !normalized) return "";
    const truncated = normalized.length > MAX_CHARS;
    const body = normalized.slice(0, MAX_CHARS).replace(/[\uD800-\uDBFF]$/, "").trimEnd();
    const location = selection.page
      ? ` (page ${selection.page})`
      : " (selected content)";
    const fence = fenceFor(body);
    const output = [
      "Here is selected content from a workspace DOCX file:",
      "",
      `File: ${path}${location}`,
      `Location: @${path}${selection.page ? `:page-${selection.page}` : ""}`,
      "",
      `${fence}text`,
      body,
    ];
    if (truncated) output.push("", `[Selection truncated after ${MAX_CHARS} characters.]`);
    output.push(fence);
    return output.join("\n");
  }

  function positionFor(range, node) {
    const rect = range.getBoundingClientRect();
    const width = node.offsetWidth || 120;
    const height = node.offsetHeight || 30;
    const top = rect.top - height - 8 >= 8 ? rect.top - height - 8 : rect.bottom + 8;
    const left = Math.max(8, Math.min(
      rect.left + rect.width / 2 - width / 2,
      window.innerWidth - width - 8,
    ));
    return { top, left };
  }

  function removeActions(clearSelection) {
    document.getElementById(ACTIONS_ID)?.remove();
    state = null;
    if (clearSelection) window.getSelection()?.removeAllRanges();
  }

  function showActions(selection) {
    document.getElementById(ACTIONS_ID)?.remove();
    const actions = document.createElement("div");
    actions.id = ACTIONS_ID;
    actions.className = "pi-office-selection-actions";
    actions.setAttribute("data-testid", "office-selection-quote");
    actions.addEventListener("pointerdown", (event) => event.preventDefault());

    const add = document.createElement("button");
    add.type = "button";
    add.textContent = /^zh/i.test(document.documentElement.lang || navigator.language || "")
      ? "添加到聊天"
      : "Add to chat";
    add.addEventListener("click", () => {
      const payload = state ? serialize(state) : "";
      if (!payload) return;
      add.disabled = true;
      invoke("composer.appendDraft", { text: payload })
        .then(() => removeActions(true))
        .catch(() => {
          add.disabled = false;
          void invoke("ui.showToast", {
            message: /^zh/i.test(document.documentElement.lang || navigator.language || "")
              ? "添加到聊天失败"
              : "Failed to add selection to chat",
          });
        });
    });
    actions.appendChild(add);
    document.documentElement.appendChild(actions);
    const position = positionFor(selection.range, actions);
    actions.style.top = `${position.top}px`;
    actions.style.left = `${position.left}px`;
    state.actions = actions;
  }

  function refresh() {
    refreshFrame = 0;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      removeActions(false);
      return;
    }
    const range = selection.getRangeAt(0);
    const root = selectionRoot(range);
    const text = selection.toString().replace(/\r\n?/g, "\n").trim();
    if (!root || !text || !currentPath()) {
      removeActions(false);
      return;
    }
    state = { range: range.cloneRange(), text, page: pageNumber(range.startContainer) };
    showActions(state);
  }

  function schedule() {
    if (!refreshFrame) refreshFrame = window.requestAnimationFrame(refresh);
  }

  document.addEventListener("selectionchange", schedule);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  document.addEventListener("pointerdown", (event) => {
    const actions = document.getElementById(ACTIONS_ID);
    if (actions && !actions.contains(event.target)) removeActions(false);
  }, true);
})();
