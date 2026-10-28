<script setup lang="ts">
import type { ExtensionMcpConnectorContribution } from '@buddy-shared/extensions/extensionMcpConnectors'
import type { ExtensionSkillContribution } from '@buddy-shared/extensions/extensionSkills'
import type { ExtensionSubagentContribution } from '@buddy-shared/extensions/extensionSubagents'
import { ChevronDown16Regular } from '@vicons/fluent'
import { NButton } from 'naive-ui'
import { computed, shallowRef, useId } from 'vue'
import { BuddyAvatar } from '@/modules/buddies/ui'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { extensionLabels } from '../extensionLabels'

const props = defineProps<{
  agent: ExtensionSubagentContribution
  connectors: ExtensionMcpConnectorContribution[]
  skills: ExtensionSkillContribution[]
  language: string
  disabled: boolean
}>()
const labels = computed(() => extensionLabels(props.language))
const english = computed(() => props.language === 'en-US')
const expanded = shallowRef(false)
const id = useId()
const tools = computed(() => props.agent.tools.map(tool => ({
  id: JSON.stringify(tool),
  name: tool.name,
  source: tool.source === 'builtin'
    ? labels.value.reviewAgentBuiltinTool
    : props.connectors.find(connector => connector.id === tool.connector)?.name ?? tool.connector,
})))
const includedSkills = computed(() => props.agent.skills.map((id) => {
  const contribution = props.skills.find(skill => skill.id === id)
  return { id, name: contribution?.path.split('/').at(-2) ?? id, required: props.agent.requiredSkills.includes(id) }
}))
const summary = computed(() => english.value
  ? `Tools ${tools.value.length} · Skills ${includedSkills.value.length}`
  : `${tools.value.length} 个工具 · ${includedSkills.value.length} 个技能`)
</script>

<template>
  <li class="extension-subagent-review flex min-w-0 flex-col rounded-lg border border-solid border-border bg-surface" :data-subagent-id="agent.id">
    <div class="min-w-0 flex-1 p-3.5">
      <div class="flex items-start gap-2.5">
        <BuddyAvatar class="size-9" data-testid="extension-subagent-avatar" />
        <div class="min-w-0">
          <h4 class="m-0 text-[13px] font-semibold leading-5 text-fg [overflow-wrap:anywhere]">
            {{ agent.name }}
          </h4>
          <p class="m-0 mt-0.5 text-[11px] leading-4 text-muted">
            {{ labels.reviewAgentFiles[agent.fileAccess] }}
          </p>
        </div>
      </div>
      <p v-if="agent.description" class="mt-2 mb-0 text-[12px] leading-[1.6] text-muted [overflow-wrap:anywhere]">
        {{ agent.description }}
      </p>
      <NButton
        text size="small" class="mt-2 text-[12px]"
        :aria-expanded="expanded" :aria-controls="`${id}-details`"
        data-testid="extension-agent-details-toggle"
        @click="expanded = !expanded"
      >
        {{ labels.reviewAgentDetails }}
        <span class="ml-2 text-muted">{{ summary }}</span>
        <DesktopIcon :component="ChevronDown16Regular" :size="14" class="ml-1" :class="{ 'rotate-180': expanded }" aria-hidden="true" />
      </NButton>
      <div v-if="expanded" :id="`${id}-details`" class="mt-2 grid gap-3 border-t border-t-solid border-t-border pt-3 text-[12px]" data-testid="extension-agent-details">
        <div>
          <h5 class="m-0 mb-1 text-[12px] font-medium text-muted">
            {{ labels.reviewAgentTools }}
          </h5>
          <ul v-if="tools.length" class="m-0 grid list-none gap-1.5 p-0">
            <li v-for="tool in tools" :key="tool.id" class="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <code class="text-fg [overflow-wrap:anywhere]">{{ tool.name }}</code>
              <span class="text-muted [overflow-wrap:anywhere]">{{ tool.source }}</span>
            </li>
          </ul>
          <p v-else class="m-0 text-muted">
            {{ labels.reviewAgentNoTools }}
          </p>
        </div>
        <div>
          <h5 class="m-0 mb-1 text-[12px] font-medium text-muted">
            {{ labels.reviewAgentSkills }}
          </h5>
          <ul v-if="includedSkills.length" class="m-0 grid list-none gap-1.5 p-0">
            <li v-for="skill in includedSkills" :key="skill.id" class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span class="text-fg [overflow-wrap:anywhere]">{{ skill.name }}</span>
              <span v-if="skill.required" class="rounded bg-subtle px-1 text-[11px] text-muted">{{ labels.reviewAgentRequiredSkill }}</span>
              <span class="w-full text-[11px] text-muted [overflow-wrap:anywhere]">{{ skill.id }}</span>
            </li>
          </ul>
          <p v-else class="m-0 text-muted">
            {{ labels.reviewAgentNoSkills }}
          </p>
        </div>
      </div>
    </div>
  </li>
</template>
