// The tab strip needs enough room to expose useful context beside the fixed
// Windows/Linux titlebar reservation. Existing persisted widths remain intact;
// this only affects a new profile without a saved preference.
export const WORK_PANEL_MIN_WIDTH = 244;
export const WORK_PANEL_DEFAULT_WIDTH = 360;
export const CONTENT_FOCUS_CHAT_MIN_WIDTH = 320;
export const WORK_PANEL_CHAT_MIN_WIDTH = 1040;
export const WORK_PANEL_CHAT_MAX_WIDTH = 10000;
/**
 * Hard MainChat floor for the in-flow three-column shell. The work panel may
 * never take width below it, and yields before changing the user-controlled
 * sidebar state. The value
 * is derived from the composer toolbar's unfolded row (plus button, mode and
 * permission chips, model/thinking chip, enhance and send buttons) plus its
 * margins: below this width the composer would fold, so it replaces the 515px
 * composer reservation of ADR 0226.
 */
export const MAIN_PANE_MIN_WIDTH = 450;
export const MAIN_PANE_REOPEN_TARGET_WIDTH = MAIN_PANE_MIN_WIDTH + 10;
/**
 * The regular panel minimum is a presentation affordance. The sidebar reopen
 * path may temporarily spend the whole right column to preserve MainChat, so
 * a positive compact width must remain representable in persisted state.
 */
export const WORK_PANEL_COMPACT_MIN_WIDTH = 1;

export type WorkPanelChatResizeGesture = {
  startClientX: number;
  startWidth: number;
};

/**
 * Lower bound for the work-panel width. There is deliberately no matching
 * constant upper bound: the panel's maximum is the live three-column budget, so
 * a wide window can spend client width on the panel down to the MainChat floor
 * instead of stopping at a fixed pixel cap.
 */
export function workPanelWidthLimits(min = WORK_PANEL_MIN_WIDTH) {
  return {
    min: Math.max(WORK_PANEL_COMPACT_MIN_WIDTH, Math.round(min)),
  };
}

export function clampWorkPanelWidth(
  width: number,
  min = WORK_PANEL_MIN_WIDTH,
) {
  return Math.max(workPanelWidthLimits(min).min, width);
}

export type WorkPanelLayout = {
  mainWidth: number;
  panelWidth: number;
  maxPanelWidth: number;
};

/**
 * Shared three-column budget. The shell is a fixed-width client area, so the
 * panel gives up width before the user-controlled sidebar does. The cap is the
 * remaining client width after the sidebar and MainChat's hard floor, so a
 * narrow window keeps all three columns usable without changing sidebar state.
 */
export function workPanelLayout({
  containerWidth,
  sidebarWidth,
  sidebarCollapsed,
  requestedPanelWidth,
  maximized = false,
}: {
  containerWidth: number;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  requestedPanelWidth: number;
  maximized?: boolean;
}): WorkPanelLayout {
  const width = Math.max(0, Math.round(containerWidth));
  const leftWidth = sidebarCollapsed ? 0 : Math.max(0, Math.round(sidebarWidth));
  // Maximized preview: MainChat is not rendered at all, so the panel takes the
  // whole client area beside the sidebar and the MainChat floor does not apply.
  if (maximized) {
    const fullWidth = Math.max(0, width - leftWidth);
    return {
      mainWidth: 0,
      panelWidth: fullWidth,
      maxPanelWidth: fullWidth,
    };
  }
  const requested = clampWorkPanelWidth(
    requestedPanelWidth,
    requestedPanelWidth < WORK_PANEL_MIN_WIDTH
      ? WORK_PANEL_COMPACT_MIN_WIDTH
      : WORK_PANEL_MIN_WIDTH,
  );
  const maxPanelWidth = Math.max(
    0,
    width - leftWidth - MAIN_PANE_MIN_WIDTH,
  );
  const panelWidth = Math.min(requested, maxPanelWidth);
  return {
    mainWidth: Math.max(0, width - leftWidth - panelWidth),
    panelWidth,
    maxPanelWidth,
  };
}

