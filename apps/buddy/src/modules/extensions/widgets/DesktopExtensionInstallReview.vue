<script setup lang="ts">
import type { ExtensionReview } from '@buddy-shared/extensions/extensionApi'
import type { FileOpeningChoice, FileOpeningReviewChoice } from '@buddy-shared/files/fileOpening'
import { connectorOfToolsId } from '@buddy-shared/buddies/buddyToolSelection'
import { BUILTIN_CAPABILITY_IDS, subagentConnectorReferences } from '@buddy-shared/extensions/extensionCapabilities'
import { Warning20Regular } from '@vicons/fluent'
import { NButton, NCheckbox, NEllipsis, NModal, NTag } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopPluginIcon from '@/shared/ui/icon/DesktopPluginIcon.vue'
import { extensionLabels } from '../extensionLabels'
import DesktopExtensionFileAssociations from './DesktopExtensionFileAssociations.vue'
import DesktopExtensionReviewPermissions from './DesktopExtensionReviewPermissions.vue'

const props = defineProps<{ review: ExtensionReview, language: string, busy: boolean }>()
const emit = defineEmits<{ cancel: [], install: [applyUpdate: boolean, choices: FileOpeningChoice[]] }>()
const labels = computed(() => extensionLabels(props.language))
const english = computed(() => props.language === 'en-US')
const applyUpdate = shallowRef(true)
const associations = computed(() => props.review.fileAssociations ?? [])
const skills = computed(() => props.review.manifest.contributes.skills.map(skill => ({
  id: skill.id,
  name: skill.path.split('/').at(-2)!,
})))
const dependencies = computed(() => Object.entries(props.review.manifest.dependencies))
const connectors = computed(() => props.review.manifest.contributes.mcpConnectors)
// Every connector a sub-agent's tools reach travels with the package or ships with the application, as the manifest guarantees.
const connectorName = (id: string) => connectors.value.find(connector => connector.id === id)?.name ?? labels.value.builtinConnectors[id] ?? id
function agentTools(selection: { mode: 'all' | 'none' } | { mode: 'selected', ids: string[] }) {
  if (selection.mode !== 'selected')
    return labels.value.reviewAgentTools[selection.mode]
  const whole = selection.ids.flatMap(id => connectorOfToolsId(id) ?? [])
  const single = selection.ids.length - whole.length
  return [
    ...(single ? [labels.value.reviewAgentTools.selected.replace('{n}', String(single))] : []),
    ...whole.map(id => labels.value.reviewAgentToolsConnector.replace('{name}', connectorName(id))),
  ].join('；')
}
const subagents = computed(() => props.review.manifest.contributes.subagents.map(agent => ({
  ...agent,
  tools: agentTools(agent.tools),
  files: labels.value.reviewAgentFiles[agent.fileAccess],
  connectors: subagentConnectorReferences(agent).map((id) => {
    const builtin = !connectors.value.some(connector => connector.id === id) && (BUILTIN_CAPABILITY_IDS.mcp as readonly string[]).includes(id)
    return (builtin ? labels.value.reviewAgentConnectorBuiltin : labels.value.reviewAgentConnectorBundled).replace('{name}', connectorName(id))
  }),
})))
const selectedAssociations = shallowRef(initialAssociations())
function initialAssociations(): FileOpeningChoice[] {
  const selected = new Map<string, FileOpeningReviewChoice>()
  for (const choice of associations.value) {
    const key = `${choice.extension}:${choice.location}`
    if (choice.providerId === choice.currentProviderId || (choice.requestDefault && !selected.has(key)))
      selected.set(key, choice)
  }
  return [...selected.values()]
    .map(({ extension, location, providerId }) => ({ extension, location, providerId }))
}
function install() {
  const changes = selectedAssociations.value.filter(selected => associations.value.some(choice => choice.extension === selected.extension && choice.location === selected.location && choice.providerId === selected.providerId && choice.currentProviderId !== selected.providerId))
  emit('install', applyUpdate.value, changes)
}
const source = computed(() => {
  if (props.review.development)
    return english.value ? 'Development folder' : '开发目录'
  if (!props.review.source)
    return english.value ? 'Local package' : '本地插件包'
  const market = english.value ? 'XTLaw Market' : 'XTLaw 市场'
  const { listing } = props.review
  return listing ? `${market} · ${labels.value.kinds[listing.kind]} · ${labels.value.sources[listing.source]}` : market
})
const title = computed(() => props.review.currentVersion
  ? (english.value ? 'Update plugin' : '更新插件')
  : props.review.listing && props.review.listing.kind !== 'plugin' ? labels.value.installKind[props.review.listing.kind] : (english.value ? 'Install plugin' : '安装插件'))
