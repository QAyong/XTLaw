<script setup lang="ts">
import type { TaskSidebarActivity } from '../../contracts'
import { ApprovalsApp20Regular, Keyboard20Regular } from '@vicons/fluent'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopRingSpinner from '@/shared/ui/loading/DesktopRingSpinner.vue'

defineProps<{
  activity: Exclude<TaskSidebarActivity, 'idle'>
}>()
</script>

<template>
  <DesktopRingSpinner v-if="activity === 'running'" />
  <!-- 与大纲、画布的提问图标一致；对话气泡在本地表示普通会话。 -->
  <DesktopIcon v-else-if="activity === 'awaiting_answer'" :component="Keyboard20Regular" :size="16" />
  <DesktopIcon v-else :component="ApprovalsApp20Regular" :size="16" />
</template>
