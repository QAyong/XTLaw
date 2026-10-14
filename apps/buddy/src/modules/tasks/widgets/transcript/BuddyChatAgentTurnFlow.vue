<script setup lang="ts">
import type { ChatAgentTurnNode } from '../../model/transcript/chatStreamingMessage'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronRight20Regular, Thinking20Regular } from '@vicons/fluent'
import { computed, shallowReactive, shallowRef, useId } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { createChatAgentActivityProjector } from '../../model/transcript/chatAgentActivities'
import BuddyChatActivityGroup from './BuddyChatActivityGroup.vue'
import BuddyChatCompactionRow from './BuddyChatCompactionRow.vue'
import BuddyChatNarrationBody from './BuddyChatNarrationBody.vue'
import BuddyChatPanelGroup from './BuddyChatPanelGroup.vue'
import { useChatActivityNavigation } from './useChatActivityNavigation'

const props = defineProps<{
  active?: boolean
  collapsed?: boolean
  completed?: boolean
  disclosureId?: string
  duration?: string
  failureDetailText: string | null
  language: BuddyLocale
  nodes: ReadonlyArray<ChatAgentTurnNode>
  statusLabel?: string
  topToggle?: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()

const { t } = useBuddyI18n(() => props.language)
const rowProjector = createChatAgentActivityProjector()
const openEntries = shallowReactive(new Map<string, boolean>())
const standaloneCollapsed = shallowRef(false)
const standaloneDisclosureId = useId()
const effectiveCollapsed = computed(() => props.collapsed ?? standaloneCollapsed.value)
const disclosureId = computed(() => props.disclosureId ?? standaloneDisclosureId)
function toggleEntry(id: string) {
  openEntries.set(id, !openEntries.get(id))
}
function toggleDisclosure() {
  if (props.collapsed !== undefined)
    emit('toggle')
  else
    standaloneCollapsed.value = !standaloneCollapsed.value
}
const rows = computed(() => rowProjector.project(props.nodes))
const summary = computed(() => props.active
  ? t('desktop.chat.processReasoningRunning')
  : props.completed && props.duration
    ? `${props.statusLabel ?? t('desktop.chat.processSummary')} · ${props.duration}`
    : props.statusLabel ?? t('desktop.chat.processSummary'))
const navigation = useChatActivityNavigation()
function revealActivity(nodeId: string) {
  const group = rows.value.find(row => row.kind === 'activity-group' && row.nodes.some(node => node.id === nodeId))
  if (group)
    navigation.reveal(group.id, nodeId)
}
defineExpose({ revealActivity })
</script>

<template>
  <div v-show="!topToggle || !effectiveCollapsed" class="buddy-chat-agent-turn__flow" :class="{ 'is-top-toggle': topToggle }">
    <button
      v-if="!topToggle && rows.length"
      class="buddy-chat-agent-turn__process-toggle buddy-chat-activity-row"
      type="button"
      :aria-expanded="!effectiveCollapsed"
      :aria-controls="disclosureId"
      @click="toggleDisclosure"
    >
      <DesktopIcon :component="Thinking20Regular" class="buddy-chat-activity-row__icon" aria-hidden="true" />
      <span class="buddy-chat-activity-row__label">{{ summary }}</span>
      <DesktopIcon :component="ChevronRight20Regular" class="buddy-chat-activity-row__chevron" :class="{ 'is-open': !effectiveCollapsed }" aria-hidden="true" />
    </button>
    <div v-show="!effectiveCollapsed" :id="disclosureId" class="buddy-chat-agent-turn__process-content">
      <template v-for="row in rows" :key="row.id">
        <BuddyChatActivityGroup
          v-if="row.kind === 'activity-group'"
          :ref="view => navigation.register(row.id, view)"
          :group="row"
          :language="language"
          :open-entries="openEntries"
          @toggle-entry="toggleEntry"
          @open-entry="openEntries.set($event, true)"
        />
        <BuddyChatCompactionRow
          v-else-if="row.kind === 'compaction' && row.status !== 'running'"
          :language="language"
          :node="row"
        />
        <BuddyChatNarrationBody
          v-else-if="row.kind === 'text'"
          :language="language"
          :text="row.text"
        />
        <BuddyChatPanelGroup v-else-if="row.kind === 'panel-group'" :group="row" :language="language" />
      </template>
    </div>
    <p v-if="failureDetailText" class="buddy-chat-agent-turn__failure-detail">
      <span>{{ t('desktop.chat.failureDetail') }}</span>
      {{ failureDetailText }}
    </p>
  </div>
</template>

<style scoped lang="scss">
@use './chatActivityRow' as activity;

@include activity.header;

.buddy-chat-agent-turn__flow {
  display: grid;
  min-width: 0;
  gap: 6px;
  margin-top: var(--buddy-chat-gap-block);
}

.buddy-chat-agent-turn__process-toggle {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  justify-content: flex-start;
  margin-inline: -4px;
  padding: 3px 4px;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: var(--buddy-chat-process-color);
  font: inherit;
  text-align: start;
  cursor: pointer;

  &:hover {
    background: var(--buddy-state-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: 2px;
  }
}

.buddy-chat-agent-turn__process-content {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding-top: 6px;
}

.buddy-chat-agent-turn__flow.is-top-toggle .buddy-chat-agent-turn__process-content {
  padding-top: 0;
}

.buddy-chat-agent-turn__failure-detail {
  margin: 0;
  color: var(--buddy-chat-meta-color);
  font-size: var(--buddy-chat-meta-font-size);
  line-height: var(--buddy-chat-meta-line-height);
  overflow-wrap: anywhere;
  white-space: pre-wrap;

  span {
    color: var(--buddy-chat-process-color);
    font-weight: 600;
  }
}
</style>
