<script setup lang="ts">
import type { DesktopArtifactOpening, LexoraConfigPatch } from '@buddy-electron/shared/desktopApi'
import { NSelect, useMessage } from 'naive-ui'
import { computed, shallowRef, useId } from 'vue'
import { useSettingsContext } from '../../settingsContext'

const { applicationSettings: { config, language, updateSettings } } = useSettingsContext()
const message = useMessage()
const labelId = useId()
const pending = shallowRef(false)
const english = computed(() => language.value === 'en-US')
const options = computed<{ label: string, value: DesktopArtifactOpening }[]>(() => [
  { label: english.value ? 'File manager' : '文件管理器', value: 'file-manager' },
  { label: english.value ? 'Output panel' : '产出面板', value: 'panel' },
])

async function save(patch: LexoraConfigPatch) {
  if (pending.value)
    return
  pending.value = true
  try {
    if (!await updateSettings(patch))
      message.error(english.value ? 'Could not save the setting.' : '保存设置失败。')
  }
  finally { pending.value = false }
}
</script>

<template>
  <div v-if="config" class="desktop-artifact-opening-setting" data-testid="artifact-opening-setting">
    <div class="desktop-artifact-opening-setting__copy">
      <strong :id="labelId">{{ english ? 'Open output cards in' : '产出卡片打开位置' }}</strong>
      <small>{{ english ? 'Files and folders inside the task space open in the file manager by default. Outputs outside the space always open in the output panel.' : '任务空间内的文件和文件夹默认在文件管理器中打开；不在空间内的产出始终在产出面板中打开。' }}</small>
    </div>
    <NSelect :aria-labelledby="labelId" :options="options" :value="config.desktop.artifactOpening" :disabled="pending" @update:value="save({ desktop: { artifactOpening: $event } })" />
  </div>
</template>

<style scoped>
.desktop-artifact-opening-setting { display: grid; grid-template-columns: minmax(0, 1fr) minmax(10rem, 19rem); align-items: center; gap: 2rem; }
.desktop-artifact-opening-setting__copy { display: grid; gap: 0.25rem; }
.desktop-artifact-opening-setting strong { color: var(--buddy-text-primary); font-size: 0.8rem; font-weight: 600; }
.desktop-artifact-opening-setting small { color: var(--buddy-text-secondary); font-size: 0.7rem; line-height: 1.5; }
@container (max-width: 560px) { .desktop-artifact-opening-setting { grid-template-columns: minmax(0, 1fr); gap: 0.7rem; } }
</style>
