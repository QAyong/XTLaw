<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue'
import type { DesktopShellBindings } from '../shell/desktopShellBindings'
import { NSpin } from 'naive-ui'
import { computed, watch } from 'vue'
import { RouterView } from 'vue-router'
import { DesktopTaskIndexView, DesktopTaskResourcePanel } from '@/modules/tasks/ui'
import { useDesktopUi } from '@/shared/ui/desktopUiContext'
import WorkbenchLayout from '@/workbench/browser/layout/WorkbenchLayout.vue'
import WorkbenchMountPoint from '@/workbench/browser/mounts/WorkbenchMountPoint.vue'
import { useWorkbench } from '@/workbench/browser/workbenchContext'
import WorkbenchLayoutNode from '@/workbench/browser/WorkbenchLayoutNode.vue'
import WorkbenchSurface from '@/workbench/browser/WorkbenchSurface.vue'
import DesktopSidebarFooter from '../shell/DesktopSidebarFooter.vue'
import DesktopDirectoryFileSurface from './DesktopDirectoryFileSurface.vue'

const props = defineProps<{ bindings: DesktopShellBindings, tasksVisible: boolean, contextOnLeft: boolean, chatPaneHidden: boolean }>()
const emit = defineEmits<{ toggleContextMaximize: [] }>()
const { controller, layout, revision, labels } = useWorkbench()
const pendingTaskIds = computed(() => {
  void revision.value
  return [...controller.navigation.entries.values()].filter(entry => entry.status === 'loading' && entry.view.resource.scheme === 'task').map(entry => entry.view.resource.id)
})
const { language } = useDesktopUi()
const sidebar = props.bindings.taskIndex.sidebar
const collapsed = computed({ get: () => sidebar.collapsed.value, set: value => void sidebar.setCollapsed(value) })
const width = computed({ get: () => sidebar.width.value, set: value => void sidebar.setWidth(value) })
const fileTab = computed(() => props.bindings.resources.activeTab.value?.kind === 'files' ? props.bindings.resources.activeTab.value : null)
const selectedFile = computed(() => {
  void revision.value
  return fileTab.value ? props.bindings.workbench.fileView(fileTab.value.target, fileTab.value.id) : null
})
const docxSelections = new Map<string, unknown>()
watch(() => fileTab.value?.target, (target) => {
  if (target?.path && fileTab.value) {
    if (/\.docx$/i.test(target.path)) {
      // Returning to the file-manager tab must not jump back to the editor.
      if (docxSelections.get(fileTab.value.id) === target)
        return
      docxSelections.set(fileTab.value.id, target)
    }
    void props.bindings.workbench.openFile({ ...target }, fileTab.value.id)
  }
}, { immediate: true })
watch(() => selectedFile.value?.id, (id) => {
  if (id && props.bindings.workbench.controller.context.values['focus.area'] === 'context')
    props.bindings.workbench.controller.focus(id)
})
function toolbarTarget(id: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement)
    props.bindings.workbench.fileToolbarTargets.set(id, element)
  else
    props.bindings.workbench.fileToolbarTargets.delete(id)
}
function focusContext() {
  const tab = props.bindings.resources.activeTab.value
  props.bindings.workbench.controller.focusContext(tab?.kind === 'view' ? tab.viewId : selectedFile.value?.id ?? null)
}
function navigate(id: string) {
  const entry = props.bindings.pages.navigation.value.find(entry => entry.id === id)
  if (entry)
    void props.bindings.navigation.navigate(entry.location)
}
</script>

<template>
  <WorkbenchLayout v-model:sidebar-collapsed="collapsed" v-model:sidebar-width="width" :language="language" :context-visible="(tasksVisible || bindings.contextPanelGlobal.value) && bindings.resources.isOpen.value" :context-on-left="tasksVisible && contextOnLeft" :workspace-visible="!chatPaneHidden" :sidebar-collapsible="tasksVisible" :sidebar-resizable="tasksVisible">
    <template v-if="tasksVisible" #sidebar>
      <WorkbenchMountPoint target="workbench.sidebar">
        <DesktopTaskIndexView :pending-task-ids="pendingTaskIds" :index="bindings.taskIndex" :active-task-id="bindings.workbench.activeTaskId.value" @open-task="bindings.workbench.openTask" @new-task="bindings.workbench.newTask">
          <template #footer>
            <DesktopSidebarFooter
              :language="language"
              :navigation="bindings.pages.navigation.value"
              :notification-items="bindings.notifications.items.value"
              :notification-loading="bindings.notifications.isLoading.value"
              :notification-unseen-count="bindings.notifications.unseenCount.value"
              @mark-all-notifications-seen="bindings.notifications.markAllSeen"
              @navigate="navigate"
              @open-notification="bindings.navigation.openNotification"
              @refresh-notifications="bindings.notifications.load"
            />
          </template>
        </DesktopTaskIndexView>
      </WorkbenchMountPoint>
    </template>
    <div v-show="tasksVisible" class="desktop-workbench-area__tasks">
      <WorkbenchLayoutNode :node="layout.root" />
    </div>
    <RouterView v-if="!tasksVisible" />
    <template #context>
      <div class="desktop-workbench-area__context" data-workbench-context @focusin="focusContext" @pointerdown="focusContext">
        <DesktopTaskResourcePanel :maximized="chatPaneHidden" :panel="bindings.resources" :context="bindings.resourceContext" :language="language" :visible="(tasksVisible || bindings.contextPanelGlobal.value) && bindings.resources.isOpen.value" @toggle-maximize="emit('toggleContextMaximize')">
          <template #view="{ viewId }">
            <WorkbenchSurface :view-id="viewId" :visible="(tasksVisible || bindings.contextPanelGlobal.value) && bindings.resources.isOpen.value" />
          </template>
          <template #file-toolbar="{ tab }">
            <div :ref="element => toolbarTarget(tab.id, element)" class="desktop-workbench-area__file-toolbar" />
          </template>
          <template #file="{ wrap, setWrap }">
            <DesktopDirectoryFileSurface v-if="selectedFile" :view="selectedFile" :wrap="wrap" :visible="(tasksVisible || bindings.contextPanelGlobal.value) && bindings.resources.isOpen.value" @update-wrap="setWrap" />
            <div v-else class="desktop-workbench-area__file-loading">
              <NSpin size="small" />{{ labels.loading }}
            </div>
          </template>
        </DesktopTaskResourcePanel>
      </div>
    </template>
  </WorkbenchLayout>
</template>

<style scoped>
.desktop-workbench-area__context { display: flex; flex: 1; min-width: 0; min-height: 0; }
.desktop-workbench-area__tasks { display: flex; flex: 1; min-width: 0; min-height: 0; }
.desktop-workbench-area__tasks > :deep(*) { flex: 1; }
.desktop-workbench-area__file-toolbar { display: flex; min-width: 0; flex: 1; }
.desktop-workbench-area__file-loading { display: grid; flex: 1; place-content: center; gap: 12px; color: var(--buddy-text-muted); font-size: 12px; }
</style>
