import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { ResponseAnnotation } from "../lib/response-annotations";
import { annotationRange, annotationRow, placeAnnotationBadges } from "../lib/response-annotation-anchor";
import { COMPOSER_DOCK_SELECTOR, intersectSelectionQuoteRect, selectionQuoteBounds, type SelectionQuoteRect } from "../lib/selection-quote";
import { useAppStore } from "../stores/app-store";
import { IconChevronDown, IconChevronRight, IconPencil, IconX } from "./icons";
import { TooltipButton } from "./ui";

const EMPTY: ResponseAnnotation[] = [];

/** One session's floating index and out-of-flow source badges; never edits Markdown. */
export function ResponseAnnotationOverlay({ sessionId, scrollRef, onNavigate }: {
  sessionId: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  onNavigate: (annotation: ResponseAnnotation) => void;
}) {
  const { t } = useTranslation();
  const annotations = useAppStore((state) => state.responseAnnotations[sessionId] ?? EMPTY);
  const edit = useAppStore((state) => state.openResponseAnnotationEditor);
  const remove = useAppStore((state) => state.removeResponseAnnotation);
  const clear = useAppStore((state) => state.clearResponseAnnotations);
  // The index rests above the composer as a one-line capsule; the excerpt list
  // is what the user opens. A batch that is sent or cleared closes it again, so
  // the next batch starts closed too (D-LOCAL-response-annotations).
  const [expanded, setExpanded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const [geometry, setGeometry] = useState<{
    badges: { id: string; index: number; left: number; top: number; exact: boolean }[];
    highlights: SelectionQuoteRect[];
  }>({ badges: [], highlights: [] });
  const [floatPosition, setFloatPosition] = useState<{
    left: number;
    bottom: number;
    maxWidth: number;
  } | null>(null);
  const sourceLayerRef = useRef<HTMLDivElement | null>(null);
  const scrollBaselineRef = useRef<number | null>(null);
  const scrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!annotations.some((annotation) => annotation.id === activeId)) setActiveId(null);
  }, [annotations, activeId]);

  useEffect(() => {
    if (!annotations.length) setExpanded(false);
  }, [annotations.length]);

  useLayoutEffect(() => {
    const root = scrollRef.current;
    const wrap = root?.parentElement;
    if (!root || !wrap || !annotations.length) {
      setGeometry({ badges: [], highlights: [] });
      setFloatPosition(null);
      scrollBaselineRef.current = null;
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      // The source layer follows the scroll compositor with a transform while
      // scrolling. Reset it before the exact layout pass so the new rects are
      // measured from a clean viewport position.
      if (sourceLayerRef.current) sourceLayerRef.current.style.transform = "";
      scrollBaselineRef.current = root.scrollTop;
      const wrapRect = wrap.getBoundingClientRect();
      const composerMaxWidth = Number.parseFloat(
        getComputedStyle(wrap).getPropertyValue("--chat-composer-max-width"),
      ) || 768;
      setFloatPosition({
        left: wrapRect.left + Math.max(24, (wrapRect.width - composerMaxWidth) / 2),
        bottom: Math.max(4, window.innerHeight - wrapRect.bottom + 4),
        maxWidth: Math.max(0, wrapRect.width - 48),
      });
      const dock = document.querySelector(COMPOSER_DOCK_SELECTOR);
      const bounds = selectionQuoteBounds({ element: root,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        bottomBoundaryTop: dock?.getBoundingClientRect().top,
      });
      if (!bounds) { setGeometry({ badges: [], highlights: [] }); return; }
      const badges: typeof geometry.badges = [];
      const highlights: SelectionQuoteRect[] = [];
      annotations.forEach((annotation, index) => {
        const row = annotationRow(root, annotation.messageId);
        if (!row) return;
        const range = annotationRange(row, annotation.anchor);
        const rects = range ? Array.from(range.getClientRects()) : [row.getBoundingClientRect()];
        const visible = rects.map((rect) => intersectSelectionQuoteRect(rect, bounds))
          .filter((rect): rect is SelectionQuoteRect => rect !== null);
        if (!visible.length) return;
        const rowRect = row.getBoundingClientRect();
        badges.push({ id: annotation.id, index: index + 1,
          left: Math.max(bounds.left, Math.min(rowRect.right + 4, bounds.right - 24)),
          top: visible[0].top, exact: range !== null,
        });
        if (range) highlights.push(...visible);
      });
      setGeometry({ badges: placeAnnotationBadges(badges, bounds.top, bounds.bottom), highlights });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const onScroll = () => {
      const baseline = scrollBaselineRef.current;
      if (baseline === null) {
        schedule();
        return;
      }
      const shift = baseline - root.scrollTop;
      if (sourceLayerRef.current) {
        sourceLayerRef.current.style.transform = shift
          ? `translate3d(0, ${shift}px, 0)`
          : "";
      }
      if (scrollSettleTimerRef.current) clearTimeout(scrollSettleTimerRef.current);
      scrollSettleTimerRef.current = setTimeout(() => {
        scrollSettleTimerRef.current = null;
        schedule();
      }, 100);
    };
    measure();
    root.addEventListener("scroll", onScroll, { capture: true, passive: true });
    root.addEventListener("scrollend", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(wrap);
    resize.observe(root);
    if (root.firstElementChild) resize.observe(root.firstElementChild);
    const dock = document.querySelector(COMPOSER_DOCK_SELECTOR);
    if (dock) resize.observe(dock);
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, { childList: true, subtree: true, characterData: true });
    return () => {
      cancelAnimationFrame(frame);
      if (scrollSettleTimerRef.current) clearTimeout(scrollSettleTimerRef.current);
      scrollSettleTimerRef.current = null;
      root.removeEventListener("scroll", onScroll, true);
      root.removeEventListener("scrollend", schedule);
      window.removeEventListener("resize", schedule);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [annotations, scrollRef]);

  if (!annotations.length) return null;
  const choose = (annotation: ResponseAnnotation) => {
    setActiveId(annotation.id);
    setExpanded(true);
    // A file or browser excerpt has no transcript row to travel to; it is
    // listed and edited here like any other annotation.
    if (annotation.messageId) onNavigate(annotation);
  };

  const annotationFloat = <aside className="response-annotation-float" data-annotation-layer
      aria-label={t("chat.annotationReview")} data-testid="annotation-float"
      style={floatPosition ?? { visibility: "hidden" }}>
      <div className="response-annotation-float-head">
        <button type="button" ref={toggleRef} className="response-annotation-float-toggle"
          aria-expanded={expanded} aria-controls={`annotation-list-${sessionId}`}
          onClick={() => setExpanded((value) => !value)}>
          {expanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          {t("chat.annotationChip", { count: annotations.length })}
        </button>
        {expanded ? <TooltipButton type="button" className="composer-annotation-clear"
          tooltip={t("chat.clearAnnotations")} ariaLabel={t("chat.clearAnnotations")} onClick={clear}>
          <IconX size={12} />
        </TooltipButton> : null}
      </div>
      {expanded ? <ol id={`annotation-list-${sessionId}`} className="response-annotation-float-list"
        data-testid="composer-annotation-menu">
        {annotations.map((annotation, index) => <li key={annotation.id}
          className={`composer-annotation-item${activeId === annotation.id ? " active" : ""}`}
          data-testid="composer-annotation-item">
          <div className="composer-annotation-item-head">
            <button type="button" className="response-annotation-locate"
              aria-label={`${t("chat.annotationLocate")} ${index + 1}`}
              onClick={() => choose(annotation)}>
              <span className="response-annotation-number">{index + 1}</span>
              <span className="composer-annotation-item-text" title={annotation.text}>{annotation.text}</span>
            </button>
            <TooltipButton type="button" className="composer-annotation-item-action"
              tooltip={t("chat.annotationEdit")} ariaLabel={`${t("chat.annotationEdit")} ${index + 1}`}
              onClick={() => edit({ messageId: annotation.messageId, text: annotation.text, annotationId: annotation.id, source: annotation.source })}>
              <IconPencil size={13} />
            </TooltipButton>
            <TooltipButton type="button" className="composer-annotation-item-action"
              tooltip={t("chat.annotationRemove")} ariaLabel={`${t("chat.annotationRemove")} ${index + 1}`}
              onClick={() => { remove(annotation.id); toggleRef.current?.focus(); }}>
              <IconX size={13} />
            </TooltipButton>
          </div>
          {annotation.annotation ? <p className="composer-annotation-item-comment">{annotation.annotation}</p> : null}
        </li>)}
      </ol> : null}
    </aside>;

  return <>
    {createPortal(annotationFloat, document.body)}
    {createPortal(<div ref={sourceLayerRef} className="response-annotation-source-layer" data-annotation-layer>
      {geometry.highlights.map((rect, index) => <span key={index} aria-hidden="true"
        className="response-annotation-highlight" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />)}
      {geometry.badges.map((badge) => {
        // A removal changes the list before its layout measurement runs.
        const index = annotations.findIndex((annotation) => annotation.id === badge.id);
        if (index < 0) return null;
        const annotation = annotations[index];
        return <button key={badge.id} type="button"
          className={`response-annotation-source-badge${activeId === badge.id ? " active" : ""}`}
          style={{ top: badge.top, left: badge.left }}
          aria-label={`${t("chat.annotationLocate")} ${index + 1}`}
          title={badge.exact ? annotation.text : t("chat.annotationRowLocation")}
          onClick={() => choose(annotation)}>{index + 1}</button>;
      })}
    </div>, document.body)}
  </>;
}
