<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, useTemplateRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { useWorkbenchAnchor } from '@/shared/ui/contributions/workbenchUiContext'
import { useWorkbenchPanelResize } from './useWorkbenchPanelResize'

const props = withDefaults(defineProps<{
  language: BuddyLocale
  contextVisible?: boolean
  contextOnLeft?: boolean
  workspaceVisible?: boolean
  sidebarCollapsible?: boolean
  sidebarResizable?: boolean
  workspaceMinimumWidth?: number
}>(), {
  contextVisible: true,
  contextOnLeft: false,
  workspaceVisible: true,
  sidebarCollapsible: false,
  sidebarResizable: false,
  workspaceMinimumWidth: 288,
})
const slots = defineSlots<{
  context?: () => unknown
  default: () => unknown
  sidebar?: () => unknown
}>()
const sidebarCollapsed = defineModel<boolean>('sidebarCollapsed', { default: false })
const sidebarWidthPreference = defineModel<number | null>('sidebarWidth', { default: null })
const { t } = useBuddyI18n(() => props.language)
const container = useTemplateRef<HTMLElement>('container')
const context = useTemplateRef<HTMLElement>('context')
const sidebar = useTemplateRef<HTMLElement>('sidebar')
useWorkbenchAnchor('workbench.sidebar', () => sidebar.value)
function sidebarVisible() {
  const collapsible = props.sidebarCollapsible
  const collapsed = sidebarCollapsed.value
  return Boolean(slots.sidebar) && (!collapsible || !collapsed)
}
const {
  activePanel,
  beginResize,
  contextRange,
  contextStyle,
  contextWidth,
  handleResizeKeydown,
  layoutStyle,
  sidebarRange,
  sidebarWidth,
} = useWorkbenchPanelResize({
  container,
  context,
  contextVisible: () => props.contextVisible,
  contextOnLeft: () => props.contextOnLeft,
  workspaceMinimumWidth: () => props.workspaceMinimumWidth,
  onSidebarWidthCommit: (width) => {
    sidebarWidthPreference.value = width
  },
  sidebar,
  sidebarPreferredWidth: () => sidebarWidthPreference.value,
  sidebarResizable: () => props.sidebarResizable,
  sidebarVisible,
})
const contextPaneStyle = computed(() => {
  if (!props.workspaceVisible && props.contextVisible)
    return { ...contextStyle.value, width: 'auto', flex: '1 1 0%' }
  return contextStyle.value
})
</script>

<template>
  <section
    ref="container"
    class="desktop-workbench-layout"
    :class="{
      'is-resizing': activePanel !== null,
      'is-context-leading': contextOnLeft,
    }"
    :style="layoutStyle"
  >
    <div
      v-if="$slots.sidebar"
      ref="sidebar"
      class="desktop-workbench-layout__sidebar"
      :class="{ 'is-collapsed': !sidebarVisible() }"
      :aria-hidden="!sidebarVisible()"
      :inert="!sidebarVisible()"
    >
      <slot name="sidebar" />
    </div>
    <div
      v-if="sidebarResizable && sidebarVisible()"
      class="desktop-workbench-layout__resizer desktop-workbench-layout__sidebar-resizer"
      :class="{ 'is-active': activePanel === 'sidebar' }"
      data-testid="workbench-sidebar-resizer"
      role="separator"
      :aria-label="t('desktop.layout.resizeTaskSidebar')"
      aria-orientation="vertical"
      :aria-valuemax="Math.round(sidebarRange.maximum)"
      :aria-valuemin="Math.round(sidebarRange.minimum)"
      :aria-valuenow="Math.round(sidebarWidth)"
      tabindex="0"
      @keydown="handleResizeKeydown('sidebar', $event)"
      @pointerdown="beginResize('sidebar', $event)"
    />
    <main v-show="workspaceVisible" class="desktop-workbench-layout__workspace" :class="{ 'is-context-leading': contextOnLeft }" :aria-hidden="!workspaceVisible" :inert="!workspaceVisible">
      <slot />
    </main>
    <div
      v-if="$slots.context && contextVisible && workspaceVisible"
      class="desktop-workbench-layout__resizer"
      :class="{ 'is-active': activePanel === 'context', 'is-context-leading': contextOnLeft }"
      data-testid="workbench-context-resizer"
      role="separator"
      :aria-label="t('desktop.layout.resizeContext')"
      aria-orientation="vertical"
      :aria-valuemax="Math.round(contextRange.maximum)"
      :aria-valuemin="Math.round(contextRange.minimum)"
      :aria-valuenow="Math.round(contextWidth)"
      tabindex="0"
      @keydown="handleResizeKeydown('context', $event)"
      @pointerdown="beginResize('context', $event)"
    />
    <aside v-if="$slots.context" v-show="contextVisible" ref="context" class="desktop-workbench-layout__context" :class="{ 'is-context-leading': contextOnLeft }" :style="contextPaneStyle" :inert="!contextVisible" :aria-hidden="!contextVisible">
      <slot name="context" />
    </aside>
    <div v-if="activePanel" class="desktop-workbench-layout__resize-shield" />
  </section>
