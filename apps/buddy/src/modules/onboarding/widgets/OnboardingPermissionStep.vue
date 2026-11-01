<script setup lang="ts">
import type { BuddyPermissionMode } from '@buddy-shared/permissions/permissionMode'
import type { BuddyI18nKey } from '@/i18n/buddyI18n'
import { HandLeft20Regular, LockClosed20Regular, LockOpen20Regular, ShieldTask20Regular } from '@vicons/fluent'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { DesktopFullAccessConfirmationDialog } from '@/modules/prompt-input'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{ language: string, disabled: boolean }>()
const mode = defineModel<BuddyPermissionMode>({ required: true })
const { t } = useBuddyI18n(() => props.language)
const confirmationOpen = shallowRef(false)
const options: Array<{ value: BuddyPermissionMode, icon: typeof LockOpen20Regular, label: BuddyI18nKey, description: BuddyI18nKey, recommended?: true }> = [
  { value: 'full_access', icon: LockOpen20Regular, label: 'desktop.chat.executionProfileFull', description: 'onboarding.permissionFullDescription', recommended: true },
  { value: 'policy_approval', icon: ShieldTask20Regular, label: 'desktop.chat.permissionModePolicy', description: 'desktop.chat.permissionModePolicyDescription' },
  { value: 'manual_approval', icon: HandLeft20Regular, label: 'desktop.chat.permissionModeManual', description: 'desktop.chat.permissionModeManualDescription' },
  { value: 'read_only', icon: LockClosed20Regular, label: 'desktop.chat.executionProfileReadOnly', description: 'desktop.chat.permissionModeReadOnlyDescription' },
]
const confirmationText = computed(() => ({
  acknowledgement: t('desktop.settings.runtime.fullAccessDefaultAcknowledgement'),
  cancelLabel: t('common.cancel'),
  confirmLabel: t('desktop.settings.runtime.fullAccessDefaultConfirm'),
  description: t('desktop.settings.runtime.fullAccessDefaultDescription'),
  title: t('desktop.settings.runtime.fullAccessDefaultTitle'),
}))

function select(value: BuddyPermissionMode) {
  if (props.disabled || value === mode.value)
    return
  if (value === 'full_access')
    confirmationOpen.value = true
  else
    mode.value = value
}
</script>

<template>
  <div class="grid gap-3">
    <div class="grid gap-2" role="radiogroup" :aria-label="t('onboarding.permissionStep')">
      <button
        v-for="option in options" :key="option.value" type="button" role="radio"
        class="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border border-solid rounded-lg bg-transparent p-3 text-left text-fg ui-focus-ring"
        :class="mode === option.value ? 'border-accent bg-accent-subtle' : 'border-border'"
        :aria-checked="mode === option.value" :disabled="disabled" :data-testid="`onboarding-permission-${option.value}`"
        @click="select(option.value)"
      >
        <DesktopIcon :component="option.icon" :size="18" class="mt-0.5" :class="mode === option.value ? 'text-accent-text' : 'text-muted'" />
        <span class="grid gap-1">
          <strong class="flex items-center gap-2 text-[13px] font-600">
            {{ t(option.label) }}
            <span v-if="option.recommended" class="rounded-full bg-accent px-2 py-0.5 text-[11px] text-on-accent font-500">{{ t('onboarding.permissionRecommended') }}</span>
          </strong>
          <span class="text-[12px] leading-[1.6] text-muted">{{ t(option.description) }}</span>
        </span>
      </button>
    </div>
    <p class="m-0 text-[12px] leading-[1.6] text-muted">
      {{ t('onboarding.permissionHint') }}
    </p>
    <DesktopFullAccessConfirmationDialog v-model:show="confirmationOpen" :text="confirmationText" @confirm="mode = 'full_access'" />
  </div>
</template>
