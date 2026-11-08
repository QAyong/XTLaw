import { formatTime } from './transcript.ts'
import type { TranscriptCue } from './transcript'

export const SELECTION_LIMIT = 32768
export type SourceFile = { name: string, relativePath?: string }
export type SubtitleSource = SourceFile & { id: string, type: 'srt' | 'vtt' | 'ass', encoding: string, show: boolean }
export type TranscriptSelection = { fromCue: number, toCue: number, fromOffset: number, toOffset: number, start: number, end: number, text: string }
type LocatorData = {
  kind: 'transcript-selection'
  subtitle: SubtitleSource
  media: SourceFile
  fromCue: number, toCue: number, fromOffset: number, toOffset: number
  start: number, end: number, prefixLength: number, selectionLength: number
}
const compact = (text: string) => text.replace(/\s/gu, '')
const integer = (value: unknown, max: number): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

function boundary(text: string, offset: number) {
  if (!integer(offset, text.length)) return false
  const previous = text.charCodeAt(offset - 1)
  const next = text.charCodeAt(offset)
  return !(previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF)
}

export function selectionFromBounds(cues: TranscriptCue[], fromCue: number, toCue: number, fromOffset: number, toOffset: number): TranscriptSelection | null {
  if (!integer(fromCue, cues.length - 1) || !integer(toCue, cues.length - 1) || toCue < fromCue) return null
  const first = cues[fromCue]
  const last = cues[toCue]
  if (!boundary(first.text, fromOffset) || !boundary(last.text, toOffset) || (fromCue === toCue && toOffset <= fromOffset)) return null
  const text = cues.slice(fromCue, toCue + 1).map((cue, index, selected) => cue.text.slice(index ? 0 : fromOffset, index === selected.length - 1 ? toOffset : undefined)).join(' ')
  if (!text.trim()) return null
  return { fromCue, toCue, fromOffset, toOffset, start: first.start, end: Math.max(...cues.slice(fromCue, toCue + 1).map(cue => cue.end)), text }
}

function source(file: SourceFile): SourceFile {
  return { name: file.name, ...(file.relativePath ? { relativePath: file.relativePath } : {}) }
}
function sourceLabel(file: SourceFile): string {
  const oneLine = (value: string) => value.replace(/[\r\n]/gu, ' ')
  return file.relativePath ? `${oneLine(file.relativePath)}（接口提供的相对路径）` : `路径不可用（文件名：${oneLine(file.name)}）`
}
function framing(subtitle: SourceFile, media: SourceFile, start: number, end: number) {
  return {
    prefix: `文件路径：${sourceLabel(subtitle)}\n选中内容：\n`,
    suffix: `\n\n字幕源媒体路径：${sourceLabel(media)}\n时间范围：${formatTime(start)}–${formatTime(end)}`,
  }
}

export function createTranscriptReference(selection: TranscriptSelection, subtitle: SubtitleSource, media: SourceFile) {
  if (!selection.text.trim() || selection.text.length > SELECTION_LIMIT) throw new Error('选区最多支持 32768 个字符，请缩小选区。')
  const subtitleSnapshot = { ...source(subtitle), id: subtitle.id, type: subtitle.type, encoding: subtitle.encoding, show: subtitle.show }
  const mediaSnapshot = source(media)
  const { prefix, suffix } = framing(subtitleSnapshot, mediaSnapshot, selection.start, selection.end)
  const data: LocatorData = {
    kind: 'transcript-selection', subtitle: subtitleSnapshot, media: mediaSnapshot,
    fromCue: selection.fromCue, toCue: selection.toCue, fromOffset: selection.fromOffset, toOffset: selection.toOffset,
    start: selection.start, end: selection.end, prefixLength: prefix.length, selectionLength: selection.text.length,
  }
  if (new TextEncoder().encode(JSON.stringify(data)).byteLength > 16384) throw new Error('字幕来源信息过长，无法创建定位引用。')
  return {
    kind: 'content' as const,
    title: `${subtitle.name} · ${formatTime(selection.start)}–${formatTime(selection.end)}`.slice(0, 512),
    text: prefix + selection.text + suffix,
    locator: { version: 1, data },
  }
}

