<script setup lang="ts">
import type { ApplicationStartupState } from '@buddy-shared/diagnostics/applicationStartup'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton } from 'naive-ui'
import { computed, useId } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopStartupArtwork from './DesktopStartupArtwork.vue'
import { startupPresentation } from './startupPresentation'

const props = defineProps<{ failed: boolean, language: BuddyLocale, stages: ApplicationStartupState['stages'] }>()
const emit = defineEmits<{ retry: [], openLogs: [], openStorage: [] }>()
const { t } = useBuddyI18n(() => props.language)
const stageLabelId = useId()
const isFailed = computed(() => props.failed || props.stages.some(stage => stage.status === 'failed'))
const presentation = computed(() => startupPresentation(props.stages, isFailed.value))
</script>

<template>
  <div class="desktop-startup" :class="{ 'is-failed': isFailed }" :role="isFailed ? 'alert' : 'status'" :aria-busy="!isFailed">
    <DesktopStartupArtwork />
    <div class="desktop-startup__identity">
      <h1>XTLaw</h1>
      <div
        v-if="!isFailed"
        class="desktop-startup__loading-line"
        :class="{ 'is-indeterminate': presentation.progress === null }"
        role="progressbar"
        :aria-labelledby="stageLabelId"
        :aria-valuenow="presentation.progress === null ? undefined : Math.round(presentation.progress * 100)"
        :aria-valuemin="0"
        :aria-valuemax="100"
      >
        <span :style="presentation.progress === null ? undefined : { transform: `scaleX(${presentation.progress})` }" />
      </div>
      <p :id="stageLabelId">
        {{ t(presentation.label) }}
      </p>
      <div v-if="isFailed" class="desktop-startup__actions">
        <NButton size="small" secondary @click="emit('retry')">
          {{ t('desktop.loading.retry') }}
        </NButton>
        <NButton size="small" secondary @click="emit('openStorage')">
          {{ t('desktop.loading.openStorage') }}
        </NButton>
        <NButton size="small" quaternary @click="emit('openLogs')">
          {{ t('applicationLogs.open') }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.desktop-startup {
  --startup-wordmark-width: clamp(14rem, 40vw, 26rem);
  --startup-wordmark-height: calc(var(--startup-wordmark-width) * 460 / 2048);
  position: absolute;
  z-index: 20;
  inset: 0;
  overflow: hidden;
  background: var(--buddy-surface-base);
  user-select: none;
}

.desktop-startup__identity {
  position: absolute;
  top: calc(50% + var(--startup-wordmark-height) / 2 + 1.5rem);
  left: 50%;
  display: grid;
  width: min(28rem, calc(100% - 3rem));
  justify-items: center;
  gap: 0.85rem;
  font-family: var(--buddy-font-brand);
  text-align: center;
  transform: translateX(-50%);
}

.desktop-startup h1 {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.desktop-startup p {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
}

.desktop-startup__loading-line {
  width: min(9rem, 100%);
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: light-dark(#e5e7eb, #343840);
}

.desktop-startup__loading-line span {
  display: block;
  width: 30%;
  height: 100%;
  border-radius: inherit;
  background: #3b82f6;
  animation: startup-loading-slide 1.4s linear infinite;
}

.desktop-startup__loading-line:not(.is-indeterminate) span {
  width: 100%;
  transform-origin: left;
  transition: transform 180ms ease-out;
  animation: none;
}

@keyframes startup-loading-slide {
  from { transform: translateX(-100%); }
  to { transform: translateX(333.333%); }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-startup__loading-line span {
    animation: none;
    transform: translateX(116.667%);
  }
}

.desktop-startup__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.4rem;
}
</style>
