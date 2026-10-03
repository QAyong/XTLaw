<script setup lang="ts">
import type { DesktopShellBindings } from './desktopShellBindings'
import { computed, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import DesktopStartupScreen from '@/app/bootstrap/DesktopStartupScreen.vue'
import DesktopTitleBar from '@/app/shell/window/DesktopTitleBar.vue'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import { useDesktopUi } from '@/shared/ui/desktopUiContext'
import WorkbenchMountPoint from '@/workbench/browser/mounts/WorkbenchMountPoint.vue'
import WorkbenchHost from '@/workbench/browser/WorkbenchHost.vue'
import DesktopWorkbenchArea from '../workbench/DesktopWorkbenchArea.vue'
import DesktopWorkbenchView from '../workbench/DesktopWorkbenchView.vue'
import { resolveContextPanePlacementOnChange } from './contextPanePlacement'

const { bindings } = defineProps<{ bindings: DesktopShellBindings }>()
const route = useRoute()
const router = useRouter()
const { sidebarCollapsed, language } = useDesktopUi()
const startupVisible = computed(() => !bindings.lifecycle.state.value.hasBeenReady && route.meta.settingsCategory !== 'logs')
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
const contextOnLeft = shallowRef(false)
const chatPaneHidden = shallowRef(false)
const taskPaneStates = new Map<string, { contextOnLeft: boolean, chatPaneHidden: boolean }>()
const rightRegionIsChat = computed(() => contextOnLeft.value && bindings.resources.isOpen.value)
const rightRegionOpen = computed(() => rightRegionIsChat.value ? !chatPaneHidden.value : bindings.resources.isOpen.value)

watch(bindings.resources.isOpen, (resourcePanelOpen) => {
  if (resourcePanelOpen)
    return
  chatPaneHidden.value = false
  const scope = activeTaskScope.value
  if (scope && bindings.contextPanelMode.value === 'task') {
    taskPaneStates.set(scope, { contextOnLeft: contextOnLeft.value, chatPaneHidden: false })
  }
}, { flush: 'sync' })

watch(
  [bindings.contextPanelMode, activeTaskScope],
  ([mode, taskScope], [previousMode, previousTaskScope]) => {
    const taskChanged = Boolean(taskScope && taskScope !== previousTaskScope)
    if (previousMode === 'task' && previousTaskScope && (taskScope !== previousTaskScope || mode !== previousMode)) {
      taskPaneStates.set(previousTaskScope, {
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
      :shortcut-bindings="bindings.shortcuts.bindings.value"
      :language="language"
      :context-available="bindings.contextPanelGlobal.value || activeView === 'lexora.tasks'"
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
      <WorkbenchHost :keybindings="bindings.shortcuts.bindings.value" :platform="bindings.shortcuts.platform.value" :active="activeView === 'lexora.tasks'" :controller="bindings.workbench.controller" :copies="bindings.workbench.copies" :language="language" :backup-error="bindings.workbench.backupError.value" @drop-resource="bindings.workbench.dropResource" @retry-backup="bindings.workbench.persistence.flush()">
        <div class="desktop-shell__content" :class="{ 'is-starting': startupVisible }" :inert="startupVisible" :aria-hidden="startupVisible">
          <WorkbenchMountPoint target="workbench" class="desktop-shell__workbench">
            <DesktopWorkbenchArea :bindings="bindings" :tasks-visible="activeView === 'lexora.tasks'" :context-on-left="contextOnLeft" :chat-pane-hidden="chatPaneHidden" @toggle-context-maximize="toggleContextMaximize" />
          </WorkbenchMountPoint>
        </div>
        <template #view="{ view, visible }">
          <DesktopWorkbenchView :view="view" :visible="visible" />
        </template>
      </WorkbenchHost>
      <Transition name="desktop-startup-reveal">
        <DesktopStartupScreen v-if="startupVisible" :failed="bindings.lifecycle.failed.value" :language="language" @retry="bindings.lifecycle.retry()" @open-logs="router.push(desktopRouteLocations.settings('logs'))" />
      </Transition>
    </div>
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
