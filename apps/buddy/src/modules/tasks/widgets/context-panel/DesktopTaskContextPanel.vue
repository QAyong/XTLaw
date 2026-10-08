<script setup lang="ts">
import type { ContextPanelTab } from '../../model/context-panel/taskContextPanel'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Code16Regular, Folder20Regular, Globe16Regular } from '@vicons/fluent'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { FileIcon, FolderIcon } from '@/shared/ui/file-icon'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import WorkbenchResourcePanel from '@/workbench/browser/WorkbenchResourcePanel.vue'

const props = defineProps<{
  activeTabId: string | null
  canAddChanges: boolean
  canAddFiles: boolean
  language: BuddyLocale
  tabs: readonly ContextPanelTab[]
}>()
const emit = defineEmits<{
  add: [kind: 'changes' | 'files' | 'browser']
  closeTab: [tabId: string]
  selectTab: [tabId: string]
}>()
defineSlots<{ default?: () => unknown, toolbar?: () => unknown }>()
const { t } = useBuddyI18n(() => props.language)
const failedFavicons = shallowRef<ReadonlySet<string>>(new Set())
function faviconFailed(url: string): void {
  failedFavicons.value = new Set([...failedFavicons.value, url].slice(-64))
}
const actions = computed(() => [
  ...(props.canAddChanges ? [{ id: 'changes' as const, label: t('desktop.context.changes'), icon: Code16Regular }] : []),
  ...(props.canAddFiles ? [{ id: 'files' as const, label: t('desktop.context.files'), icon: Folder20Regular }] : []),
  { id: 'browser' as const, label: t('desktop.context.browser'), icon: Globe16Regular },
])
function add(id: string) {
  const action = actions.value.find(action => action.id === id)
  if (action)
    emit('add', action.id)
}
</script>

<template>
  <WorkbenchResourcePanel :active-tab-id="activeTabId" :tabs="tabs" :language="language" :actions="actions" @add="add" @close-tab="emit('closeTab', $event)" @select-tab="emit('selectTab', $event)">
    <template #icon="{ tab }">
      <FileIcon v-if="tab.icon === 'file'" :name="tab.fileName ?? tab.title" />
      <FolderIcon v-else-if="tab.icon === 'folder'" class="desktop-task-context-panel__folder-icon" />
      <img v-else-if="tab.icon === 'browser' && tab.favicon && !failedFavicons.has(tab.favicon)" :key="tab.favicon" :src="tab.favicon" class="desktop-task-context-panel__favicon" alt="" referrerpolicy="no-referrer" @error="faviconFailed(tab.favicon)">
      <DesktopIcon v-else :component="tab.icon === 'browser' ? Globe16Regular : Code16Regular" />
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
