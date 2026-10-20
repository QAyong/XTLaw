<script setup lang="ts">
import type { Component } from 'vue'
import type { DesktopNavigationEntry } from '@/shared/navigation/desktopPages'
import { CalendarClock20Regular, PuzzlePiece20Regular } from '@vicons/fluent'
import { computed, h } from 'vue'
import { BuddyIcon } from '@/modules/buddies'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{ navigation: readonly DesktopNavigationEntry[] }>()
const emit = defineEmits<{ navigate: [id: string] }>()

// 与下方空间、任务行的线宽一致：插件、自动化用 Fluent 20 Regular，助手用与会话头部伙伴按钮相同的细线版图标；
// 页面自带的图标（24 格、1.8 线宽）更粗，这里不用。
const BuddyToolbarIcon = () => h(BuddyIcon, { variant: 'toolbar' })
const NAVIGATION_ICONS: ReadonlyArray<readonly [id: string, icon: Component]> = [
  ['lexora.extensions', PuzzlePiece20Regular],
  ['lexora.automations', CalendarClock20Regular],
  ['lexora.buddies', BuddyToolbarIcon],
]
const entries = computed(() => NAVIGATION_ICONS.flatMap(([id, icon]) => {
  const entry = props.navigation.find(item => item.id === id)
  return entry ? [{ ...entry, icon }] : []
}))
</script>

<template>
  <nav class="desktop-sidebar-navigation">
    <button
      v-for="entry in entries"
      :key="entry.id"
      class="desktop-sidebar-navigation__entry"
      :class="{ 'is-active': entry.active }"
      type="button"
      :aria-current="entry.active ? 'page' : undefined"
      :data-extension-navigation="entry.extensionId"
      @click="emit('navigate', entry.id)"
    >
      <DesktopIcon :component="entry.icon" :size="16" />
      <span>{{ entry.title }}</span>
    </button>
  </nav>
</template>

<style scoped>
.desktop-sidebar-navigation {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  padding: 0 0.5rem 0.25rem;
}

.desktop-sidebar-navigation__entry {
  display: flex;
  height: 2rem;
  align-items: center;
  gap: 0.375rem;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--buddy-sidebar-space-font-size);
  font-weight: var(--buddy-sidebar-space-font-weight);
  line-height: 20px;
  padding: 0 0.375rem;
  text-align: left;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-sidebar-navigation__entry :deep(.n-icon) {
  flex: none;
  color: inherit;
}

.desktop-sidebar-navigation__entry:hover {
  background: var(--buddy-state-hover);
  color: var(--buddy-text-strong);
}

.desktop-sidebar-navigation__entry:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

.desktop-sidebar-navigation__entry.is-active {
  background: var(--buddy-accent-surface-subtle);
  color: var(--buddy-nav-foreground);
}
</style>
