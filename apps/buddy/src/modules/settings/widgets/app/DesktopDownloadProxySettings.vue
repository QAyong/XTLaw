<script setup lang="ts">
import type { DownloadProxy, DownloadSettings } from '@buddy-shared/network/downloadSettings'
import type { ApplicationSettingsProps } from './typing'
import { downloadSettingsSchema } from '@buddy-shared/network/downloadSettings'
import { NButton, NSwitch, useMessage } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { useSettingMutation } from '../../state/useSettingMutation'
import DesktopSettingRow from '../shared/DesktopSettingRow.vue'
import DesktopDownloadProxyDialog from './DesktopDownloadProxyDialog.vue'
import DesktopDownloadProxyRow from './DesktopDownloadProxyRow.vue'

const props = defineProps<ApplicationSettingsProps>()
const { t } = useBuddyI18n(() => props.language)
const message = useMessage()
const { pending: pendingFields, save: updateSetting } = useSettingMutation<'downloads'>(
  patch => props.updateSettings(patch),
  () => message.error(t('desktop.settings.saveFailed')),
)
const pending = computed(() => pendingFields.value.has('downloads'))
const editing = shallowRef<DownloadProxy | null>(null)
const isNew = shallowRef(false)

async function save(patch: Partial<DownloadSettings>): Promise<boolean> {
  if (!props.config || pending.value)
    return false
  const downloads = downloadSettingsSchema.parse({ ...props.config.downloads, ...patch })
  return updateSetting('downloads', { downloads })
}

function edit(proxy?: Readonly<DownloadProxy>) {
  isNew.value = !proxy
  editing.value = proxy ? { ...proxy } : { id: crypto.randomUUID(), name: '', url: '', enabled: true }
}

async function submit(proxy: DownloadProxy) {
  if (!props.config)
    return
  const proxies = isNew.value
    ? [...props.config.downloads.proxies, proxy]
    : props.config.downloads.proxies.map(item => item.id === proxy.id ? proxy : { ...item })
  if (await save({ proxies }))
    editing.value = null
}

function toggle(id: string, enabled: boolean) {
  void save({ proxies: props.config!.downloads.proxies.map(proxy => ({ ...proxy, enabled: proxy.id === id ? enabled : proxy.enabled })) })
}

function remove(id: string) {
  void save({ proxies: props.config!.downloads.proxies.filter(proxy => proxy.id !== id).map(proxy => ({ ...proxy })) })
}

function move(index: number, direction: -1 | 1) {
  const proxies = props.config!.downloads.proxies.map(proxy => ({ ...proxy }))
  const target = index + direction
  if (target < 0 || target >= proxies.length)
    return
  const moved = proxies.splice(index, 1)[0]!
  proxies.splice(target, 0, moved)
  void save({ proxies })
}
</script>

<template>
  <section v-if="config" class="grid gap-[0.8rem]" data-testid="download-proxy-settings">
    <h2 class="m-0 text-[0.92rem]">
      {{ t('desktop.settings.downloads.title') }}
    </h2>
    <div class="border border-solid border-border rounded-[0.65rem] bg-surface p-[0.9rem]" data-theme-surface="panel">
      <DesktopSettingRow v-slot="{ controlAttrs }" :label="t('desktop.settings.downloads.enabled')" :description="t('desktop.settings.downloads.description')" toggle class="[--setting-row-height:0px] [--setting-row-px:0px] [--setting-row-py:0px]">
        <NSwitch v-bind="controlAttrs" :round="false" :value="config.downloads.enabled" :loading="pending" :disabled="pending" @update:value="save({ enabled: $event })" />
      </DesktopSettingRow>
      <ul v-if="config.downloads.proxies.length" class="m-0 mt-4 list-none p-0">
        <DesktopDownloadProxyRow
          v-for="(proxy, index) in config.downloads.proxies" :key="proxy.id"
          :proxy="proxy" :language="language" :disabled="pending" :first="index === 0" :last="index === config.downloads.proxies.length - 1"
          @toggle="toggle(proxy.id, $event)" @edit="edit(proxy)" @remove="remove(proxy.id)" @move="move(index, $event)"
        />
      </ul>
      <p v-else class="my-4 text-muted text-sm">
        {{ t('desktop.settings.downloads.empty') }}
      </p>
      <div class="mt-3 flex justify-end">
        <NButton size="small" :disabled="pending || config.downloads.proxies.length >= 20" @click="edit()">
          {{ t('desktop.settings.downloads.add') }}
        </NButton>
      </div>
    </div>
    <DesktopDownloadProxyDialog v-if="editing" :proxy="editing" :is-new="isNew" :language="language" :pending="pending" @save="submit" @close="editing = null" />
  </section>
</template>
