import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { setNativeSurfaceRect } from "../../lib/native-surface-occlusion";
import type { WorkPanelLayoutMode } from "../../lib/work-panel-resize";
import { pluginViewIcon } from "../../lib/plugin-view-icons";
import { IconPlug } from "../icons";
import { WorkTabEmpty } from "./WorkTabEmpty";

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
 */
export function PluginViewTab({
  pluginId,
  viewId,
  title,
  icon,
  blocked = false,
  sessionId,
  location,
  layoutMode = "chat",
  sidebarCollapsed = false,
  sidebarEntering = false,
  sidebarExiting = false,
  sidebarWidth = 0,
}: {
  pluginId: string;
  viewId: string;
  title: string;
  icon?: string;
  blocked?: boolean;
  sessionId?: string;
  location?: string;
  layoutMode?: WorkPanelLayoutMode;
  sidebarCollapsed?: boolean;
  sidebarEntering?: boolean;
  sidebarExiting?: boolean;
  sidebarWidth?: number;
}) {
  const { t } = useTranslation();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const reportBoundsRef = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);

  // Create the view, and re-create it whenever the plugin's lifecycle changed
  // underneath us: a crash, a development reload, or a re-enable all destroy
  // the previous web contents while this tab stays open.
  useEffect(() => {
    let current = true;
    const open = async () => {
      try {
        await api.pluginViewOpen(pluginId, viewId, { sessionId, location });
        if (!current) return;
        // A reload destroys the native WebContentsView before the renderer
        // receives pluginChanged. Re-attach it only after open has completed;
        // calling setVisible earlier races the host's view creation and leaves
        // the work panel with a stale, non-interactive surface.
        await api.pluginViewSetVisible(pluginId, viewId, !blocked, sessionId);
        if (current) setFailed(false);
      } catch {
        if (current) setFailed(true);
      }
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
  }, [blocked, pluginId, viewId, sessionId, location]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || failed) return;
    void api.pluginViewSetVisible(pluginId, viewId, !blocked, sessionId);
    return () => {
      void api.pluginViewSetVisible(pluginId, viewId, false);
    };
  }, [pluginId, viewId, blocked, failed, sessionId]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || failed) return;
    const occlusionId = `${pluginId}:${viewId}`;
    let frame = 0;
    let disposed = false;
    let lastBounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    } | null = null;
    const reportNow = () => {
      if (disposed) return;
      const rect = surface.getBoundingClientRect();
      const bounds = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
      setNativeSurfaceRect(
        occlusionId,
        blocked
          ? null
          : {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            },
      );
      if (
        lastBounds &&
        lastBounds.x === bounds.x &&
        lastBounds.y === bounds.y &&
        lastBounds.width === bounds.width &&
        lastBounds.height === bounds.height
      ) {
        return;
      }
      lastBounds = bounds;
      void api.pluginViewSetBounds(bounds);
    };
    const report = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reportNow);
    };
    reportBoundsRef.current = report;
    const observer = new ResizeObserver(report);
    observer.observe(surface);
    window.addEventListener("resize", report);
    report();
    return () => {
      disposed = true;
      setNativeSurfaceRect(occlusionId, null);
      reportBoundsRef.current = () => {};
      observer.disconnect();
      window.removeEventListener("resize", report);
      cancelAnimationFrame(frame);
    };
  }, [blocked, pluginId, viewId, failed, layoutMode]);

  useEffect(() => {
    if (failed) return;
    const sidebarTransitioning = sidebarEntering || sidebarExiting;
    let frame = 0;
    // A native WebContentsView does not follow position-only layout changes.
    // Track the measured rect while the sidebar animates, then report once more
    // after the transition or a user-driven sidebar width change.
    const reportSidebarLayout = () => {
      reportBoundsRef.current();
      if (sidebarTransitioning) {
        frame = requestAnimationFrame(reportSidebarLayout);
      }
    };
    reportSidebarLayout();
    return () => cancelAnimationFrame(frame);
  }, [
    failed,
    sidebarCollapsed,
    sidebarEntering,
    sidebarExiting,
    sidebarWidth,
  ]);

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
