import type { LocalBuddy } from '@buddy-shared/buddies/buddyApi'
import type { LocalConnector } from '@buddy-shared/connectors/connectorApi'
import type { WorkbenchContextSnapshot } from '@buddy-shared/workbench/workbenchContext'
import type { Ref } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import type { useExtensionState } from './state/useExtensionState'
import type { useExtensionUiContributions } from './state/useExtensionUiContributions'
import type { useExtensionViews } from './widgets/useExtensionViews'
import type { WorkbenchAnchors } from '@/shared/ui/contributions/workbenchUiContext'
import { createInjectionState } from '@vueuse/core'

export interface ExtensionContext {
  workbench: Readonly<Ref<WorkbenchContextSnapshot>>
  anchors: WorkbenchAnchors
  ui: ReturnType<typeof useExtensionUiContributions>
  state: ReturnType<typeof useExtensionState>
  views: ReturnType<typeof useExtensionViews>
  language: Readonly<Ref<string>>
  isDark: Readonly<Ref<boolean>>
  themeColors: Readonly<Ref<Record<string, string>>>
  themeRevision?: Readonly<Ref<number>>
  endInteraction: (id: string) => void
  focusView: (id: string) => void
  authoring: { author: Readonly<Ref<string>>, save: (author: string) => Promise<boolean> }
  startCreation: (prompt: string) => Promise<void>
  startSkillCreation: (prompt: string) => Promise<void>
  settingsLocation: (extensionId: string) => RouteLocationRaw | null
  /** Where the connectors and sub-agents that market packages added stand now, so cards can say what still needs setting up. */
  capabilityStatus?: {
    connectors: Readonly<Ref<readonly LocalConnector[]>>
    buddies: Readonly<Ref<readonly LocalBuddy[]>>
    defaultBuddyId: Readonly<Ref<string | null>>
    loadConnectors: () => unknown
  }
}
const [useProvideExtensionContext, injectExtensionContext] = createInjectionState((context: ExtensionContext) => context)
export { useProvideExtensionContext }
export function useExtensionContext(): ExtensionContext {
  const context = injectExtensionContext()
  if (!context)
    throw new Error('Extension context is unavailable')
  return context
}
