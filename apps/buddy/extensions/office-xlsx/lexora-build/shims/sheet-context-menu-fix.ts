// Stands in for the renderer's own sheet-context-menu module. Upstream opens its status-bar statistics menu for any
// right-click inside `section[data-range-selector]`, but Univer puts that attribute on two sections: the footer and the
// wrapper around the grid. A cell overlay such as a hyperlink lives in the wrapper, so right-clicking a linked cell
// popped the statistics menu. Only the footer (the last such section) may open it.
import { sheetContextMenuAction as upstreamAction } from '../../apps/sheets/src/renderer/sheet-context-menu'

export type { SheetContextMenuAction } from '../../apps/sheets/src/renderer/sheet-context-menu'

export function sheetContextMenuAction(target: EventTarget | null): ReturnType<typeof upstreamAction> {
  const action = upstreamAction(target)
  if (!action.statsMenu || !(target instanceof Element))
    return action
  const sections = document.querySelectorAll('#univer-container section[data-range-selector]')
  const footer = target.closest('#univer-container section[data-range-selector]')
  return footer && footer === sections[sections.length - 1] ? action : { statsMenu: false, suppressNativeMenu: true }
}
