/**
 * Compact comment editor for one response annotation (ADR response-annotations / D-LOCAL-response-annotations).
 *
 * The visual contract intentionally matches the original selection comment
 * pill: Add to chat swaps the action row for a small textarea with Cancel and
 * Save. The excerpt remains a renderer snapshot in the store; this card does
 * not open a second large dialog or repeat the selected text.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAppStore } from "../stores/app-store";
import type { ResponseAnnotationEditor } from "../lib/response-annotations";

export function ResponseAnnotationDialog() {
  const editor = useAppStore((s) => s.responseAnnotationEditor);
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  const saveResponseAnnotationEditor = useAppStore(
    (s) => s.saveResponseAnnotationEditor,
  );
  const closeResponseAnnotationEditor = useAppStore(
    (s) => s.closeResponseAnnotationEditor,
  );
  const owned = editor && editor.sessionId === activeSessionId ? editor : null;

  // The editor belongs to the session it was opened in: switching sessions
  // must not carry a half-written comment into another conversation.
  useEffect(() => {
    if (editor && editor.sessionId !== activeSessionId) {
      closeResponseAnnotationEditor();
    }
  }, [editor, activeSessionId, closeResponseAnnotationEditor]);

  if (!owned) return null;
  return (
    <CommentEditor
      // A different excerpt or annotation is a different editor: remounting
      // seeds the textarea from that annotation's own comment.
      key={`${owned.sessionId}\u0000${owned.annotationId ?? owned.text}`}
      editor={owned}
      onSave={saveResponseAnnotationEditor}
      onClose={closeResponseAnnotationEditor}
    />
  );
}

function CommentEditor({
  editor,
  onSave,
  onClose,
}: {
  editor: ResponseAnnotationEditor;
  onSave: (comment: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [comment, setComment] = useState(editor.comment);
  const [position, setPosition] = useState<{
    top?: number;
    left: number;
    maxWidth: number;
    bottom?: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const input = textareaRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key !== "Escape") return;
      event.preventDefault();
      // The comment pill owns Escape, not the application's abort shortcut.
      event.stopImmediatePropagation();
      onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && dialogRef.current?.contains(event.target)) {
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      if (previouslyFocused?.isConnected && previouslyFocused !== document.body) {
        previouslyFocused.focus();
        if (document.activeElement === previouslyFocused) return;
      }
      document.querySelector<HTMLElement>(
        '[data-composer-dock] [contenteditable="true"]',
      )?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // The shared editor is used for existing annotation edits and assistant
    // turn actions. Keep it above the composer and remeasure when the shell
    // layout changes; sidebar resizing changes the composer width without
    // emitting `window.resize`.
    let frame = 0;
    const measure = () => {
      frame = 0;
      const dock = document.querySelector<HTMLElement>("[data-composer-dock]");
      const stack = dock?.querySelector<HTMLElement>(".composer-stack");
      const dockRect = dock?.getBoundingClientRect();
      const stackRect = stack?.getBoundingClientRect();
      const maxWidth = Math.max(
        0,
        Math.min(
          260,
          window.innerWidth - 16,
          stackRect?.width ?? window.innerWidth - 16,
        ),
      );
      const reference = stackRect ?? dockRect;
      const left = reference
        ? Math.max(
            8,
            Math.min(
              window.innerWidth - maxWidth - 8,
              reference.left + (reference.width - maxWidth) / 2,
            ),
          )
        : Math.max(8, (window.innerWidth - maxWidth) / 2);
      setPosition({
        left,
        maxWidth,
        bottom: dockRect
          ? Math.max(8, window.innerHeight - dockRect.top + 8)
          : 24,
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const dock = document.querySelector<HTMLElement>("[data-composer-dock]");
    const stack = dock?.querySelector<HTMLElement>(".composer-stack");
    const mainPane = document.querySelector<HTMLElement>(".main-pane");
    const appShell = document.querySelector<HTMLElement>(".app-shell");
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    for (const target of [dock, stack, mainPane, appShell]) {
      if (resize && target) resize.observe(target);
    }
    const mutation = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
    if (appShell && mutation) {
      mutation.observe(appShell, { attributes: true, attributeFilter: ["class", "style"] });
    }
    measure();
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, []);

  const saveComment = (value = comment) => onSave(value);

  const dialog = (
    <div
      ref={dialogRef}
      className="selection-quote is-comment response-annotation-popover"
      role="dialog"
      aria-modal="false"
      aria-label={t("chat.annotationCommentTitle")}
      data-testid="annotation-comment-dialog"
      style={position ?? { top: 0, left: 0, visibility: "hidden" }}
    >
      <textarea
        ref={textareaRef}
        className="selection-quote-comment-input"
        data-testid="annotation-comment-input"
        rows={2}
        value={comment}
        aria-label={t("chat.annotationCommentTitle")}
        placeholder={t("chat.annotationCommentPlaceholder")}
        onChange={(event) => setComment(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
            return;
          }
          if (event.key !== "Enter" || event.shiftKey) return;
          event.preventDefault();
          event.stopPropagation();
          if (!event.repeat) saveComment(event.currentTarget.value);
        }}
      />
      <div className="selection-quote-comment-actions">
        <button
          type="button"
          className="btn btn-ghost selection-quote-comment-btn"
          onClick={onClose}
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          className="btn btn-primary selection-quote-comment-btn"
          onClick={() => saveComment()}
        >
          {t("common.save")}
        </button>
      </div>
    </div>
  );

  return typeof document === "undefined"
    ? dialog
    : createPortal(dialog, document.body);
}
