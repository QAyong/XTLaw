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
}>()
const emit = defineEmits<{ navigate: [], remove: [] }>()
</script>

<template>
  <div class="chat-reference-card">
    <button type="button" class="chat-reference-card__link" :title="text" @click="emit('navigate')">
      <DesktopIcon :component="icon" class="chat-reference-card__icon" />
      <span class="chat-reference-card__body">
        <small>{{ label }}</small>
        <span class="chat-reference-card__excerpt">{{ text }}</span>
      </span>
    </button>
    <NButton v-if="removable" class="buddy-icon-button chat-reference-card__remove" quaternary size="tiny" :disabled="disabled" :aria-label="removeLabel" @click="emit('remove')">
      <template #icon>
        <DesktopIcon :component="Dismiss16Regular" />
      </template>
    </NButton>
  </div>
</template>

<style scoped>
.chat-reference-card { display: flex; flex: 0 0 auto; width: 180px; max-width: 100%; min-width: 0; align-items: flex-start; border: 1px solid var(--buddy-border-subtle); border-radius: var(--buddy-radius-micro); background: var(--buddy-surface-raised); }
.chat-reference-card__link { display: flex; flex: 1; gap: 8px; min-width: 0; padding: 8px 10px; border: 0; background: transparent; color: var(--buddy-text-primary); text-align: left; font: inherit; cursor: pointer; }
.chat-reference-card__link:hover { background: var(--buddy-state-hover); }
.chat-reference-card__link:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: -2px; border-radius: var(--buddy-radius-micro); }
.chat-reference-card__icon { flex: none; margin-top: 2px; color: var(--buddy-accent-text); }
.chat-reference-card__body { display: grid; min-width: 0; gap: 3px; }
.chat-reference-card__body small { color: var(--buddy-text-secondary); font-size: 11px; }
.chat-reference-card__excerpt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; line-height: 1.5; }
.chat-reference-card__remove { flex: none; margin: 4px 4px 0 0; }
</style>
