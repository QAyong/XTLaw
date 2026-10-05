import type { ExtensionApi, ExtensionStatus, ExtensionWorkbenchEvent } from '@buddy-shared/extensions/extensionApi'
import type { Ref } from 'vue'
import type { JsonValue } from '@buddy-shared/workbench/workbenchState'
import type { SelectionReferenceRequest, SelectionReferenceResult, WorkbenchSelectionReferences } from '@/shared/ui/selection/workbenchSelectionReferences'
import type { ExtensionUiContributions, ExtensionViews } from '@/modules/extensions'
import type { ViewRendererRegistry } from '@/workbench/browser/ViewRendererRegistry'
import type { ViewLocation } from '@/workbench/common/workbench'
import type { WorkbenchController } from '@/workbench/services/WorkbenchController'
import type { WorkbenchPersistence } from '@/workbench/services/WorkbenchPersistence'
import { extensionCommandNamespace } from '@buddy-shared/extensions/extensionCommands'
import { spaceFileTargetSchema } from '@buddy-shared/spaces/spaceFileApi'
import { qualifyWorkbenchCommand } from '@buddy-shared/workbench/workbenchCommand'
import { matchesWorkbenchContext } from '@buddy-shared/workbench/workbenchContext'
import { parseWorkbenchUiSelection, workbenchUiSelectionKey, workbenchUiTargetCatalog } from '@buddy-shared/workbench/workbenchUi'
import { nextTick, onScopeDispose, watch } from 'vue'
import { DesktopExtensionView } from '@/modules/extensions/ui'

