<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopStartupArtwork from './DesktopStartupArtwork.vue'

const props = defineProps<{ failed: boolean, language: BuddyLocale }>()
const emit = defineEmits<{ retry: [], openLogs: [] }>()
const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <div class="desktop-startup" :class="{ 'is-failed': failed }" :role="failed ? 'alert' : 'status'" :aria-busy="!failed">
    <DesktopStartupArtwork />
    <div class="desktop-startup__identity">
      <h1>XTLaw</h1>
      <div v-if="!failed" class="desktop-startup__loading-line" aria-hidden="true">
        <span />
      </div>
      <p>{{ t(failed ? 'desktop.loading.failed' : 'desktop.loading.app') }}</p>
      <div v-if="failed" class="desktop-startup__actions">
        <NButton size="small" secondary @click="emit('retry')">
          {{ t('desktop.loading.retry') }}
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
  gap: 0.5rem;
  margin-top: 0.4rem;
}
</style>
