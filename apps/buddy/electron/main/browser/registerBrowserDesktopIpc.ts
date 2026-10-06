import type { BrowserWindow, IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import type { BrowserDataService } from './BrowserDataService'
import type { BrowserHost } from './BrowserHost'
import type { BrowserScreenshotService } from './BrowserScreenshotService'
import { fileURLToPath } from 'node:url'
import { dialog, ipcMain, session, shell, webContents } from 'electron'
import { browserClearDataInputSchema, browserClearDataResultSchema, browserDataSummarySchema } from '../../../shared/browser/browserData'
import {
  browserAttachGuestInputSchema,
  browserEnsureSessionInputSchema,
  browserNavigateInputSchema,
  browserOpenArtifactInputSchema,
  browserSessionInputSchema,
  browserSetProfileModeInputSchema,
  browserSetSurfaceInputSchema,
  browserSetViewportInputSchema,
  browserSetZoomFactorInputSchema,
  desktopBrowserGuestDescriptorsSchema,
  desktopBrowserStateSchema,
} from '../../../shared/browser/browserDesktopSchemas'
import { BROWSER_PAGE_DIALOG_CHANNEL } from '../../../shared/browser/browserDialogs'
import { browserLocateElementInputSchema, browserPickInputSchema, browserPickResultSchema } from '../../../shared/browser/browserSelection'
import { DESKTOP_IPC_CHANNELS } from '../../shared/desktopApi'
import { assertTrustedSender } from '../ipc'

export interface RegisterBrowserDesktopIpcOptions {
  getLanguage?: () => string
  data: Pick<BrowserDataService, 'clear' | 'getSummary'>
  screenshots: Pick<BrowserScreenshotService, 'capture'>
  getHost: () => BrowserHost | null
  getWindow: () => BrowserWindow | null
  resolveArtifactEntry: (input: {
    artifactId: string
    conversationId: string
  }) => Promise<{ entryPath: string, rootPath: string }>
}

export function registerBrowserDesktopIpc(
  options: RegisterBrowserDesktopIpcOptions,
): () => void {
  const handlePageDialog = (event: IpcMainEvent, input: unknown): boolean => {
    // Guest-only entry: page payloads cannot choose a tab, origin, file or host command.
    const window = options.getWindow()
    const sender = event.sender
    if (!window || sender.isDestroyed() || sender.getType() !== 'webview'
      || sender.hostWebContents !== window.webContents || event.senderFrame !== sender.mainFrame) {
      return false
    }
    if (!input || typeof input !== 'object' || Object.keys(input).length !== 2)
      return false
    const request = input as { type?: unknown, message?: unknown }
    if ((request.type !== 'alert' && request.type !== 'confirm') || typeof request.message !== 'string' || request.message.length > 2_048)
      return false
    const host = options.getHost()
    if (!host)
      return false
    return host.handlePageDialog(sender.id, { type: request.type, message: request.message }, (origin) => {
      const chinese = options.getLanguage?.() === 'zh-CN'
      const response = dialog.showMessageBoxSync(window, {
        type: request.type === 'confirm' ? 'question' : 'info',
        title: chinese ? 'XTLaw — 网页对话框' : 'XTLaw — Web page',
        message: origin,
        detail: request.message as string,
        buttons: request.type === 'confirm' ? (chinese ? ['取消', '确定'] : ['Cancel', 'OK']) : [chinese ? '确定' : 'OK'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      return request.type === 'alert' || response === 1
    })
  }
  const pageDialogListener = (event: IpcMainEvent, input: unknown): void => {
    let value = false
    try {
      value = handlePageDialog(event, input)
    }
    catch {}
    // Electron's setter sends the synchronous reply immediately. Reply exactly once, after
    // the user choice, never with a provisional default before opening the dialog.
    event.returnValue = { handled: true, value }
  }
  ipcMain.on(BROWSER_PAGE_DIALOG_CHANNEL, pageDialogListener)
  const registeredChannels: string[] = []
  const handle = (
    channel: string,
    handler: (host: BrowserHost, input: unknown, event: IpcMainInvokeEvent) => unknown,
  ) => {
    registeredChannels.push(channel)
    ipcMain.handle(channel, async (event: IpcMainInvokeEvent, input: unknown) => {
      assertTrustedSender(event, options.getWindow())
      const host = requireBrowserHost(options.getHost())
      return handler(host, input, event)
    })
  }

  handle(DESKTOP_IPC_CHANNELS.browserPickElement, async (host, input, event) => {
    if (event.senderFrame !== event.sender.mainFrame)
      throw new Error('Element picking requires the trusted main frame')
    const { sessionId, requestId } = browserPickInputSchema.parse(input)
    return browserPickResultSchema.parse(await host.pickElement(sessionId, requestId))
  })
  handle(DESKTOP_IPC_CHANNELS.browserCancelElementPick, (host, input, event) => {
    if (event.senderFrame !== event.sender.mainFrame)
      throw new Error('Element picking requires the trusted main frame')
    const { sessionId, requestId } = browserPickInputSchema.parse(input)
    host.cancelElementPick(sessionId, requestId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserLocateElement, (host, input, event) => {
    if (event.senderFrame !== event.sender.mainFrame)
      throw new Error('Element location requires the trusted main frame')
    return host.locateElement(browserLocateElementInputSchema.parse(input))
  })
  handle(DESKTOP_IPC_CHANNELS.browserAttachGuest, (host, input, event) => {
    const { sessionId, webContentsId } = browserAttachGuestInputSchema.parse(input)
    const guest = webContents.fromId(webContentsId)
    if (
      !guest
      || guest.getType() !== 'webview'
      || guest.hostWebContents !== event.sender
    ) {
      throw new Error('Browser guest does not belong to the Desktop renderer')
    }
    const descriptor = host.getGuestDescriptor(sessionId)
    if (guest.session !== session.fromPartition(descriptor.partition))
      throw new Error('Browser guest does not belong to the requested session')
    host.attachGuest(sessionId, guest)
  })
  handle(DESKTOP_IPC_CHANNELS.browserCaptureScreenshot, async (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    const window = options.getWindow()
    if (!window)
      throw new Error('Browser window is unavailable')
    return options.screenshots.capture(window, () => host.captureScreenshot(sessionId))
  })
  handle(DESKTOP_IPC_CHANNELS.browserGetDataSummary, async () => browserDataSummarySchema.parse(await options.data.getSummary()))
  handle(DESKTOP_IPC_CHANNELS.browserClearData, async (_host, input) => (
    browserClearDataResultSchema.parse(await options.data.clear(browserClearDataInputSchema.parse(input)))
  ))
  handle(DESKTOP_IPC_CHANNELS.browserSetViewport, async (host, input) => {
    const { sessionId, viewport } = browserSetViewportInputSchema.parse(input)
    return desktopBrowserStateSchema.parse(await host.setViewport(sessionId, viewport))
  })
  handle(DESKTOP_IPC_CHANNELS.browserSetZoomFactor, async (host, input) => {
    const { sessionId, zoomFactor } = browserSetZoomFactorInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    return desktopBrowserStateSchema.parse(await host.setZoomFactor(sessionId, zoomFactor))
  })
  handle(DESKTOP_IPC_CHANNELS.browserEnsureSession, (host, input) => {
    const { conversationId, tabId } = browserEnsureSessionInputSchema.parse(input)
    return desktopBrowserStateSchema.parse(host.ensureSession(conversationId, tabId))
  })
  handle(DESKTOP_IPC_CHANNELS.browserGoBack, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    host.goBack(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserGoForward, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    host.goForward(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserListGuests, host => (
    desktopBrowserGuestDescriptorsSchema.parse(host.listGuests())
  ))
  handle(DESKTOP_IPC_CHANNELS.browserNavigate, async (host, input) => {
    const { sessionId, url } = browserNavigateInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    return desktopBrowserStateSchema.parse(await host.navigate(sessionId, url))
  })
  handle(DESKTOP_IPC_CHANNELS.browserOpenArtifact, async (host, input) => {
    const { artifactId, sessionId } = browserOpenArtifactInputSchema.parse(input)
    const conversationId = host.getState(sessionId).conversationId
    if (!conversationId)
      throw new Error('Artifact previews require a conversation browser session')
    const entry = await options.resolveArtifactEntry({ artifactId, conversationId })
    takeHumanControl(host, sessionId)
    return desktopBrowserStateSchema.parse(await host.openLocalFile(sessionId, entry))
  })
  handle(DESKTOP_IPC_CHANNELS.browserOpenDevTools, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    return host.openDevTools(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserOpenExternal, async (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    const { url } = host.getState(sessionId)
    if (url === 'about:blank')
      return false
    if (url.startsWith('file:')) {
      const error = await shell.openPath(fileURLToPath(url))
      if (error)
        throw new Error(error)
      return true
    }
    await shell.openExternal(url)
    return true
  })
  handle(DESKTOP_IPC_CHANNELS.browserReload, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    host.reload(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserSetProfileMode, async (host, input) => {
    const { profileMode, sessionId } = browserSetProfileModeInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    return desktopBrowserStateSchema.parse(await host.setProfileMode(sessionId, profileMode))
  })
  handle(DESKTOP_IPC_CHANNELS.browserSetSurface, (host, input) => {
    host.setSurface(browserSetSurfaceInputSchema.parse(input))
  })
  handle(DESKTOP_IPC_CHANNELS.browserStop, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    takeHumanControl(host, sessionId)
    host.stop(sessionId)
  })
  handle(DESKTOP_IPC_CHANNELS.browserShowFileInFolder, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    const { url } = host.getState(sessionId)
    if (!url.startsWith('file:'))
      return false
    shell.showItemInFolder(fileURLToPath(url))
    return true
  })
  handle(DESKTOP_IPC_CHANNELS.browserRevealDownload, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    const path = host.getState(sessionId).download?.path
    if (!path)
      return false
    shell.showItemInFolder(path)
    return true
  })
  handle(DESKTOP_IPC_CHANNELS.browserTakeControl, (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    return desktopBrowserStateSchema.parse(host.takeControl(sessionId))
  })
  handle(DESKTOP_IPC_CHANNELS.browserClose, async (host, input) => {
    const { sessionId } = browserSessionInputSchema.parse(input)
    if (host.hasActiveDownloads(sessionId)) {
      const window = options.getWindow()
      if (!window)
        throw new Error('Download cancellation requires confirmation')
      const chinese = options.getLanguage?.() === 'zh-CN'
      const result = await dialog.showMessageBox(window, {
        type: 'warning',
        message: chinese ? '取消下载并关闭标签页？' : 'Cancel downloads and close this tab?',
        detail: chinese ? '此标签页仍有下载进行中。关闭会停止下载；XTLaw 不会删除已有文件。' : 'Downloads from this tab are still in progress. Closing it will stop them. Existing files will not be deleted by XTLaw.',
        buttons: chinese ? ['保留标签页', '取消下载并关闭'] : ['Keep tab open', 'Cancel downloads and close'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
      })
      if (result.response !== 1)
        throw new Error('Download cancellation declined')
    }
    host.close(sessionId)
  })

  return () => {
    ipcMain.removeListener(BROWSER_PAGE_DIALOG_CHANNEL, pageDialogListener)
    for (const channel of registeredChannels)
      ipcMain.removeHandler(channel)
  }
}

function requireBrowserHost(host: BrowserHost | null): BrowserHost {
  if (!host)
    throw new Error('Browser host is unavailable')
  return host
}

function takeHumanControl(host: BrowserHost, sessionId: string): void {
  if (host.getState(sessionId).controller === 'agent')
    host.takeControl(sessionId)
}
