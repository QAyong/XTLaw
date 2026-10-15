<script setup lang="ts">
import type { LocalConnector } from '@buddy-shared/connectors/connectorApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'

import { Eye20Regular, EyeOff20Regular } from '@vicons/fluent'
import { NAlert, NButton, NInput } from 'naive-ui'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { useWebCredentialInput } from '../../state/useWebCredentialInput'

const props = defineProps<{
  connector: Readonly<LocalConnector> | null
  disabled: boolean
  language: BuddyLocale
  saveToken: (token: string | null) => Promise<boolean>
}>()
const { t } = useBuddyI18n(() => props.language)
// A saved token cannot be read back, so the eye button only reveals what is being typed.
const { canSave, masked, save, toggleVisibility, update, value: tokenValue, visible } = useWebCredentialInput({
  configured: () => props.connector?.credentialConfigured === true,
  reveal: async () => null,
  save: token => props.saveToken(token),
})

function prepareEdit(event: Event) {
  if (masked.value && event.target instanceof HTMLInputElement)
    event.target.select()
}
</script>

<template>
  <div class="desktop-legal-settings">
    <header class="desktop-legal-settings__heading">
      <h3 class="desktop-legal-settings__title">
        {{ t('desktop.legal.pkulaw') }}
      </h3>
    </header>
    <p class="desktop-legal-settings__description">
      {{ t('desktop.legal.pkulawDescription') }}
    </p>
    <NAlert v-if="!connector" type="warning" :show-icon="false">
      {{ t('desktop.legal.unavailable') }}
    </NAlert>
    <form v-else class="desktop-legal-settings__credentials" @submit.prevent="save">
      <NInput
        :value="tokenValue"
        :type="visible ? 'text' : 'password'"
        autocomplete="off"
        clearable
        :aria-label="t('desktop.legal.token')"
        :placeholder="t('desktop.legal.token')"
        :disabled="disabled"
        @beforeinput="prepareEdit"
        @update:value="update"
      >
        <template #suffix>
          <NButton class="desktop-legal-settings__reveal" quaternary :aria-label="t(visible ? 'desktop.web.hideKey' : 'desktop.web.showKey')" :aria-pressed="visible" :disabled="disabled || masked" @mousedown.prevent @click="toggleVisibility">
            <DesktopIcon :component="visible ? Eye20Regular : EyeOff20Regular" />
          </NButton>
        </template>
      </NInput>
      <NButton attr-type="submit" :disabled="!canSave || disabled">
        {{ t('common.save') }}
      </NButton>
    </form>
  </div>
</template>

<style scoped lang="scss">
.desktop-legal-settings { display: grid; gap: 0.7rem; }
.desktop-legal-settings__heading, .desktop-legal-settings__credentials { display: flex; align-items: center; gap: 0.65rem; }
.desktop-legal-settings__title { margin: 0; font-size: 0.82rem; font-weight: 600; }
.desktop-legal-settings__description { margin: 0; color: var(--buddy-text-secondary); font-size: 0.75rem; line-height: 1.65; }
.desktop-legal-settings__reveal { width: 1.5rem; height: 1.5rem; padding: 0; color: var(--buddy-text-secondary); border-radius: 6px; }
.desktop-legal-settings__credentials > .n-input { min-width: 0; flex: 1; }
@media (max-width: 900px) {
  .desktop-legal-settings__credentials { flex-wrap: wrap; }
  .desktop-legal-settings__credentials > .n-input { flex-basis: 100%; }
}
</style>
