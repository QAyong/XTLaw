import { z } from 'zod'

export const CLIPBOARD_IMAGE_MAX_BYTES = 32 * 1024 * 1024
export const CLIPBOARD_IMAGE_MAX_PIXELS = 64 * 1024 * 1024
export const CLIPBOARD_PASTE_IMAGE_UNAVAILABLE = 'Clipboard paste image is unavailable'
export const CLIPBOARD_PASTE_IMAGE_TOO_LARGE = 'Clipboard paste image is too large'
export const CLIPBOARD_PASTE_IMAGE_INVALID = 'Clipboard paste image is invalid'

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]

export function classifyClipboardPng(bytes: Uint8Array): 'ok' | 'invalid' | 'too_large' {
  if (bytes.byteLength > CLIPBOARD_IMAGE_MAX_BYTES)
    return 'too_large'
  if (bytes.byteLength < 33 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value))
    return 'invalid'
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = header.getUint32(16)
  const height = header.getUint32(20)
  if (width <= 0 || height <= 0)
    return 'invalid'
  if (width * height > CLIPBOARD_IMAGE_MAX_PIXELS)
    return 'too_large'
  return 'ok'
}

export const clipboardWriteImageInputSchema = z.object({
  png: z.instanceof(Uint8Array).refine(bytes => classifyClipboardPng(bytes) === 'ok', 'Invalid or oversized clipboard PNG'),
}).strict()

export interface ClipboardPngSnapshotItem {
  readonly types: readonly string[]
  getType: (type: string) => Promise<{ size: number, arrayBuffer: () => Promise<ArrayBuffer> }>
}

export function shouldRecoverEmptyClipboardPng(files: ArrayLike<{ type: string, size: number }>): boolean {
  if (files.length === 0)
    return false
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]
    if (!file || file.type !== 'image/png' || file.size !== 0)
      return false
  }
  return true
}

export async function readForegroundClipboardPng(
  items: readonly ClipboardPngSnapshotItem[],
  assertStillForeground: () => void,
): Promise<Uint8Array> {
  assertStillForeground()
  const item = items.find(entry => entry.types.includes('image/png'))
  if (!item)
    throw new Error(CLIPBOARD_PASTE_IMAGE_UNAVAILABLE)
  assertStillForeground()
  const blob = await item.getType('image/png')
  if (blob.size <= 0)
    throw new Error(CLIPBOARD_PASTE_IMAGE_UNAVAILABLE)
  if (blob.size > CLIPBOARD_IMAGE_MAX_BYTES)
    throw new Error(CLIPBOARD_PASTE_IMAGE_TOO_LARGE)
  if (blob.size < 33)
    throw new Error(CLIPBOARD_PASTE_IMAGE_INVALID)
  assertStillForeground()
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (bytes.byteLength !== blob.size)
    throw new Error(CLIPBOARD_PASTE_IMAGE_INVALID)
  const verdict = classifyClipboardPng(bytes)
  if (verdict !== 'ok')
    throw new Error(verdict === 'too_large' ? CLIPBOARD_PASTE_IMAGE_TOO_LARGE : CLIPBOARD_PASTE_IMAGE_INVALID)
  assertStillForeground()
  const payload = new Uint8Array(bytes.byteLength)
  payload.set(bytes)
  return payload
}
