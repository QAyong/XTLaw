import type { DesktopSelectionEditCommand } from '@buddy-electron/shared/desktopApi'
import type { DesktopBrowserApi } from '@buddy-shared/browser/browserDesktopApi'
import type { SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { Ref } from 'vue'
import type { TaskWorkspacePool } from './TaskWorkspacePool'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { TaskResourcePanel } from '@/modules/tasks/contracts'
import type { SelectionReferenceTarget } from '@/shared/ui/selection/workbenchSelectionReferences'
import type { WorkbenchController } from '@/workbench/services/WorkbenchController'
import { buddyUserContentToText } from '@buddy-shared/conversation/buddyUserContent'
import { translateBuddy } from '@/i18n/buddyI18n'
import { chatComposerDocumentToUserContent, userContentToChatComposerDocument } from '@/modules/prompt-input'
import { WorkbenchSelectionReferences } from '@/shared/ui/selection/workbenchSelectionReferences'
import { panes } from '@/workbench/common/workbench'

export function createDesktopSelectionReferences(options: {
  controller: WorkbenchController
  pool: TaskWorkspacePool
  language: Readonly<Ref<BuddyLocale>>
  openFile: (target: SpaceFileTarget) => Promise<string | null | undefined>
  resources: () => TaskResourcePanel
  independent: () => boolean
  ready: () => boolean
  locateFile: (target: SpaceFileTarget) => Promise<unknown>
  browser?: DesktopBrowserApi
  editSelection?: (command: DesktopSelectionEditCommand) => Promise<void>
}) {
  return new WorkbenchSelectionReferences({
    editSelection: options.editSelection,
    isSplit: () => panes(options.controller.layout.root).length > 1,
    targets() {
      if (!options.ready())
        return []
      return panes(options.controller.layout.root).flatMap((pane, index): SelectionReferenceTarget[] => {
        const view = pane.view ? options.controller.layout.views[pane.view] : null
        const task = view && options.pool.peek(view.resource)
        if (!view || !task || task.workspace.restoration.state.value !== 'ready' || task.workspace.status.isClosing.value
          || task.workspace.execution.isSending.value || task.workspace.execution.isMutatingBranch.value) {
          return []
        }
        const workspace = task.workspace
        const title = workspace.session.currentTitle.value || view.title
        return [{
          id: view.id,
          identity: JSON.stringify([workspace.composer.draftId.value, workspace.composer.editorKey.value, workspace.composer.target.value, task.session.navigationVersion()]),
          scope: workspace.session.activeConversationId.value ? `task:${workspace.session.activeConversationId.value}` : `draft:${workspace.composer.draftId.value}`,
          label: translateBuddy(options.language.value, 'desktop.chat.quoteTargetPane', { index: index + 1, title }),
          read: () => chatComposerDocumentToUserContent(workspace.composer.composerContent.value),
          write: content => workspace.composer.updateComposerContent(buddyUserContentToText(content), userContentToChatComposerDocument(content)),
        }]
      })
    },
    source(viewId) {
      if (!options.ready())
        return null
      if (viewId.startsWith('browser:')) {
        const tabId = viewId.slice('browser:'.length)
        const resources = options.resources()
        const tab = resources.allTabs.value.find(tab => tab.id === tabId && tab.kind === 'browser')
        const state = resources.browserStates.value[tabId]
        if (!tab || resources.activeTab.value?.id !== tabId || !state || state.status !== 'ready')
          return null
        return { identity: JSON.stringify([tab.id, tab.scope, state.sessionId, state.pageId, state.documentVersion, state.url, options.independent()]), owner: !options.independent() && /^(?:task|draft):/.test(tab.scope) ? tab.scope : null }
      }
      const view = options.controller.layout.views[viewId]
      if (!view || !['file', 'file-preview'].includes(view.resource.scheme))
        return null
      const tabId = typeof view.state.contextTabId === 'string' ? view.state.contextTabId : view.id
      const tab = options.resources().allTabs.value.find(tab => tab.id === tabId)
      if (view.location === 'context' && !tab)
        return null
      const owner = !options.independent() && tab && /^(?:task|draft):/.test(tab.scope) ? tab.scope : null
      return { identity: JSON.stringify([view.id, view.resource, view.state.mode, view.state.preview, options.independent(), tab?.scope]), owner }
    },
    async locate(quote) {
      try {
        if ('element' in quote) {
          const resources = options.resources()
          const tab = resources.tabs.value.find(tab => tab.kind === 'browser' && resources.browserStates.value[tab.id]?.sessionId === quote.source.sessionId)
          if (!tab || !await options.browser?.locateElement({ source: quote.source, element: quote.element, text: quote.text }))
            return false
          resources.selectTab(tab.id)
          return true
        }
        await options.locateFile(quote.source.file)
        const id = await options.openFile(quote.source.file)
        if (!id)
          return false
        const view = options.controller.layout.views[id]
        if (!view)
          return false
        options.controller.updateView(id, { state: {
          ...view.state,
          mode: quote.source.format === 'markdown' ? 'preview' : 'source',
          quoteSelection: quote.range ? { ...quote.range, text: quote.text, id: quote.id } : null,
        } })
        return true
      }
      catch { return false }
    },
  })
}
