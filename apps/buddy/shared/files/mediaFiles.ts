import type { SpaceFileTarget } from '../spaces/spaceFileApi'
import { spaceFileTargetSchema } from '../spaces/spaceFileApi'

export const MEDIA_PROTOCOL = 'lexora-media'

export type MediaKind = 'audio' | 'video'

// Only containers and codecs Chromium can decode on its own; there is no transcoding fallback.
const AUDIO_MIME_TYPES: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  weba: 'audio/webm',
}

const VIDEO_MIME_TYPES: Readonly<Record<string, string>> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
}

function extensionOf(path: string): string {
  const name = path.split(/\//).at(-1) ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function mediaKindOf(path: string): MediaKind | null {
  const extension = extensionOf(path)
  if (Object.hasOwn(AUDIO_MIME_TYPES, extension))
    return 'audio'
  return Object.hasOwn(VIDEO_MIME_TYPES, extension) ? 'video' : null
}

export function mediaMimeType(path: string): string | null {
  const extension = extensionOf(path)
  if (Object.hasOwn(AUDIO_MIME_TYPES, extension))
    return AUDIO_MIME_TYPES[extension]!
  return Object.hasOwn(VIDEO_MIME_TYPES, extension) ? VIDEO_MIME_TYPES[extension]! : null
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'))
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, character => character.charCodeAt(0)))
}

// The URL carries the file target, never a filesystem path; the main process re-checks the grant on every request.
export function createMediaUrl(target: SpaceFileTarget, version = 0): string {
  const { spaceId, directoryId, revision, path } = target
  const encoded = toBase64Url(JSON.stringify({ spaceId, directoryId, revision, path }))
  return `${MEDIA_PROTOCOL}://file/${encoded}${version ? `?v=${version}` : ''}`
}

export function parseMediaUrl(value: string): SpaceFileTarget | null {
  try {
    const url = new URL(value)
    if (url.protocol !== `${MEDIA_PROTOCOL}:` || url.hostname !== 'file')
      return null
    const segments = url.pathname.split('/').filter(Boolean)
    if (segments.length !== 1)
      return null
    const parsed = spaceFileTargetSchema.safeParse(JSON.parse(fromBase64Url(segments[0]!)))
    return parsed.success ? parsed.data : null
  }
  catch {
    return null
  }
}

export type MediaByteRange = { start: number, end: number } | 'unsatisfiable'

// Single `bytes=a-b`, `bytes=a-` and `bytes=-n` forms; multi-range requests are refused rather than answered in full.
export function parseMediaRange(header: string, size: number): MediaByteRange {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match || (!match[1] && !match[2]) || size <= 0)
    return 'unsatisfiable'
  let start: number
  let end: number
  if (!match[1]) {
    start = Math.max(size - Number(match[2]), 0)
    end = size - 1
  }
  else {
    start = Number(match[1])
    end = match[2] ? Number(match[2]) : size - 1
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start)
    return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
}
