import type { BuddyResourceQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { SelectionReferenceRequest } from './workbenchSelectionReferences'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { buddyResourceQuoteSchema } from '@buddy-shared/conversation/buddyUserContent'
import { useEventListener } from '@vueuse/core'
import { useMessage } from 'naive-ui'
import { onScopeDispose, readonly, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { getDirectSelectionReferenceTarget, useSelectionReferences } from './workbenchSelectionReferences'

export type PrepareResourceQuote = (quote: BuddyResourceQuote, x: number, y: number, intent: 'menu' | 'quote') => (() => void) | null

export function useResourceSelectionQuote(options: {
  viewId: () => string
  ownerKey: () => string
  visible: () => boolean
  language: () => BuddyLocale
}) {
  const references = useSelectionReferences()
  const message = useMessage()
  const { t } = useBuddyI18n(options.language)
  const pending = shallowRef<SelectionReferenceRequest | null>(null)
  const position = shallowRef({ x: 0, y: 0 })
  let disposed = false
  let generation = 0

  function close() {
    generation++
    pending.value = null
  }

  function add(request: SelectionReferenceRequest, targetId: string) {
    const result = references?.add(request, targetId) ?? 'unavailable'
    if (result === 'added')
      message.success(t('desktop.chat.quoteAddedToTarget', { title: request.targets.find(target => target.id === targetId)?.label ?? '' }))
    else if (result === 'duplicate')
      message.info(t('desktop.chat.quoteDuplicate'))
    else
      message.warning(t(result === 'limit' ? 'desktop.chat.quoteLimit' : 'desktop.chat.quoteTargetChanged'))
  }

  function openRequest(request: SelectionReferenceRequest, x: number, y: number) {
    close()
    if (disposed)
      return
    if (!options.visible() || request.viewId !== options.viewId() || !references?.isSourceCurrent(request)) {
      message.warning(t('desktop.chat.quoteTargetChanged'))
      return
    }
    position.value = { x, y }
    pending.value = request
  }

  const prepare: PrepareResourceQuote = (quote, x, y, intent) => {
    if (disposed || !options.visible() || !references)
      return null
    close()
    const version = generation
    const request = references.capture(options.viewId(), quote)
    let consumed = false
    return () => {
      if (consumed || disposed)
        return
      consumed = true
      if (version !== generation || !options.visible() || (request && !references.isSourceCurrent(request))) {
        message.warning(t('desktop.chat.quoteTargetChanged'))
        return
      }
      if (!request) {
        message.warning(t(buddyResourceQuoteSchema.safeParse(quote).success ? 'desktop.chat.quoteTargetChanged' : 'desktop.chat.quoteLimit'))
        return
      }
      const target = getDirectSelectionReferenceTarget(request)
      if (intent === 'quote' && target)
        add(request, target.id)
      else
        openRequest(request, x, y)
    }
  }

  function select(targetId: string) {
    const request = pending.value
    close()
    if (!disposed && options.visible() && request)
      add(request, targetId)
  }

  watch([options.viewId, options.ownerKey, options.visible], close, { flush: 'sync' })
  useEventListener(window, 'resize', close)
  useEventListener(window, 'blur', close)
  useEventListener(document, 'keydown', (event) => {
    if (event.key === 'Escape' || event.key === 'Tab')
      close()
  })
  onScopeDispose(() => {
    disposed = true
    close()
  })

  return { enabled: !!references, pending: readonly(pending), position: readonly(position), prepare, openRequest, select, close }
}

export type ResourceSelectionQuote = ReturnType<typeof useResourceSelectionQuote>
