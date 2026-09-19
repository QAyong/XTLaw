import { createPortal } from "react-dom";
import { Fragment, type CSSProperties, type ReactNode, type RefObject } from "react";

export type SelectionAction = {
  key: string;
  label: ReactNode;
  onClick: () => void;
  ariaLabel?: string;
  title?: string;
  disabled?: boolean;
  iconOnly?: boolean;
};

/** Shared Renderer action pill for transcript and workspace selections. */
export function SelectionActionPopover({
  pillRef,
  placement,
  testId,
  actions,
}: {
  pillRef: RefObject<HTMLDivElement | null>;
  placement: { top: number; left: number; maxWidth: number } | null;
  testId: string;
  actions: SelectionAction[];
}) {
  const style: CSSProperties = placement
    ? {
        top: placement.top,
        left: placement.left,
        maxWidth: placement.maxWidth,
      }
    : { top: 0, left: 0, visibility: "hidden" };

  return createPortal(
    <div
      ref={pillRef}
      className="selection-quote"
      data-testid={testId}
      style={style}
      onPointerDown={(event) => event.preventDefault()}
    >
      {actions.map((action, index) => (
        <Fragment key={action.key}>
          {index > 0 ? (
            <span className="selection-quote-sep" aria-hidden="true" />
          ) : null}
          <button
            type="button"
            className={`selection-quote-action${action.iconOnly ? " icon" : ""}`}
            aria-label={action.ariaLabel}
            title={action.title}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        </Fragment>
      ))}
    </div>,
    document.body,
  );
}
