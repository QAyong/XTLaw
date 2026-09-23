import type { Dispatch, SetStateAction } from "react";
import type { TFunction } from "i18next";
import type { GlobalPermissionMode, Mode } from "@pi-desktop/shared";
import { AnchoredMenu } from "../../../components/settings/AnchoredMenu";
import { TooltipButton } from "../../../components/ui";
import { IconCheck, IconChevronDown, IconKey } from "../../../components/icons";
import { PERMISSION_MODE_I18N_KEYS } from "../../../lib/permission-mode-labels";

/** Controlled permission UI shared by conversations and task drafts. */
export function ComposerPermissionPicker({t, mode, composerPermissionMode,
  permissionOpen, setPermissionOpen, controlsBlocked, onCloseOtherMenus, onSelect,
}: {
  t: TFunction;
  mode: Mode;
  composerPermissionMode: GlobalPermissionMode;
  permissionOpen: boolean;
  setPermissionOpen: Dispatch<SetStateAction<boolean>>;
  controlsBlocked: boolean;
  onCloseOtherMenus: () => void;
  onSelect: (mode: GlobalPermissionMode) => void | Promise<void>;
}) {
  const selectedPermissionLabel = t(PERMISSION_MODE_I18N_KEYS[composerPermissionMode]);
  const permissionWarning =
    mode === "goal"
      ? t("goal.autoWarning")
      : mode === "plan" && composerPermissionMode === "auto"
        ? t("plan.autoWarning")
        : undefined;
  const triggerLabel = `${t("chat.permissionMode")}: ${selectedPermissionLabel}${
    permissionWarning ? ` · ${permissionWarning}` : ""
  }`;

  return (
        <AnchoredMenu
          className="composer-permission"
          open={permissionOpen && mode !== "goal"}
          onClose={() => setPermissionOpen(false)}
          menuClassName="composer-permission-menu"
          label={t("chat.permissionMode")}
          role="menu"
          align="start"
          side="top"
          trigger={(ref) => (
            <TooltipButton
              ref={ref}
              type="button"
              className={`icon-btn mode-chip ${permissionOpen ? "active" : ""}`}
              tooltip={triggerLabel}
              ariaLabel={triggerLabel}
              aria-haspopup={mode === "goal" ? undefined : "menu"}
              aria-expanded={mode === "goal" ? false : permissionOpen}
              disabled={controlsBlocked || mode === "goal"}
              onClick={() => {
                onCloseOtherMenus();
                setPermissionOpen((open) => !open);
              }}
            >
              <span className="composer-permission-icon" aria-hidden="true">
                <IconKey size={14} />
              </span>
              <span className="composer-permission-label text-sm">
                {selectedPermissionLabel}
              </span>
              <IconChevronDown
                className="composer-permission-chevron"
                size={12}
                aria-hidden="true"
              />
            </TooltipButton>
          )}
        >
          {(["ask", "accept-edits", "auto"] as const).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="menuitemradio"
              aria-checked={composerPermissionMode === candidate}
              disabled={controlsBlocked}
              className={`composer-plus-item ${composerPermissionMode === candidate ? "active" : ""}`}
              onClick={async () => {
                setPermissionOpen(false);
                await onSelect(candidate);
              }}
            >
              <span className="flex-1 text-left">
                {t(PERMISSION_MODE_I18N_KEYS[candidate])}
              </span>
              {composerPermissionMode === candidate ? <IconCheck size={13} /> : null}
            </button>
          ))}
        </AnchoredMenu>
  );
}