export type WorkPanelFocusLayout = {
  chatWidth: number;
  panelWidth: number;
  minPanelWidth: number;
  maxPanelWidth: number;
};

/**
 * Content-focus layout: give the work panel the space MainChat normally owns,
 * while keeping a usable compact chat column on the opposite side.
 */
export function workPanelFocusLayout({
  containerWidth,
  sidebarWidth,
  sidebarCollapsed,
  requestedPanelWidth,
}: {
  containerWidth: number;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  requestedPanelWidth: number;
}): WorkPanelFocusLayout {
  const width = Math.max(0, Math.round(containerWidth));
  const leftWidth = sidebarCollapsed ? 0 : Math.max(0, Math.round(sidebarWidth));
  const availableWidth = Math.max(0, width - leftWidth);
  // Keep a normal work surface first, then reserve a usable 320px secondary
  // chat column whenever the client area allows it.
  const maxPanelWidth = Math.max(
    WORK_PANEL_COMPACT_MIN_WIDTH,
    availableWidth - CONTENT_FOCUS_CHAT_MIN_WIDTH,
  );
  const minPanelWidth = Math.min(MAIN_PANE_MIN_WIDTH, maxPanelWidth);
  const panelWidth = Math.min(
    maxPanelWidth,
    Math.max(minPanelWidth, Math.round(requestedPanelWidth)),
  );
  return {
    chatWidth: Math.max(0, availableWidth - panelWidth),
    panelWidth,
    minPanelWidth,
    maxPanelWidth,
  };
}

/**
 * Computes the right-column width used while manually reopening the sidebar.
 * The right column gives up its space first, preserving the current MainChat
 * width. If that cannot keep the 450px hard floor, the 460px reopen target is
 * used as the next best stable width.
 */
export function workPanelWidthForSidebarReopen({
  containerWidth,
  sidebarWidth,
  currentPanelWidth,
}: {
  containerWidth: number;
  sidebarWidth: number;
  currentPanelWidth: number;
}) {
  const width = Math.max(0, Math.round(containerWidth));
  const leftWidth = Math.max(0, Math.round(sidebarWidth));
  const panelWidth = clampWorkPanelWidth(
    currentPanelWidth,
    currentPanelWidth < WORK_PANEL_MIN_WIDTH
      ? WORK_PANEL_COMPACT_MIN_WIDTH
      : WORK_PANEL_MIN_WIDTH,
  );
  const remainingAfterSidebar = width - leftWidth;
  const preservedMainWidth = remainingAfterSidebar - panelWidth;
  const targetMainWidth =
    preservedMainWidth >= MAIN_PANE_MIN_WIDTH
      ? preservedMainWidth
      : MAIN_PANE_REOPEN_TARGET_WIDTH;
  return Math.max(
    WORK_PANEL_COMPACT_MIN_WIDTH,
    Math.min(panelWidth, remainingAfterSidebar - targetMainWidth),
  );
}

export function clampWorkPanelChatWidth(width: number) {
  return Math.max(
    WORK_PANEL_CHAT_MIN_WIDTH,
    Math.min(WORK_PANEL_CHAT_MAX_WIDTH, Math.round(width)),
  );
}

export function workPanelChatWidthFromPointer(
  gesture: WorkPanelChatResizeGesture,
  clientX: number,
) {
  return clampWorkPanelChatWidth(
    gesture.startWidth + clientX - gesture.startClientX,
  );
}

export function parseWorkPanelChatWidth(input: unknown): number | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null;
  }
  const width = (input as { width?: unknown }).width;
  if (
    typeof width !== "number" ||
    !Number.isSafeInteger(width) ||
    width < WORK_PANEL_CHAT_MIN_WIDTH ||
    width > WORK_PANEL_CHAT_MAX_WIDTH
  ) {
    return null;
  }
  return width;
}

export function committedWorkPanelChatWidth(
  gesture: WorkPanelChatResizeGesture,
  previewWidth: number,
  commit: boolean,
) {
  if (!commit || previewWidth === gesture.startWidth) return null;
  return previewWidth;
}
