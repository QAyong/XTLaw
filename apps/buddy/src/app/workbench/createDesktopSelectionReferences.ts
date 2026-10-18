import type { DesktopBrowserApi } from '@buddy-shared/browser/browserDesktopApi'
import type { SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { Ref } from 'vue'
import type { TaskWorkspacePool } from './TaskWorkspacePool'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { TaskResourcePanel } from '@/modules/tasks/contracts'
import type { SelectionReferenceTarget } from '@/shared/ui/selection/workbenchSelectionReferences'
import type { WorkbenchController } from '@/workbench/services/WorkbenchController'
import { isTextArtifactMimeType } from '@buddy-shared/artifacts/artifactApi'
import { buddyUserContentToText } from '@buddy-shared/conversation/buddyUserContent'
import { spaceFileTargetSchema } from '@buddy-shared/spaces/spaceFileApi'
import { translateBuddy } from '@/i18n/buddyI18n'
import { chatComposerDocumentToUserContent, userContentToChatComposerDocument } from '@/modules/prompt-input'
import { isMarkdownFile } from '@/shared/ui/files/fileDocumentPresentation'
import { WorkbenchSelectionReferences } from '@/shared/ui/selection/workbenchSelectionReferences'
import { panes } from '@/workbench/common/workbench'
import { isQuotableExtensionDocument } from './extensionDocuments'

export function createDesktopSelectionReferences(options: {
  controller: WorkbenchController
  pool: TaskWorkspacePool
  language: Readonly<Ref<BuddyLocale>>
  openFile: (target: SpaceFileTarget, current: () => boolean) => Promise<string | null | undefined>
  resources: () => TaskResourcePanel
  independent: () => boolean
  ready: () => boolean
  locateFile: (target: SpaceFileTarget) => Promise<unknown>
  browser?: DesktopBrowserApi
  navigationVersion: () => number
}) {
  let operation = 0
  const references: WorkbenchSelectionReferences = new WorkbenchSelectionReferences({
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
      if (viewId.startsWith('artifact:')) {
        const resources = options.resources()
        const tab = resources.allTabs.value.find(tab => tab.id === viewId && tab.kind === 'artifact')
        if (!tab || tab.kind !== 'artifact' || resources.activeTab.value?.id !== tab.id
          || tab.artifact.kind !== 'file' || (!isTextArtifactMimeType(tab.artifact.mimeType) && !isMarkdownFile(tab.artifact.name))) {
          return null
        }
        return { identity: JSON.stringify([tab.id, tab.scope, tab.artifact, tab.viewMode, options.independent()]), owner: !options.independent() && /^(?:task|draft):/.test(tab.scope) ? tab.scope : null }
      }
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
      if (!view || !['file', 'file-preview', 'extension'].includes(view.resource.scheme))
        return null
      if (view.resource.scheme === 'extension' && (!spaceFileTargetSchema.safeParse(view.resource.data.fileTarget).success || !isQuotableExtensionDocument(String((view.resource.data.fileTarget as { path?: string })?.path))))
        return null
      const tabId = typeof view.state.contextTabId === 'string' ? view.state.contextTabId : view.id
      const tab = options.resources().allTabs.value.find(tab => tab.id === tabId)
      if (view.location === 'context' && !tab)
        return null
      const owner = !options.independent() && tab && /^(?:task|draft):/.test(tab.scope) ? tab.scope : null
      return { identity: JSON.stringify([view.id, view.resource, view.state.mode, view.state.preview, options.independent(), tab?.scope]), owner }
    },
    async locate(quote): Promise<boolean> {
      const request = ++operation
      const version = options.navigationVersion()
      const resources = options.resources()
      const scope = resources.selectionScope.value
      let activeTabId = resources.activeTab.value?.id
      const current = () => request === operation && options.ready() && options.navigationVersion() === version
        && options.resources() === resources && resources.selectionScope.value === scope && resources.activeTab.value?.id === activeTabId
      try {
        if ('element' in quote) {
          const tab = resources.tabs.value.find(tab => tab.kind === 'browser' && resources.browserStates.value[tab.id]?.sessionId === quote.source.sessionId)
          if (!tab || !await options.browser?.locateElement({ source: quote.source, element: quote.element, text: quote.text }) || !current())
            return false
          resources.selectTab(tab.id)
          if (!resources.isOpen.value)
            resources.toggle()
          return true
        }
        if (quote.source.kind === 'artifact') {
          const source = quote.source
          const artifact = resources.findArtifact(source.artifactId)
          if (!artifact || artifact.conversationId !== source.conversationId || artifact.runId !== source.runId || artifact.path !== source.path)
            return false
          await resources.openArtifact(artifact)
          activeTabId = resources.activeTab.value?.id
          const tab = resources.activeTab.value
          if (!current() || tab?.kind !== 'artifact' || tab.artifact.artifactId !== source.artifactId)
            return false
          resources.setArtifactViewMode(tab.id, source.format === 'markdown' ? 'preview' : 'source')
          return await references.reveal(tab.id, quote, current)
        }
        await options.locateFile(quote.source.file)
        if (!current())
          return false
        const id = await options.openFile(quote.source.file, current)
        activeTabId = resources.activeTab.value?.id
        if (!id || !current())
          return false
        const view = options.controller.layout.views[id]
        if (!view)
          return false
        if (quote.source.format === 'docx' || quote.source.format === 'pptx' || quote.source.format === 'xlsx')
          return view.resource.scheme === 'extension'
        options.controller.updateView(id, { state: { ...view.state, mode: quote.source.format === 'markdown' ? 'preview' : 'source' } })
        return await references.reveal(id, quote, () => current() && !!options.controller.layout.views[id])
      }
      catch { return false }
    },
  })
  return references
}
