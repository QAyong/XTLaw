import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { pluginViewIcon } from "../../lib/plugin-view-icons";
import { IconPlug } from "../icons";
import { WorkTabEmpty } from "./WorkTabEmpty";

const PLUGIN_VIEW_DIVIDER_PX = 1;

/**
 * How long the surface keeps re-measuring after a render. A docked layout
 * change animates for up to `--motion-duration-slow` (300ms), so the window
 * has to outlast the transition that started it.
 */
const PLUGIN_VIEW_SETTLE_MS = 400;

/**
 * A blocking renderer overlay — the shared modal dialog family. Closed dialogs
 * unmount, so a match is a dialog the user is looking at.
 */
const BLOCKING_OVERLAY_SELECTOR = "[aria-modal]";

/**
 * Does any of those dialogs actually reach into the dock?
 *
 * Only the dialog box itself has to clear the surface — the scrim behind it is
 * decoration, and the dock's part of it is covered by the native page anyway.
 * The comment editor insets its centring to the conversation pane, which ends
 * where the panel begins, so it never reaches the dock and the surface stays up.
 * A window-centred modal that really does cross the boundary still yields the
 * surface, because no renderer layer can rise above a native page.
 */
function blockingOverlayOver(surface: HTMLElement | null): boolean {
  if (!surface) return false;
  const rect = surface.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const dialogs = document.querySelectorAll(BLOCKING_OVERLAY_SELECTOR);
  return Array.from(dialogs).some((dialog) => {
    if (dialog.getClientRects().length === 0) return false;
    const box = dialog.getBoundingClientRect();
    return (
      box.left < rect.right &&
      box.right > rect.left &&
      box.top < rect.bottom &&
      box.bottom > rect.top
    );
  });
}


/**
 * A plugin-contributed work panel view (ADR 0104).
 *
 * The surface itself is a main-process `WebContentsView`, the same isolated
 * page a `ui.panel` window hosts; this component renders nothing into it. It
 * measures the placeholder rect and drives visibility. The view composites
 * above renderer content, so a panel-wide blocking overlay still hides it.
 * The work-panel menu temporarily blocks the active view while open, which
 * keeps the menu inside the dock without changing plugin bounds or pushing the
 * plugin body down.
 *
 * Following the dock is not only a resize problem: collapsing, dragging, or
 * swapping the columns moves the surface without changing its size, so a
 * `ResizeObserver` alone would leave the native page at its previous origin —
 * painting over the chat column and the selection pill that belongs to it.
 *
 * It also yields to blocking overlays: a dialog from the shared modal family is
 * centered on the window, so its right half lands in the dock, where the native
 * page would paint over it and hide the dialog's own actions.
 */
export function PluginViewTab({
  pluginId,
  viewId,
  title,
  icon,
  blocked = false,
  sessionId,
  location,
  panelSide = "right",
}: {
  pluginId: string;
  viewId: string;
  title: string;
  icon?: string;
  blocked?: boolean;
  sessionId?: string;
  location?: string;
  /** The dock can move between the left and right side of the shell. */
  panelSide?: "left" | "right";
}) {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [overlayBlocking, setOverlayBlocking] = useState(false);
  // Set by the bounds effect. The per-render settle below calls through it,
  // so following a layout change never re-subscribes the observer.
  const settleBoundsRef = useRef<() => void>(() => {});

  // Create the view, and re-create it whenever the plugin's lifecycle changed
  // underneath us: a crash, a development reload, or a re-enable all destroy
  // the previous web contents while this tab stays open.
  useEffect(() => {
    let current = true;
    const open = () => {
      void api.pluginViewOpen(pluginId, viewId, { sessionId, location }).then(
        () => {
          if (current) setFailed(false);
        },
        () => {
          if (current) setFailed(true);
        },
      );
    };
    open();
    const off = api.onPluginChanged((event) => {
      if (event?.pluginId && event.pluginId !== pluginId) return;
      open();
    });
    return () => {
      current = false;
      off();
    };
  }, [pluginId, viewId, sessionId, location]);

  // The renderer mounts no portal for a closed dialog, so a mounted modal is an
  // open one and the DOM itself is the signal: this observer costs nothing
  // while the dock and every dialog are still.
  useEffect(() => {
    const sync = () => setOverlayBlocking(blockingOverlayOver(surfaceRef.current));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    // An open dialog outlives a window resize, and the boundary it has to
    // clear moves with the layout, so re-compare rather than trust the mount.
    window.addEventListener("resize", sync);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || failed) return;
    void api.pluginViewSetVisible(
      pluginId,
      viewId,
      !blocked && !overlayBlocking,
      sessionId,
    );
    return () => {
      void api.pluginViewSetVisible(pluginId, viewId, false);
    };
  }, [pluginId, viewId, blocked, overlayBlocking, failed, sessionId]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || failed) return;
    let frame = 0;
    let settleFrame = 0;
    let settleUntil = 0;
    let reported = "";
    const measure = () => {
      const rect = surface.getBoundingClientRect();
      const dividerInset = rect.width > 0 ? PLUGIN_VIEW_DIVIDER_PX : 0;
      const nativeX = panelSide === "right" ? rect.x + dividerInset : rect.x;
      const bounds = {
        x: nativeX,
        y: rect.y,
        width: Math.max(0, rect.width - dividerInset),
        height: rect.height,
      };
      // The settle window measures every frame, so an unchanged rectangle has
      // to cost nothing: a still dock sends no IPC at all.
      const signature = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
      if (signature === reported) return;
      reported = signature;
      void api.pluginViewSetBounds(bounds);
    };
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    // The render that changes a column is only the start of the move: the
    // transition keeps the dock travelling for a few hundred milliseconds
    // while React stays quiet. Follow it frame by frame for that long.
    const settle = () => {
      settleUntil = performance.now() + PLUGIN_VIEW_SETTLE_MS;
      if (settleFrame) return;
      const step = () => {
        settleFrame = 0;
        measure();
        if (performance.now() < settleUntil) {
          settleFrame = requestAnimationFrame(step);
        }
      };
      settleFrame = requestAnimationFrame(step);
    };
    settleBoundsRef.current = settle;
    const observer = new ResizeObserver(report);
    observer.observe(surface);
    window.addEventListener("resize", report);
    report();
    return () => {
      settleBoundsRef.current = () => {};
      observer.disconnect();
      window.removeEventListener("resize", report);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(settleFrame);
    };
  }, [failed, panelSide, pluginId, viewId]);

  // Collapsing, dragging, or swapping the columns moves the dock without
  // resizing it, and none of the listeners inside the effect above can see
  // that. Every render is the trigger instead: the native page follows the
  // layout it belongs to instead of staying where the dock used to be.
  useLayoutEffect(() => {
    settleBoundsRef.current();
  });

  if (failed) {
    return (
      <div className="work-plugin-view">
        <WorkTabEmpty
          icon={pluginViewIcon(icon) ?? IconPlug}
          title={title}
          body={t("panel.pluginView.failed")}
        />
      </div>
    );
  }

  return (
    <div className="work-plugin-view">
      <div ref={surfaceRef} className="work-plugin-view-surface" />
    </div>
  );
}
