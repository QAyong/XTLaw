import { shouldRecoverEmptyClipboardPng } from '../shared/desktopClipboard'

export interface EmptyClipboardPngPasteEvent {
  isTrusted: boolean
  timeStamp: number
  clipboardData?: { files?: ArrayLike<{ type: string, size: number }> } | null
}

// The read starts inside the trusted paste. The same batch stays available until
// the next task because a native event can checkpoint microtasks between worlds.
export function createEmptyPngPasteCapture(readImage: () => Promise<Uint8Array>) {
  let ticket: { promise: Promise<Uint8Array>, consumed: boolean, timeStamp: number } | null = null
  let expiry: ReturnType<typeof setTimeout> | null = null

  function expire(current: NonNullable<typeof ticket>) {
    if (expiry !== null)
      clearTimeout(expiry)
    expiry = setTimeout(() => {
      expiry = null
      if (ticket === current && !current.consumed)
        ticket = null
    }, 0)
  }

  function onPaste(event: EmptyClipboardPngPasteEvent) {
    const files = event.clipboardData?.files
    if (!event.isTrusted || !Number.isFinite(event.timeStamp) || !files || !shouldRecoverEmptyClipboardPng(files))
      return
    let promise: Promise<Uint8Array>
    try {
      promise = Promise.resolve(readImage())
    }
    catch (error) {
      promise = Promise.reject(error)
    }
    void promise.catch(() => {})
    const current = { promise, consumed: false, timeStamp: event.timeStamp }
    ticket = current
    expire(current)
  }

  function take(timeStamp: number): Promise<Uint8Array> | null {
    if (!ticket || ticket.consumed || !Number.isFinite(timeStamp) || timeStamp !== ticket.timeStamp)
      return null
    ticket.consumed = true
    const promise = ticket.promise
    ticket = null
    if (expiry !== null) {
      clearTimeout(expiry)
      expiry = null
    }
    return promise
  }

  return { onPaste, take }
}
