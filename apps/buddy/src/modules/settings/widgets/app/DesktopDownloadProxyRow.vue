<script setup lang="ts">
import type { DownloadProxy } from '@buddy-shared/network/downloadSettings'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NButton, NSwitch } from 'naive-ui'
import { useId } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  proxy: Readonly<DownloadProxy>
  language: BuddyLocale
  disabled: boolean
  first: boolean
  last: boolean
}>()
const emit = defineEmits<{ toggle: [enabled: boolean], edit: [], remove: [], move: [direction: -1 | 1] }>()
const { t } = useBuddyI18n(() => props.language)
const labelId = useId()
</script>

<template>
  <li class="flex flex-wrap items-center gap-3 border-t border-t-solid border-t-border py-3" data-testid="download-proxy-row">
    <div class="min-w-0 flex-1 basis-44">
      <div :id="labelId" class="break-all text-sm font-medium">
        {{ proxy.name }}
      </div>
      <div class="mt-1 break-all text-xs text-muted">
        {{ proxy.url }}
      </div>
    </div>
    <NSwitch :aria-labelledby="labelId" :round="false" :value="proxy.enabled" :disabled="disabled" @update:value="emit('toggle', $event)" />
    <div class="flex flex-wrap gap-1">
      <NButton size="tiny" :disabled="disabled || first" @click="emit('move', -1)">
        {{ t('desktop.settings.downloads.moveUp') }}
      </NButton>
      <NButton size="tiny" :disabled="disabled || last" @click="emit('move', 1)">
        {{ t('desktop.settings.downloads.moveDown') }}
      </NButton>
      <NButton size="tiny" :disabled="disabled" @click="emit('edit')">
        {{ t('desktop.settings.downloads.edit') }}
      </NButton>
      <NButton size="tiny" :disabled="disabled" @click="emit('remove')">
        {{ t('desktop.settings.downloads.remove') }}
      </NButton>
    </div>
  </li>
</template>
