<script setup lang="ts">
import type { Component } from 'vue'
import { Dismiss16Regular } from '@vicons/fluent'
import { NButton } from 'naive-ui'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

defineProps<{
  icon: Component
  label: string
  text: string
  removable?: boolean
  disabled?: boolean
  removeLabel: string
  actionLabel?: string
}>()
const emit = defineEmits<{ navigate: [], remove: [] }>()
</script>

<template>
  <div class="chat-reference-card flex flex-none w-[180px] max-w-full min-w-0 items-start overflow-hidden border-1 border-solid border-border rounded-micro bg-raised">
    <button type="button" class="chat-reference-card__link flex flex-1 gap-2 min-w-0 py-2 px-[10px] border-0 bg-transparent text-fg text-left cursor-pointer hover:bg-hover ui-focus-ring focus-visible:rounded-micro" :aria-label="actionLabel" @click="emit('navigate')">
      <slot name="icon">
        <DesktopIcon :component="icon" class="flex-none mt-[2px] text-accent-text" />
      </slot>
      <span class="grid min-w-0 gap-[3px]">
        <small class="truncate text-muted text-[length:var(--buddy-chat-caption-font-size)] leading-[var(--buddy-chat-caption-line-height)]">{{ label }}</small>
        <span class="chat-reference-card__excerpt overflow-hidden whitespace-pre-wrap [overflow-wrap:anywhere] text-[length:var(--buddy-chat-caption-font-size)] leading-[1.5]">{{ text }}</span>
      </span>
    </button>
    <NButton v-if="removable" class="buddy-icon-button flex-none mt-1 mr-1" quaternary size="tiny" :disabled="disabled" :aria-label="removeLabel" @click.stop="emit('remove')">
      <template #icon>
        <DesktopIcon :component="Dismiss16Regular" />
      </template>
    </NButton>
  </div>
</template>

<style scoped lang="scss">
.chat-reference-card__excerpt {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
