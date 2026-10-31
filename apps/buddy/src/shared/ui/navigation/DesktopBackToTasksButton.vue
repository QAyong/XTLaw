<script setup lang="ts">
import { ArrowLeft20Regular } from '@vicons/fluent'
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = withDefaults(defineProps<{
  floating?: boolean
  language: string
}>(), {
  floating: false,
})

const route = useRoute()
const { t } = useBuddyI18n(() => props.language)

/** 设置二级页（路由声明 meta.settingsParent）返回父级设置页，其余场景返回任务主页；文案统一。 */
const to = computed(() => route.meta.settingsParent ?? desktopRouteLocations.tasks())
</script>

<template>
  <RouterLink
    class="desktop-back-to-tasks"
    :class="{ 'is-floating': floating }"
    :title="t('desktop.navigation.backToTasks')"
    :to="to"
  >
    <DesktopIcon :component="ArrowLeft20Regular" :size="16" />
    <span>{{ t('desktop.navigation.back') }}</span>
  </RouterLink>
</template>

<style scoped>
.desktop-back-to-tasks {
  display: inline-flex;
  min-height: 2rem;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--buddy-icon-button-radius);
  background: var(--buddy-surface-base);
  color: var(--buddy-text-secondary);
  font-size: var(--buddy-sidebar-item-font-size);
  font-weight: var(--buddy-sidebar-item-font-weight);
  padding: 0.25rem 0.7rem 0.25rem 0.5rem;
  text-decoration: none;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    border-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-back-to-tasks:hover {
  border-color: var(--buddy-border-strong);
  background: var(--buddy-state-hover);
  color: var(--buddy-text-strong);
}

.desktop-back-to-tasks:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 1px;
}

.desktop-back-to-tasks.is-floating {
  position: absolute;
  z-index: 6;
  bottom: 0.75rem;
  left: 0.75rem;
  box-shadow: var(--buddy-shadow-soft);
}
</style>
