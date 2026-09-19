export const BROWSER_ELEMENT_PICKER_BINDING = "piDesktopBrowserElementPicker";

const STATE_KEY = "__piDesktopBrowserElementPicker";
const UI_ATTRIBUTE = "data-pi-browser-picker-ui";

/**
 * This runs in the guest document, not in the renderer. The guest is an
 * untrusted page, so it only sends bounded descriptive data back through the
 * host's CDP binding; it never receives renderer or filesystem capabilities.
 */
export const BROWSER_ELEMENT_PICKER_INSTALL_SCRIPT = String.raw`(() => {
  const stateKey = ${JSON.stringify(STATE_KEY)};
  const bindingName = ${JSON.stringify(BROWSER_ELEMENT_PICKER_BINDING)};
  const uiAttribute = ${JSON.stringify(UI_ATTRIBUTE)};
  const old = window[stateKey];
  if (old && typeof old.destroy === "function") old.destroy();

  // While the picker card is in comment mode it owns the captured selection;
  // focusing its input must not cause the page selection listeners to remove it.
  const state = { enabled: true, selected: null, hover: null, menu: null, style: null, suppressClick: false, mode: null, pointerDown: false };
  const max = (value, length) => String(value ?? "").trim().slice(0, length);
  const send = (message) => {
    try {
      const binding = window[bindingName];
      if (typeof binding === "function") binding(JSON.stringify(message));
    } catch (_) {
      // The host may detach while the page is navigating.
    }
  };
  const isUi = (node) => node instanceof Element && Boolean(node.closest("[" + uiAttribute + "]"));
  const meaningfulElement = (node) => {
    if (!(node instanceof Element) || isUi(node)) return null;
    if (node === document.documentElement || node === document.body) return null;
    return node;
  };
  const elementAt = (event) => meaningfulElement(document.elementFromPoint(event.clientX, event.clientY));
  const rectData = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: Number.isFinite(rect.left) ? rect.left : 0,
      y: Number.isFinite(rect.top) ? rect.top : 0,
      width: Math.max(0, Number.isFinite(rect.width) ? rect.width : 0),
      height: Math.max(0, Number.isFinite(rect.height) ? rect.height : 0),
    };
  };
  const selectorPart = (element) => {
    const tag = element.tagName.toLowerCase();
    if (element.id) return tag + "#" + CSS.escape(element.id).slice(0, 120);
    const classes = [...element.classList].filter(Boolean).slice(0, 3).map((value) => CSS.escape(value));
    return tag + (classes.length ? "." + classes.join(".") : "");
  };
  const selectorFor = (element) => {
    const parts = [];
    let current = element;
    while (current && current instanceof Element && current !== document.body && parts.length < 6) {
      const part = selectorPart(current);
      const parent = current.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((child) => child.tagName === current.tagName);
        if (siblings.length > 1) parts.unshift(part + ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")");
        else parts.unshift(part);
      } else {
        parts.unshift(part);
      }
      current = parent;
    }
    return parts.join(" > ").slice(0, 1024);
  };
  const elementForNode = (node) => {
    if (node instanceof Element) return node;
    return node && node.parentElement instanceof Element ? node.parentElement : null;
  };
  const isUiNode = (node) => isUi(elementForNode(node));
  const safeHtml = (element) => {
    try {
      const clone = element.cloneNode(true);
      const fields = [clone, ...clone.querySelectorAll("input, textarea, select")];
      fields.filter((field) => /^(INPUT|TEXTAREA|SELECT)$/.test(field.tagName)).forEach((field) => {
        field.removeAttribute("value");
        if (field.tagName === "TEXTAREA") field.textContent = "";
        if (field.tagName === "SELECT") field.querySelectorAll("option").forEach((option) => option.removeAttribute("selected"));
      });
      return max(clone.outerHTML, 16000);
    } catch (_) {
      return "";
    }
  };
  const computedStyles = (element) => {
    const computed = getComputedStyle(element);
    const names = [
      "display", "position", "width", "height", "margin", "padding", "gap",
      "color", "background-color", "font-family", "font-size", "font-weight",
      "line-height", "border", "border-radius", "box-shadow", "overflow",
      "flex-direction", "align-items", "justify-content", "grid-template-columns",
    ];
    const result = {};
    for (const name of names) {
      const value = max(computed.getPropertyValue(name), 256);
      if (value) result[name] = value;
    }
    return result;
  };
  const describe = (element) => {
    const text = max(element.innerText || element.textContent, 4000);
    const name = max(
      element.getAttribute("aria-label") || element.getAttribute("alt") ||
      element.getAttribute("title") || element.getAttribute("placeholder") || text,
      512,
    );
    return {
      url: max(location.href, 2048),
      title: max(document.title, 512),
      tagName: max(element.tagName, 64),
      role: max(element.getAttribute("role") || "", 128),
      name,
      text,
      html: safeHtml(element),
      selector: selectorFor(element),
      box: rectData(element),
      styles: computedStyles(element),
    };
  };
  const textSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const start = elementForNode(range.startContainer);
    const end = elementForNode(range.endContainer);
    if (!start || !end || isUiNode(start) || isUiNode(end)) return null;
    const text = max(selection.toString().replace(/\r\n?/g, "\n"), 4000);
    if (!text) return null;
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
    const rect = range.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0 ? rect : rects[0];
    if (!visible) return null;
    return {
      kind: "text",
      url: max(location.href, 2048),
      title: max(document.title, 512),
      text,
      box: {
        x: Number.isFinite(visible.left) ? visible.left : 0,
        y: Number.isFinite(visible.top) ? visible.top : 0,
        width: Math.max(0, Number.isFinite(visible.width) ? visible.width : 0),
        height: Math.max(0, Number.isFinite(visible.height) ? visible.height : 0),
      },
    };
  };
  const ensureStyle = () => {
    const style = document.createElement("style");
    style.setAttribute(uiAttribute, "true");
    style.textContent =
      ".pi-browser-picker-highlight{" +
      "position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #7c9cff;" +
      "background:color-mix(in srgb,#7c9cff 12%,transparent);box-shadow:0 0 0 1px rgba(255,255,255,.55);" +
      "transition:all 60ms ease}" +
      ".pi-browser-picker-selected{border-color:#35c98b;background:color-mix(in srgb,#35c98b 12%,transparent)}" +
      ":root{--pi-selection-popup-border:rgba(255,255,255,.14);" +
      "--pi-selection-popup-bg:rgba(30,30,34,.96);" +
      "--pi-selection-popup-fg:#f7f7f8;" +
      "--pi-selection-popup-hover:rgba(255,255,255,.12);" +
      "--pi-selection-popup-separator:rgba(255,255,255,.14);" +
      "--pi-selection-popup-shadow:rgba(0,0,0,.24)}" +
      ".selection-quote[data-pi-browser-picker-ui]{position:fixed;z-index:2147483647;display:flex;" +
      "align-items:center;gap:2px;padding:3px;border:1px solid var(--pi-selection-popup-border);border-radius:999px;" +
      "background:var(--pi-selection-popup-bg);box-shadow:0 8px 24px var(--pi-selection-popup-shadow);font:12px/1.35 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-action{display:inline-flex;align-items:center;" +
      "gap:5px;min-height:22px;padding:3px 9px;border:0;border-radius:999px;background:transparent;color:var(--pi-selection-popup-fg);" +
      "font:inherit;cursor:pointer;white-space:nowrap;transition:background 120ms ease-out}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-action:hover{background:var(--pi-selection-popup-hover)}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-action:active{transform:scale(.96)}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-action.icon{padding:3px 7px}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-sep{align-self:stretch;width:1px;background:var(--pi-selection-popup-separator)}" +
      ".selection-quote[data-pi-browser-picker-ui].is-comment{display:block;width:min(260px,calc(100vw - 16px));padding:6px;border-radius:12px;color:var(--pi-selection-popup-fg)}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-comment-input{display:block;width:100%;min-height:40px;max-height:120px;padding:4px 6px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;line-height:1.35;resize:none}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-comment-input:focus{outline:none}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-comment-input::placeholder{color:currentColor;opacity:.45}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-comment-actions{display:flex;justify-content:flex-end;gap:4px;margin-top:2px}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-comment-actions button{display:inline-flex;align-items:center;min-height:22px;padding:3px 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-comment-actions button:hover{background:var(--pi-selection-popup-hover)}" +
      ".selection-quote[data-pi-browser-picker-ui] .selection-quote-comment-actions button.primary{background:var(--pi-selection-popup-accent,#4f6ede);color:#fff}" +
      // The chip floats over an untrusted page, but it is still host UI: it
      // follows the app palette the host publishes to every renderer instead
      // of staying dark under a light theme.
      "@media (prefers-color-scheme: light){" +
      ".pi-browser-picker-highlight{box-shadow:0 0 0 1px rgba(26,28,31,.2)}" +
      ":root{--pi-selection-popup-border:rgba(26,28,31,.08);" +
      "--pi-selection-popup-bg:rgba(255,255,255,.97);" +
      "--pi-selection-popup-fg:#1a1c1f;" +
      "--pi-selection-popup-hover:rgba(26,28,31,.06);" +
      "--pi-selection-popup-separator:rgba(26,28,31,.12);" +
      "--pi-selection-popup-shadow:rgba(26,28,31,.18)}" +
      "}";
    (document.head || document.documentElement).appendChild(style);
    state.style = style;
  };
  const addOverlay = (className) => {
    const overlay = document.createElement("div");
    overlay.className = className;
    overlay.setAttribute(uiAttribute, "true");
    document.documentElement.appendChild(overlay);
    return overlay;
  };
  const paint = (overlay, box) => {
    if (!overlay || !box || box.width <= 0 || box.height <= 0) {
      if (overlay) overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    overlay.style.left = Math.round(box.x) + "px";
    overlay.style.top = Math.round(box.y) + "px";
    overlay.style.width = Math.round(box.width) + "px";
    overlay.style.height = Math.round(box.height) + "px";
  };
  const hideMenu = () => {
    state.mode = null;
    if (state.menu) state.menu.remove();
    state.menu = null;
  };
  const clearSelection = () => {
    state.selected = null;
    hideMenu();
    if (state.selectedOverlay) state.selectedOverlay.hidden = true;
    window.getSelection()?.removeAllRanges();
  };
  /** Sit the pill just above the passage it belongs to, clamped to the viewport. */
  const placeMenu = (menu, box) => {
    const menuBox = menu.getBoundingClientRect();
    const width = menuBox.width || 140;
    const height = menuBox.height || 30;
    const top = box.y > height + 16 ? box.y - height - 8 : box.y + box.height + 8;
    menu.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, box.x + box.width / 2 - width / 2)) + "px";
    menu.style.top = Math.max(8, Math.min(window.innerHeight - height - 8, top)) + "px";
  };
  /** Add to chat keeps the original compact selection card and swaps its actions for the comment input. */
  const openComment = (menu, selection) => {
    const isZh = /^zh/i.test(document.documentElement.lang || navigator.language || "");
    state.mode = "comment";
    state.menu = menu;
    menu.classList.add("is-comment");
    menu.textContent = "";
    const input = document.createElement("textarea");
    input.className = "selection-quote-comment-input";
    input.rows = 2;
    input.placeholder = isZh ? "写下你的评论…" : "Add a comment…";
    input.setAttribute("aria-label", isZh ? "评论" : "Comment");
    const row = document.createElement("div");
    row.className = "selection-quote-comment-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = isZh ? "取消" : "Cancel";
    cancel.dataset.commentAction = "cancel";
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "primary";
    submit.textContent = isZh ? "保存" : "Save";
    submit.dataset.commentAction = "save";
    const save = () => {
      const comment = max(input.value, 2000);
      clearSelection();
      send({ type: "action", action: "add", selection, comment });
    };
    cancel.addEventListener("click", () => clearSelection());
    submit.addEventListener("click", save);
    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        clearSelection();
        return;
      }
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      if (!event.repeat) save();
    });
    row.append(cancel, submit);
    menu.append(input, row);
    placeMenu(menu, selection.box);
    window.requestAnimationFrame(() => {
      placeMenu(menu, selection.box);
      input.focus();
    });
  };
  const showMenu = (selection) => {
    hideMenu();
    const menu = document.createElement("div");
    menu.className = "selection-quote";
    menu.setAttribute(uiAttribute, "true");
    const isZh = /^zh/i.test(document.documentElement.lang || navigator.language || "");
    const add = document.createElement("button");
    add.type = "button";
    add.className = "selection-quote-action";
    add.dataset.action = "add";
    add.textContent = isZh ? "添加到聊天" : "Add to chat";
    const separator = document.createElement("span");
    separator.className = "selection-quote-sep";
    separator.setAttribute("aria-hidden", "true");
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "selection-quote-action icon";
    copy.dataset.action = "copy";
    copy.title = isZh ? "复制" : "Copy";
    copy.setAttribute("aria-label", copy.title);
    copy.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    menu.append(add, separator, copy);
    menu.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = event.target instanceof Element ? event.target.closest("button")?.dataset.action : "";
      if (action === "copy") {
        send({ type: "action", action, selection });
        return;
      }
      if (action === "add") openComment(menu, selection);
    });
    document.documentElement.appendChild(menu);
    placeMenu(menu, selection.box);
    state.menu = menu;
  };
  const onSelectionChange = () => {
    if (!state.enabled || state.mode === "comment") return;
    const selection = textSelection();
    if (!selection) {
      if (state.selected?.kind === "text") clearSelection();
      return;
    }
    state.selected = selection;
    if (state.selectedOverlay) state.selectedOverlay.hidden = true;
    if (state.pointerDown) return;
    showMenu(selection);
  };
  const onPointerMove = (event) => {
    if (!state.enabled || isUi(event.target)) return;
    const element = elementAt(event);
    state.hover = element;
    paint(state.hoverOverlay, element ? rectData(element) : null);
  };
  const onPointerDown = (event) => {
    if (!state.enabled || isUi(event.target)) return;
    state.pointerDown = true;
    if (!state.menu) return;
    // Match the chat/file selection affordance: clicking away dismisses the
    // current action pill instead of exposing a second visible cancel button.
    clearSelection();
    state.suppressClick = true;
  };
  const onPointerUp = () => {
    if (!state.enabled) return;
    state.pointerDown = false;
    onSelectionChange();
  };
  const onPointerCancel = () => {
    state.pointerDown = false;
  };
  const onClick = (event) => {
    if (!state.enabled || isUi(event.target)) return;
    if (state.suppressClick) {
      state.suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const text = textSelection();
    if (text) {
      event.preventDefault();
      event.stopPropagation();
      state.selected = text;
      if (state.selectedOverlay) state.selectedOverlay.hidden = true;
      showMenu(text);
      return;
    }
    const element = elementAt(event);
    if (!element) return;
    event.preventDefault();
    event.stopPropagation();
    state.selected = describe(element);
    paint(state.selectedOverlay, state.selected.box);
    showMenu(state.selected);
  };
  const onKeyDown = (event) => {
    if (event.key !== "Escape") return;
    if (isUi(event.target)) return;
    clearSelection();
    send({ type: "action", action: "cancel" });
  };
  ensureStyle();
  state.hoverOverlay = addOverlay("pi-browser-picker-highlight");
  state.selectedOverlay = addOverlay("pi-browser-picker-highlight pi-browser-picker-selected");
  state.selectedOverlay.hidden = true;
  document.addEventListener("selectionchange", onSelectionChange, true);
  document.addEventListener("pointermove", onPointerMove, true);
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("pointerup", onPointerUp, true);
  document.addEventListener("pointercancel", onPointerCancel, true);
  state.destroy = () => {
    state.enabled = false;
    document.removeEventListener("selectionchange", onSelectionChange, true);
    document.removeEventListener("pointermove", onPointerMove, true);
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("pointerup", onPointerUp, true);
    document.removeEventListener("pointercancel", onPointerCancel, true);
    hideMenu();
    state.hoverOverlay?.remove();
    state.selectedOverlay?.remove();
    state.style?.remove();
    if (window[stateKey] === state) delete window[stateKey];
  };
  window[stateKey] = state;
})();`;

export const BROWSER_ELEMENT_PICKER_DISABLE_SCRIPT = String.raw`(() => {
  const state = window[${JSON.stringify(STATE_KEY)}];
  if (state && typeof state.destroy === "function") state.destroy();
})();`;
