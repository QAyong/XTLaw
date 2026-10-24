<script setup lang="ts">
import type { ContextPanePlacementState } from './contextPanePlacement'
import type { DesktopShellBindings } from './desktopShellBindings'
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopStartupScreen from '@/app/bootstrap/DesktopStartupScreen.vue'
import DesktopTitleBar from '@/app/shell/window/DesktopTitleBar.vue'
import { DesktopFeatureDiscovery, DesktopOnboardingScreen } from '@/modules/onboarding/ui'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import { useDesktopUi } from '@/shared/ui/desktopUiContext'
import WorkbenchMountPoint from '@/workbench/browser/mounts/WorkbenchMountPoint.vue'
import WorkbenchHost from '@/workbench/browser/WorkbenchHost.vue'
import DesktopWorkbenchArea from '../workbench/DesktopWorkbenchArea.vue'
import DesktopWorkbenchView from '../workbench/DesktopWorkbenchView.vue'
import { readContextPanePlacements, resolveContextPanePlacementOnChange, serializeContextPanePlacements } from './contextPanePlacement'
import { useContextPanePresentation } from './useContextPanePresentation'

const { bindings } = defineProps<{ bindings: DesktopShellBindings }>()
const route = useRoute()
const router = useRouter()
const { sidebarCollapsed, language } = useDesktopUi()
const hasBeenReady = computed(() => bindings.lifecycle.state.value.hasBeenReady)
const startupVisible = computed(() => !hasBeenReady.value && route.meta.requiresRuntime !== false)
const onboardingPending = bindings.onboarding.pending
const onboardingVisible = computed(() => onboardingPending.value && hasBeenReady.value)
const blocked = computed(() => startupVisible.value || onboardingVisible.value)
const activeView = computed(() => bindings.pages.current.value)
const activeTaskScope = computed(() => {
  const conversationId = bindings.workbench.activeTask.value?.workspace.session.activeConversationId.value
  if (conversationId)
    return `task:${conversationId}`
  const resource = bindings.workbench.activeResource.value
  return resource && (resource.scheme === 'task' || resource.scheme === 'draft')
    ? `${resource.scheme}:${resource.id}`
    : null
})
const placementAuxiliaryKey = 'contextPlacement'
const contextOnLeft = shallowRef(false)
const chatPaneHidden = shallowRef(false)
const presentation = useContextPanePresentation({
  chatPaneHidden,
  tasksVisible: computed(() => activeView.value === 'lexora.tasks'),
  scope: activeTaskScope,
})
const taskPaneStates = new Map<string, ContextPanePlacementState>()
const rightRegionIsChat = computed(() => contextOnLeft.value && bindings.resources.isOpen.value)
const rightRegionOpen = computed(() => rightRegionIsChat.value ? presentation.workspaceVisible.value : bindings.resources.isOpen.value)

function rememberTaskPaneState(scope: string, state: ContextPanePlacementState) {
  taskPaneStates.set(scope, state)
  if (bindings.workbench.initialized)
    bindings.workbench.controller.setAuxiliary(placementAuxiliaryKey, serializeContextPanePlacements(taskPaneStates))
}

// The workbench restores the active task before it is initialized, so the saved placements are applied once it is ready.
watch(() => bindings.workbench.initialized, (ready) => {
  if (!ready)
    return
  for (const [scope, state] of readContextPanePlacements(bindings.workbench.controller.layout.auxiliary[placementAuxiliaryKey]))
    taskPaneStates.set(scope, state)
  const scope = activeTaskScope.value
  const saved = scope && bindings.contextPanelMode.value === 'task' ? taskPaneStates.get(scope) : null
  if (saved)
    contextOnLeft.value = saved.contextOnLeft
}, { immediate: true, flush: 'sync' })

watch(contextOnLeft, (onLeft) => {
  const scope = activeTaskScope.value
  if (scope && bindings.contextPanelMode.value === 'task')
    rememberTaskPaneState(scope, { chatPaneHidden: taskPaneStates.get(scope)?.chatPaneHidden ?? false, contextOnLeft: onLeft })
}, { flush: 'sync' })

watch(bindings.resources.isOpen, (resourcePanelOpen) => {
  if (resourcePanelOpen)
    return
  chatPaneHidden.value = false
  const scope = activeTaskScope.value
  if (scope && bindings.contextPanelMode.value === 'task') {
    rememberTaskPaneState(scope, { contextOnLeft: contextOnLeft.value, chatPaneHidden: false })
  }
}, { flush: 'sync' })

