(function installOfficeSelectionActions() {
  "use strict";

  const MAX_CHARS = 12000;
  const ACTIONS_ID = "pi-office-selection-actions";
  let state = null;
  let refreshFrame = 0;

  const style = document.createElement("style");
  style.textContent =
     ".pi-office-selection-actions{position:fixed;z-index:2147483640;display:inline-flex;align-items:center;padding:3px;border:1px solid var(--pi-selection-popup-border,#d0d5dd);border-radius:999px;background:var(--pi-selection-popup-bg,#fff);color:var(--pi-selection-popup-fg,#1a1c1f);font:11px/1.35 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.18);animation:pi-office-selection-in 120ms ease-out}" +
    ".pi-office-selection-actions button{display:inline-flex;align-items:center;min-height:22px;padding:3px 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;white-space:nowrap;cursor:pointer}" +
     ".pi-office-selection-actions button:hover{background:var(--pi-selection-popup-hover,rgba(26,28,31,.06))}" +
    ".pi-office-selection-actions button:active{transform:scale(.96)}" +
     ".pi-office-selection-actions button:focus-visible{outline:2px solid var(--pi-selection-popup-accent,#4f6ede);outline-offset:1px}" +
    "@keyframes pi-office-selection-in{from{opacity:0;transform:translateY(2px)}}" +
    "@media (prefers-reduced-motion:reduce){.pi-office-selection-actions{animation:none}}" +
    ".pi-office-selection-actions.is-comment{display:block;width:min(260px,calc(100vw - 16px));padding:6px;border-radius:12px}" +
    ".pi-office-selection-comment-input{display:block;width:100%;min-height:40px;max-height:120px;padding:4px 6px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;line-height:1.35;resize:vertical}" +
    ".pi-office-selection-comment-input:focus{outline:none}" +
    ".pi-office-selection-comment-input::placeholder{color:currentColor;opacity:.45}" +
    ".pi-office-selection-comment-actions{display:flex;justify-content:flex-end;gap:4px;margin-top:2px}" +
    ".pi-office-selection-comment-actions button{display:inline-flex;align-items:center;min-height:22px;padding:3px 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px;cursor:pointer;white-space:nowrap}" +
    ".pi-office-selection-comment-actions button:hover{background:var(--pi-selection-popup-hover,rgba(26,28,31,.06))}" +
    ".pi-office-selection-comment-actions button.primary{background:var(--pi-selection-popup-accent,#4f6ede);color:#fff}";
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

  function labels() {
    const language = String(document.documentElement.lang || navigator.language || "");
    return /^zh/i.test(language)
      ? {
          add: "添加到聊天",
          comment: "评论",
          commentPlaceholder: "写下你的评论…",
          save: "保存",
          cancel: "取消",
          failed: "添加到聊天失败",
        }
      : {
          add: "Add to chat",
          comment: "Comment",
          commentPlaceholder: "Write a comment…",
          save: "Save",
          cancel: "Cancel",
          failed: "Failed to add selection to chat",
        };
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

  function currentDocxState() {
    try {
      return Promise.resolve(window.desktop?.getCurrentDocxState?.() || null).catch(() => null);
    } catch {
      return Promise.resolve(null);
    }
  }

  function editorFor(root) {
    const editor = window.__aidocs?.editor;
    if (!editor?.state?.doc || !editor?.view) return null;
    const dom = editor.view.dom;
    return dom && (dom === root || dom.contains(root) || root.contains(dom)) ? editor : null;
  }

  /** Find the top-level ProseMirror block containing a document position. */
  function blockAt(doc, position, endBias) {
    const target = Math.max(0, Math.min(Number(position) || 0, doc.content.size));
    let cursor = 0;
    for (let index = 0; index < doc.childCount; index += 1) {
      const node = doc.child(index);
      const end = cursor + node.nodeSize;
      if (target < end || (endBias && target === end) || index === doc.childCount - 1) {
        return {
          index,
          node,
          nodeStart: cursor,
          contentStart: cursor + 1,
          contentEnd: Math.max(cursor + 1, end - 1),
          nodeEnd: end,
        };
      }
      cursor = end;
    }
    return null;
  }

  function editorSelection(editor, range) {
    try {
      const from = editor.view.posAtDOM(range.startContainer, range.startOffset);
      const to = editor.view.posAtDOM(range.endContainer, range.endOffset);
      if (from !== to) return from <= to ? { from, to } : { from: to, to: from };
    } catch {
      // Fall back to the editor selection below when the DOM range has already
      // been detached by a layout update.
    }
    const current = editor.state.selection;
    return current && !current.empty ? { from: current.from, to: current.to } : null;
  }

  /** Capture editor indexes only long enough to resolve native DOCX IDs. */
  function docxSelectionIndexes(root, range) {
    const editor = editorFor(root);
    if (!editor) return null;
    const positions = editorSelection(editor, range);
    if (!positions || positions.from === positions.to) return null;
    const { doc } = editor.state;
    const start = blockAt(doc, positions.from, false);
    const end = blockAt(doc, positions.to, true);
    if (!start || !end) return null;

    const indexes = [];
    for (let index = start.index; index <= end.index; index += 1) {
      const node = doc.child(index);
      const docxIndex = Number(node.attrs?.docxIndex);
      if (!Number.isInteger(docxIndex) || docxIndex < 0) continue;
      if (!indexes.includes(docxIndex)) indexes.push(docxIndex);
    }
    return indexes.length > 0 ? indexes : null;
  }

  function fenceFor(text) {
    let longest = 0;
    for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
    return "`".repeat(Math.max(3, longest + 1));
  }

  function anchorLabel(anchor) {
    if (!anchor?.paragraphIds?.length) return "selected content";
    return `paragraph IDs ${anchor.paragraphIds.join(", ")}`;
  }

  function serialize(selection) {
    const path = selection.path || currentPath();
    const normalized = String(selection.text || "").replace(/\r\n?/g, "\n").trim();
    if (!path || !normalized) return "";
    const truncated = normalized.length > MAX_CHARS;
    const body = normalized.slice(0, MAX_CHARS).replace(/[\uD800-\uDBFF]$/, "").trimEnd();
    const fence = fenceFor(body);
    const output = [
      "Here is selected content from an open DOCX file:",
      "",
      `File: ${path}`,
      `Location: @${path}`,
      `Document anchor: ${anchorLabel(selection.docx)}`,
    ];
    if (selection.docx?.documentHash) {
      output.push(`Document version: ${selection.docx.documentHash}`);
    }
    output.push("", `${fence}text`, body);
    if (truncated) output.push("", `[Selection truncated after ${MAX_CHARS} characters.]`);
    output.push(fence);
    return output.join("\n");
  }

  function positionFor(range, node) {
    const rect = range.getBoundingClientRect();
    const width = node.offsetWidth || 140;
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

  async function selectionPayload(comment) {
    const snapshot = state;
    if (!snapshot) return null;
    const current = await currentDocxState();
    if (!current?.path || current.path !== snapshot.path) throw new Error("the selected DOCX is no longer open");
    const paragraphIds = [];
    let complete = true;
    for (const index of snapshot.docxIndexes || []) {
      const value = current.paragraphIds?.[index];
      const ids = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
      if (ids.length === 0) complete = false;
      for (const id of ids) {
        if (typeof id === "string" && !paragraphIds.includes(id)) paragraphIds.push(id);
      }
    }
    if (
      !complete ||
      paragraphIds.length === 0 ||
      paragraphIds.some((value) => !/^[0-9a-f]{8}$/i.test(value)) ||
      new Set(paragraphIds).size !== paragraphIds.length
    ) {
      throw new Error("the selected content has no native DOCX paragraph ID");
    }
    const docx = {
      paragraphIds,
      ...(current.hash ? { documentHash: current.hash } : {}),
    };
    const selection = { ...snapshot, docx };
    const text = serialize(selection);
    if (!text) return null;
    return {
      text,
      source: {
        file: {
          path: snapshot.path,
          docx,
        },
      },
      comment: String(comment || "").trim(),
    };
  }

  function openCommentInput(actions) {
    if (!state) return;
    state.mode = "comment";
    actions.classList.add("is-comment");
    actions.innerHTML = "";
    const textLabels = labels();
    const input = document.createElement("textarea");
    input.className = "pi-office-selection-comment-input";
    input.rows = 2;
    input.placeholder = textLabels.commentPlaceholder;
    input.setAttribute("aria-label", textLabels.comment);
    const row = document.createElement("div");
    row.className = "pi-office-selection-comment-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = textLabels.cancel;
    cancel.addEventListener("click", () => removeActions(false));
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "primary";
    submit.textContent = textLabels.save;
    const save = async () => {
      let payload;
      try {
        payload = await selectionPayload(input.value);
      } catch {
        void invoke("ui.showToast", { message: textLabels.failed });
        return;
      }
      if (!payload?.text) return;
      submit.disabled = true;
      try {
        await invoke("composer.addSelection", payload);
        removeActions(true);
      } catch {
        submit.disabled = false;
        void invoke("ui.showToast", { message: textLabels.failed });
      }
    };
    submit.addEventListener("click", () => void save());
    input.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        removeActions(false);
        return;
      }
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      if (!event.repeat) void save();
    });
    row.append(cancel, submit);
    actions.append(input, row);
    const position = positionFor(state.range, actions);
    actions.style.top = `${position.top}px`;
    actions.style.left = `${position.left}px`;
    window.requestAnimationFrame(() => input.focus());
  }

  function showActions(selection) {
    document.getElementById(ACTIONS_ID)?.remove();
    const actions = document.createElement("div");
    actions.id = ACTIONS_ID;
    actions.className = "pi-office-selection-actions";
    actions.setAttribute("data-testid", "office-selection-quote");
    actions.addEventListener("pointerdown", (event) => event.preventDefault());

    const textLabels = labels();
    const add = document.createElement("button");
    add.type = "button";
    add.className = "add";
    add.textContent = textLabels.add;
    add.addEventListener("click", () => openCommentInput(actions));

    actions.appendChild(add);
    document.documentElement.appendChild(actions);
    const position = positionFor(selection.range, actions);
    actions.style.top = `${position.top}px`;
    actions.style.left = `${position.left}px`;
  }

  function refresh() {
    refreshFrame = 0;
    if (state?.mode === "comment") return;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      removeActions(false);
      return;
    }
    const range = selection.getRangeAt(0);
    const root = selectionRoot(range);
    const text = selection.toString().replace(/\r\n?/g, "\n").trim();
    const path = currentPath();
    if (!root || !text || !path) {
      removeActions(false);
      return;
    }
    state = {
      path,
      range: range.cloneRange(),
      text,
      docxIndexes: docxSelectionIndexes(root, range),
    };
    if (!state.docxIndexes?.length) {
      removeActions(false);
      return;
    }
    showActions(state);
  }

  function schedule() {
    if (!refreshFrame) refreshFrame = window.requestAnimationFrame(refresh);
  }

  document.addEventListener("selectionchange", schedule);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("keyup", schedule);
  document.addEventListener("pointerdown", (event) => {
    const actions = document.getElementById(ACTIONS_ID);
    if (actions && event.target instanceof Node && actions.contains(event.target)) return;
    removeActions(false);
  }, true);
})();
