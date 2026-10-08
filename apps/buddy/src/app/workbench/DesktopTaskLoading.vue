<script setup lang="ts">
import { NButton, NSkeleton, NSpin } from 'naive-ui'
import { useWorkbench } from '@/workbench/browser/workbenchContext'

defineProps<{ failed: boolean }>()
defineEmits<{ retry: [] }>()
const { labels } = useWorkbench()
</script>

<template>
  <section class="desktop-task-loading" :aria-busy="!failed" data-testid="task-loading">
    <header class="desktop-task-loading__header">
      <div class="desktop-task-loading__title">
        <slot name="title" />
      </div>
      <slot name="actions" />
    </header>
    <div v-if="failed" class="desktop-task-loading__failure" role="alert">
      <span>{{ labels.failed }}</span>
      <NButton size="small" @click="$emit('retry')">
        {{ labels.retry }}
      </NButton>
    </div>
    <template v-else>
      <div class="desktop-task-loading__content">
        <div class="desktop-task-loading__status" role="status">
          <NSpin :size="16" />
          <span>{{ labels.loading }}</span>
        </div>
        <div class="desktop-task-loading__skeleton" aria-hidden="true">
          <div v-for="index in 2" :key="index" class="desktop-task-loading__message">
            <NSkeleton width="80px" height="14px" />
            <NSkeleton text :repeat="3" />
          </div>
        </div>
      </div>
      <div class="desktop-task-loading__composer" aria-hidden="true">
        <NSkeleton height="88px" :sharp="false" />
      </div>
    </template>
  </section>
</template>

<style scoped>
.desktop-task-loading { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; }
.desktop-task-loading__header { display: flex; flex: none; align-items: center; gap: 0.85rem; height: var(--buddy-region-header-height); border-bottom: 1px solid var(--buddy-border-subtle); background: var(--buddy-surface-base); padding: 0 0.75rem 0 1rem; }
.desktop-task-loading__title { flex: 1; min-width: 0; font-size: 0.88rem; font-weight: 660; }
.desktop-task-loading__content { flex: 1; min-height: 0; overflow: hidden; width: min(100%, 800px); margin: 0 auto; padding: 24px; }
.desktop-task-loading__status { display: flex; align-items: center; gap: 8px; color: var(--buddy-text-secondary); font-size: 12px; }
.desktop-task-loading__skeleton { display: grid; gap: 32px; margin-top: 28px; }
.desktop-task-loading__message { display: grid; gap: 12px; }
.desktop-task-loading__composer { flex: none; width: min(100%, 800px); margin: 0 auto; padding: 12px 24px 24px; }
.desktop-task-loading__failure { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; color: var(--buddy-text-secondary); }
@media (prefers-reduced-motion: reduce) {
  .desktop-task-loading :deep(.n-skeleton), .desktop-task-loading :deep(.n-spin-body) { animation: none !important; }
}
</style>