watch(
  [bindings.contextPanelMode, activeTaskScope],
  ([mode, taskScope], [previousMode, previousTaskScope]) => {
    const taskChanged = Boolean(taskScope && taskScope !== previousTaskScope)
    if (previousMode === 'task' && previousTaskScope && (taskScope !== previousTaskScope || mode !== previousMode)) {
      rememberTaskPaneState(previousTaskScope, {
        contextOnLeft: contextOnLeft.value,
        chatPaneHidden: chatPaneHidden.value,
      })
    }
    if (!taskScope)
      return

    const next = resolveContextPanePlacementOnChange({
      mode,
      previousMode,
      taskChanged,
      current: {
        contextOnLeft: contextOnLeft.value,
        chatPaneHidden: chatPaneHidden.value,
      },
      savedTaskState: mode === 'task' ? taskPaneStates.get(taskScope) : null,
    })
    contextOnLeft.value = next.contextOnLeft
    chatPaneHidden.value = next.chatPaneHidden
  },
  { flush: 'sync' },
)

function toggleCurrentRightRegion() {
  if (rightRegionIsChat.value) {
    chatPaneHidden.value = !chatPaneHidden.value
    return
  }
  bindings.resources.toggle()
}

function toggleContextMaximize() {
  if (bindings.resources.isOpen.value)
    chatPaneHidden.value = !chatPaneHidden.value
}

function toggleContextPosition() {
  contextOnLeft.value = !contextOnLeft.value
  chatPaneHidden.value = false
}
</script>

<template>
  <div class="desktop-shell">
    <DesktopTitleBar
      :app-info="bindings.appInfo.value"
      :minimal="onboardingVisible"
      :shortcut-bindings="bindings.shortcuts.bindings.value"
      :language="language"
      :context-available="hasBeenReady && !onboardingPending && (bindings.contextPanelGlobal.value || activeView === 'lexora.tasks')"
      :context-open="rightRegionOpen"
      :context-swap-available="activeView === 'lexora.tasks' && bindings.resources.isOpen.value"
      :context-swapped="contextOnLeft"
      :context-is-chat="rightRegionIsChat"
      :sidebar-collapsed="sidebarCollapsed"
      @toggle-context="toggleCurrentRightRegion"
      @toggle-context-position="toggleContextPosition"
      @toggle-sidebar="bindings.toggleSidebar"
    />
    <div class="desktop-shell__body">
      <WorkbenchHost :keybindings="bindings.shortcuts.bindings.value" :platform="bindings.shortcuts.platform.value" :active="hasBeenReady && !onboardingPending && activeView === 'lexora.tasks'" :main-visible="presentation.workspaceVisible.value" :controller="bindings.workbench.controller" :copies="bindings.workbench.copies" :auto-save="bindings.workbench.autoSave" :language="language" :backup-error="bindings.workbench.backupError.value" @drop-resource="bindings.workbench.dropResource" @retry-backup="bindings.workbench.persistence.flush()" @task-drag-start="presentation.beginDrag" @task-drag-end="presentation.endDrag">
        <div class="desktop-shell__content" :class="{ 'is-starting': blocked }" :inert="blocked" :aria-hidden="blocked">
          <WorkbenchMountPoint target="workbench" class="desktop-shell__workbench">
            <DesktopWorkbenchArea :bindings="bindings" :tasks-visible="activeView === 'lexora.tasks'" :context-on-left="contextOnLeft" :chat-pane-hidden="presentation.contextMaximized.value" @toggle-context-maximize="toggleContextMaximize" />
          </WorkbenchMountPoint>
        </div>
        <template #view="{ view, visible }">
          <DesktopWorkbenchView :view="view" :visible="visible" />
        </template>
      </WorkbenchHost>
      <DesktopOnboardingScreen v-if="onboardingVisible && !startupVisible" :controller="bindings.onboarding" :app-info="bindings.appInfo.value" />
      <Transition name="desktop-startup-reveal">
        <DesktopStartupScreen v-if="startupVisible" :failed="bindings.lifecycle.failed.value" :language="language" @retry="bindings.lifecycle.retry()" @open-logs="router.push(desktopRouteLocations.settings('logs'))" @open-storage="router.push(desktopRouteLocations.settings('storage'))" />
      </Transition>
    </div>
    <DesktopFeatureDiscovery v-if="!blocked" :controller="bindings.featureDiscovery" :language="language" :can-remind="hasBeenReady && bindings.taskIndex.tasks.value.every(task => task.activity === 'idle')" />
  </div>
</template>

<style scoped>
.desktop-shell {
  display: flex;
  width: 100dvw;
  height: 100dvh;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  background: var(--buddy-surface-canvas);
}

.desktop-shell__body,
.desktop-shell__content,
.desktop-shell__workbench {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
}

.desktop-shell__body { position: relative; }
.desktop-shell__content { transition: opacity 220ms ease; }
.desktop-shell__content.is-starting { opacity: 0; }
.desktop-startup-reveal-leave-active { transition: opacity 220ms ease; }
.desktop-startup-reveal-leave-to { opacity: 0; }

.desktop-shell__workbench {
  background: var(--buddy-surface-canvas);
}

@media (prefers-reduced-motion: reduce) {
  .desktop-shell__content,
  .desktop-startup-reveal-leave-active {
    transition: none;
  }
}
</style>
