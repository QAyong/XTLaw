import { deferred } from '@buddy-tests/deferred'
import { describe, expect, it, vi } from 'vitest'
import { createEmptyPngPasteCapture } from '../emptyPngPaste'

const empty = { isTrusted: true, timeStamp: 10, clipboardData: { files: [{ type: 'image/png', size: 0 }] } }

describe('trusted empty png paste capture', () => {
  it('starts one read for the trusted batch and keeps it across a microtask checkpoint', async () => {
    const read = vi.fn(() => Promise.resolve(new Uint8Array([1])))
    const capture = createEmptyPngPasteCapture(read)
    capture.onPaste({ isTrusted: false, timeStamp: 10, clipboardData: { files: [{ type: 'image/png', size: 0 }] } })
    capture.onPaste({ isTrusted: true, timeStamp: 10, clipboardData: { files: [{ type: 'image/png', size: 8 }] } })
    capture.onPaste({ isTrusted: true, timeStamp: 10, clipboardData: { files: [{ type: 'image/jpeg', size: 0 }] } })
    capture.onPaste({ isTrusted: true, timeStamp: 10, clipboardData: { files: [] } })
    capture.onPaste({ isTrusted: true, timeStamp: Number.NaN, clipboardData: { files: [{ type: 'image/png', size: 0 }] } })
    expect(read).not.toHaveBeenCalled()
    expect(capture.take(10)).toBeNull()

    capture.onPaste(empty)
    expect(read).toHaveBeenCalledOnce()
    await Promise.resolve()
    const first = capture.take(10)
    expect(first).toBeInstanceOf(Promise)
    expect(capture.take(10)).toBeNull()
    await expect(first).resolves.toEqual(new Uint8Array([1]))
  })

  it('does not let a mismatched or non-numeric stamp consume the batch', async () => {
    const pending = deferred<Uint8Array>()
    const read = vi.fn(() => pending.promise)
    const capture = createEmptyPngPasteCapture(read)
    capture.onPaste(empty)
    expect(capture.take(11)).toBeNull()
    expect(capture.take('10' as unknown as number)).toBeNull()
    expect(capture.take(Number.NaN)).toBeNull()
    const taken = capture.take(10)
    pending.resolve(new Uint8Array([2]))
    await expect(taken).resolves.toEqual(new Uint8Array([2]))
    expect(read).toHaveBeenCalledOnce()
  })

  it('keeps an already consumed batch when a later paste replaces the clipboard', async () => {
    const first = deferred<Uint8Array>()
    const second = deferred<Uint8Array>()
    const read = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const capture = createEmptyPngPasteCapture(read)
    capture.onPaste(empty)
    const taken = capture.take(10)
    capture.onPaste({ ...empty, timeStamp: 11 })
    first.resolve(new Uint8Array([1]))
    second.resolve(new Uint8Array([2]))
    await expect(taken).resolves.toEqual(new Uint8Array([1]))
    await expect(capture.take(11)).resolves.toEqual(new Uint8Array([2]))
    expect(capture.take(11)).toBeNull()
  })

  it('drops an unconsumed batch on the next task, not at the next microtask', async () => {
    const read = vi.fn(() => Promise.resolve(new Uint8Array([1])))
    const capture = createEmptyPngPasteCapture(read)
    capture.onPaste(empty)
    await Promise.resolve()
    expect(capture.take(10)).toBeInstanceOf(Promise)
    capture.onPaste({ ...empty, timeStamp: 12 })
    await Promise.resolve()
    expect(capture.take(12)).toBeInstanceOf(Promise)
    capture.onPaste({ ...empty, timeStamp: 13 })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(capture.take(13)).toBeNull()
    expect(read).toHaveBeenCalledTimes(3)
  })
})
