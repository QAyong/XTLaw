// The tab strip needs enough room to expose useful context beside the fixed
// Windows/Linux titlebar reservation. Existing persisted widths remain intact;
// this only affects a new profile without a saved preference.
export const WORK_PANEL_MIN_WIDTH = 244;
export const WORK_PANEL_DEFAULT_WIDTH = 360;
export const WORK_PANEL_CHAT_MIN_WIDTH = 1040;
export const WORK_PANEL_CHAT_MAX_WIDTH = 10000;
/**
 * Hard MainChat floor for the in-flow three-column shell. The work panel may
 * never take width below it, and the expanded sidebar yields first. The value
 * is derived from the composer toolbar's unfolded row (plus button, mode and
 * permission chips, model/thinking chip, enhance and send buttons) plus its
 * margins: below this width the composer would fold, so it replaces the 515px
 * composer reservation of ADR 0226.
 */
export const MAIN_PANE_MIN_WIDTH = 450;
/** Both chat/work orders preserve the same minimum conversation width. */
export const WORK_LAYOUT_CHAT_MIN_WIDTH = MAIN_PANE_MIN_WIDTH;
export const WORK_LAYOUT_CHAT_DEFAULT_WIDTH = MAIN_PANE_MIN_WIDTH;
export const WORK_LAYOUT_WORK_MIN_WIDTH = 300;
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

/**
 * Live bounds for a manual panel width: the compact minimum replaces the
 * regular minimum while the panel is below it, and the shared three-column
 * budget caps the growth. Pointer, keyboard, and reset paths share it so a
 * reset can never breach the MainChat floor.
 */
export function workPanelWidthBounds(
  panelMinimum = WORK_PANEL_MIN_WIDTH,
  maxPanelWidth: number,
) {
  const minimum = Math.min(panelMinimum, maxPanelWidth);
  return { minimum, maximum: Math.max(minimum, maxPanelWidth) };
}

/**
 * Double-click reset for the panel separator: the default width, clamped to
 * the live bounds, so a window narrower than the default keeps its budget cap.
 */
export function workPanelResetWidth(
  panelMinimum = WORK_PANEL_MIN_WIDTH,
  maxPanelWidth: number,
) {
  const { minimum, maximum } = workPanelWidthBounds(panelMinimum, maxPanelWidth);
  const target = Math.min(Math.max(WORK_PANEL_DEFAULT_WIDTH, minimum), maximum);
  return clampWorkPanelWidth(target, minimum);
}

export type WorkPanelLayout = {
  mainWidth: number;
  panelWidth: number;
  maxPanelWidth: number;
  minTargetWidth: number;
  maxTargetWidth: number;
  targetWidth: number;
  shouldCollapseSidebar: boolean;
};

export type WorkPanelLayoutMode = "chat" | "work";

/**
 * Shared three-column budget. The shell is a fixed-width client area, so the
 * only way to satisfy the MainChat floor is to cap the panel and, at the
 * threshold, collapse the sidebar. The cap is the client width itself: a wide
 * window lets the panel keep growing until MainChat reaches its floor.
 */
export function workPanelLayout({
  layoutMode = "chat",
  containerWidth,
  sidebarWidth,
  sidebarCollapsed,
  requestedPanelWidth,
  maximized = false,
  rightPaneHidden = false,
}: {
  layoutMode?: WorkPanelLayoutMode;
  containerWidth: number;
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  /** Work-panel target in chat layout; chat target in work layout. */
  requestedPanelWidth: number;
  maximized?: boolean;
  rightPaneHidden?: boolean;
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
      minTargetWidth: 0,
      maxTargetWidth: fullWidth,
      targetWidth: fullWidth,
      shouldCollapseSidebar: false,
    };
  }
  if (layoutMode === "work") {
    const availableWidth = Math.max(0, width - leftWidth);
    if (rightPaneHidden) {
      return {
        mainWidth: 0,
        panelWidth: availableWidth,
        maxPanelWidth: availableWidth,
        minTargetWidth: 0,
        maxTargetWidth: availableWidth,
        targetWidth: 0,
        shouldCollapseSidebar: false,
      };
    }
    const maxChatWidth = Math.max(
      WORK_LAYOUT_CHAT_MIN_WIDTH,
      availableWidth - WORK_LAYOUT_WORK_MIN_WIDTH,
    );
    const targetWidth = Math.min(
      maxChatWidth,
      Math.max(WORK_LAYOUT_CHAT_MIN_WIDTH, Math.round(requestedPanelWidth)),
    );
    const mainWidth = Math.min(availableWidth, targetWidth);
    const panelWidth = Math.max(0, availableWidth - mainWidth);
    return {
      mainWidth,
      panelWidth,
      // In work layout the separator changes the right chat width.
      maxPanelWidth: maxChatWidth,
      minTargetWidth: WORK_LAYOUT_CHAT_MIN_WIDTH,
      maxTargetWidth: maxChatWidth,
      targetWidth: mainWidth,
      shouldCollapseSidebar:
        !sidebarCollapsed &&
        availableWidth - targetWidth < WORK_LAYOUT_WORK_MIN_WIDTH,
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
    minTargetWidth: Math.min(
      requested < WORK_PANEL_MIN_WIDTH
        ? WORK_PANEL_COMPACT_MIN_WIDTH
        : WORK_PANEL_MIN_WIDTH,
      maxPanelWidth,
    ),
    maxTargetWidth: maxPanelWidth,
    targetWidth: panelWidth,
    shouldCollapseSidebar:
      !sidebarCollapsed &&
      width - leftWidth - requestedPanelWidth <= MAIN_PANE_MIN_WIDTH,
  };
}

export function workPanelResizeTargetBounds(
  layout: WorkPanelLayout,
) {
  return {
    minimum: Math.min(layout.minTargetWidth, layout.maxTargetWidth),
    maximum: Math.max(layout.minTargetWidth, layout.maxTargetWidth),
  };
}

export function workPanelResetTargetWidth(
  layoutMode: WorkPanelLayoutMode,
  layout: WorkPanelLayout,
) {
  const { minimum, maximum } = workPanelResizeTargetBounds(layout);
  const preferred =
    layoutMode === "work"
      ? WORK_LAYOUT_CHAT_DEFAULT_WIDTH
      : WORK_PANEL_DEFAULT_WIDTH;
  return Math.min(maximum, Math.max(minimum, preferred));
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
