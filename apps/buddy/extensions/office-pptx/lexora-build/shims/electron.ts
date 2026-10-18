/**
 * In-page Electron stand-in. The upstream preload, main-process handlers and
 * renderer all run in this one document, so ipcRenderer.invoke is a direct call
 * into the handlers ipcMain.handle registered. Arguments and results are cloned
 * to keep the isolation a real IPC boundary gives.
 */
type Handler = (event: unknown, ...args: any[]) => unknown
type Listener = (event: unknown, ...args: any[]) => void

const handlers = new Map<string, Handler>()
const rendererListeners = new Map<string, Set<Listener>>()
const mainListeners = new Map<string, Set<Listener>>()

function add(map: Map<string, Set<Listener>>, channel: string, listener: Listener) {
  let set = map.get(channel)
  if (!set)
    map.set(channel, (set = new Set()))
  set.add(listener)
}
function remove(map: Map<string, Set<Listener>>, channel: string, listener: Listener) {
  map.get(channel)?.delete(listener)
}
const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value))

function quiet() {}
const stub = (): any => new Proxy(quiet, { get: (_t, key) => (key === 'then' ? undefined : stub()), apply: () => undefined })

export const sender: any = {
  id: 1,
  send: (channel: string, ...args: unknown[]) => {
    for (const listener of [...(rendererListeners.get(channel) ?? [])]) listener({ sender }, ...clone(args))
  },
  isDestroyed: () => false,
  isLoading: () => false,
  on: quiet,
  once: quiet,
  removeListener: quiet,
  getOwnerBrowserWindow: () => null,
  setZoomFactor: quiet,
  session: stub(),
  // Editing commands act on the focused element, like WebContents.copy/cut/paste.
  copy: () => void document.execCommand('copy'),
  cut: () => void document.execCommand('cut'),
  paste: () => void navigator.clipboard?.readText?.().then(text => document.execCommand('insertText', false, text)).catch(() => {}),
}
const event = { sender, senderFrame: { url: 'lexora-extension://slides' } }

/** Host access for the plugin glue: look up or replace a registered handler. */
export const handlerRegistry = {
  get: (channel: string) => handlers.get(channel),
  set: (channel: string, handler: Handler) => void handlers.set(channel, handler),
  event: () => event,
  broadcast: (channel: string, ...args: unknown[]) => sender.send(channel, ...args),
}

export const ipcMain = {
  handle: (channel: string, handler: Handler) => void handlers.set(channel, handler),
  handleOnce: (channel: string, handler: Handler) => void handlers.set(channel, handler),
  removeHandler: (channel: string) => void handlers.delete(channel),
  on: (channel: string, listener: Listener) => add(mainListeners, channel, listener),
  once: (channel: string, listener: Listener) => add(mainListeners, channel, listener),
  removeListener: (channel: string, listener: Listener) => remove(mainListeners, channel, listener),
}

export const ipcRenderer = {
  invoke: async (channel: string, ...args: unknown[]) => {
    const handler = handlers.get(channel)
    if (!handler) {
      // AI, project store, presenter and attachment channels are not part of the plugin: answer empty.
      if (/^(?:ai|project):|^slides:(?:presenter|audience|files|cloud|local-generate)/.test(channel))
        return null
      throw new Error(`SLIDES_FEATURE_UNAVAILABLE: ${channel}`)
    }
    return clone(await handler(event, ...clone(args)))
  },
  send: (channel: string, ...args: unknown[]) => {
    for (const listener of [...(mainListeners.get(channel) ?? [])]) listener(event, ...clone(args))
  },
  on: (channel: string, listener: Listener) => add(rendererListeners, channel, listener),
  once: (channel: string, listener: Listener) => add(rendererListeners, channel, listener),
  removeListener: (channel: string, listener: Listener) => remove(rendererListeners, channel, listener),
  removeAllListeners: (channel: string) => void rendererListeners.delete(channel),
}

export const contextBridge = {
  exposeInMainWorld: (name: string, api: unknown) => {
    ;(window as any)[name] = api
  },
}
export const webUtils = { getPathForFile: () => '' }

export const app: any = {
  isPackaged: true,
  getPath: (name: string) => `/virtual/${name}`,
  getLocale: () => navigator.language,
  getName: () => 'XTLaw',
  getVersion: () => '0.0.0',
  whenReady: () => Promise.resolve(),
  on: quiet,
  once: quiet,
  quit: quiet,
  exit: quiet,
  focus: quiet,
  commandLine: stub(),
}
export const webContents: any = {
  fromId: (id: number) => (id === sender.id ? sender : null),
  getAllWebContents: () => [sender],
  getFocusedWebContents: () => sender,
}
export const BrowserWindow: any = { getFocusedWindow: () => null, getAllWindows: () => [], fromWebContents: () => null, fromId: () => null }
/** Message boxes go to the plugin view so confirmations and errors reach the user. */
const hostBox = () => (globalThis as { __lexoraSlidesHost?: { messageBox?: (options: unknown) => Promise<number> } }).__lexoraSlidesHost?.messageBox
export const dialog: any = {
  showMessageBox: async (...args: unknown[]) => {
    const options = args.at(-1)
    const box = hostBox()
    return { response: box ? await box(options) : 0, checkboxChecked: false }
  },
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showSaveDialog: async () => ({ canceled: true }),
  showErrorBox: quiet,
}
export const shell: any = stub()
export const clipboard: any = { readText: () => '', writeText: quiet, readBuffer: () => new Uint8Array(), writeBuffer: quiet, availableFormats: () => [], clear: quiet }
export const nativeImage: any = stub()
export const Menu: any = { setApplicationMenu: quiet, buildFromTemplate: stub }
export const session: any = stub()
export const systemPreferences: any = stub()
export const desktopCapturer: any = stub()
export const screen: any = stub()
export class WebContentsView {}
export default { ipcMain, ipcRenderer, contextBridge, webUtils, app, webContents, BrowserWindow, dialog, shell, clipboard, nativeImage, Menu, session }
