<script setup lang="ts">
import type { LocalBuddy } from '@buddy-shared/buddies/buddyApi'
import type { BuddySettings } from '@buddy-shared/buddies/buddySettings'
import { connectorOfToolsId, toolSelectionMatcher } from '@buddy-shared/buddies/buddyToolSelection'
import { NAlert, NButton, NSelect } from 'naive-ui'
import { computed, shallowRef, useId } from 'vue'
import { useDesktopUi } from '@/shared/ui/desktopUiContext'
import { useBuddiesContext } from '../buddiesContext'
import { buddyLabels } from '../buddyLabels'
import { useBuddySettingsOptions } from '../state/useBuddySettingsOptions'
import BuddyCapabilitySelection from './BuddyCapabilitySelection.vue'
import BuddyInstructionsEditor from './BuddyInstructionsEditor.vue'
import BuddyModelSelection from './BuddyModelSelection.vue'
import BuddyNpcTeam from './BuddyNpcTeam.vue'
import BuddySettingsSection from './BuddySettingsSection.vue'
import BuddySkillSelectionDialog from './BuddySkillSelectionDialog.vue'
import BuddyToolSelectionDialog from './BuddyToolSelectionDialog.vue'

defineProps<{ buddy: LocalBuddy, disabled: boolean }>()
const { language } = useDesktopUi()
const { buddies } = useBuddiesContext()
const labels = computed(() => buddyLabels(language.value))
const settings = defineModel<BuddySettings>('settings', { required: true })
const { models, providers, skillCatalog, toolCatalog, failed, refresh } = useBuddySettingsOptions()

const showToolDialog = shallowRef(false)
const showSkillDialog = shallowRef(false)
const fileAccessId = useId()

const fileAccessOptions = computed(() => [
  { value: 'inherit', label: labels.value.inheritAccess },
  { value: 'read_only', label: labels.value.readOnlyAccess },
])

// A role can select a whole connector in one id (market sub-agents do), so what is selected is read through the matcher, not by listing ids.
const toolMatcher = computed(() => settings.value.tools.mode === 'selected' ? toolSelectionMatcher(settings.value.tools.ids) : null)
const selectedTools = computed(() => toolCatalog.value.filter(tool => toolMatcher.value?.has(tool.id)))
const toolGroupNames = computed(() => [...new Set(selectedTools.value.map(tool => tool.source.title || tool.source.id))])

const toolSummary = computed(() => {
  if (settings.value.tools.mode === 'all')
    return labels.value.allToolsHint
  if (settings.value.tools.mode === 'none')
    return labels.value.noToolsHint
  const count = toolCatalog.value.length ? selectedTools.value.length : settings.value.tools.ids.length
  return count > 0
    ? labels.value.toolsCount(count, toolGroupNames.value.length)
    : labels.value.selectTools
})

function findSkillName(id: string): string {
  const item = skillCatalog.value.find(s => s.id === id)
  return item?.name ?? id
}

const toolTags = computed(() => {
  if (settings.value.tools.mode !== 'selected')
    return []
  return selectedTools.value.map(t => t.name)
})

function updateToolMode(mode: 'all' | 'selected' | 'none') {
  if (mode === 'selected') {
    const existingIds = settings.value.tools.mode === 'selected' ? settings.value.tools.ids : []
    const initialIds = existingIds.length ? existingIds : toolCatalog.value.map(t => t.id)
    settings.value.tools = { mode: 'selected', ids: initialIds }
    showToolDialog.value = true
  }
  else {
    settings.value.tools = { mode }
  }
}

// The dialog lists single tools, so a connector-wide id is shown as the tools it covers; saving writes them out one by one.
const dialogSelectedIds = computed(() => settings.value.tools.mode === 'selected'
  ? [...new Set([...settings.value.tools.ids.filter(id => connectorOfToolsId(id) === null), ...selectedTools.value.map(tool => tool.id)])]
  : [])

function onSaveTools(ids: string[]) {
  if (!ids.length)
    settings.value.tools = { mode: 'none' }
  else
    settings.value.tools = { mode: 'selected', ids }
}

const skillSummary = computed(() => {
  if (settings.value.skills.mode === 'all')
    return labels.value.allSkillsHint
  if (settings.value.skills.mode === 'none')
    return labels.value.noSkillsHint
  return ''
})

const skillTags = computed(() => {
  if (settings.value.skills.mode !== 'selected')
    return []
  return settings.value.skills.ids.map((id) => {
    const name = findSkillName(id)
    const isRequired = settings.value.requiredSkills.includes(id)
    return isRequired ? `⚡ ${name}` : name
  })
})

function updateSkillMode(mode: 'all' | 'selected' | 'none') {
  if (mode === 'selected') {
    const existingIds = settings.value.skills.mode === 'selected' ? settings.value.skills.ids : []
    const initialIds = existingIds.length ? existingIds : skillCatalog.value.filter(s => s.status === 'available').map(s => s.id)
    settings.value.skills = { mode: 'selected', ids: initialIds }
    showSkillDialog.value = true
  }
  else {
    settings.value.skills = { mode }
    if (mode === 'none')
      settings.value.requiredSkills = []
  }
}

