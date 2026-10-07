<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Chat20Regular } from '@vicons/fluent'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import WorkbenchMenu from '@/shared/ui/contributions/WorkbenchMenu.vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{
  taskId?: string | null
  viewMode?: 'chat' | 'canvas'
  canToggleCanvas: boolean
  language: BuddyLocale
  title: string
}>()
const emit = defineEmits<{
  toggleCanvas: []
}>()

const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <header class="desktop-chat-workspace-header">
    <div class="desktop-chat-workspace-header__copy">
      <slot name="title">
        <strong>{{ title }}</strong>
      </slot>
    </div>

    <div class="desktop-chat-workspace-header__actions">
      <WorkbenchMenu target="task.actions" :task-id="taskId" />
      <slot name="leadingActions" />
      <button
        v-if="canToggleCanvas"
        class="desktop-chat-workspace-header__icon-button"
        :class="{ 'is-active': viewMode === 'canvas' }"
        data-testid="conversation-canvas-toggle"
        type="button"
        :aria-label="viewMode === 'canvas' ? t('desktop.canvas.chatView') : t('desktop.canvas.view')"
        :aria-pressed="viewMode === 'canvas'"
        @click="emit('toggleCanvas')"
      >
        <DesktopIcon v-if="viewMode === 'canvas'" :component="Chat20Regular" />
        <DesktopIcon v-else>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="9" width="6" height="6" rx="1.5" />
            <path d="M8 12h4M12 5v14M12 5h4M12 12h4M12 19h4" />
            <rect x="16" y="3" width="6" height="4" rx="1" />
            <rect x="16" y="10" width="6" height="4" rx="1" />
            <rect x="16" y="17" width="6" height="4" rx="1" />
          </svg>
        </DesktopIcon>
      </button>
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped lang="scss">
.desktop-chat-workspace-header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.85rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-base);
  padding: 0 0.75rem 0 1rem;
}

.desktop-chat-workspace-header__copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.05rem;
  user-select: none;

  strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    font-size: 0.88rem;
    font-weight: 660;
  }
}

.desktop-chat-workspace-header__actions {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  gap: 0.18rem;
}

.desktop-chat-workspace-header__icon-button {
  display: grid;
  width: 2rem;
  height: 2rem;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-icon-button-radius);
  background: transparent;
  color: var(--buddy-text-primary);
  cursor: pointer;

  .n-icon {
    font-size: 18px;
  }

  &:hover:not(:disabled) {
    background: var(--buddy-state-hover);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }
}
</style>