</script>

<template>
  <NModal
    show
    preset="card"
    :title="title"
    class="extension-install-review"
    content-class="min-h-0 overflow-y-auto overscroll-contain"
    :mask-closable="!busy"
    :closable="!busy"
    :close-on-esc="!busy"
    data-testid="extension-install-review"
    @update:show="value => { if (!value) emit('cancel') }"
  >
    <div class="flex items-center gap-3">
      <span class="grid shrink-0 w-[44px] h-[44px] place-items-center rounded-[10px] text-nav-foreground bg-nav-selected" aria-hidden="true">
        <DesktopPluginIcon :src="review.iconUrl" :size="28" />
      </span>
      <div class="min-w-0">
        <h2 class="m-0 text-fg text-[18px] font-semibold leading-[1.45] [overflow-wrap:anywhere]">
          {{ review.manifest.name }}
        </h2>
        <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          <NEllipsis class="max-w-[220px]" :tooltip="false">
            {{ review.manifest.author || (english ? 'Author not provided' : '未提供作者') }}
          </NEllipsis>
          <span class="[font-variant-numeric:tabular-nums]">
            <template v-if="review.currentVersion">{{ review.currentVersion }} → </template>{{ review.manifest.version }}
          </span>
          <NTag size="small" :bordered="false">
            {{ source }}
          </NTag>
        </div>
      </div>
    </div>
    <p v-if="review.manifest.description" class="mt-3 mb-0 text-muted text-[13px] leading-[1.65] [overflow-wrap:anywhere]">
      {{ review.manifest.description }}
    </p>

    <DesktopExtensionReviewPermissions class="mt-5" :review="review" :language="language" />

    <DesktopExtensionFileAssociations
      v-if="associations.length"
      v-model="selectedAssociations"
      class="mt-5 border-t border-t-solid border-t-border pt-4"
      :associations="associations" :language="language" :busy="busy"
    />

    <section v-if="skills.length" class="mt-4" data-testid="extension-included-skills">
      <div class="flex flex-wrap items-start gap-x-4 gap-y-2">
        <h3 class="m-0 w-[112px] shrink-0 text-[13px] font-medium leading-[1.8] text-muted">
          {{ english ? 'Included skills' : '附带技能' }}
        </h3>
        <ul class="m-0 p-0 flex flex-1 flex-wrap gap-1.5 list-none">
          <li v-for="skill in skills" :key="skill.id" class="min-w-0 max-w-full">
            <span class="inline-block max-w-full rounded-[4px] border border-solid border-border bg-subtle px-2 py-0.5 text-[12px] leading-[1.6] text-fg [overflow-wrap:anywhere]">{{ skill.name }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section v-if="connectors.length" class="mt-4" data-testid="extension-included-mcp">
      <h3 class="m-0 mb-2 text-[13px] font-semibold leading-[1.6] text-fg">
        {{ labels.reviewMcp }}
      </h3>
      <ul class="m-0 p-0 grid gap-3 list-none">
        <li v-for="connector in connectors" :key="connector.id" class="grid gap-0.5 text-fg text-[13px] [overflow-wrap:anywhere]">
          <strong>{{ connector.name }}</strong>
          <span class="text-[12px] text-muted leading-[1.6]">{{ labels.reviewMcpAddress }}：<code>{{ connector.url }}</code></span>
          <span class="text-[12px] text-muted leading-[1.6]">{{ labels.reviewMcpCredential[connector.credential] }} · {{ labels.reviewMcpExposure[connector.deferred ? 'deferred' : 'direct'] }}</span>
        </li>
      </ul>
      <p class="mt-2 mb-0 text-[12px] text-muted leading-[1.6]">
        {{ labels.reviewMcpNoDownload }}
      </p>
    </section>

    <section v-if="subagents.length" class="mt-4" data-testid="extension-included-agents">
      <h3 class="m-0 mb-2 text-[13px] font-semibold leading-[1.6] text-fg">
        {{ labels.reviewAgents }}
      </h3>
      <ul class="m-0 p-0 grid gap-3 list-none">
        <li v-for="agent in subagents" :key="agent.id" class="grid gap-0.5 text-fg text-[13px] [overflow-wrap:anywhere]">
          <strong>{{ agent.name }}</strong>
          <span v-if="agent.description" class="text-[12px] text-muted leading-[1.6]">{{ agent.description }}</span>
          <span class="text-[12px] text-muted leading-[1.6]">{{ agent.tools }} · {{ agent.files }}</span>
          <span v-if="agent.connectors.length" class="text-[12px] text-muted leading-[1.6]">{{ labels.reviewAgentConnectors }}{{ agent.connectors.join('、') }}</span>
        </li>
      </ul>
      <p class="mt-2 mb-0 text-[12px] text-muted leading-[1.6]">
        {{ labels.reviewAgentDelegate }}
      </p>
    </section>

    <section v-if="dependencies.length" class="mt-4">
      <h3 class="m-0 mb-2 text-[13px] font-semibold leading-[1.6] text-fg">
        {{ labels.dependencies }}
      </h3>
      <ul class="m-0 p-0 grid gap-1 list-none">
        <li v-for="[id, range] in dependencies" :key="id" class="text-fg text-[12px] leading-[1.6] [overflow-wrap:anywhere]">
          {{ id }} <span class="text-muted">{{ range }}</span>
        </li>
      </ul>
    </section>

    <div v-if="review.currentVersion" class="mt-4 border-t border-t-solid border-t-border pt-4">
      <NCheckbox v-model:checked="applyUpdate" :disabled="busy">
        {{ labels.applyAfterInstall }}
      </NCheckbox>
      <p v-if="applyUpdate" class="mt-1 mb-0 text-[12px] text-muted leading-[1.6]">
        {{ labels.applyUpdateHint }}
      </p>
    </div>

    <template #footer>
      <div class="flex items-center gap-3">
        <p class="m-0 mr-auto flex min-w-0 flex-1 items-start gap-1.5 text-[12px] font-medium text-warning leading-[1.6]">
          <DesktopIcon class="mt-0.5 shrink-0" :component="Warning20Regular" :size="16" aria-hidden="true" />
          {{ english ? 'Only install plugins from sources you trust.' : '请确认你信任此插件的来源。' }}
        </p>
        <NButton :disabled="busy" @click="emit('cancel')">
          {{ labels.cancel }}
        </NButton>
        <NButton type="primary" :loading="busy" data-testid="extension-confirm-install" @click="install">
          {{ review.currentVersion ? (applyUpdate ? labels.updateAndApply : labels.update) : labels.confirm }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
:global(.extension-install-review) {
  width: min(660px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  border-radius: 12px;
}

.extension-install-review {
  :deep(.n-card-header) {
    flex-shrink: 0;
    padding: 20px 24px 16px;
  }

  :deep(.n-card-header__main) {
    font-size: 16px;
    font-weight: 600;
  }

  :deep(.n-card-content) {
    padding: 4px 24px 20px;
  }

  :deep(.n-card__footer) {
    flex-shrink: 0;
    padding: 14px 24px;
    border-top: 1px solid var(--buddy-border-subtle);
  }
}
</style>
