(function () {
  "use strict";

  // This view is shipped as a pre-built third-party plugin. Keep the small
  // selection affordance as a plain companion script so the host can update
  // the plugin without moving file-manager execution into the renderer.
  var MAX_CHARS = 12000;
  var ACTIONS_ID = "pi-file-selection-actions";
  var state = null;
  var refreshFrame = 0;
  var copiedTimer = 0;

  var style = document.createElement("style");
  style.textContent =
    ".pi-file-selection-actions{position:fixed;z-index:60;display:inline-flex;align-items:center;padding:3px;border:1px solid var(--border-strong);border-radius:999px;background:var(--surface-raised);color:var(--fg);font-size:11px;line-height:1.35;box-shadow:0 8px 28px color-mix(in oklab,#000 28%,transparent);animation:pi-file-selection-actions-in 120ms ease-out}" +
    ".pi-file-selection-actions button{display:inline-flex;align-items:center;gap:5px;min-height:22px;padding:3px 9px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;white-space:nowrap;cursor:pointer;transition:background 120ms ease-out}" +
    ".pi-file-selection-actions button:hover{background:var(--surface-hover)}" +
    ".pi-file-selection-actions button:active{transform:scale(.96)}" +
    ".pi-file-selection-actions button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}" +
    ".pi-file-selection-actions .icon{padding:3px 7px}" +
    ".pi-file-selection-actions .sep{align-self:stretch;width:1px;background:var(--border-strong)}" +
    "@keyframes pi-file-selection-actions-in{from{opacity:0}}" +
    "@media (prefers-reduced-motion:reduce){.pi-file-selection-actions{animation:none}}" +
    // The comment form of the same pill: Add to chat swaps the action row for
    // a compact input above the selection, so the comment is written next to
    // the passage it belongs to instead of in a window-centred editor.
    ".pi-file-selection-actions.is-comment{display:block;width:min(260px,calc(100vw - 16px));padding:6px;border-radius:12px}" +
    ".pi-file-selection-comment-input{display:block;width:100%;min-height:40px;max-height:120px;padding:4px 6px;border:0;background:transparent;color:inherit;font:inherit;font-size:12px;line-height:1.35;resize:none}" +
    ".pi-file-selection-comment-input:focus{outline:none}" +
    ".pi-file-selection-comment-input::placeholder{color:var(--fg);opacity:.4}" +
    ".pi-file-selection-comment-actions{display:flex;justify-content:flex-end;gap:4px;margin-top:2px}" +
    ".pi-file-selection-comment-actions button{display:inline-flex;align-items:center;min-height:22px;padding:3px 10px;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:11px;cursor:pointer}" +
    ".pi-file-selection-comment-actions button:hover{background:var(--surface-hover)}" +
    ".pi-file-selection-comment-actions button.primary{background:var(--accent);color:var(--surface-raised)}" +
    ".pi-file-selection-comment-actions button.primary:hover{opacity:.9}";
  document.head.appendChild(style);

  function bridge() {
    return window.pluginBridge;
  }

  function invoke(channel, payload) {
    var current = bridge();
    if (!current || typeof current.invoke !== "function") {
      return Promise.reject(new Error("plugin bridge unavailable"));
    }
    try {
      return Promise.resolve(current.invoke(channel, payload));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  function elementForNode(node) {
    if (!node) return null;
    return node.nodeType === 1 ? node : node.parentElement;
  }

  function selectionRoot(range) {
    var start = elementForNode(range.startContainer);
    var end = elementForNode(range.endContainer);
    if (!start || !end) return null;
    var startRoot = start.closest(".cm-content, .md-body");
    var endRoot = end.closest(".cm-content, .md-body");
    return startRoot && startRoot === endRoot && startRoot.contains(range.endContainer)
      ? startRoot
      : null;
  }

  function lineNumber(root, node, last) {
    if (!root.classList.contains("cm-content")) return null;
    var line = elementForNode(node) && elementForNode(node).closest(".cm-line");
    var lines = Array.prototype.slice.call(root.querySelectorAll(".cm-line"));
    var index = line ? lines.indexOf(line) : -1;
    if (index < 0) index = last ? lines.length - 1 : 0;
    var editor = root.closest(".cm-editor");
    var gutters = editor ? Array.prototype.slice.call(editor.querySelectorAll(".cm-gutterElement")) : [];
    var value = gutters[index] && gutters[index].textContent;
    var number = Number.parseInt(value || "", 10);
    return Number.isInteger(number) && number > 0 ? number : null;
  }

  function currentPath(root) {
    var section = root.closest("section");
    var path = section && section.querySelector("header span[title]");
    return path ? String(path.getAttribute("title") || "").trim() : "";
  }

  function relativeWorkspacePath(path) {
    return Boolean(path) &&
      !/^[A-Za-z]:[\\/]/.test(path) &&
      !/^\\\\/.test(path) &&
      !/^\//.test(path) &&
      path.split(/[\\/]+/).indexOf("..") === -1;
  }

  function codeLanguage(path) {
    var match = /\.([A-Za-z0-9]+)$/.exec(path || "");
    var ext = match ? match[1].toLowerCase() : "";
    var names = {
      cjs: "javascript", css: "css", htm: "html", html: "html", js: "javascript",
      json: "json", jsx: "jsx", md: "markdown", mdx: "markdown", mjs: "javascript",
      py: "python", rs: "rust", sh: "bash", sql: "sql", ts: "typescript",
      tsx: "tsx", txt: "text", vue: "vue", yaml: "yaml", yml: "yaml",
    };
    return names[ext] || ext || "text";
  }

  function fenceFor(text) {
    var longest = 0;
    var match;
    var runs = /`+/g;
    while ((match = runs.exec(text))) longest = Math.max(longest, match[0].length);
    return "`".repeat(Math.max(3, longest + 1));
  }

  function serialize(path, text, startLine, endLine) {
    var normalized = String(text || "").replace(/\r\n?/g, "\n").trim();
    if (!normalized) return "";
    var truncated = normalized.length > MAX_CHARS;
    var body = normalized.slice(0, MAX_CHARS).replace(/[\uD800-\uDBFF]$/, "").trimEnd();
    var lineLabel = Number.isInteger(startLine) && Number.isInteger(endLine) && endLine >= startLine
      ? startLine === endLine ? "line " + startLine : "lines " + startLine + "-" + endLine
      : "selected content";
    var location = Number.isInteger(startLine) && Number.isInteger(endLine) && endLine >= startLine
      ? "@" + path + ":" + startLine + (startLine === endLine ? "" : "-" + endLine)
      : "@" + path;
    var fence = fenceFor(body);
    var output = [
      "Here is selected content from a workspace file:",
      "",
      "File: " + path + " (" + lineLabel + ")",
      "Location: " + location,
      "",
      fence + codeLanguage(path),
      body,
    ];
    if (truncated) output.push("", "[Selection truncated after " + MAX_CHARS + " characters.]");
    output.push(fence);
    return output.join("\n");
  }

  function boundsFor(range, actions) {
    var rect = range.getBoundingClientRect();
    var width = actions.offsetWidth || 140;
    var height = actions.offsetHeight || 30;
    var gap = 8;
    var top = rect.top - height - gap;
    if (top < 8) top = rect.bottom + gap;
    var left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    return { top: top, left: left };
  }

  function removeActions(clearSelection) {
    var node = document.getElementById(ACTIONS_ID);
    if (node) node.remove();
    state = null;
    if (clearSelection && window.getSelection()) window.getSelection().removeAllRanges();
  }

  function labels() {
    return document.documentElement.lang.toLowerCase().indexOf("zh") === 0
      ? {
          add: "添加到聊天",
          copy: "复制",
          copied: "已复制",
          added: "已添加",
          comment: "评论",
          commentPlaceholder: "写下你的评论…",
          save: "保存",
          cancel: "取消",
        }
      : {
          add: "Add to chat",
          copy: "Copy",
          copied: "Copied",
          added: "Added",
          comment: "Comment",
          commentPlaceholder: "Write a comment…",
          save: "Save",
          cancel: "Cancel",
        };
  }

  /** The excerpt and the place it came from, with the comment it was given. */
  function selectionPayload(comment) {
    return {
      text: serialize(state.path, state.text, state.startLine, state.endLine),
      source: {
        file: {
          path: state.path,
          startLine: state.startLine,
          endLine: state.endLine,
        },
      },
      comment: comment,
    };
  }

  /**
   * Add to chat turns the pill into the comment input in place. The excerpt
   * stays on screen next to the passage it quotes, and nothing opens a
   * window-centred editor that this page — a native surface — would sit on top
   * of. `state` already snapshots the selection, so focusing the input (which
   * collapses the document selection) cannot lose it. Saving attaches the
   * excerpt with its comment; an empty comment still attaches the excerpt.
   */
  function openCommentInput(actions) {
    if (!state || !bridge()) return;
    state.mode = "comment";
    actions.classList.add("is-comment");
    actions.innerHTML = "";

    var input = document.createElement("textarea");
    input.className = "pi-file-selection-comment-input";
    input.rows = 2;
    input.placeholder = labels().commentPlaceholder;
    input.setAttribute("aria-label", labels().comment);
    input.addEventListener("keydown", function (event) {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        removeActions(false);
        return;
      }
      if (event.key !== "Enter" || event.shiftKey) return;
      event.preventDefault();
      save(input.value);
    });

    var row = document.createElement("div");
    row.className = "pi-file-selection-comment-actions";

    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = labels().cancel;
    cancel.addEventListener("click", function () { removeActions(false); });

    var submit = document.createElement("button");
    submit.type = "button";
    submit.className = "primary";
    submit.textContent = labels().save;
    submit.addEventListener("click", function () { save(input.value); });

    row.appendChild(cancel);
    row.appendChild(submit);
    actions.appendChild(input);
    actions.appendChild(row);

    // The card is wider than the action pill it replaced: re-anchor it above
    // the selection with its own size before it is painted.
    var position = boundsFor(state.range, actions);
    actions.style.top = position.top + "px";
    actions.style.left = position.left + "px";
    window.requestAnimationFrame(function () { input.focus(); });

    function save(comment) {
      var payload = state ? selectionPayload(comment) : null;
      if (!payload || !payload.text) return;
      submit.disabled = true;
      invoke("composer.addSelection", payload)
        .then(function () { removeActions(true); })
        .catch(function () {
          submit.disabled = false;
          invoke("ui.showToast", { message: labels().add + " failed" }).catch(function () {});
        });
    }
  }

  function makeActions() {
    var text = document.createElement("div");
    text.id = ACTIONS_ID;
    text.className = "pi-file-selection-actions";
    text.setAttribute("data-testid", "file-selection-quote");
    text.addEventListener("pointerdown", function (event) { event.preventDefault(); });

    var add = document.createElement("button");
    add.type = "button";
    add.className = "add";
    add.textContent = labels().add;
    add.addEventListener("click", function () {
      if (!state || !relativeWorkspacePath(state.path) || !bridge()) return;
      if (!serialize(state.path, state.text, state.startLine, state.endLine)) return;
      openCommentInput(text);
    });

    var separator = document.createElement("span");
    separator.className = "sep";
    separator.setAttribute("aria-hidden", "true");

    var copy = document.createElement("button");
    copy.type = "button";
    copy.className = "icon";
    copy.title = labels().copy;
    copy.setAttribute("aria-label", labels().copy);
    copy.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    copy.addEventListener("click", function () {
      if (!state || !bridge()) return;
      var selectedText = state.text;
      invoke("clipboard.writeText", { text: selectedText })
        .then(function () {
          copy.title = labels().copied;
          copy.setAttribute("aria-label", labels().copied);
          window.clearTimeout(copiedTimer);
          copiedTimer = window.setTimeout(function () { removeActions(false); }, 900);
        })
        .catch(function () {});
    });

    if (relativeWorkspacePath(state.path)) {
      text.appendChild(add);
      text.appendChild(separator);
    }
    text.appendChild(copy);
    document.body.appendChild(text);
    return text;
  }

  function refresh() {
    refreshFrame = 0;
    // The comment input owns the pill while it is open: focusing it collapses
    // the document selection, and a refresh would take the card away.
    if (state && state.mode === "comment") return;
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      removeActions(false);
      return;
    }
    var range = selection.getRangeAt(0);
    var root = selectionRoot(range);
    var selectedText = selection.toString().replace(/\r\n?/g, "\n").trim();
    if (!root || !selectedText) {
      removeActions(false);
      return;
    }
    var path = currentPath(root);
    if (!path) {
      removeActions(false);
      return;
    }
    state = {
      path: path,
      text: selectedText,
      startLine: lineNumber(root, range.startContainer, false),
      endLine: lineNumber(root, range.endContainer, true),
      range: range.cloneRange(),
    };
    var actions = document.getElementById(ACTIONS_ID) || makeActions();
    var position = boundsFor(range, actions);
    actions.style.top = position.top + "px";
    actions.style.left = position.left + "px";
  }

  function schedule() {
    if (!refreshFrame) refreshFrame = window.requestAnimationFrame(refresh);
  }

  document.addEventListener("selectionchange", schedule);
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  window.addEventListener("keyup", schedule);
  window.addEventListener("pointerdown", function (event) {
    var actions = document.getElementById(ACTIONS_ID);
    if (actions && event.target instanceof Node && actions.contains(event.target)) return;
    removeActions(false);
  });
})();
