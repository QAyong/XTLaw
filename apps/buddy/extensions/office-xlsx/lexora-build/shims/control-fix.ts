import type { ControlReply, ControlRequest } from '../../apps/sheets/src/renderer/control'
// Stands in for the renderer's `control` module. It keeps the upstream hook (`genoffice selection`, `open --range`) and adds one
// request, `lexora-selection-text`, which the plugin's "Quote to chat" entry uses: the display text of the single selected range.
// App.tsx calls the hook with the lazy workbook state as a fourth argument (see fixRendererSources in vite.config.mjs).
import { handleSheetsControl as upstreamControl } from '../../apps/sheets/src/renderer/control'

export * from '../../apps/sheets/src/renderer/control'

/** More cells than this are refused without reading them. */
const MAX_SELECTION_CELLS = 100000
/** Rows per getDisplayValues call, bounding the facade's allocation (same block size as the upstream CSV export). */
const ROW_BLOCK = 2048

interface LoadedRange { startRow: number, endRow: number, startColumn: number, endColumn: number }
interface LazyState { flags: { preloadComplete: boolean }, loadedRanges: Map<string, LoadedRange> }
interface SelectionRange {
  getRow: () => number
  getColumn: () => number
  getHeight: () => number
  getWidth: () => number
  getA1Notation: () => string
}
interface SelectionSheet {
  getSheetId: () => string
  getSheetName: () => string
  getLastRow: () => number
  getLastColumn: () => number
  getVisibleRange: () => unknown
  getSelection: () => { getActiveRangeList: () => SelectionRange[] } | null
  getRange: (row: number, column: number, rows: number, columns: number) => { getDisplayValues: () => string[][] }
}
interface SelectionWorkbook {
  getActiveSheet: () => SelectionSheet
  getSheets: () => SelectionSheet[]
}

export interface SelectionTextRequest { cmd: 'lexora-selection-text', maxChars: number }
const error = (reason: string, message: string): ControlReply => ({ status: 'error', error: { reason, message } })

// Tabs and line breaks separate cells and rows in the output, so they cannot stay inside a cell.
const cellText = (value: unknown) => String(value ?? '').replace(/[\t\r\n]+/g, ' ')

function selectionText(workbook: SelectionWorkbook, state: LazyState | null, maxChars: number): ControlReply {
  const sheet = workbook.getActiveSheet()
  try {
    sheet.getVisibleRange()
  }
  catch {
    return { status: 'not_ready' }
  }
  const ranges = sheet.getSelection()?.getActiveRangeList() ?? []
  if (!ranges.length)
    return error('no_selection', 'No cells are selected')
  if (ranges.length > 1)
    return error('multiple_ranges', 'More than one range is selected')
  const range = ranges[0]!
  const startRow = range.getRow()
  const startColumn = range.getColumn()
  let endRow = startRow + range.getHeight() - 1
  let endColumn = startColumn + range.getWidth() - 1
  const base = { sheet: sheet.getSheetName(), sheetIndex: Math.max(0, workbook.getSheets().findIndex(item => item.getSheetId() === sheet.getSheetId())), range: range.getA1Notation() }
  if (state && !state.flags.preloadComplete) {
    // A large workbook streams cells in by viewport: cells outside the loaded window read as empty (and the sheet's last row only
    // counts loaded rows), which must not pass for data.
    const loaded = state.loadedRanges.get(sheet.getSheetId())
    if (!loaded || startRow < loaded.startRow || endRow > loaded.endRow || startColumn < loaded.startColumn || endColumn > loaded.endColumn)
      return error('not_loaded', 'The selection is not fully loaded yet')
  }
  else {
    // Whole-row and whole-column selections reach past the data: only read what the sheet uses.
    endRow = Math.min(endRow, Math.max(sheet.getLastRow(), 0))
    endColumn = Math.min(endColumn, Math.max(sheet.getLastColumn(), 0))
  }
  if (endRow < startRow || endColumn < startColumn)
    return { status: 'ok', result: { ...base, text: '' } }
  if ((endRow - startRow + 1) * (endColumn - startColumn + 1) > MAX_SELECTION_CELLS)
    return { status: 'ok', result: { ...base, tooLong: true } }
  const rows: string[][] = []
  let length = 0
  for (let row = startRow; row <= endRow; row += ROW_BLOCK) {
    const block = sheet.getRange(row, startColumn, Math.min(ROW_BLOCK, endRow - row + 1), endColumn - startColumn + 1).getDisplayValues()
    for (const values of block) {
      const cells = values.map(cellText)
      rows.push(cells)
      length += cells.reduce((sum, cell) => sum + cell.length + 1, 0)
    }
    if (length > maxChars * 2)
      return { status: 'ok', result: { ...base, tooLong: true } }
  }
  // Trailing empty rows and columns carry nothing.
  while (rows.length && rows.at(-1)!.every(cell => !cell))
    rows.pop()
  const width = rows.reduce((max, cells) => {
    let last = cells.length
    while (last && !cells[last - 1])
      last--
    return Math.max(max, last)
  }, 0)
  const text = rows.map(cells => cells.slice(0, width).join('\t')).join('\n')
  return { status: 'ok', result: { ...base, ...(text.length > maxChars ? { tooLong: true } : { text }) } }
}

export function handleSheetsControl(req: ControlRequest | SelectionTextRequest, workbook: Parameters<typeof upstreamControl>[1], fileLoaded: boolean, lazyState?: LazyState | null): ControlReply {
  if (req.cmd !== 'lexora-selection-text')
    return upstreamControl(req, workbook, fileLoaded)
  if (!workbook || !fileLoaded)
    return { status: 'not_ready' }
  try {
    return selectionText(workbook as unknown as SelectionWorkbook, lazyState ?? null, req.maxChars)
  }
  catch {
    // Univer services are still registering while the workbook boots.
    return { status: 'not_ready' }
  }
}
