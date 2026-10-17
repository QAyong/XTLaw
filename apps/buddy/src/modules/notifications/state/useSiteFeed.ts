import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { SiteFeedState } from '@buddy-electron/shared/siteFeed'
import { readonly, shallowRef } from 'vue'

export function useSiteFeed(app: Pick<LexoraDesktopApi['app'], 'siteFeed'>) {
  const state = shallowRef<SiteFeedState | null>(null)
  let disposed = false
  const stop = app.siteFeed.onChanged(apply)

  function apply(next: SiteFeedState) {
    if (!disposed && (!state.value || next.revision >= state.value.revision))
      state.value = next
  }

  async function load() {
    apply(await app.siteFeed.getState())
  }

  async function markSeen(itemId: string, revision: string) {
    apply(await app.siteFeed.markSeen(itemId, revision))
  }

  async function markAllSeen() {
    apply(await app.siteFeed.markAllSeen())
  }

  function open(itemId: string) {
    return app.siteFeed.open(itemId)
  }

  function dispose() {
    disposed = true
    stop()
  }

  return { state: readonly(state), load, markSeen, markAllSeen, open, dispose }
}

export type SiteFeed = ReturnType<typeof useSiteFeed>
