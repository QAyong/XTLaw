<script setup lang="ts">
import type { TaskIndex } from '../../contracts'
import { useDesktopUi } from '@/shared/ui/desktopUiContext'
import DesktopTaskIndex from '../task-index/DesktopTaskIndex.vue'

const props = defineProps<{ activeTaskId: string | null, pendingTaskIds?: readonly string[], index: TaskIndex }>()
const emit = defineEmits<{ openTask: [id: string], newTask: [spaceId?: string | null] }>()
defineSlots<{ footer?: () => unknown, navigation?: () => unknown }>()
const { language } = useDesktopUi()
const { pinnedItems, sidebar, spaces, tasks: items, ...actions } = props.index
</script>

<template>
  <DesktopTaskIndex :pending-conversation-ids="pendingTaskIds" :active-conversation-id="activeTaskId" :marks="index.marks" :language="language" :pinned-items="pinnedItems" :sidebar="sidebar" :spaces="spaces" :select-space-directory="actions.selectSpaceDirectory" :tasks="items" :create-space="actions.createSpace" :update-space="actions.updateSpace" @delete-space="actions.deleteSpace" @delete-task="actions.deleteTask" @move-task="actions.moveTaskToSpace" @new-task="emit('newTask', $event)" @open-space-directory="actions.openSpaceDirectory" @open-task="emit('openTask', $event)" @rename-task="actions.renameTask" @update-pinned-items="actions.setPinnedItems">
    <template v-if="$slots.navigation" #navigation>
      <slot name="navigation" />
    </template>
    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </DesktopTaskIndex>
</template>
