export interface BrowserFileSelectionOptions {
  multiple: boolean
  filters?: Array<{ name: string, extensions: string[] }>
}

const MIME_EXTENSIONS: Record<string, string[]> = {
  'image/*': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'],
  'audio/*': ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'],
  'video/*': ['mp4', 'webm', 'mov', 'mkv', 'avi'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'application/json': ['json'],
  'text/plain': ['txt'],
  'text/csv': ['csv'],
}

/** Unknown MIME types remain selectable: accept is a chooser hint, not an upload validator. */
export function fileChooserFilters(accept: string): BrowserFileSelectionOptions['filters'] {
  const extensions = new Set<string>()
  for (const token of accept.toLowerCase().slice(0, 2_048).split(',')) {
    const value = token.trim()
    if (/^\.[a-z0-9]{1,16}$/.test(value)) {
      extensions.add(value.slice(1))
    }
    else {
      for (const extension of MIME_EXTENSIONS[value] ?? [])
        extensions.add(extension)
    }
  }
  return extensions.size ? [{ name: accept.slice(0, 80), extensions: [...extensions] }, { name: '*', extensions: ['*'] }] : undefined
}

/** Show only the origin; never disclose credentials, query tokens, or local paths. */
export function browserNoticeOrigin(rawUrl: string): string | undefined {
  try {
    const url = new URL(rawUrl)
    if (['http:', 'https:', 'blob:'].includes(url.protocol) && url.origin !== 'null')
      return url.origin.slice(0, 512)
    if (url.protocol === 'file:')
      return 'file://'
  }
  catch {}
  return undefined
}
