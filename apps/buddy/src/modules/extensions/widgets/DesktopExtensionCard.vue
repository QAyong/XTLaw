<script setup lang="ts">
import type { ExtensionStatus, ExtensionUnavailableInstallation } from '@buddy-shared/extensions/extensionApi'
import type { DropdownOption } from 'naive-ui'
import { installedExtensionKinds } from '@buddy-shared/extensions/extensionCapabilities'
import { MoreHorizontal20Regular } from '@vicons/fluent'
import { NButton, NDropdown, NEllipsis, NTag, NTooltip } from 'naive-ui'
import { computed } from 'vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopPluginIcon from '@/shared/ui/icon/DesktopPluginIcon.vue'
import { extensionLabels } from '../extensionLabels'
import DesktopExtensionCapabilities from './DesktopExtensionCapabilities.vue'
import DesktopExtensionCompatibilityHint from './DesktopExtensionCompatibilityHint.vue'
import DesktopExtensionTags from './DesktopExtensionTags.vue'

const props = defineProps<{ item: ExtensionStatus, unavailablePending?: ExtensionUnavailableInstallation, language: string, busy: boolean, canOpen: boolean }>()
const emit = defineEmits<{
  toggle: []
  restart: []
  applyUpdate: []
  diagnostics: []
  remove: []
  open: []
  revokeResources: []
}>()
const labels = computed(() => extensionLabels(props.language))
const kinds = computed(() => installedExtensionKinds(props.item.manifest))
const contributes = computed(() => props.item.manifest.contributes)
// Packages that add skills, connections or sub-agents list them on the card, so it grows past the plain plugin height.
const hasCapabilities = computed(() => !!(contributes.value.skills.length || contributes.value.mcpConnectors.length || contributes.value.subagents.length))
const pending = computed(() => props.item.pending ?? props.unavailablePending)
const warning = computed(() => {
  const issue = props.item.incompatibility ?? pending.value?.incompatibility
  return issue ? { issue, version: props.item.incompatibility ? undefined : pending.value?.manifest.version } : null
})
const status = computed(() => props.item.incompatibility ? (props.language === 'en-US' ? 'Unavailable' : '暂不可用') : labels.value[props.item.state === 'failed' ? 'failedState' : props.item.state])
const actions = computed<DropdownOption[]>(() => {
  const pluginActions: DropdownOption[] = []
  if (props.item.manifest.permissions.localResources)
    pluginActions.push({ key: 'file-access', label: props.language === 'en-US' ? 'File access' : '文件访问', props: { role: 'menuitem' }, children: [{ key: 'revoke-resources', label: props.language === 'en-US' ? 'Revoke all access' : '撤销全部授权', props: { role: 'menuitem' } }] })
  return [
    ...pluginActions,
    ...(pluginActions.length ? [{ key: 'plugin-actions-divider', type: 'divider' as const }] : []),
    ...(props.item.pending && !props.item.pending.incompatibility ? [{ key: 'apply-update', label: labels.value.applyUpdate, props: { 'role': 'menuitem', 'data-testid': 'extension-apply-update-menu' } }] : []),
    { key: 'restart', label: labels.value.restart, disabled: !!props.item.incompatibility, props: { 'role': 'menuitem', 'data-testid': 'extension-restart' } },
    { key: 'diagnostics', label: labels.value.diagnostics, props: { role: 'menuitem' } },
    { key: 'divider', type: 'divider' },
    { key: 'remove', label: labels.value.remove, props: { 'role': 'menuitem', 'data-testid': 'extension-uninstall' } },
  ]
})
function handleAction(key: string | number) {
  if (key === 'restart')
    emit('restart')
  else if (key === 'apply-update')
    emit('applyUpdate')
  else if (key === 'diagnostics')
    emit('diagnostics')
  else if (key === 'remove')
    emit('remove')
  else if (key === 'revoke-resources')
    emit('revokeResources')
}
</script>

