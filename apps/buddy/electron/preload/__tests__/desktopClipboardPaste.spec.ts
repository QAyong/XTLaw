import type { LexoraDesktopApi } from '../../shared/desktopApi'
import type { EmptyClipboardPngPasteEvent } from '../emptyPngPaste'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { DESKTOP_IPC_CHANNELS } from '../../shared/desktopApi'
import { createDesktopApi } from '../desktop'

const electron = vi.hoisted(() => ({ invoke: vi.fn() }))
vi.mock('electron', () => ({
  ipcRenderer: { invoke: electron.invoke, on: vi.fn(), off: vi.fn() },
  webUtils: { getPathForFile: vi.fn() },
}))

interface PasteTarget {
  addEventListener: (type: 'paste', listener: (event: EmptyClipboardPngPasteEvent) => void, capture: true) => void
}

describe('desktop paste image bridge', () => {
  it('exposes only the one-shot paste stamp, not a general clipboard read', () => {
    expectTypeOf<keyof LexoraDesktopApi['clipboard']>().toEqualTypeOf<'getFilePath' | 'takeEmptyPastedImage' | 'writeImage' | 'writeText'>()
    expectTypeOf<Parameters<LexoraDesktopApi['clipboard']['takeEmptyPastedImage']>>().toEqualTypeOf<[timeStamp: number]>()
    expectTypeOf<ReturnType<LexoraDesktopApi['clipboard']['takeEmptyPastedImage']>>().toEqualTypeOf<Promise<Uint8Array> | null>()
  })

  it('reads from the same trusted paste capture and consumes that batch once', () => {
    electron.invoke.mockReset().mockResolvedValue(new Uint8Array([9]))
    const listeners: Array<{ listener: (event: EmptyClipboardPngPasteEvent) => void, capture: boolean }> = []
    const target: PasteTarget = {
      addEventListener: (type, listener, capture) => {
        if (type === 'paste')
          listeners.push({ listener, capture })
      },
    }
    vi.stubGlobal('document', target)
    const api = createDesktopApi()
    expect(listeners).toEqual([{ listener: expect.any(Function), capture: true }])
    expect(api.clipboard.takeEmptyPastedImage(4)).toBeNull()
    expect(electron.invoke).not.toHaveBeenCalled()

    const ignored: EmptyClipboardPngPasteEvent = {
      isTrusted: true,
      timeStamp: 4,
      clipboardData: { files: [{ type: 'image/png', size: 6 }] },
    }
    listeners[0]!.listener(ignored)
    expect(electron.invoke).not.toHaveBeenCalled()

    const event: EmptyClipboardPngPasteEvent = {
      isTrusted: true,
      timeStamp: 18,
      clipboardData: { files: [{ type: 'image/png', size: 0 }] },
    }
    listeners[0]!.listener(event)
    expect(electron.invoke).toHaveBeenCalledExactlyOnceWith(DESKTOP_IPC_CHANNELS.clipboardReadPastedImage)
    const pending = api.clipboard.takeEmptyPastedImage(event.timeStamp)
    expect(pending).toBeInstanceOf(Promise)
    expect(api.clipboard.takeEmptyPastedImage(event.timeStamp)).toBeNull()
    expect(api.clipboard.takeEmptyPastedImage(4)).toBeNull()
    expect(electron.invoke).toHaveBeenCalledOnce()
    vi.unstubAllGlobals()
  })
})
