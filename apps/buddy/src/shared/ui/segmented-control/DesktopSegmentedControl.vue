<script setup lang="ts" generic="T extends string | number">
import type { GlobalThemeOverrides } from 'naive-ui'
import type { Component } from 'vue'
import { NTab, NTabs } from 'naive-ui'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{
  /** An option with an `icon` renders the icon alone; its `label` becomes the tooltip and accessible name. */
  options: readonly { label: string, value: T, disabled?: boolean, icon?: Component }[]
  disabled?: boolean
}>()
const value = defineModel<T>({ required: true })
const themeOverrides: GlobalThemeOverrides['Tabs'] = {
  colorSegment: 'var(--buddy-surface-subtle)',
  tabColorSegment: 'var(--buddy-surface-base)',
  tabTextColorSegment: 'var(--buddy-text-secondary)',
  tabTextColorActiveSegment: 'var(--buddy-text-strong)',
  tabTextColorHoverSegment: 'var(--buddy-text-strong)',
  tabFontSizeSmall: '13px',
  tabFontWeight: '580',
  fontWeightStrong: '580',
  tabBorderRadius: 'var(--buddy-radius-micro)',
  tabPaddingSmallSegment: '4px 12px',
}

function select(next: string | number) {
  const option = props.options.find(option => option.value === next)
  if (!props.disabled && option && !option.disabled && option.value !== value.value)
    value.value = option.value
}
</script>

<template>
  <NTabs
    class="desktop-segmented-control"
    role="group"
    type="segment"
    size="small"
    animated
    :value="value"
    :theme-overrides="themeOverrides"
    @update:value="select"
  >
    <NTab
      v-for="option in options"
      :key="option.value"
      :name="option.value"
      :disabled="disabled || option.disabled"
      role="button"
      :tabindex="disabled || option.disabled ? -1 : 0"
      :aria-pressed="value === option.value"
      :aria-disabled="disabled || option.disabled || undefined"
      :aria-label="option.icon ? option.label : undefined"
      :title="option.icon ? option.label : undefined"
      @keydown.enter.prevent="select(option.value)"
      @keydown.space.prevent="select(option.value)"
    >
      <DesktopIcon v-if="option.icon" class="desktop-segmented-control__icon" :component="option.icon" :size="16" />
      <template v-else>
        {{ option.label }}
      </template>
    </NTab>
  </NTabs>
</template>

<style scoped>
.desktop-segmented-control {
  width: max-content;
  max-width: 100%;
  flex: none;
}

.desktop-segmented-control :deep(.n-tabs-tab:focus-visible) {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

.desktop-segmented-control :deep(.n-tabs-tab__label) {
  display: inline-flex;
  align-items: center;
}

@media (prefers-reduced-motion: reduce) {
  .desktop-segmented-control :deep(.n-tabs-capsule) {
    transition: none;
  }
}
</style>