<template>
  <article class="extension-card" :data-extension-id="item.manifest.id">
    <header class="extension-card__header">
      <DesktopPluginIcon :src="item.iconUrl" :size="28" />
      <div class="extension-card__identity">
        <h2 class="extension-card__name">
          <NEllipsis :tooltip="false">
            {{ item.manifest.name }}
          </NEllipsis>
        </h2>
        <p class="extension-card__meta">
          <span>{{ item.manifest.version }}</span>
          <NEllipsis :tooltip="false" class="extension-card__author">
            {{ item.manifest.author || (language === 'en-US' ? 'Unsigned' : '未署名') }}
          </NEllipsis>
        </p>
      </div>
      <div class="extension-card__status">
        <NTag size="small" :bordered="false" :type="item.incompatibility || item.state === 'failed' || item.state === 'blocked' ? 'warning' : 'default'">
          {{ status }}
        </NTag>
        <DesktopExtensionCompatibilityHint v-if="warning" :issue="warning.issue" :version="warning.version" :language="language" placement="bottom-end" />
      </div>
    </header>
    <div class="extension-card__body">
      <div class="extension-card__kinds" data-testid="extension-kinds">
        <NTag v-for="kind in kinds" :key="kind" size="small" :bordered="false" :data-kind="kind">
          {{ labels.kinds[kind] }}
        </NTag>
      </div>
      <NEllipsis v-if="item.manifest.description" :tooltip="false" class="extension-card__description" :line-clamp="item.error && !item.incompatibility ? 1 : 2">
        {{ item.manifest.description }}
      </NEllipsis>
      <NEllipsis v-if="item.error && !item.incompatibility" :tooltip="false" :line-clamp="1" class="extension-card__error">
        {{ item.error }}
      </NEllipsis>
    </div>
    <DesktopExtensionCapabilities v-if="hasCapabilities" :manifest="item.manifest" :language="language" />
    <footer class="extension-card__footer">
      <DesktopExtensionTags :tags="item.manifest.tags" />
      <div class="extension-card__actions">
        <NTooltip v-if="pending" :disabled="!!pending.incompatibility">
          <template #trigger>
            <NButton type="primary" size="small" :disabled="busy || !!pending.incompatibility" data-testid="extension-apply-update" @click="emit('applyUpdate')">
              {{ labels.applyUpdate }}
            </NButton>
          </template>
          <div class="extension-card__pending-tooltip">
            <span>{{ language === 'en-US' ? 'New version' : '新版本' }} {{ pending.manifest.version }}</span>
            <span>{{ labels.applyUpdateHint }}</span>
          </div>
        </NTooltip>
        <NButton v-if="canOpen" type="primary" size="small" :secondary="!!pending && !pending.incompatibility" :disabled="busy" @click="emit('open')">
          {{ language === 'en-US' ? 'Open' : '打开' }}
        </NButton>
        <NButton type="primary" :secondary="item.enabled" size="small" :disabled="busy || (!item.enabled && !!item.incompatibility)" :data-testid="item.enabled ? 'extension-disable' : 'extension-enable'" @click="emit('toggle')">
          {{ item.enabled ? labels.disable : labels.enable }}
        </NButton>
        <NDropdown trigger="click" :options="actions" :disabled="busy" @select="handleAction">
          <NButton quaternary size="small" class="extension-card__more" :disabled="busy" :aria-label="labels.more" data-testid="extension-card-more">
            <template #icon>
              <DesktopIcon :component="MoreHorizontal20Regular" :size="16" />
            </template>
          </NButton>
        </NDropdown>
      </div>
    </footer>
  </article>
</template>

<style scoped>
.extension-card { box-sizing: border-box; display: flex; min-height: 200px; min-width: 0; flex-direction: column; gap: 8px; border: 1px solid var(--buddy-border-subtle); border-radius: var(--buddy-radius-micro); background: var(--buddy-surface-base); padding: 16px; }
.extension-card__kinds { display: flex; flex-wrap: wrap; gap: 6px; }
.extension-card__header { display: flex; min-width: 0; flex: none; align-items: flex-start; gap: 12px; }
.extension-card__identity { min-width: 0; flex: 1; }
.extension-card__name { min-width: 0; margin: 0; color: var(--buddy-text-strong); font-size: 14px; font-weight: 600; line-height: 1.5; }
.extension-card__meta { display: flex; min-width: 0; align-items: center; gap: 8px; margin: 4px 0 0; color: var(--buddy-text-secondary); font-size: 11px; }
.extension-card__meta > span:first-child { flex: none; }
.extension-card__author { min-width: 0; }
.extension-card__status { display: flex; flex: none; align-items: center; gap: 4px; }
.extension-card__body { display: grid; min-width: 0; flex: none; gap: 6px; }
.extension-card__description { color: var(--buddy-text-secondary); font-size: 13px; line-height: 1.6; }
.extension-card__error { margin: 0; color: var(--buddy-status-danger-text); font-family: var(--buddy-font-mono); font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.extension-card__footer { display: flex; min-width: 0; flex: none; flex-direction: column; gap: 8px; margin-top: auto; }
.extension-card__actions { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 4px; }
.extension-card__pending-tooltip { display: grid; max-width: 280px; gap: 4px; font-size: 12px; line-height: 1.6; }
.extension-card__more { flex: none; width: 28px; height: 28px; margin-left: auto; padding: 0; }
</style>
