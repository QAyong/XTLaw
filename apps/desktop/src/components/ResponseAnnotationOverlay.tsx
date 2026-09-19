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

/** One session's pending-annotation surface and optional out-of-flow source badges. */
export function ResponseAnnotationOverlay({
  sessionId,
  scrollRef,
  onNavigate,
  showAttachment = true,
}: {
  sessionId: string;
  /** Transcript scroller used for source highlights; omit for the composer surface. */
  scrollRef?: RefObject<HTMLDivElement | null> | null;
  onNavigate?: (annotation: ResponseAnnotation) => void;
  /** Transcript keeps the source markers but delegates the pending list to ChatSurface. */
  showAttachment?: boolean;
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
  const scrollLayerRef = useRef<HTMLDivElement | null>(null);
  const scrollBaselineRef = useRef<number | null>(null);
  const scrollSettleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!annotations.some((annotation) => annotation.id === activeId)) setActiveId(null);
  }, [annotations, activeId]);

  useEffect(() => {
    if (!annotations.length) setExpanded(false);
  }, [annotations.length]);

  useLayoutEffect(() => {
    const root = scrollRef?.current ?? null;
    const wrap = root?.parentElement;
    if (!annotations.length) {
      setGeometry({ badges: [], highlights: [] });
      setFloatPosition(null);
      scrollBaselineRef.current = null;
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      // The empty-session home surface uses `data-composer-dock="home"`;
      // pending file/browser annotations must remain visible there too. The
      // transcript bounds below still use the docked-only selector because
      // only a transcript has a reading boundary to clamp against.
      const composerDock = document.querySelector<HTMLElement>("[data-composer-dock]");
      const dockRect = composerDock?.getBoundingClientRect();
      const stackRect = composerDock
        ?.querySelector<HTMLElement>(".composer-stack")
        ?.getBoundingClientRect();
      const anchorRect = wrap?.getBoundingClientRect() ?? stackRect ?? dockRect;
      if (anchorRect) {
        const composerMaxWidth = wrap
          ? Number.parseFloat(
              getComputedStyle(wrap).getPropertyValue("--chat-composer-max-width"),
            ) || 768
          : anchorRect.width;
        setFloatPosition({
          left: wrap
            ? anchorRect.left + Math.max(24, (anchorRect.width - composerMaxWidth) / 2)
            : anchorRect.left,
          bottom: Math.max(
            4,
            window.innerHeight - (dockRect?.top ?? anchorRect.bottom) + 4,
          ),
          maxWidth: Math.max(0, (dockRect ?? anchorRect).width - 48),
        });
      } else {
        setFloatPosition(null);
      }
      if (!root || !wrap) {
        setGeometry({ badges: [], highlights: [] });
        return;
      }
      scrollBaselineRef.current = root.scrollTop;
      const transcriptDock = document.querySelector(COMPOSER_DOCK_SELECTOR);
      const bounds = selectionQuoteBounds({ element: root,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        bottomBoundaryTop: transcriptDock?.getBoundingClientRect().top,
      });
      if (!bounds) { setGeometry({ badges: [], highlights: [] }); return; }
      // The band is clipped by the outer layer, which never moves, while the
      // inner layer is translated with the scroll. Highlights therefore stay
      // cut exactly at the transcript edges and the docked composer at every
      // scroll offset, and the rects below are stored unclipped for that.
      if (sourceLayerRef.current) {
        sourceLayerRef.current.style.clipPath = `inset(${Math.max(0, bounds.top)}px `
          + `${Math.max(0, window.innerWidth - bounds.right)}px `
          + `${Math.max(0, window.innerHeight - bounds.bottom)}px ${Math.max(0, bounds.left)}px)`;
      }
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
        if (range) highlights.push(...rects);
      });
      setGeometry({ badges: placeAnnotationBadges(badges, bounds.top, bounds.bottom), highlights });
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const onScroll = () => {
      if (!root) return;
      const baseline = scrollBaselineRef.current;
      if (baseline === null) {
        schedule();
        return;
      }
      const shift = baseline - root.scrollTop;
      if (scrollLayerRef.current) {
        scrollLayerRef.current.style.transform = shift
          ? `translate3d(0, ${shift}px, 0)`
          : "";
      }
      if (scrollSettleTimerRef.current) clearTimeout(scrollSettleTimerRef.current);
      scrollSettleTimerRef.current = setTimeout(() => {
        scrollSettleTimerRef.current = null;
        schedule();
      }, 100);
    };
    // Engines that report `scrollend` drop the pending settle timer, so one stop
    // triggers a single exact measurement instead of two competing ones.
    const onScrollEnd = () => {
      if (scrollSettleTimerRef.current) {
        clearTimeout(scrollSettleTimerRef.current);
        scrollSettleTimerRef.current = null;
      }
      schedule();
    };
    // The attachment index has no transcript root (`scrollRef` is null), but it
    // still has to follow the composer when the sidebar changes the main-pane
    // width. Observe both layout boxes and the shell's inline CSS variable
    // updates; a sidebar drag does not emit `window.resize`.
    const composerDock = document.querySelector<HTMLElement>("[data-composer-dock]");
    const composerStack = composerDock?.querySelector<HTMLElement>(".composer-stack");
    const mainPane = document.querySelector<HTMLElement>(".main-pane");
    const appShell = document.querySelector<HTMLElement>(".app-shell");

    measure();
    if (root) {
      root.addEventListener("scroll", onScroll, { capture: true, passive: true });
      root.addEventListener("scrollend", onScrollEnd, { passive: true });
    }
    window.addEventListener("resize", schedule);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    const resizeTargets = [
      wrap,
      root,
      root?.firstElementChild,
      composerDock,
      composerStack,
      mainPane,
      appShell,
    ];
    if (resize) {
      for (const target of resizeTargets) {
        if (target) resize.observe(target);
      }
    }
    const mutation = typeof MutationObserver === "undefined" ? null : new MutationObserver(schedule);
    if (root && mutation) {
      mutation.observe(root, { childList: true, subtree: true, characterData: true });
    }
    if (appShell && mutation) {
      mutation.observe(appShell, { attributes: true, attributeFilter: ["class", "style"] });
    }
    return () => {
      cancelAnimationFrame(frame);
      if (scrollSettleTimerRef.current) clearTimeout(scrollSettleTimerRef.current);
      scrollSettleTimerRef.current = null;
      root?.removeEventListener("scroll", onScroll, true);
      root?.removeEventListener("scrollend", onScrollEnd);
      window.removeEventListener("resize", schedule);
      resize?.disconnect();
      if (mutation) mutation.disconnect();
    };
  }, [annotations, scrollRef, sessionId]);

  // While scrolling, the layer is offset with a compositor transform (see
  // `onScroll`). The freshly measured rects are published in a commit, and the
  // offset is dropped in that same commit's layout phase, so the swap paints
  // once. Clearing it before the new rects were committed painted the previous
  // measurement without the offset, which read as a flicker on every stop.
  useLayoutEffect(() => {
    if (scrollLayerRef.current) scrollLayerRef.current.style.transform = "";
  }, [geometry]);

  if (!annotations.length) return null;
  const choose = (annotation: ResponseAnnotation) => {
    setActiveId(annotation.id);
    setExpanded(true);
    // A file or browser excerpt has no transcript row to travel to; it is
    // listed and edited here like any other annotation.
    if (annotation.messageId) onNavigate?.(annotation);
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
    {showAttachment ? createPortal(annotationFloat, document.body) : null}
    {scrollRef ? createPortal(<div ref={sourceLayerRef} className="response-annotation-source-layer" data-annotation-layer>
      <div ref={scrollLayerRef} className="response-annotation-scroll-layer">
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
      </div>
    </div>, document.body) : null}
  </>;
}
