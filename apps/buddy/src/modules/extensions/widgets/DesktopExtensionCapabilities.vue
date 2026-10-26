<script setup lang="ts">
import type { ExtensionManifest } from '@buddy-shared/extensions/extensionManifest'
import { connectorSetupState, marketSubagentId } from '@buddy-shared/extensions/extensionCapabilities'
import { NButton, NEllipsis, NTag } from 'naive-ui'
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import { useExtensionContext } from '../extensionContext'
import { extensionLabels } from '../extensionLabels'

const props = defineProps<{ manifest: ExtensionManifest, language: string }>()
const { capabilityStatus } = useExtensionContext()
const router = useRouter()
const labels = computed(() => extensionLabels(props.language))
const skills = computed(() => props.manifest.contributes.skills.map(skill => ({ id: skill.id, name: skill.path.split('/').at(-2) ?? skill.id })))
const connectors = computed(() => props.manifest.contributes.mcpConnectors.map((connector) => {
  const record = capabilityStatus?.connectors.value.find(item => item.id === connector.id)
  const state = connectorSetupState(connector, record)
  const tag = { 'needs-setup': ['setupNeeded', 'warning'], 'enabled': ['setupEnabled', 'success'], 'off': ['setupOff', 'default'], 'removed': ['setupRemoved', 'default'] } as const
  return { id: connector.id, name: connector.name, state, label: labels.value[tag[state][0]], type: tag[state][1] }
}))
const subagents = computed(() => props.manifest.contributes.subagents.map((subagent) => {
  const id = marketSubagentId(props.manifest.id, subagent.id)
  const row = capabilityStatus?.buddies.value.find(item => item.id === id)
  const actor = capabilityStatus?.buddies.value.find(item => item.id === capabilityStatus?.defaultBuddyId.value)
  const state = !row ? 'removed' : actor?.settings.npcIds.includes(id) ? 'delegated' : 'idle'
  return { id, name: subagent.name, buddyId: row?.id, label: state === 'removed' ? labels.value.setupRemoved : state === 'delegated' ? labels.value.delegated : labels.value.notDelegated, type: state === 'delegated' ? 'success' as const : 'default' as const }
}))
onMounted(() => void capabilityStatus?.loadConnectors())
</script>

<template>
  <div class="extension-capabilities" data-testid="extension-capabilities">
    <section v-if="skills.length" data-testid="extension-capabilities-skills">
      <h3>{{ labels.capabilitiesSkills }}</h3>
      <ul>
        <li v-for="skill in skills" :key="skill.id">
          <NEllipsis :tooltip="false" class="extension-capabilities__name">
            {{ skill.name }}
          </NEllipsis>
          <NButton size="tiny" quaternary @click="router.push(desktopRouteLocations.skills())">
            {{ labels.manage }}
          </NButton>
        </li>
      </ul>
    </section>
    <section v-if="connectors.length" data-testid="extension-capabilities-mcp">
      <h3>{{ labels.capabilitiesMcp }}</h3>
      <ul>
        <li v-for="connector in connectors" :key="connector.id" :data-connector-id="connector.id">
          <NEllipsis :tooltip="false" class="extension-capabilities__name">
            {{ connector.name }}
          </NEllipsis>
          <NTag size="small" :bordered="false" :type="connector.type" data-testid="extension-connector-state">
            {{ connector.label }}
          </NTag>
          <NButton v-if="connector.state !== 'removed'" size="tiny" :type="connector.state === 'needs-setup' ? 'primary' : 'default'" :quaternary="connector.state !== 'needs-setup'" data-testid="extension-connector-configure" @click="router.push(desktopRouteLocations.mcp())">
            {{ connector.state === 'needs-setup' ? labels.setupConfigure : labels.manage }}
          </NButton>
        </li>
      </ul>
    </section>
    <section v-if="subagents.length" data-testid="extension-capabilities-agents">
      <h3>{{ labels.capabilitiesAgents }}</h3>
      <ul>
        <li v-for="subagent in subagents" :key="subagent.id" :data-subagent-id="subagent.id">
          <NEllipsis :tooltip="false" class="extension-capabilities__name">
            {{ subagent.name }}
          </NEllipsis>
          <NTag size="small" :bordered="false" :type="subagent.type" data-testid="extension-subagent-state">
            {{ subagent.label }}
          </NTag>
          <NButton v-if="subagent.buddyId" size="tiny" quaternary @click="router.push(desktopRouteLocations.buddies(subagent.buddyId))">
            {{ labels.manage }}
          </NButton>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.extension-capabilities { display: grid; gap: 6px; min-width: 0; }
.extension-capabilities h3 { margin: 0; color: var(--buddy-text-secondary); font-size: 11px; font-weight: 600; }
.extension-capabilities ul { display: grid; gap: 2px; margin: 2px 0 0; padding: 0; list-style: none; }
.extension-capabilities li { display: flex; min-width: 0; align-items: center; gap: 6px; font-size: 12px; }
.extension-capabilities__name { min-width: 0; flex: 1; color: var(--buddy-text-primary); }
</style>
