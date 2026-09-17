/**
 * Floating selection overlay (ADR message-quotes-and-side-chats / D-LOCAL-selection-overlay).
 *
 * Mirrors the ChatGPT desktop app's selected-text overlay: a pill that floats
 * above the selection, centered on it, clamped into the bounds of the scroll
 * container it belongs to (never over the docked composer), and that follows the
 * selection while the thread scrolls.
 *
 * It is portaled to `document.body` and positioned in viewport coordinates, so
 * it never participates in the transcript's layout or scroll extent. The
 * selection is serialized back to Markdown when the pill appears — the DOM the
 * range points at can change while it is on screen — and every action only
 * writes a draft, a clipboard entry, a side chat, or the annotation comment
 * editor: nothing is sent to the conversation being read, no session is created,
 * and nothing is written to its transcript.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { RefObject } from "react";
import { IconCheck, IconCopy } from "./icons";
import { useCopy } from "./Markdown";
import { useAppStore } from "../stores/app-store";
import {
  selectionAnnotationAnchorWithinRow,
  type ResponseAnnotationAnchor,
} from "../lib/response-annotation-anchor";
import {
  activeSelectionRange,
  COMPOSER_DOCK_SELECTOR,
  placeSelectionQuote,
  quotableRowFor,
  selectionQuoteTarget,
  type SelectionQuoteTarget,
} from "../lib/selection-quote";

export function SelectionQuoteButton({
  scrollRef,
  title,
}: {
  /** The transcript this overlay quotes from; selections elsewhere are ignored. */
  scrollRef: RefObject<HTMLElement | null>;
  /** Source title for the quote attribution line. */
  title: string;
}) {
  const { t } = useTranslation();
  const quoteMessageIntoComposer = useAppStore((s) => s.quoteMessageIntoComposer);
  const addResponseAnnotation = useAppStore((s) => s.addResponseAnnotation);
  const openSideChat = useAppStore((s) => s.openSideChat);
  const { copied, copy } = useCopy();
  const [target, setTarget] = useState<SelectionQuoteTarget | null>(null);
  const [placement, setPlacement] = useState<{
    top: number;
    left: number;
    maxWidth: number;
  } | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  // Add to chat on an assistant turn turns the pill into the comment input in
  // place (D-LOCAL-selection-overlay): the comment is written next to the
  // passage it belongs to, so no window-centred editor has to open over the
  // work panel.
  const [comment, setComment] = useState("");
  const [commenting, setCommenting] = useState(false);
  // Read by the document listeners below, which are installed once.
  const commentingRef = useRef(false);
  const commentRef = useRef<HTMLTextAreaElement | null>(null);
  // The selected occurrence, read while the native selection is still live: the
  // comment input takes focus on the frame it appears, which collapses that
  // selection, and an annotation saved afterwards could no longer tell which
  // passage it quoted (D-LOCAL-response-annotations).
  const annotationAnchorRef = useRef<ResponseAnnotationAnchor | undefined>(undefined);
  // A press on the pill must not be read as "the user clicked away", and the
  // host refuses a fork while the visible turn is still running.
  const pressedRef = useRef(false);
  const sessionRunning = useAppStore((s) =>
    s.activeSessionId ? s.runningSessions[s.activeSessionId] === true : false,
  );

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      frame = 0;
      // Focusing the comment input collapses the document selection, and a
      // recomputed target would take the card away mid-sentence.
      if (pressedRef.current || commentingRef.current) return;
      const dock = document.querySelector(COMPOSER_DOCK_SELECTOR);
      const next = selectionQuoteTarget({
        scrollRoot: scrollRef.current,
        // The composer is a sibling of the transcript, so its top edge is
        // the visible reading boundary.
        bottomBoundaryTop: dock ? dock.getBoundingClientRect().top : null,
      });
      // The exact occurrence is snapshotted here, while the native selection is
      // still live: the comment input takes focus on the frame it appears and
      // collapses that selection, so reading it at save time would silently
      // fall back to locating the whole row (D-LOCAL-response-annotations).
      annotationAnchorRef.current = next?.annotatable
        ? selectionAnnotationAnchorWithinRow(next.rowAnchorId)
        : undefined;
      setTarget(next);
    };
    const schedule = () => {
      if (frame) return;
      // A drag fires selectionchange many times per frame, and each pass clones
      // DOM; one rAF per frame keeps a long drag from serializing repeatedly.
      frame = requestAnimationFrame(sync);
    };
    const clear = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      commentingRef.current = false;
      setCommenting(false);
      setComment("");
      setTarget(null);
      setPlacement(null);
      annotationAnchorRef.current = undefined;
    };
    const onPointerDown = (event: PointerEvent) => {
      const node = event.target;
      if (node instanceof Node && pillRef.current?.contains(node)) return;
      // Pressing elsewhere is a new selection or a dismissal: hold the old pill
      // back until the gesture settles.
      pressedRef.current = true;
      clear();
    };
    const onPointerUp = () => {
      if (!pressedRef.current) return;
      pressedRef.current = false;
      schedule();
    };
    // Scroll does not bubble, so the capture phase is what catches the
    // transcript's own scroller. Scrolling something unrelated to the selection
    // (the sidebar, a settings page) must not move the pill.
    const onScroll = (event: Event) => {
      if (pressedRef.current) return;
      const range = activeSelectionRange();
      const row = range ? quotableRowFor(range.startContainer) : null;
      const node = event.target;
      if (!row || !(node instanceof Node) || !node.contains(row)) return;
      schedule();
    };
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("dblclick", schedule);
    window.addEventListener("keyup", schedule);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    // A selection that already exists on mount (a re-rendered pane) still owns
    // its pill without waiting for the next document event.
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
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [scrollRef]);

  // The pill is laid out before it is measured, so the first painted frame
  // already has its final place: no visible jump from a provisional spot.
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

  // The input takes the caret on the frame it appears, so Add to chat then
  // typing needs no second click.
  useLayoutEffect(() => {
    if (commenting) commentRef.current?.focus();
  }, [commenting]);

  const dismiss = useCallback(() => {
    // Mirrors the reference behavior: the action consumes the selection, so the
    // pill does not survive its own click.
    window.getSelection()?.removeAllRanges();
    commentingRef.current = false;
    setCommenting(false);
    setComment("");
    setTarget(null);
    setPlacement(null);
    annotationAnchorRef.current = undefined;
  }, []);

  if (!target) return null;

  const addToChat = () => {
    if (target.annotatable) {
      // A response turn turns the pill itself into the comment input, anchored
      // above the passage it quotes (D-LOCAL-selection-overlay). Both the excerpt
      // and the exact occurrence were snapshotted while the selection was still
      // live, so focusing the input cannot lose either of them.
      commentingRef.current = true;
      setCommenting(true);
      return;
    }
    quoteMessageIntoComposer({ title, text: target.markdown });
    dismiss();
  };

  const saveComment = () => {
    addResponseAnnotation({
      messageId: target.rowAnchorId,
      text: target.markdown,
      comment,
      anchor: annotationAnchorRef.current,
    });
    dismiss();
  };

  const askInSideChat = async () => {
    await openSideChat(target.rowAnchorId, target.markdown);
    dismiss();
  };

  // The comment form of the same pill. It keeps the pill's anchor above the
  // passage, so the excerpt it quotes stays on screen while the comment is
  // written, and it never crosses into the work panel's native surface.
  if (commenting) {
    return createPortal(
      <div
        ref={pillRef}
        className="selection-quote is-comment"
        data-testid="selection-quote-comment"
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
          data-testid="selection-quote-comment-input"
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
            if (!event.repeat) saveComment();
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
            onClick={saveComment}
          >
            {t("common.save")}
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      ref={pillRef}
      className="selection-quote"
      data-testid="selection-quote"
      style={
        placement
          ? {
              top: placement.top,
              left: placement.left,
              maxWidth: placement.maxWidth,
            }
          : { top: 0, left: 0, visibility: "hidden" }
      }
      // Keeping the selection alive through the press is what lets the quote be
      // taken from it rather than from a collapsed caret.
      onPointerDown={(event) => event.preventDefault()}
    >
      <button type="button" className="selection-quote-action" onClick={addToChat}>
        {t("chat.addToChat")}
      </button>
      <span className="selection-quote-sep" aria-hidden="true" />
      <button
        type="button"
        className="selection-quote-action"
        disabled={sessionRunning}
        onClick={() => void askInSideChat()}
      >
        {t("chat.askInSideChat")}
      </button>
      <span className="selection-quote-sep" aria-hidden="true" />
      <button
        type="button"
        className="selection-quote-action icon"
        aria-label={t("chat.copy")}
        title={t("chat.copy")}
        onClick={() => copy(target.markdown)}
      >
        {copied ? <IconCheck size={13} /> : <IconCopy size={13} />}
      </button>
    </div>,
    document.body,
  );
}
