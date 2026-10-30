// The editor opens its own right-click menu but does not cancel the browser's context-menu event, so the host window also raises
// its native edit menu (Undo, Redo, Cut, Copy, Paste, Select All) on top of it. Cancel the default for the document surface only:
// the event still reaches the editor, which opens its menu as before, and fields elsewhere keep the native menu.
export function suppressNativeContextMenu(signal) {
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('.ProseMirror'))
      event.preventDefault()
  }, { capture: true, signal })
}
