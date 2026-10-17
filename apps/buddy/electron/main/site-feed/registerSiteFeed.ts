import type { DesktopRuntimeHost } from '../app/DesktopRuntimeHost'
import type { DesktopWindowHost } from '../app/DesktopWindowHost'
import type { DesktopEnvironment } from '../app/typing'
import { ipcMain, shell } from 'electron'
import { DESKTOP_IPC_CHANNELS } from '../../shared/desktopApi'
import { siteFeedSeenInputSchema, siteFeedTargetSchema } from '../../shared/siteFeed'
import { assertTrustedSender } from '../ipc'
import { fetchSiteFeed } from '../siteFeed'
import { SiteFeedService } from './SiteFeedService'
import { SiteFeedStore } from './SiteFeedStore'

export function registerSiteFeed(environment: DesktopEnvironment, runtime: DesktopRuntimeHost, windows: DesktopWindowHost) {
  const service = new SiteFeedService({
    automatic: !environment.isSmokeTest && environment.paths.profile !== 'test',
    store: new SiteFeedStore(environment.paths.buddyHome),
    fetch: signal => fetchSiteFeed({ signal, fetchFeed: runtime.network.get }),
    openLink: url => shell.openExternal(url),
    reportFailure: () => environment.events.publish({ component: 'desktop.site-feed', event: 'site-feed.failed', level: 'warn', errorCode: 'SITE_FEED_FETCH_FAILED' }),
  })
  const changes = service.onDidChange((state) => {
    const window = windows.window
    if (window && !window.isDestroyed())
      window.webContents.send(DESKTOP_IPC_CHANNELS.appSiteFeedChanged, state)
  })
  const stopStartup = environment.startup.onStateChange(state => service.setReady(state.status === 'ready'))
  service.setReady(environment.startup.state.status === 'ready')
  void service.start().catch(() => environment.events.publish({ component: 'desktop.site-feed', event: 'site-feed.restore.failed', level: 'warn', errorCode: 'SITE_FEED_STATE_UNAVAILABLE' }))

  const channels = [
    DESKTOP_IPC_CHANNELS.appSiteFeedState,
    DESKTOP_IPC_CHANNELS.appSiteFeedMarkSeen,
    DESKTOP_IPC_CHANNELS.appSiteFeedMarkAllSeen,
    DESKTOP_IPC_CHANNELS.appSiteFeedOpen,
  ]
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appSiteFeedState, (event) => {
    assertTrustedSender(event, windows.window)
    return service.getState()
  })
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appSiteFeedMarkSeen, (event, input: unknown) => {
    assertTrustedSender(event, windows.window)
    const { itemId, revision } = siteFeedSeenInputSchema.parse(input)
    return service.markSeen(itemId, revision)
  })
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appSiteFeedMarkAllSeen, (event) => {
    assertTrustedSender(event, windows.window)
    return service.markAllSeen()
  })
  ipcMain.handle(DESKTOP_IPC_CHANNELS.appSiteFeedOpen, (event, input: unknown) => {
    assertTrustedSender(event, windows.window)
    const { itemId } = siteFeedTargetSchema.parse(input)
    return service.open(itemId)
  })
  return {
    async dispose() {
      stopStartup()
      changes.dispose()
      for (const channel of channels)
        ipcMain.removeHandler(channel)
      await service.dispose()
    },
  }
}