function onSaveSkills(selectedIds: string[], requiredIds: string[]) {
  if (settings.value.skills.mode === 'all') {
    settings.value.requiredSkills = requiredIds
  }
  else {
    if (!selectedIds.length) {
      settings.value.skills = { mode: 'none' }
      settings.value.requiredSkills = []
    }
    else {
      settings.value.skills = { mode: 'selected', ids: selectedIds }
      settings.value.requiredSkills = requiredIds.filter(id => selectedIds.includes(id))
    }
  }
}
</script>

<template>
  <div data-testid="buddy-settings">
    <NAlert v-if="failed" class="mb-4" :show-icon="false" type="warning">
      {{ labels.optionsFailed }} <NButton text @click="refresh">
        {{ labels.retry }}
      </NButton>
    </NAlert>
    <div
      class="buddy-settings-columns grid items-start gap-5"
      :class="{ 'is-npc': buddy.kind === 'npc' }"
    >
      <div class="grid min-w-0 gap-5">
        <BuddySettingsSection v-slot="{ headingId }" :heading="labels.instructions">
          <BuddyInstructionsEditor
            v-model="settings.instructions"
            :labelled-by="headingId"
            :placeholder="labels.instructionsPlaceholder"
            :disabled="disabled"
          />
        </BuddySettingsSection>

        <BuddySettingsSection :heading="labels.capabilities">
          <BuddyModelSelection
            v-model="settings.model"
            :kind="buddy.kind"
            :models="models"
            :providers="providers"
            :disabled="disabled"
          />
          <div class="buddy-capability-columns grid min-w-0">
            <BuddyCapabilitySelection
              :label="labels.tools"
              :description="labels.toolsHint"
              :mode="settings.tools.mode"
              :summary="toolSummary"
              :tags="toolTags"
              :configure-label="labels.configureTools"
              :disabled="disabled"
              @update:mode="updateToolMode"
              @configure="showToolDialog = true"
            />

            <BuddyCapabilitySelection
              :label="labels.availableSkills"
              :description="labels.skillsHint"
              :mode="settings.skills.mode"
              :summary="skillSummary"
              :tags="skillTags"
              :configure-label="labels.configureSkills"
              :disabled="disabled"
              @update:mode="updateSkillMode"
              @configure="showSkillDialog = true"
            />
          </div>
          <div class="flex flex-wrap items-center justify-between gap-4 border-t border-t-solid border-t-border px-4 py-3">
            <div class="min-w-0 flex-1 basis-40">
              <span :id="fileAccessId" class="text-[13px] font-600 text-fg">{{ labels.fileWriteAccess }}</span>
              <p :id="`${fileAccessId}-hint`" class="m-0 mt-1 text-[12px] text-muted leading-relaxed">
                {{ labels.fileAccessHint }}
              </p>
            </div>
            <NSelect
              v-model:value="settings.limits.fileAccess"
              class="w-[min(100%,15rem)]"
              :input-props="{ 'aria-labelledby': fileAccessId, 'aria-describedby': `${fileAccessId}-hint` }"
              :options="fileAccessOptions"
              :disabled="disabled"
            />
          </div>
        </BuddySettingsSection>
      </div>

      <div v-if="buddy.kind === 'actor'" class="grid min-w-0 gap-4">
        <BuddyNpcTeam
          v-model:enabled="settings.npcTeamEnabled"
          v-model:npc-ids="settings.npcIds"
          v-model:concurrency="settings.npcConcurrency"
          :buddies="buddies"
          :disabled="disabled"
        />
      </div>
    </div>

    <BuddyToolSelectionDialog
      v-model:show="showToolDialog"
      :tool-catalog="toolCatalog"
      :selected-ids="dialogSelectedIds"
      :disabled="disabled"
      @save="onSaveTools"
    />

    <BuddySkillSelectionDialog
      v-model:show="showSkillDialog"
      :skill-catalog="skillCatalog"
      :selected-skill-ids="settings.skills.mode === 'selected' ? settings.skills.ids : skillCatalog.map(s => s.id)"
      :required-skill-ids="settings.requiredSkills"
      :disabled="disabled"
      @save="onSaveSkills"
    />
  </div>
</template>

<style scoped lang="scss">
.buddy-settings-columns {
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);

  &.is-npc {
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
  }

  @container (max-width: 860px) {
    grid-template-columns: minmax(0, 1fr);
  }
}

.buddy-capability-columns {
  grid-template-columns: repeat(2, minmax(0, 1fr));

  > :last-child {
    border-left: 1px solid var(--buddy-border-subtle);
  }

  @container buddy-section (max-width: 480px) {
    grid-template-columns: minmax(0, 1fr);

    > :last-child {
      border-left: 0;
      border-top: 1px solid var(--buddy-border-subtle);
    }
  }
}
</style>
