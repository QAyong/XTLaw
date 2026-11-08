export interface Cue { start: number; end: number; text: string; speaker: string }
export interface RawCue { startTime: number; endTime: number; text: string }
export type SubtitleType = 'srt' | 'vtt' | 'ass'
export const MAX_SUBTITLE_BYTES = 8 * 1024 * 1024
export const MAX_CUES = 20000

export function subtitleType(name: string): SubtitleType | null {
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase()
  return extension === 'srt' || extension === 'vtt' || extension === 'ass' ? extension : null
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (whole, entity: string) => {
    if (entity[0] !== '#') return named[entity.toLowerCase()] ?? whole
    const point = entity[1]?.toLowerCase() === 'x' ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10)
    return point > 0 && point <= 0x10FFFF && !(point >= 0xD800 && point <= 0xDFFF) ? String.fromCodePoint(point) : '\uFFFD'
  })
}

export function normalizeCue(cue: RawCue): Cue | null {
  if (!Number.isFinite(cue.startTime) || !Number.isFinite(cue.endTime) || cue.startTime < 0 || cue.endTime <= cue.startTime) return null
  const speaker = decodeEntities(/<v(?:\.[^\s>]*)?\s+([^>]+)>/i.exec(cue.text)?.[1] ?? '').trim()
  // Remove only subtitle markup. Other input remains literal text, never HTML.
  const text = decodeEntities(cue.text.replace(/<\/?(?:b|i|u|ruby|rt|c|v|lang)(?:[.\s][^>]*)?>|<\d{2}:\d{2}(?::\d{2})?\.\d{3}>/gi, '')).trim()
  return text ? { start: cue.startTime, end: cue.endTime, text, speaker } : null
}

export function normalizeCues(raw: readonly RawCue[]): Cue[] {
  if (raw.length > MAX_CUES) throw new Error('字幕超过 20,000 句，请拆分后加载。')
  return raw.map(normalizeCue).filter((cue): cue is Cue => cue !== null).sort((a, b) => a.start - b.start || a.end - b.end)
}

export function activeCueIndexes(cues: readonly Cue[], time: number): number[] {
  // End is exclusive. Overlapping speakers can both be active.
  const active: number[] = []
  for (let i = 0; i < cues.length && cues[i]!.start <= time; i++) {
    if (time < cues[i]!.end) active.push(i)
  }
  return active
}

export function groupCues(cues: readonly Cue[]): number[][] {
  const groups: number[][] = []
  cues.forEach((cue, i) => {
    const previous = cues[i - 1]
    if (previous && previous.speaker === cue.speaker && cue.start - previous.end < 1.5) groups[groups.length - 1]!.push(i)
    else groups.push([i])
  })
  return groups
}

export function formatTime(seconds: number): string {
  const time = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const s = String(time % 60).padStart(2, '0')
  const m = String(Math.floor(time / 60) % 60).padStart(2, '0')
  return time >= 3600 ? `${Math.floor(time / 3600)}:${m}:${s}` : `${m}:${s}`
}
