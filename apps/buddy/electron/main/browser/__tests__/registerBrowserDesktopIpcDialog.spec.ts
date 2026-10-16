import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import type { BrowserHost } from '../BrowserHost'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_PAGE_DIALOG_CHANNEL } from '../../../../shared/browser/browserDialogs'
import { DEFAULT_BROWSER_PREFERENCES } from '../../../../shared/browser/browserPreferences'
import { BrowserScreenshotService } from '../BrowserScreenshotService'
import { registerBrowserDesktopIpc } from '../registerBrowserDesktopIpc'

const electron = vi.hoisted(() => ({
  fromId: vi.fn(),
  fromPartition: vi.fn(),
  handlers: new Map<string, (event: IpcMainInvokeEvent, input: unknown) => unknown>(),
  listeners: new Map<string, (event: IpcMainEvent, input: unknown) => void>(),
  showMessageBoxSync: vi.fn(),
  openExternal: vi.fn(),
  openPath: vi.fn(),
  removeHandler: vi.fn((channel: string) => electron.handlers.delete(channel)),
  showOpenDialog: vi.fn(),
  showItemInFolder: vi.fn(),
  showSaveDialog: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({ writeFile: electron.writeFile }))

vi.mock('electron', () => ({
  app: { getVersion: () => '0.1.0' },
  clipboard: { writeText: vi.fn() },
  dialog: {
    showMessageBoxSync: electron.showMessageBoxSync,
    showOpenDialog: electron.showOpenDialog,
    showSaveDialog: electron.showSaveDialog,
  },
  ipcMain: {
    on: vi.fn((channel, listener) => electron.listeners.set(channel, listener)),
    removeListener: vi.fn(),
    handle: vi.fn((channel, handler) => electron.handlers.set(channel, handler)),
    removeHandler: electron.removeHandler,
  },
  session: { fromPartition: electron.fromPartition },
  shell: {
    openExternal: electron.openExternal,
    openPath: electron.openPath,
    showItemInFolder: electron.showItemInFolder,
  },
  webContents: { fromId: electron.fromId },
}))

beforeEach(() => {
  electron.handlers.clear()
  electron.listeners.clear()
  electron.showMessageBoxSync.mockReset()
  electron.showOpenDialog.mockReset()
  electron.showSaveDialog.mockReset()
  electron.fromId.mockReset()
  electron.fromPartition.mockReset()
  electron.openExternal.mockReset()
  electron.openPath.mockReset()
  electron.showItemInFolder.mockReset()
  electron.writeFile.mockReset()
})

describe('registerBrowserDesktopIpc page dialogs', () => {
  it.each([1, 0])('replies only once, after the guest confirm choice %s', (response) => {
    const mainFrame = {}
    const desktop = {}
    const window = { webContents: desktop } as BrowserWindow
    const host = { handlePageDialog: vi.fn((_id, _request, show: (origin: string) => boolean) => show('https://example.com')) } as unknown as BrowserHost
    registerBrowserDesktopIpc({
      data: { getSummary: async () => ({ cacheBytes: 0, cookieSiteCount: 0 }), clear: async () => ({ ok: true }) },
      screenshots: new BrowserScreenshotService(() => DEFAULT_BROWSER_PREFERENCES),
      getHost: () => host,
      getWindow: () => window,
      resolveArtifactEntry: async () => { throw new Error('unused') },
    })
    const replies: unknown[] = []
    const event = { sender: { id: 17, mainFrame, hostWebContents: desktop, getType: () => 'webview', isDestroyed: () => false }, senderFrame: mainFrame } as unknown as IpcMainEvent
    Object.defineProperty(event, 'returnValue', { get: () => replies.at(-1), set: value => replies.push(value) })
    electron.showMessageBoxSync.mockImplementation(() => {
      expect(replies).toEqual([])
      return response
    })
    const listener = electron.listeners.get(BROWSER_PAGE_DIALOG_CHANNEL)!
    listener(event, { type: 'confirm', message: 'Fixture question' })
    expect(replies).toEqual([{ handled: true, value: response === 1 }])
    expect(electron.showMessageBoxSync).toHaveBeenCalledWith(window, expect.objectContaining({ message: 'https://example.com', cancelId: 0 }))
    listener({ ...event, senderFrame: {} } as IpcMainEvent, { type: 'confirm', message: 'subframe' })
    listener(event, { type: 'confirm', message: 'spoof', origin: 'https://trusted.example' })
    expect(host.handlePageDialog).toHaveBeenCalledOnce()
  })
})
