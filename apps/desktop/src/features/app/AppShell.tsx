import { type CSSProperties, lazy, type ReactNode, Suspense } from "react";
import { ChatSurface } from "../../components/ChatSurface";
import { ConversationTopbar } from "../../components/ConversationTopbar";
import { ExtensionPromptHost } from "../../components/ExtensionPromptDialog";
import {
  IconNewSession,
  IconPanel,
  IconPanelOpen,
  IconArrowLeftRight,
} from "../../components/icons";
import { ProjectCreateDialog } from "../../components/ProjectCreateDialog";
import { SearchDialog } from "../../components/SearchDialog";
import { Sidebar } from "../../components/Sidebar";
import { StartupRecovery } from "../../components/StartupRecovery";
import { ToastHost } from "../../components/Toast";
import { UpdateBanner } from "../../components/UpdateBanner";
import { cx, TooltipButton } from "../../components/ui";
import { WindowControls } from "../../components/WindowControls";
import { WorkPanel } from "../../components/workpanel/WorkPanel";
import { useCopyTex } from "../../hooks/use-copy-tex";
import { api } from "../../lib/api";
import { PortalVisibilityProvider } from "../../lib/portal-visibility";
import { CollapsedTitlebarActions, RoutePending } from "./chrome";
import { useAppShellRuntime } from "./useAppShellRuntime";