export function useExtensionContributions(options: { controller: WorkbenchController, renderers: ViewRendererRegistry, persistence: WorkbenchPersistence, installed: Readonly<Ref<ExtensionStatus[]>>, api: ExtensionApi, views: ExtensionViews, ui: ExtensionUiContributions, ready: () => boolean, selectionReferences?: WorkbenchSelectionReferences, onQuoteResult?: (result: SelectionReferenceResult, targetLabel: string) => void }) {
  const { controller, renderers, persistence, installed, api, views, ui } = options
  onScopeDispose(renderers.register('extensions.view', DesktopExtensionView))
  const owners = new Map<string, { revision: string, dispose: () => void }>()
  watch(installed, (items) => {
    const enabled = items.filter(item => item.enabled && item.compatible && !['failed', 'blocked'].includes(item.state))
    for (const [id, owner] of owners) {
      if (!enabled.some(item => item.manifest.id === id && item.revision === owner.revision)) {
        owner.dispose()
        owners.delete(id)
      }
    }
    for (const item of enabled) {
      const { id } = item.manifest
      if (owners.has(id))
        continue
      const dispose = controller.registry.register(`extension:${id}`, (scope) => {
        for (const view of item.manifest.contributes.views.filter(view => view.location === 'context')) {
          const locations: [ViewLocation, ...ViewLocation[]] = ['context', ...new Set(item.manifest.contributes.placements.flatMap(placement => placement.kind === 'view' && placement.view === view.id ? ['mount' as const] : []))]
          scope.view({ id: view.id, label: view.title, renderer: 'extensions.view', multiple: true, locations, when: view.when, supports: resource => resource.scheme === 'extension' && resource.data.extensionId === id && resource.data.viewType === view.id })
        }
        for (const placement of item.manifest.contributes.placements) {
          if (placement.kind === 'view')
            scope.placement({ id: placement.id, viewType: placement.view, location: 'mount', target: placement.target, presentation: placement.presentation, interaction: placement.interaction, when: placement.when })
        }
        for (const command of item.manifest.contributes.commands.filter(command => !command.hidden)) {
          scope.command({ id: command.id, label: command.title, slash: command.slash ? { ...command.slash, name: qualifyWorkbenchCommand(extensionCommandNamespace(id), command.slash.name), origin: { id, name: item.manifest.name, author: item.manifest.author, version: item.manifest.version, source: item.source?.artifact } } : undefined, enabled: () => matchesWorkbenchContext(command.when, controller.contextKeys.snapshot()), execute: async ({ view, pane, source, arguments: argumentsText }) => {
            if (source === 'slash')
              return api.executeSlash(id, command.id, argumentsText ?? '', pane?.id)
            const parsed = view && ['file', 'file-preview'].includes(view.resource.scheme) ? spaceFileTargetSchema.safeParse(view.resource.data) : null
            await api.execute(id, command.id, parsed?.success ? parsed.data : null)
          } })
        }
      })
      owners.set(id, { revision: item.revision, dispose })
    }
    reconcilePlacements()
  }, { immediate: true, flush: 'sync' })
  function reconcilePlacements() {
    if (!options.ready())
      return
    for (const view of Object.values(controller.layout.views)) {
      if (view.resource.scheme !== 'extension' || typeof view.resource.data.placementId !== 'string')
        continue
      const plugin = installed.value.find(item => item.manifest.id === view.resource.data.extensionId && item.enabled && item.compatible)
      const placement = plugin?.manifest.contributes.placements.find(placement => placement.id === view.resource.data.placementId && placement.kind === 'view')
      const descriptor = plugin?.manifest.contributes.views.find(descriptor => descriptor.id === placement?.view)
      if (!descriptor || placement?.kind !== 'view')
        continue
      const mountInstanceId = placement.target === 'workbench.pane' ? view.mountInstanceId ?? controller.layout.activePane : undefined
      if (view.type !== descriptor.id || view.location !== 'mount' || view.placement !== placement.id || view.title !== descriptor.title || view.mountInstanceId !== mountInstanceId) {
        controller.rebindAuxiliary(view.id, { type: descriptor.id, placement: placement.id, title: descriptor.title, location: 'mount', mountInstanceId, resource: { ...view.resource, data: { ...view.resource.data, viewType: descriptor.id } } })
      }
    }
  }
  type RequestEvent = Exclude<ExtensionWorkbenchEvent, { kind: 'cancel' }>
  const requests = new Map<string, { event: RequestEvent, abort: AbortController, started: boolean }>()
  const quoteCaptures = new Map<string, { request: SelectionReferenceRequest, generation: string, token: string, expires: number }>()
  function drain() {
    if (!options.ready())
      return
    for (const request of requests.values()) {
      const { event, abort } = request
      if (event.kind === 'open' || event.kind === 'placement' || (event.kind === 'interaction' && event.title !== null) || event.kind === 'message') {
        const plugin = installed.value.find(item => item.manifest.id === event.extensionId)
        const current = plugin?.enabled && plugin.compatible && plugin.generation === event.generation
        if (!current) {
          if (request.started)
            abort.abort()
          continue
        }
      }
      if (!request.started) {
        request.started = true
        void handle(event, abort.signal)
      }
    }
  }
  onScopeDispose(api.onWorkbench((event) => {
    if (event.kind === 'cancel') {
      requests.get(event.requestId)?.abort.abort()
      requests.delete(event.requestId)
      return
    }
    if (requests.size >= 64) {
      api.replyWorkbench(event.requestId, null)
      return
    }
    requests.set(event.requestId, { event, abort: new AbortController(), started: false })
    drain()
  }))
  watch([options.ready, installed], () => {
    reconcilePlacements()
    drain()
  }, { flush: 'sync' })
  async function handle(event: RequestEvent, signal: AbortSignal) {
    let viewId: string | null = null
    let replyData: JsonValue | undefined
    let quoteTargetLabel: string | undefined
    try {
      if (signal.aborted)
        return
      if (event.kind === 'clear-data') {
        const ids = Object.values(controller.layout.views).filter(view => view.resource.scheme === 'extension' && view.resource.data.extensionId === event.extensionId).map(view => view.id)
        if (!(await controller.closeMany(ids, signal)).committed || signal.aborted)
          return
        const configuration = { ...controller.configuration.snapshot() }
        for (const target of workbenchUiTargetCatalog) {
          const key = workbenchUiSelectionKey(target)
          const previous = parseWorkbenchUiSelection(configuration[key], target.selection === 'multiple')
          if (!previous?.some(id => id.startsWith(`${event.extensionId}.`)))
            continue
          const remaining = previous.filter(id => !id.startsWith(`${event.extensionId}.`))
          if (remaining.length)
            configuration[key] = target.selection === 'multiple' ? JSON.stringify(remaining) : remaining[0]!
          else delete configuration[key]
        }
        controller.configuration.restore(configuration)
        await persistence.checkpoint()
        viewId = event.requestId
      }
      else if (event.kind === 'interaction') {
        if (event.title === null) {
          controller.removeInteraction(event.interactionId)
        }
        else {
          controller.interactions.add({ id: event.interactionId, title: event.title }, () => {
            controller.removeInteraction(event.interactionId)
            void api.endInteraction(event.interactionId).catch(() => {})
          })
        }
        viewId = event.interactionId
      }
      else if (event.kind === 'message') {
        views.broadcast(event.extensionId, event.generation, event.message)
      }
      else if (event.kind === 'regions') {
        if (views.setRegions(event.viewId, event.generation, event.token, event.regions))
          viewId = event.viewId
      }
      else if (event.kind === 'control') {
        if (views.proposeControl(event.viewId, event.generation, event.token, event.proposal))
          viewId = event.viewId
      }
      else if (event.kind === 'activity') {
        if (views.setActive(event.viewId, event.generation, event.token, event.active)) {
          await nextTick()
          viewId = event.viewId
        }
      }
      else if (event.kind === 'placement') {
        const plugin = installed.value.find(item => item.manifest.id === event.extensionId && item.enabled && item.compatible)
        const placement = plugin?.manifest.contributes.placements.find(placement => placement.id === event.placementId)
        const descriptor = plugin?.manifest.contributes.views.find(view => view.id === placement?.view)
        if ((placement?.kind === 'slot' || placement?.kind === 'control') && !event.instanceId && !event.interactionId) {
          const result = ui.setEnabled(event.extensionId, event.generation, placement.id, event.visible)
          if (result) {
            if (result.changed && event.visible && placement.kind === 'control')
              views.retryControl(placement.id)
            await nextTick()
            viewId = event.requestId
          }
          return
        }
        if (placement?.kind !== 'view' || !descriptor)
          return
        const instanceId = placement.target === 'workbench.pane' ? event.instanceId ?? controller.layout.activePane : undefined
        if (instanceId && !controller.pane(instanceId))
          return
        const existing = Object.values(controller.layout.views).find(view => view.resource.scheme === 'extension' && view.resource.data.extensionId === event.extensionId && view.resource.data.placementId === placement.id && view.mountInstanceId === instanceId && view.interactionId === event.interactionId)
        if (event.visible) {
          viewId = await controller.open({ scheme: 'extension', id: placement.id, data: { extensionId: event.extensionId, viewType: placement.view, resource: null, placementId: placement.id } }, descriptor.title, { signal, placement: placement.id, mountInstanceId: instanceId, interactionId: event.interactionId, viewType: placement.view, location: 'mount', focus: false, state: { version: descriptor.stateVersion, value: {} } })
        }
        else if (existing && (await controller.close(existing.id, signal)).committed) {
          viewId = existing.id
        }
        await persistence.flush()
      }
      else if (event.kind === 'open') {
        const descriptor = installed.value.find(item => item.manifest.id === event.extensionId)?.manifest.contributes.views.find(view => view.id === event.viewType)
        if (!descriptor)
          return
        const existing = event.fileTarget && Object.values(controller.layout.views).find(view => view.type === event.viewType && view.resource.scheme === 'extension' && JSON.stringify(view.resource.data.fileTarget) === JSON.stringify(event.fileTarget))
        if (existing) {
          controller.focus(existing.id)
          viewId = existing.id
        }
        else {
          viewId = await controller.open({ scheme: 'extension', id: `${event.extensionId}:${event.viewType}:${event.resource?.id ?? crypto.randomUUID()}`, data: { extensionId: event.extensionId, viewType: event.viewType, resource: event.resource, ...(event.fileTarget ? { fileTarget: { ...event.fileTarget } } : {}) } }, event.resource?.name ?? descriptor.title, { signal, viewType: event.viewType, duplicate: true, state: { version: event.stateVersion, value: event.state } })
        }
        if (viewId)
          await persistence.flush()
      }
      else {
        const view = controller.layout.views[event.viewId]
        const session = views.surfaces.get(event.viewId)?.session
        if (!view || view.resource.scheme !== 'extension' || session?.generation !== event.generation || session.token !== event.token)
          return
        if (event.kind === 'quote-capture' || event.kind === 'quote-add') {
          const surface = views.surfaces.get(event.viewId)
          const references = options.selectionReferences
          if (!surface?.visible || !surface.ready || !references)
            return
          if (event.kind === 'quote-add')
            quoteTargetLabel = ''
          for (const [captureId, capture] of quoteCaptures) {
            if (capture.expires < Date.now())
              quoteCaptures.delete(captureId)
          }
          if (event.kind === 'quote-capture') {
            const file = spaceFileTargetSchema.parse(view.resource.data.fileTarget)
            const quotedFile = event.quote.source.file
            if (file.spaceId !== quotedFile.spaceId || file.directoryId !== quotedFile.directoryId || file.revision !== quotedFile.revision || file.path !== quotedFile.path)
              return
            const request = references.capture(view.id, event.quote)
            if (!request)
              return
            if (quoteCaptures.size >= 64)
              quoteCaptures.delete(quoteCaptures.keys().next().value!)
            quoteCaptures.set(event.captureId, { request, generation: event.generation, token: event.token, expires: Date.now() + 120000 })
            replyData = { id: event.captureId, defaultId: request.defaultId, targets: request.targets.map(({ id, label }) => ({ id, label })) }
          }
          else {
            const capture = quoteCaptures.get(event.captureId)
            if (!capture || capture.request.viewId !== view.id || capture.generation !== event.generation || capture.token !== event.token)
              return
            quoteCaptures.delete(event.captureId)
            quoteTargetLabel = capture.request.targets.find(target => target.id === event.targetId)?.label ?? ''
            replyData = references.add(capture.request, event.targetId)
          }
          viewId = view.id
          return
        }
        if (event.kind === 'presentation') {
          const placement = view.placement ? controller.registry.placements.get(view.placement) : null
          if (!placement || placement.viewType !== view.type)
            return
          if (event.presentation.target === 'workbench.pane' && !view.mountInstanceId)
            return
          controller.updateView(view.id, { presentation: { ...view.presentation, ...event.presentation } })
        }
        else {
          controller.updateView(view.id, { state: { ...view.state, version: event.stateVersion, value: event.state } })
        }
        await persistence.flush()
        viewId = view.id
      }
    }
    catch {
      viewId = null
    }
    finally {
      requests.delete(event.requestId)
      if (!signal.aborted) {
        api.replyWorkbench(event.requestId, viewId, replyData)
        if (quoteTargetLabel !== undefined)
          options.onQuoteResult?.(replyData === 'added' || replyData === 'duplicate' || replyData === 'limit' ? replyData : 'unavailable', quoteTargetLabel)
      }
    }
  }
  onScopeDispose(() => {
    for (const { event, abort } of requests.values()) {
      abort.abort()
      api.replyWorkbench(event.requestId, null)
    }
    requests.clear()
    quoteCaptures.clear()
    for (const owner of owners.values()) owner.dispose()
    owners.clear()
  })
}