</template>

<style scoped>
.desktop-workbench-layout {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: var(--buddy-surface-base);
}

.desktop-workbench-layout__sidebar {
  display: flex;
  width: var(--buddy-workspace-sidebar-width);
  min-width: 0;
  min-height: 0;
  flex: none;
  overflow: hidden;
  opacity: 1;
  transition: opacity 100ms ease;
}

.desktop-workbench-layout__sidebar.is-collapsed {
  width: 0;
  opacity: 0;
  pointer-events: none;
  visibility: hidden;
}

.desktop-workbench-layout__workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
}

.desktop-workbench-layout__context {
  display: flex;
  width: var(--buddy-context-panel-width);
  min-width: 0;
  min-height: 0;
  flex: none;
  border-left: 1px solid var(--buddy-border-subtle);
}

.desktop-workbench-layout.is-context-leading .desktop-workbench-layout__context {
  order: 1;
  border-right: 1px solid var(--buddy-border-subtle);
  border-left: 0;
}

.desktop-workbench-layout.is-context-leading .desktop-workbench-layout__resizer:not(.desktop-workbench-layout__sidebar-resizer) {
  order: 2;
  margin-right: 0;
  margin-left: -1px;
}

.desktop-workbench-layout.is-context-leading .desktop-workbench-layout__workspace {
  order: 3;
}

.desktop-workbench-layout__resizer {
  position: relative;
  z-index: 11;
  width: 1px;
  height: 100%;
  flex: 0 0 1px;
  cursor: col-resize;
  margin-right: -1px;
  outline: 0;
  touch-action: none;
}

.desktop-workbench-layout__resizer::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  width: 9px;
  content: '';
}

.desktop-workbench-layout__sidebar-resizer::before {
  width: 1.25rem;
}

.desktop-workbench-layout__resizer::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 2px;
  background: transparent;
  content: '';
  transform: translateX(-0.5px);
  transition: background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-workbench-layout.is-context-leading .desktop-workbench-layout__resizer:not(.desktop-workbench-layout__sidebar-resizer)::before {
  right: -4px;
  left: auto;
}

.desktop-workbench-layout.is-context-leading .desktop-workbench-layout__resizer:not(.desktop-workbench-layout__sidebar-resizer)::after {
  right: 0;
  left: auto;
  transform: translateX(0.5px);
}

.desktop-workbench-layout__resizer:hover::after,
.desktop-workbench-layout__resizer:focus-visible::after,
.desktop-workbench-layout__resizer.is-active::after {
  background: var(--buddy-accent-solid);
}

.desktop-workbench-layout__resize-shield {
  position: absolute;
  z-index: 10;
  inset: 0;
  cursor: col-resize;
}

.desktop-workbench-layout.is-resizing .desktop-workbench-layout__sidebar {
  transition: none;
}

.desktop-workbench-layout.is-resizing,
.desktop-workbench-layout.is-resizing * {
  cursor: col-resize !important;
  user-select: none !important;
}

@media (prefers-reduced-motion: reduce) {
  .desktop-workbench-layout__sidebar {
    transition: none;
  }
}
</style>
