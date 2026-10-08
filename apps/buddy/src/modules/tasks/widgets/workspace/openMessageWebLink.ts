import type { DesktopBrowserApi, DesktopBrowserState } from '@buddy-electron/shared/desktopApi'

interface MessageWebLinkOptions {
  browser: Pick<DesktopBrowserApi, 'ensureSession' | 'navigate'>
  conversationId: () => string | null
  openBrowser: () => void
  retainBrowserSession: (state: DesktopBrowserState) => void
  updateBrowserState: (state: DesktopBrowserState) => void
  openExternal: (href: string) => void
  onError: () => void
}

export function createMessageWebLinkOpener(options: MessageWebLinkOptions) {
  // Keep rapid clicks ordered, including session creation and page attachment.
  let pending = Promise.resolve()
  return (href: string): Promise<void> => {
    if (!/^https?:\/\//i.test(href))
      return Promise.resolve()
    const conversationId = options.conversationId()
    pending = pending.then(async () => {
      if (!conversationId) {
        fallback(href)
        return
      }
      try {
        // Do not focus another task if the user switched while this click was queued.
        if (options.conversationId() !== conversationId)
          return
        options.openBrowser()
        const state = await options.browser.ensureSession(conversationId)
        options.retainBrowserSession(state)
        const nextState = await options.browser.navigate(state.sessionId, href)
        options.updateBrowserState(nextState)
        if (nextState.error)
          fallback(href)
      }
      catch {
        fallback(href)
      }
    })
    return pending
  }

  function fallback(href: string) {
    // The desktop external-navigation policy only permits HTTPS.
    options.onError()
    if (/^https:\/\//i.test(href))
      options.openExternal(href)
  }
}
