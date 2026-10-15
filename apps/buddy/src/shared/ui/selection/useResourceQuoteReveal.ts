import type { BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import { watch } from 'vue'
import { useSelectionReferences } from './workbenchSelectionReferences'

export function useResourceQuoteReveal(options: {
  viewId: () => string
  identity: () => string
  visible: () => boolean
  ready: () => boolean
  prepare?: () => void
  reveal: (quote: BuddyTextQuote) => boolean
}) {
  const references = useSelectionReferences()
  watch([options.viewId, options.identity, options.visible], ([viewId, , visible], _, onCleanup) => {
    if (!visible || !references)
      return
    const pending = new Set<() => void>()
    const unregister = references.registerReveal(viewId, (quote, current) => {
      options.prepare?.()
      return new Promise<boolean>((resolve) => {
        let stop: (() => void) | undefined
        let timer: ReturnType<typeof setTimeout> | undefined
        function finish(value: boolean) {
          clearTimeout(timer)
          stop?.()
          pending.delete(cancel)
          resolve(value)
        }
        function cancel() {
          finish(false)
        }
        const check = () => {
          if (!current()) {
            finish(false)
          }
          else if (options.ready()) {
            try {
              finish(options.reveal(quote))
            }
            catch {
              finish(false)
            }
          }
        }
        stop = watch([options.ready, current], check, { flush: 'post' })
        timer = setTimeout(cancel, 10_000)
        pending.add(cancel)
        check()
      })
    })
    onCleanup(() => {
      unregister()
      for (const cancel of pending) cancel()
    })
  }, { immediate: true, flush: 'sync' })
}
