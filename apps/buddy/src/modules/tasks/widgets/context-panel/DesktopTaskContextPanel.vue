<script setup lang="ts">
import type { ContextPanelTab } from '../../model/context-panel/taskContextPanel'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { WorkbenchLauncherAction } from '@/workbench/browser/useWorkbenchLaunchers'
import { Code16Regular, Globe16Regular } from '@vicons/fluent'
import { shallowRef } from 'vue'
import { FileIcon, FolderIcon } from '@/shared/ui/file-icon'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import WorkbenchResourcePanel from '@/workbench/browser/WorkbenchResourcePanel.vue'

withDefaults(defineProps<{
  activeTabId: string | null
  actions: readonly WorkbenchLauncherAction[]
  language: BuddyLocale
  maximized?: boolean
  tabs: readonly ContextPanelTab[]
}>(), { maximized: undefined })
const emit = defineEmits<{
  add: [id: string]
  closeTab: [tabId: string]
  selectTab: [tabId: string]
  toggleMaximize: []
}>()
defineSlots<{ default?: () => unknown, toolbar?: () => unknown, headerActions?: () => unknown }>()
const failedFavicons = shallowRef<ReadonlySet<string>>(new Set())
function faviconFailed(url: string): void {
  failedFavicons.value = new Set([...failedFavicons.value, url].slice(-64))
}
</script>

<template>
  <WorkbenchResourcePanel :active-tab-id="activeTabId" :tabs="tabs" :language="language" :actions="actions" :maximized="maximized" @toggle-maximize="emit('toggleMaximize')" @add="emit('add', $event)" @close-tab="emit('closeTab', $event)" @select-tab="emit('selectTab', $event)">
    <template #icon="{ tab }">
      <FileIcon v-if="tab.icon === 'file'" :name="tab.fileName ?? tab.title" />
      <FolderIcon v-else-if="tab.icon === 'folder'" class="desktop-task-context-panel__folder-icon" />
      <img v-else-if="tab.icon === 'browser' && tab.favicon && !failedFavicons.has(tab.favicon)" :key="tab.favicon" :src="tab.favicon" class="desktop-task-context-panel__favicon" alt="" referrerpolicy="no-referrer" @error="faviconFailed(tab.favicon)">
      <DesktopIcon v-else :component="tab.icon === 'browser' ? Globe16Regular : Code16Regular" />
    </template>
    <template v-if="$slots.headerActions" #headerActions>
      <slot name="headerActions" />
    </template>
    <template v-if="$slots.toolbar" #toolbar>
      <slot name="toolbar" />
    </template>
    <slot />
  </WorkbenchResourcePanel>
</template>

<style scoped>
.desktop-task-context-panel__favicon { width: 1rem; height: 1rem; flex: none; object-fit: contain; }
.desktop-task-context-panel__folder-icon { width: 1rem; height: 1rem; flex: none; }
</style>
