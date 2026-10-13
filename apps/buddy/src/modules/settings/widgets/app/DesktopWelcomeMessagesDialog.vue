<script setup lang="ts">
import type { DesktopChatWelcomeItem } from '@buddy-electron/shared/desktopApi'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { DESKTOP_CHAT_WELCOME_MAX_ITEMS, DESKTOP_CHAT_WELCOME_MAX_LENGTH } from '@buddy-electron/shared/desktopChatWelcome'
import { NButton, NInput, NModal, NRadio, NRadioGroup } from 'naive-ui'
import { computed, useId } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { resolveDesktopChatWelcomeText } from '@/shared/branding/welcome/desktopChatWelcomeVariants'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{
  language: BuddyLocale
  items: ReadonlyArray<DesktopChatWelcomeItem>
  selectedId: string | null
  pending: boolean
  disabled: boolean
}>()
const emit = defineEmits<{ close: [], add: [], delete: [id: string], select: [id: string] }>()
const draft = defineModel<string>('draft', { required: true })
const { t } = useBuddyI18n(() => props.language)
const labelId = useId()
const items = computed(() => props.items.map(item => ({ id: item.id, text: resolveDesktopChatWelcomeText(item, props.language) })))
const atLimit = computed(() => props.items.length >= DESKTOP_CHAT_WELCOME_MAX_ITEMS)

function submit(event?: KeyboardEvent) {
  if (event?.isComposing || props.disabled || props.pending || atLimit.value || !draft.value.trim())
    return
  event?.preventDefault()
  emit('add')
}
</script>

<template>
  <NModal
    show preset="card" class="desktop-welcome-messages-dialog" :style="{ width: 'min(560px, calc(100vw - 32px))' }" :aria-labelledby="labelId"
    :closable="!pending" :mask-closable="!pending" :close-on-esc="!pending"
    @close="emit('close')" @update:show="value => !value && emit('close')"
  >
    <template #header>
      <span :id="labelId">{{ t('desktop.settings.welcomeMessages') }}</span>
    </template>
    <div class="grid min-w-0 gap-4" :class="{ 'text-disabled': disabled }" data-testid="welcome-messages">
      <NRadioGroup
        v-if="items.length" :value="selectedId" :disabled="disabled || pending" :aria-labelledby="labelId" :role="selectedId === null ? 'group' : 'radiogroup'" class="min-w-0 w-full"
        @update:value="emit('select', $event)"
      >
        <ul class="m-0 grid max-h-64 min-w-0 list-none gap-0 overflow-y-auto p-0">
          <li v-for="item in items" :key="item.id" class="flex min-w-0 items-center gap-3 border-b border-b-solid border-b-border py-2 last:border-b-0" :data-welcome-id="item.id">
            <NRadio v-if="selectedId !== null" :value="item.id" class="min-w-0 flex-1">
              <span class="whitespace-pre-wrap [overflow-wrap:anywhere] text-[0.8rem] leading-[1.5]">{{ item.text }}</span>
            </NRadio>
            <span v-else class="min-w-0 flex-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-[0.8rem] leading-[1.5]">{{ item.text }}</span>
            <NButton
              class="buddy-icon-button shrink-0" quaternary size="small" :disabled="disabled || pending"
              :aria-label="t('desktop.settings.welcomeDeleteItem', { text: item.text })" @click="emit('delete', item.id)"
            >
              <template #icon>
                <DesktopIcon name="delete" :size="16" />
              </template>
            </NButton>
          </li>
        </ul>
      </NRadioGroup>
      <p v-else class="m-0 text-[0.8rem] leading-[1.5]" :class="{ 'text-muted': !disabled }">
        {{ t('desktop.settings.welcomeEmpty') }}
      </p>
      <div class="grid min-w-0 gap-2">
        <div class="flex min-w-0 items-start gap-2">
          <NInput
            v-model:value="draft" class="min-w-0 flex-1" :maxlength="DESKTOP_CHAT_WELCOME_MAX_LENGTH" :input-props="{ 'aria-label': t('desktop.settings.welcomePlaceholder') }"
            :placeholder="t('desktop.settings.welcomePlaceholder')" :disabled="disabled || pending || atLimit" @keydown.enter="submit"
          />
          <NButton :disabled="disabled || !draft.trim() || pending || atLimit" :loading="pending" @click="submit()">
            {{ t('desktop.settings.welcomeAdd') }}
          </NButton>
        </div>
        <small v-if="atLimit" class="text-[0.7rem]" :class="{ 'text-muted': !disabled }">{{ t('desktop.settings.welcomeLimit', { count: DESKTOP_CHAT_WELCOME_MAX_ITEMS }) }}</small>
      </div>
    </div>
  </NModal>
</template>

<style scoped lang="scss">
.desktop-welcome-messages-dialog :deep(.n-radio__label) {
  min-width: 0;
}
</style>
