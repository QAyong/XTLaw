<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { TaskChatWorkspace } from '@/modules/tasks/contracts'
import type { ResourceOpenTarget } from '@/modules/tasks/model/context-panel/resourceOpenTarget'
import { Folder20Regular } from '@vicons/fluent'
import { NDropdown, useMessage } from 'naive-ui'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{
  target: ResourceOpenTarget | null
  context: Pick<TaskChatWorkspace['context'], 'files' | 'openArtifact'>
  language: BuddyLocale
}>()
const { t } = useBuddyI18n(() => props.language)
const message = useMessage()
const menuOpen = shallowRef(false)
const busy = shallowRef(false)
const needsApplication = shallowRef(false)
let disposed = false
let generation = 0
onScopeDispose(() => {
  disposed = true
  generation++
})
watch(() => props.target?.key, () => {
  generation++
  menuOpen.value = false
  needsApplication.value = false
}, { flush: 'sync' })
const options = computed<DropdownOption[]>(() => [
  { key: 'open', label: t('desktop.context.openExternal'), disabled: busy.value },
  { key: 'reveal', label: t('desktop.context.revealResource'), disabled: busy.value },
  ...(needsApplication.value && props.target?.kind === 'artifact' && props.target.file
    ? [{ key: 'choose-app', label: t('desktop.context.chooseApplication'), disabled: busy.value }]
    : []),
])
async function execute(action: string) {
  const target = props.target
  if (!target || busy.value || !['open', 'reveal', 'choose-app'].includes(action))
    return
  if (action === 'choose-app' && (!needsApplication.value || target.kind !== 'artifact' || !target.file))
    return
  const version = generation
  menuOpen.value = false
  busy.value = true
  try {
    if (target.kind === 'directory') {
      await props.context.files.revealFile({ ...target.directory })
    }
    else {
      const result = await props.context.openArtifact({ ...target.artifact, action: action as 'open' | 'reveal' | 'choose-app' })
      if (!disposed && version === generation) {
        if (result.status === 'choose-app') {
          needsApplication.value = true
          message.warning(t('desktop.context.chooseApplicationHint'))
          menuOpen.value = true
        }
        else if (action !== 'reveal' && result.status !== 'cancelled') {
          needsApplication.value = false
        }
      }
    }
  }
  catch {
    if (!disposed && version === generation)
      message.error(t(action === 'reveal' ? 'desktop.context.fileRevealFailed' : 'desktop.context.openFailed'))
  }
  finally {
    if (!disposed)
      busy.value = false
  }
}
</script>

<template>
  <NDropdown v-model:show="menuOpen" trigger="click" placement="bottom-end" size="small" :options="options" :disabled="!target || busy" @select="execute">
    <button class="desktop-resource-open" :class="{ 'is-open': menuOpen }" type="button" data-testid="resource-open-menu" :disabled="!target || busy" :aria-label="t('desktop.context.openCurrentResource')" :title="t('desktop.context.openCurrentResource')" aria-haspopup="menu" :aria-expanded="menuOpen">
      <DesktopIcon :component="Folder20Regular" />
    </button>
  </NDropdown>
</template>

<style scoped>
.desktop-resource-open { display: grid; width: 2rem; height: 2rem; flex: none; place-items: center; padding: 0; border: 0; border-radius: var(--buddy-icon-button-radius); background: transparent; color: var(--buddy-text-secondary); cursor: pointer; }
.desktop-resource-open:hover:not(:disabled), .desktop-resource-open.is-open { background: var(--buddy-state-hover); color: var(--buddy-text-strong); }
.desktop-resource-open:disabled { color: var(--buddy-text-muted); cursor: default; }
.desktop-resource-open:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: -2px; }
</style>
