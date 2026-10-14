<script setup lang="ts">
import type { DesktopUpdateCheckResult } from '@buddy-electron/shared/desktopUpdates'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NAlert, NButton, NDropdown } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{ result: DesktopUpdateCheckResult, language: BuddyLocale, pending: boolean }>()
const emit = defineEmits<{ open: [], ignore: [version: string], dismiss: [], snooze: [version: string, delay: '30-minutes' | 'tomorrow'] }>()
const { t } = useBuddyI18n(() => props.language)
const options = computed(() => [
  { key: 'close', label: t('desktop.update.dismiss') },
  { key: '30-minutes', label: t('desktop.update.remindIn30Minutes') },
  { key: 'tomorrow', label: t('desktop.update.remindTomorrow') },
  { key: 'separator', type: 'divider' },
  { key: 'skip', label: t('desktop.update.ignore') },
])
function select(key: string) {
  if (key === 'close')
    emit('dismiss')
  else if (key === 'skip')
    emit('ignore', props.result.latestVersion)
  else if (key === '30-minutes' || key === 'tomorrow')
    emit('snooze', props.result.latestVersion, key)
}
</script>

<template>
  <aside class="desktop-update-reminder" data-testid="update-reminder" aria-live="polite">
    <NAlert :title="t('desktop.update.notificationTitle', { version: result.latestVersion })" :show-icon="false" closable @close="emit('dismiss')">
      <p class="desktop-update-reminder__description">
        {{ t('desktop.update.notificationDescription') }}
      </p>
      <div class="desktop-update-reminder__actions">
        <NButton size="small" type="primary" :disabled="pending" @click="emit('open')">
          {{ t('desktop.update.view') }}
        </NButton>
        <NDropdown :menu-props="() => ({ role: 'menu' })" :node-props="option => ({ 'role': 'menuitem', 'aria-disabled': option.disabled ? 'true' : 'false' })" trigger="click" :options="options" @select="select">
          <NButton size="small" quaternary :disabled="pending">
            {{ t('desktop.update.later') }}
          </NButton>
        </NDropdown>
      </div>
    </NAlert>
  </aside>
</template>

<style scoped>
.desktop-update-reminder {
  position: fixed;
  z-index: 1900;
  right: 20px;
  bottom: 20px;
  width: min(340px, calc(100vw - 40px));
  box-shadow: var(--buddy-shadow-soft);
}
.desktop-update-reminder__description {
  margin: 4px 0 12px;
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.desktop-update-reminder__actions {
  display: flex;
  gap: 8px;
}
</style>
