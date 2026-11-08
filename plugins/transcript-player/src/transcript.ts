export type TranscriptCue = { start: number, end: number, text: string }
export type TranscriptParagraph = { start: number, indexes: number[] }
export type SearchHit = { cueIndex: number, start: number, end: number }

export function normalizeCues(cues: TranscriptCue[]): TranscriptCue[] {
  return cues
    .filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.start >= 0 && cue.end > cue.start && cue.text.trim())
    .map(cue => ({ ...cue, text: cue.text.replace(/\s+/gu, ' ').trim() }))
    .sort((a, b) => a.start - b.start)
}

export function groupCues(cues: TranscriptCue[]): TranscriptParagraph[] {
  const paragraphs: TranscriptParagraph[] = []
  let length = 0
  cues.forEach((cue, index) => {
    const previous = cues[index - 1]
    if (!previous || cue.start - previous.end >= 1.5 || length + cue.text.length > 360) {
      paragraphs.push({ start: cue.start, indexes: [] })
      length = 0
    }
    paragraphs[paragraphs.length - 1].indexes.push(index)
    length += cue.text.length
  })
  return paragraphs
}

export function findHits(cues: TranscriptCue[], query: string): SearchHit[] {
  const needle = query.trim()
  if (!needle) return []
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu')
  return cues.flatMap((cue, cueIndex) => Array.from(cue.text.matchAll(pattern), match => ({
    cueIndex, start: match.index, end: match.index + match[0].length,
  })))
}

export function activeCueIndex(cues: TranscriptCue[], time: number): number {
  // Prefer the most recently started cue when subtitle intervals overlap.
  let low = 0
  let high = cues.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (cues[middle].start <= time) low = middle + 1
    else high = middle
  }
  for (let index = low - 1; index >= 0; index--) {
    if (time < cues[index].end) return index
  }
  return -1
}

export function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor(total % 3600 / 60)
  const rest = String(total % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${String(minutes).padStart(2, '0')}:${rest}`
}