const SettingsPage = lazy(() =>
  import("../../pages/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const PullRequestsPage = lazy(() =>
  import("../../pages/PullRequestsPage").then((module) => ({
    default: module.PullRequestsPage,
  })),
);
const ScheduledPage = lazy(() =>
  import("../../pages/ScheduledPage").then((module) => ({
    default: module.ScheduledPage,
  })),
);
const PluginsPage = lazy(() =>
  import("../../pages/PluginsPage").then((module) => ({
    default: module.PluginsPage,
  })),
);

export function AppShell() {
  const {
    t,
    ready,
    page,
    activeSessionId,
    subagentPanel,
    subagentPanelOpen,
    closeSubagentPanel,
    workPanelOpen,
    searchOpen,
    setSearchOpen,
    sidebarCollapsed,
    sidebarEntering,
    sidebarExiting,
    sidebarWidth,
    sidebarWidthMax,
    handleSidebarWidthChange,
    handleSidebarWidthCommit,
    handleSidebarResizeCollapse,
    toggleSidebar,
    reopenSidebar,
    appShellRef,
    shellWidth,
    runMenuCommand,
    handleSidebarAnimationEnd,
    presentedWorkPanelOpen,
    workPanelExiting,
    workPanelExitGeneration,
    finishWorkPanelExit,
    toggleCurrentRightRegion,
    workPanelMaximized,
    toggleWorkPanelMaximize,
    layoutMode,
    chatPaneHidden,
    renderedChatWidth,
    workLayoutChatWidth,
    switchChatWorkLayout,
    previewWorkLayoutChatWidth,
    commitWorkLayoutChatWidth,
    backendDown,
    archMismatch,
    setArchMismatch,
    showSplash,
    splash,
    startupPhase,
    startupWaitedMs,
    retryStartup,
    startupRetrying,
    sidebarToggleShortcut,
    workPanelToggleTooltip,
  } = useAppShellRuntime();
  useCopyTex();
  const workAreaToolbarOverlaid =
    presentedWorkPanelOpen &&
    (layoutMode === "chat" || chatPaneHidden || workPanelMaximized);

  // A boot that never reaches the shell gets a surface it can act on instead of
  // a window that only knows how to wait (issue #831). Rendered as a direct child
  // of the shell so it can layer above the splash and below the window controls.
  const startupRecovery =
    startupPhase === "starting" ? null : (
      <StartupRecovery
        phase={startupPhase}
        waitedMs={startupWaitedMs}
        onRetry={retryStartup}
        retrying={startupRetrying}
        down={backendDown}
      />
    );

  const chatPane = !workPanelMaximized ? (
    <section
      key="chat-pane"
      className="main-pane"
      hidden={layoutMode === "work" && presentedWorkPanelOpen && chatPaneHidden}
      aria-hidden={layoutMode === "work" && presentedWorkPanelOpen && chatPaneHidden}
      style={
        layoutMode === "work" && presentedWorkPanelOpen && !chatPaneHidden
          ? ({ "--work-layout-chat-width": `${renderedChatWidth}px` } as CSSProperties)
          : undefined
      }
    >
      {page === "chat" ? (
        <ConversationTopbar
          sidebarCollapsed={
            layoutMode === "work" && presentedWorkPanelOpen
              ? false
              : sidebarCollapsed
          }
          workPanelOpen={presentedWorkPanelOpen}
          onToggleSidebar={toggleSidebar}
          onNewTask={() => void runMenuCommand("newTask")}
          onOpenSearch={() => setSearchOpen(true)}
        />
      ) : (
        <div
          className={cx(
            "main-titlebar",
            presentedWorkPanelOpen && "work-panel-open",
          )}
        >
          {sidebarCollapsed && (
            <div className="main-titlebar-left no-drag">
              <CollapsedTitlebarActions
                onToggleSidebar={reopenSidebar}
                onNewTask={() => void runMenuCommand("newTask")}
                sidebarToggleShortcut={sidebarToggleShortcut}
              />
            </div>
          )}
        </div>
      )}
      <UpdateBanner />

      {backendDown && (
        <div
          className={`backend-banner no-drag ${backendDown.fatal ? "fatal" : "warn"}`}
          role="status"
        >
          <span className="backend-dot" aria-hidden />
          <span>
            {backendDown.fatal
              ? backendDown.message === "GLIBC_UNSUPPORTED"
                ? t("status.unsupportedGlibc")
                : backendDown.message === "DB_SCHEMA_TOO_NEW"
                  ? t("status.dbSchemaTooNew", {
                      found: backendDown.schema?.found ?? "?",
                      supported: backendDown.schema?.supported ?? "?",
                    })
                  : t("status.fatal")
              : t("status.restarting")}
          </span>
          {backendDown.fatal && (
            <button
              type="button"
              className="backend-action"
              onClick={() => void api.openLogs()}
            >
              {t("status.openLogs")}
            </button>
          )}
        </div>
      )}

      {archMismatch && (
        <div className="backend-banner no-drag warn" role="status">
          <span className="backend-dot" aria-hidden />
          <span>
            {t("status.archMismatch", {
              buildArch: t(
                `status.archNames.${archMismatch.platform}.${archMismatch.processArch}`,
                { defaultValue: archMismatch.processArch },
              ),
              machineArch: t(
                `status.archNames.${archMismatch.platform}.${archMismatch.machineArch}`,
                { defaultValue: archMismatch.machineArch },
              ),
            })}
          </span>
          <button
            type="button"
            className="backend-action"
            onClick={() => setArchMismatch(null)}
          >
            {t("status.dismissArchMismatch")}
          </button>
        </div>
      )}

      <Suspense fallback={<RoutePending />}>
        {page === "pulls" ? (
          <div className="route-surface route-page">
            <PullRequestsPage />
          </div>
        ) : page === "scheduled" ? (
          <div className="route-surface route-page">
            <ScheduledPage />
          </div>
        ) : page === "plugins" ? (
          <div className="route-surface route-page">
            <PluginsPage />
          </div>
        ) : (
          <ChatSurface />
        )}
      </Suspense>
    </section>
  ) : null;

  const workPanelNode = presentedWorkPanelOpen || workPanelExiting ? (
    <WorkPanel
      key="work-panel"
      panelBlocked={searchOpen}
      exiting={workPanelExiting}
      onExitAnimationEnd={() =>
        finishWorkPanelExit(workPanelExitGeneration.current)
      }
      subagentPanel={subagentPanelOpen ? subagentPanel : null}
      onCloseSubagentPanel={closeSubagentPanel}
      containerWidth={shellWidth}
      sidebarWidth={sidebarWidth}
      sidebarCollapsed={sidebarCollapsed}
      sidebarEntering={sidebarEntering}
      sidebarExiting={sidebarExiting}
      maximized={workPanelMaximized}
      onToggleMaximize={toggleWorkPanelMaximize}
      layoutMode={layoutMode}
      chatPaneHidden={chatPaneHidden}
      chatPaneWidth={workLayoutChatWidth}
      onChatPaneWidthPreview={previewWorkLayoutChatWidth}
      onChatPaneWidthCommit={commitWorkLayoutChatWidth}
      sidebarLeadingActions={
        layoutMode === "work" &&
        presentedWorkPanelOpen &&
        sidebarCollapsed &&
        !workPanelMaximized ? (
          <CollapsedTitlebarActions
            onToggleSidebar={reopenSidebar}
            sidebarToggleShortcut={sidebarToggleShortcut}
            nativeTooltip
          />
        ) : null
      }
    />
  ) : null;

  const orderedPanes =
    layoutMode === "work"
      ? [workPanelNode, chatPane]
      : [chatPane, workPanelNode];

  let shell: ReactNode = null;
  if (ready) {
    shell = (
      <>
        <PortalVisibilityProvider visible={page !== "settings"}>
          <div
            className="app-chat-shell"
            hidden={page === "settings"}
            inert={page === "settings" ? true : undefined}
            aria-hidden={page === "settings" ? true : undefined}
          >
            {!sidebarCollapsed || sidebarExiting ? (
              <Sidebar
                className={cx(sidebarEntering && "is-entering", sidebarExiting && "is-exiting")}
                onAnimationEnd={handleSidebarAnimationEnd}
                onToggleSidebar={toggleSidebar}
                sidebarToggleShortcut={sidebarToggleShortcut}
                sidebarWidth={sidebarWidth}
                widthMax={sidebarWidthMax}
                onWidthChange={handleSidebarWidthChange}
                onWidthCommit={handleSidebarWidthCommit}
                onResizeCollapse={handleSidebarResizeCollapse}
              />
            ) : null}

            {workPanelMaximized && (
              /* MainChat is absent; the panel header owns dragging while this
                 pass-through row keeps the shell controls available. */
              <div
                className={cx(
                  "window-chrome-row",
                  !sidebarCollapsed && "sidebar-expanded",
                )}
              >
                {sidebarCollapsed && (
                  <CollapsedTitlebarActions
                    onToggleSidebar={toggleSidebar}
                    onNewTask={() => void runMenuCommand("newTask")}
                    sidebarToggleShortcut={sidebarToggleShortcut}
                    nativeTooltip
                  />
                )}
                {!sidebarCollapsed && (
                  <TooltipButton
                    type="button"
                    className="title-nav-btn"
                    nativeTooltip
                    tooltip={t("nav.newTask")}
                    ariaLabel={t("nav.newTask")}
                    data-nav="new-task"
                    onClick={() => void runMenuCommand("newTask")}
                  >
                    <IconNewSession size={15} />
                  </TooltipButton>
                )}
                <div className="window-chrome-drag" aria-hidden />
              </div>
            )}

            {orderedPanes}

            {page === "chat" &&
              presentedWorkPanelOpen &&
              !workPanelExiting &&
              !workPanelMaximized &&
              !chatPaneHidden && (
                <TooltipButton
                  type="button"
                  className="app-chat-work-layout-toggle no-drag"
                  nativeTooltip={workAreaToolbarOverlaid}
                  tooltip={t(
                    layoutMode === "work"
                      ? "nav.switchToChatLayout"
                      : "nav.switchToWorkLayout",
                  )}
                  ariaLabel={t(
                    layoutMode === "work"
                      ? "nav.switchToChatLayout"
                      : "nav.switchToWorkLayout",
                  )}
                  aria-pressed={layoutMode === "work"}
                  onClick={switchChatWorkLayout}
                >
                  <IconArrowLeftRight size={15} aria-hidden />
                </TooltipButton>
              )}

            <TooltipButton
              type="button"
              className="app-work-panel-toggle no-drag"
              nativeTooltip={workAreaToolbarOverlaid}
              tooltip={workPanelToggleTooltip}
              ariaLabel={workPanelToggleTooltip}
              aria-pressed={
                layoutMode === "work" && presentedWorkPanelOpen
                  ? !chatPaneHidden
                  : workPanelOpen || presentedWorkPanelOpen
              }
              disabled={!activeSessionId && !presentedWorkPanelOpen && !workPanelExiting}
              onClick={toggleCurrentRightRegion}
            >
              <span className="app-work-panel-toggle-icon" aria-hidden>
                <IconPanel size={15} />
                <IconPanelOpen size={15} />
              </span>
            </TooltipButton>
          </div>
        </PortalVisibilityProvider>
        {page === "settings" ? (
          <Suspense fallback={<RoutePending />}>
            <SettingsPage />
          </Suspense>
        ) : null}
        <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} />
        <ToastHost />
        <ExtensionPromptHost />
        {page === "settings" ? <UpdateBanner /> : null}
      </>
    );
  }

  return (
    <div
      ref={appShellRef}
      className={cx(
        "app-shell",
        !ready && "app-shell-boot",
        page === "settings" && ready && "settings-mode",
        sidebarCollapsed && "sidebar-collapsed",
        workPanelMaximized && "work-panel-maximized",
        layoutMode === "work" && "work-layout",
        layoutMode === "work" && (presentedWorkPanelOpen || workPanelExiting) && "work-layout-with-panel",
        layoutMode === "work" && workPanelExiting && "work-panel-exiting",
        layoutMode === "work" && presentedWorkPanelOpen && chatPaneHidden && "chat-pane-hidden",
        showSplash && "is-booting",
      )}
      style={{
        "--ds-sidebar-width": `${sidebarWidth}px`,
        "--work-layout-chat-width": `${renderedChatWidth}px`,
      } as CSSProperties}
    >
      <div className="app-scenic-backdrop" aria-hidden />
      {shell}
      {/* Outside pane stacking; skip splash so the band cannot cover boot chrome. */}
      {/* `showSplash` stays true for as long as the shell is not ready, so a
          bare `!showSplash` test would leave the recovery surface without any
          window controls — the only ones a frameless Windows/Linux window has.
          The controls therefore follow the boot surface that is actually up. */}
      {(ready && !showSplash) || startupPhase !== "starting" ? (
        <WindowControls nativeTooltip={workAreaToolbarOverlaid} />
      ) : null}
      <ProjectCreateDialog />
      {splash}
      {startupRecovery}
    </div>
  );
}
