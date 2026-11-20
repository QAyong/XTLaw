import { describe, expect, it, vi } from 'vitest'
import { classifyClipboardPng, CLIPBOARD_IMAGE_MAX_BYTES, CLIPBOARD_PASTE_IMAGE_INVALID, CLIPBOARD_PASTE_IMAGE_TOO_LARGE, CLIPBOARD_PASTE_IMAGE_UNAVAILABLE, readForegroundClipboardPng, shouldRecoverEmptyClipboardPng } from '../desktopClipboard'

function png(width: number, height: number, extra = 0): Uint8Array {
  const bytes = new Uint8Array(33 + extra)
  const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82]
  signature.forEach((value, index) => {
    bytes[index] = value
  })
  const view = new DataView(bytes.buffer)
  view.setUint32(16, width)
  view.setUint32(20, height)
  return bytes
}

function item(bytes: Uint8Array, size = bytes.byteLength, types: readonly string[] = ['text/plain', 'image/png']) {
  const arrayBuffer = vi.fn(async () => {
    const copy = new Uint8Array(bytes.byteLength)
    copy.set(bytes)
    return copy.buffer
  })
  const getType = vi.fn(async (type: string) => {
    if (type !== 'image/png')
      throw new Error(`unexpected clipboard type ${type}`)
    return { size, arrayBuffer }
  })
  return { types, getType, arrayBuffer }
}

describe('clipboard png recovery boundary', () => {
  it('recovers only an all-empty png file list', () => {
    expect(shouldRecoverEmptyClipboardPng([])).toBe(false)
    expect(shouldRecoverEmptyClipboardPng([{ type: 'image/png', size: 0 }])).toBe(true)
    expect(shouldRecoverEmptyClipboardPng([{ type: 'image/png', size: 0 }, { type: 'image/png', size: 0 }])).toBe(true)
    expect(shouldRecoverEmptyClipboardPng([{ type: 'image/png', size: 4 }])).toBe(false)
    expect(shouldRecoverEmptyClipboardPng([{ type: 'image/jpeg', size: 0 }])).toBe(false)
    expect(shouldRecoverEmptyClipboardPng([{ type: 'image/png', size: 0 }, { type: 'text/plain', size: 2 }])).toBe(false)
  })

  it('checks blob size before copying bytes, then checks the png header', async () => {
    const bytes = png(2, 3)
    const valid = item(bytes)
    await expect(readForegroundClipboardPng([valid], () => {})).resolves.toEqual(bytes)
    expect(valid.getType).toHaveBeenCalledExactlyOnceWith('image/png')

    const empty = item(bytes, 0)
    await expect(readForegroundClipboardPng([empty], () => {})).rejects.toThrow(CLIPBOARD_PASTE_IMAGE_UNAVAILABLE)
    expect(empty.arrayBuffer).not.toHaveBeenCalled()

    const oversized = item(bytes, CLIPBOARD_IMAGE_MAX_BYTES + 1)
    await expect(readForegroundClipboardPng([oversized], () => {})).rejects.toThrow(CLIPBOARD_PASTE_IMAGE_TOO_LARGE)
    expect(oversized.arrayBuffer).not.toHaveBeenCalled()

    const short = item(bytes, 32)
    await expect(readForegroundClipboardPng([short], () => {})).rejects.toThrow(CLIPBOARD_PASTE_IMAGE_INVALID)
    expect(short.arrayBuffer).not.toHaveBeenCalled()

    const malformed = item(new Uint8Array(40))
    await expect(readForegroundClipboardPng([malformed], () => {})).rejects.toThrow(CLIPBOARD_PASTE_IMAGE_INVALID)
    const huge = item(png(100_000, 100_000))
    await expect(readForegroundClipboardPng([huge], () => {})).rejects.toThrow(CLIPBOARD_PASTE_IMAGE_TOO_LARGE)
    expect(classifyClipboardPng(png(0, 1))).toBe('invalid')
  })

  it('reads image/png only and stops when the foreground check fails around the copy', async () => {
    const text = item(png(1, 1), 33, ['text/plain', 'text/html'])
    await expect(readForegroundClipboardPng([text], () => {})).rejects.toThrow(CLIPBOARD_PASTE_IMAGE_UNAVAILABLE)
    expect(text.getType).not.toHaveBeenCalled()

    const blocked = item(png(1, 1))
    await expect(readForegroundClipboardPng([blocked], () => {
      throw new Error(CLIPBOARD_PASTE_IMAGE_UNAVAILABLE)
    })).rejects.toThrow(CLIPBOARD_PASTE_IMAGE_UNAVAILABLE)
    expect(blocked.getType).not.toHaveBeenCalled()

    let copied = false
    const late = item(png(1, 1))
    late.arrayBuffer.mockImplementation(async () => {
      copied = true
      const copy = new Uint8Array(png(1, 1))
      return copy.buffer
    })
    await expect(readForegroundClipboardPng([late], () => {
      if (copied)
        throw new Error(CLIPBOARD_PASTE_IMAGE_UNAVAILABLE)
    })).rejects.toThrow(CLIPBOARD_PASTE_IMAGE_UNAVAILABLE)

    const mismatched = item(png(1, 1), 100)
    await expect(readForegroundClipboardPng([mismatched], () => {})).rejects.toThrow(CLIPBOARD_PASTE_IMAGE_INVALID)
  })
})
