import type { BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { ExtensionViews } from '@/modules/extensions'
import type { WorkbenchSelectionReferences } from '@/shared/ui/selection/workbenchSelectionReferences'
import type { WorkbenchController } from '@/workbench/services/WorkbenchController'
import { onScopeDispose } from 'vue'
import { documentLocator } from './extensionDocumentLocator'

// Document plugins place a saved file quote themselves (Feature-043). Every plugin view in the layout can be asked to reveal one:
// the request carries the quote text and the position stored with it, and the plugin answers whether it found the place.
export function useExtensionDocumentReveal(options: {
  references: WorkbenchSelectionReferences
  controller: WorkbenchController
  views: ExtensionViews
}) {
  const { references, controller, views } = options
  const registered = new Map<string, () => void>()

  function sync() {
    const ids = new Set(Object.values(controller.layout.views).filter(view => view.resource.scheme === 'extension').map(view => view.id))
    for (const [id, dispose] of registered) {
      if (!ids.has(id)) {
        dispose()
        registered.delete(id)
      }
    }
    for (const id of ids) {
      if (!registered.has(id))
        registered.set(id, references.registerReveal(id, (quote, current) => reveal(id, quote, current)))
    }
  }

  async function reveal(id: string, quote: BuddyTextQuote, current: () => boolean): Promise<boolean> {
    const locator = quote.source.kind === 'file' ? documentLocator(quote.source) : null
    if (!locator)
      return false
    // The plugin view is mounted and its session ready some time after the file was opened; a plugin cannot be asked before that.
    for (;;) {
      const surface = views.surfaces.get(id)
      if (!current() || surface?.error)
        return false
      if (surface?.ready && surface.visible && surface.eligible && surface.session)
        break
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    const abort = new AbortController()
    const timer = setInterval(() => !current() && abort.abort(), 100)
    try {
      return await views.revealReference(id, { referenceId: quote.id, text: quote.text, locator }, abort.signal)
    }
    finally {
      clearInterval(timer)
    }
  }

  sync()
  const stop = controller.onDidChangeLayout(sync)
  onScopeDispose(() => {
    stop.dispose()
    for (const dispose of registered.values()) dispose()
    registered.clear()
  })
}