function sourceFile(value: unknown): SourceFile | null {
  const file = object(value)
  if (!file || typeof file.name !== 'string' || !file.name || file.name.length > 512) return null
  if (file.relativePath !== undefined && (typeof file.relativePath !== 'string' || file.relativePath.length > 32768)) return null
  return { name: file.name, ...(typeof file.relativePath === 'string' ? { relativePath: file.relativePath } : {}) }
}

export function readTranscriptReference(locator: unknown, text: string): { data: LocatorData, text: string } | null {
  const outer = object(locator)
  const data = object(outer?.data)
  if (outer?.version !== 1 || data?.kind !== 'transcript-selection') return null
  const subtitle = object(data.subtitle)
  const subtitleFile = sourceFile(subtitle)
  const media = sourceFile(data.media)
  if (!subtitle || !subtitleFile || !media || typeof subtitle.id !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(subtitle.id) || typeof subtitle.type !== 'string' || !['srt', 'vtt', 'ass'].includes(subtitle.type) || typeof subtitle.encoding !== 'string' || !['utf-8', 'gbk'].includes(subtitle.encoding) || typeof subtitle.show !== 'boolean') return null
  if (!integer(data.fromCue, 19999) || !integer(data.toCue, 19999) || data.toCue < data.fromCue || !integer(data.fromOffset, 8 * 1024 * 1024) || !integer(data.toOffset, 8 * 1024 * 1024)) return null
  if (typeof data.start !== 'number' || !Number.isFinite(data.start) || data.start < 0 || typeof data.end !== 'number' || !Number.isFinite(data.end) || data.end <= data.start) return null
  if (!integer(data.prefixLength, text.length) || !integer(data.selectionLength, SELECTION_LIMIT) || !data.selectionLength) return null
  const { prefix, suffix } = framing(subtitleFile, media, data.start, data.end)
  const selected = text.slice(data.prefixLength, data.prefixLength + data.selectionLength)
  if (!selected.trim() || prefix.length !== data.prefixLength || prefix + selected + suffix !== text) return null
  return { data: data as unknown as LocatorData, text: selected }
}

export function locateTranscriptSelection(cues: TranscriptCue[], saved: Pick<TranscriptSelection, 'fromCue' | 'toCue' | 'fromOffset' | 'toOffset' | 'start' | 'text'>): TranscriptSelection | null {
  const wanted = compact(saved.text)
  if (!wanted) return null
  const exact = selectionFromBounds(cues, saved.fromCue, saved.toCue, saved.fromOffset, saved.toOffset)
  if (exact && Math.abs(exact.start - saved.start) < 0.01 && compact(exact.text) === wanted) return exact
  // If the subtitle was revised, only use a unique textual match. Never silently
  // choose the first occurrence of a repeated phrase at another time.
  const normalized = cues.map(cue => compact(cue.text))
  const joined = normalized.join('')
  const start = joined.indexOf(wanted)
  if (start < 0 || joined.indexOf(wanted, start + 1) >= 0) return null
  const end = start + wanted.length
  let cursor = 0
  let fromCue = -1
  let toCue = -1
  let fromOffset = 0
  let toOffset = 0
  for (let index = 0; index < cues.length; index++) {
    const next = cursor + normalized[index].length
    const rawOffset = (position: number, exclusive: boolean) => {
      let length = 0
      for (let raw = 0; raw < cues[index].text.length; raw++) {
        if (/\s/u.test(cues[index].text[raw])) continue
        if (!exclusive && length === position) return raw
        length++
        if (exclusive && length === position) return raw + 1
      }
      return cues[index].text.length
    }
    if (fromCue < 0 && start < next) {
      fromCue = index
      fromOffset = rawOffset(start - cursor, false)
    }
    if (fromCue >= 0 && end <= next) {
      toCue = index
      toOffset = rawOffset(end - cursor, true)
      break
    }
    cursor = next
  }
  const match = selectionFromBounds(cues, fromCue, toCue, fromOffset, toOffset)
  return match && compact(match.text) === wanted ? match : null
}
