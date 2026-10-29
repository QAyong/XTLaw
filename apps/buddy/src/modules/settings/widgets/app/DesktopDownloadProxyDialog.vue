<script setup lang="ts">
import type { DownloadProxy } from '@buddy-shared/network/downloadSettings'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { downloadProxySchema } from '@buddy-shared/network/downloadSettings'
import { NButton, NInput, NModal } from 'naive-ui'
import { computed, shallowRef, useId } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{ proxy: DownloadProxy, isNew: boolean, language: BuddyLocale, pending: boolean }>()
const emit = defineEmits<{ save: [proxy: DownloadProxy], close: [] }>()
const { t } = useBuddyI18n(() => props.language)
const id = useId()
const name = shallowRef(props.proxy.name)
const url = shallowRef(props.proxy.url)
const submitted = shallowRef(false)
const invalidName = computed(() => submitted.value && !downloadProxySchema.shape.name.safeParse(name.value).success)
const invalidUrl = computed(() => submitted.value && !downloadProxySchema.shape.url.safeParse(url.value).success)

function submit() {
  if (props.pending)
    return
  submitted.value = true
  const result = downloadProxySchema.safeParse({ ...props.proxy, name: name.value, url: url.value })
  if (result.success)
    emit('save', result.data)
}
</script>

<template>
  <NModal show preset="card" :style="{ width: 'min(520px, calc(100vw - 32px))' }" :aria-labelledby="`${id}-heading`" :closable="!pending" :mask-closable="!pending" :close-on-esc="!pending" @update:show="!$event && !pending && emit('close')">
    <template #header>
      <span :id="`${id}-heading`">{{ t(isNew ? 'desktop.settings.downloads.add' : 'desktop.settings.downloads.edit') }}</span>
    </template>
    <form class="grid gap-3" @submit.prevent="submit">
      <div class="grid gap-2">
        <label :for="`${id}-name`">{{ t('desktop.settings.downloads.name') }}</label>
        <NInput v-model:value="name" :input-props="{ 'id': `${id}-name`, 'aria-describedby': invalidName ? `${id}-name-error` : undefined }" :disabled="pending" :status="invalidName ? 'error' : undefined" :maxlength="80" />
        <small v-if="invalidName" :id="`${id}-name-error`" class="text-danger" role="alert">{{ t('desktop.settings.downloads.invalidName') }}</small>
      </div>
      <div class="grid gap-2">
        <label :for="`${id}-url`">{{ t('desktop.settings.downloads.url') }}</label>
        <NInput v-model:value="url" :input-props="{ 'id': `${id}-url`, 'aria-describedby': `${id}-url-help` }" placeholder="https://ghfast.top/" :disabled="pending" :status="invalidUrl ? 'error' : undefined" />
        <small :id="`${id}-url-help`" class="text-xs leading-relaxed text-muted">{{ t('desktop.settings.downloads.urlHelp') }}</small>
        <small v-if="invalidUrl" class="text-danger" role="alert">{{ t('desktop.settings.downloads.invalidUrl') }}</small>
      </div>
      <div class="mt-2 flex justify-end gap-2">
        <NButton :disabled="pending" @click="emit('close')">
          {{ t('desktop.settings.downloads.cancel') }}
        </NButton>
        <NButton attr-type="submit" type="primary" :loading="pending" :disabled="pending">
          {{ t('desktop.settings.downloads.save') }}
        </NButton>
      </div>
    </form>
  </NModal>
</template>
