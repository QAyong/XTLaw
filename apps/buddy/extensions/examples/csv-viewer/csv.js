// A small CSV reader for the example viewer: RFC 4180 quoting, CRLF or LF rows, a leading byte order mark.
// It is bounded on purpose; a viewer should show a large file's start and say so instead of freezing.

export const MAX_ROWS = 2000
export const MAX_COLUMNS = 128

export function parseCsv(text, { maxRows = MAX_ROWS, maxColumns = MAX_COLUMNS } = {}) {
  const source = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let truncated = false
  const endCell = () => {
    if (row.length < maxColumns)
      row.push(cell)
    else
      truncated = true
    cell = ''
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }
  for (let index = 0; index < source.length && rows.length < maxRows; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"'
        index++
      }
      else if (char === '"') {
        quoted = false
      }
      else {
        cell += char
      }
    }
    else if (char === '"' && !cell) {
      quoted = true
    }
    else if (char === ',') {
      endCell()
    }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n')
        index++
      endRow()
    }
    else {
      cell += char
    }
  }
  if (rows.length >= maxRows)
    truncated = true
  else if (cell || row.length)
    endRow()
  return { rows, truncated }
}

// Selected cells as tab-separated lines, the form the chat quote carries.
export function selectionText(rows, from, to) {
  const lines = []
  for (let r = from[0]; r <= to[0]; r++)
    lines.push((rows[r] ?? []).slice(from[1], to[1] + 1).join('\t'))
  return lines.join('\n')
}
