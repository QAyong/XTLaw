import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { IconCheck, IconCopy } from "../icons";
import { SelectionActionPopover } from "../SelectionActionPopover";
import { useCopy } from "../Markdown";
import {
  activeSelectionRange,
  placeSelectionQuote,
  selectionQuoteAnchor,
  selectionQuoteBounds,
  type SelectionQuoteBounds,
  type SelectionQuoteRect,
} from "../../lib/selection-quote";
import type { WorkspaceFileSelection } from "../../lib/workspace-file-selection";

type FileSelectionTarget = Omit<WorkspaceFileSelection, "path" | "language"> & {
  anchor: SelectionQuoteRect;
  bounds: SelectionQuoteBounds;
};

function elementForNode(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement;
}

function lineNumberForNode(
  node: Node | null,
  root: Element,
  end: boolean,
): number | undefined {
  const line = elementForNode(node)?.closest<HTMLElement>("[data-file-line-number]");
  const value = line?.dataset.fileLineNumber;
  if (value) {
    const number = Number.parseInt(value, 10);
    if (Number.isInteger(number) && number > 0) return number;
  }

  const lines = root.querySelectorAll<HTMLElement>("[data-file-line-number]");
  const fallback = end ? lines[lines.length - 1] : lines[0];
  const number = Number.parseInt(fallback?.dataset.fileLineNumber ?? "", 10);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function fileSelectionTarget(
  root: Element | null,
  viewport = { width: window.innerWidth, height: window.innerHeight },
): FileSelectionTarget | null {
  const range = activeSelectionRange();
  if (!root || !range) return null;
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    return null;
  }

  const text = range.toString().replace(/\r\n?/g, "\n").trim();
  if (!text) return null;

  const bounds = selectionQuoteBounds({ element: root, viewport });
  if (!bounds) return null;
  const anchor = selectionQuoteAnchor({ range, element: root, bounds });
  if (!anchor) return null;

  return {
    text,
    startLine: lineNumberForNode(range.startContainer, root, false),
    endLine: lineNumberForNode(range.endContainer, root, true),
    anchor,
    bounds,
  };
}

export function FileSelectionQuoteButton({
  containerRef,
  sessionId,
  canAddToChat,
  onAddComment,
}: {
  containerRef: RefObject<HTMLElement | null>;
  sessionId: string | null;
  canAddToChat: boolean;
  /** The pill collects the comment beside the selected workspace excerpt. */
  onAddComment: (
    selection: Omit<WorkspaceFileSelection, "path" | "language"> & { comment: string },
  ) => void;
}) {
  const { t } = useTranslation();
  const { copied, copy } = useCopy();
  const [target, setTarget] = useState<FileSelectionTarget | null>(null);
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState("");
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
    maxWidth: number;
  } | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const pressedRef = useRef(false);
  const commentingRef = useRef(false);
  const commentRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const clear = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      setTarget(null);
      setPlacement(null);
      commentingRef.current = false;
      setCommenting(false);
      setComment("");
    };
    const sync = () => {
      frame = 0;
      if (pressedRef.current || commentingRef.current) return;
      setTarget(fileSelectionTarget(containerRef.current));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(sync);
    };
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target;
      if (node instanceof Node && pillRef.current?.contains(node)) return;
      pressedRef.current = true;
      clear();
    };
    const onPointerUp = () => {
      if (!pressedRef.current) return;
      pressedRef.current = false;
      schedule();
    };

    document.addEventListener("selectionchange", schedule);
    window.addEventListener("dblclick", schedule);
    window.addEventListener("keyup", schedule);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, { capture: true, passive: true });
    schedule();
    return () => {
      clear();
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("dblclick", schedule);
      window.removeEventListener("keyup", schedule);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, { capture: true });
    };
  }, [containerRef]);

  const previousSessionId = useRef(sessionId);
  useEffect(() => {
    if (previousSessionId.current === sessionId) return;
    previousSessionId.current = sessionId;
    window.getSelection()?.removeAllRanges();
    setTarget(null);
    setPlacement(null);
    commentingRef.current = false;
    setCommenting(false);
    setComment("");
  }, [sessionId]);

  useLayoutEffect(() => {
    if (!target) {
      setPlacement(null);
      return;
    }
    const size = pillRef.current?.getBoundingClientRect();
    if (!size) return;
    setPlacement(
      placeSelectionQuote({ anchor: target.anchor, size, bounds: target.bounds }),
    );
  }, [target, commenting]);

  useLayoutEffect(() => {
    if (commenting) commentRef.current?.focus();
  }, [commenting]);

  const dismiss = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    commentingRef.current = false;
    setCommenting(false);
    setComment("");
    setTarget(null);
    setPlacement(null);
  }, []);

  if (!target) return null;

  const addToChat = () => {
    commentingRef.current = true;
    setCommenting(true);
  };

  const saveComment = (value = comment) => {
    onAddComment({
      text: target.text,
      startLine: target.startLine,
      endLine: target.endLine,
      comment: value,
    });
    dismiss();
  };

  if (commenting) {
    return createPortal(
      <div
        ref={pillRef}
        className="selection-quote is-comment"
        data-testid="file-selection-quote-comment"
        style={
          placement
            ? {
                top: placement.top,
                left: placement.left,
                maxWidth: placement.maxWidth,
              }
            : { top: 0, left: 0, visibility: "hidden" }
        }
      >
        <textarea
          ref={commentRef}
          className="selection-quote-comment-input"
          data-testid="file-selection-quote-comment-input"
          rows={2}
          value={comment}
          aria-label={t("chat.annotationCommentTitle")}
          placeholder={t("chat.annotationCommentPlaceholder")}
          onChange={(event) => setComment(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            if (event.key === "Escape") {
              event.preventDefault();
              dismiss();
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
            onClick={dismiss}
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
      </div>,
      document.body,
    );
  }

  return (
    <SelectionActionPopover
      pillRef={pillRef}
      placement={placement}
      testId="file-selection-quote"
      actions={[
        ...(canAddToChat
          ? [
              {
                key: "add",
                label: t("chat.addToChat"),
                onClick: addToChat,
              },
            ]
          : []),
        {
          key: "copy",
          label: copied ? <IconCheck size={13} /> : <IconCopy size={13} />,
          ariaLabel: t("chat.copy"),
          title: t("chat.copy"),
          iconOnly: true,
          onClick: () => copy(target.text),
        },
      ]}
    />
  );
}
