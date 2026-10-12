<script setup lang="ts">
import type { Component } from 'vue'
import { useId } from 'vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

defineProps<{ heading: string, icon?: Component }>()
const headingId = useId()
</script>

<template>
  <section class="buddy-settings-section min-w-0" :aria-labelledby="headingId">
    <div class="overflow-hidden border border-solid border-border rounded-[0.65rem] bg-surface">
      <header class="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div class="min-w-0">
          <h3 :id="headingId" class="m-0 flex items-center gap-2 text-[14px] font-600 text-fg">
            <DesktopIcon v-if="icon" :component="icon" class="text-[18px] text-muted" />
            <span>{{ heading }}</span>
            <slot name="badge" />
          </h3>
        </div>
        <slot name="actions" />
      </header>
      <slot :heading-id="headingId" />
    </div>
  </section>
</template>

<style scoped lang="scss">
.buddy-settings-section {
  container: buddy-section / inline-size;
}
</style>
