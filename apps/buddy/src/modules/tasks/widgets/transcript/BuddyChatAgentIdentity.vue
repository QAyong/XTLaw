<script setup lang="ts">
import type { ChatTranscriptExecutionStatus } from '../../model/transcript/chatTranscriptTypes'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { BUILTIN_BUDDY_ID } from '@buddy-shared/buddies/buddyApi'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { BuddyAvatar, useBuddyIdentity } from '@/modules/buddies'
import { formatChatRunDuration } from '../../model/transcript/chatRunDuration'
import { useChatActorMention } from './chatActorMentionContext'
import { useChatBuddyId } from './chatBuddyIdentity'

const props = defineProps<{
  as?: 'header' | 'span'
  language: BuddyLocale
  runId?: string | null
  executionStatus?: ChatTranscriptExecutionStatus
}>()

const { t } = useBuddyI18n(() => props.language)
const actorId = useChatBuddyId(() => props.runId, '')
const buddyId = computed(() => actorId.value || BUILTIN_BUDDY_ID)
const buddy = useBuddyIdentity(buddyId)
const mention = useChatActorMention()
const canMention = computed(() => Boolean(actorId.value && buddy.value?.kind === 'actor'
  && buddy.value.enabled && !buddy.value.deletedAt && mention?.canMentionActor(actorId.value)))
function mentionActor() {
  if (canMention.value && buddy.value)
    mention?.mentionActor({ type: 'actor_ref', actorId: actorId.value, name: buddy.value.name })
}
const name = computed(() => buddy.value?.name ?? (buddyId.value === BUILTIN_BUDDY_ID ? t('desktop.chat.agentName') : props.language === 'en-US' ? 'Assistant' : '助手'))
const completed = computed(() => props.executionStatus && props.executionStatus.status !== 'queued' && props.executionStatus.status !== 'running' ? props.executionStatus : null)
const duration = computed(() => completed.value ? formatChatRunDuration(completed.value.startedAt, completed.value.completedAt, Date.now()) : null)
</script>

<template>
  <component :is="props.as ?? 'header'" :data-buddy-id="buddyId" :data-run-id="runId" class="buddy-chat-agent-identity" :class="{ 'has-status': completed }">
    <button
      type="button"
      class="buddy-chat-agent-identity__mention ui-focus-ring"
      :disabled="!canMention"
      @mousedown.prevent
      @click="mentionActor"
    >
      <span class="buddy-chat-agent-identity__avatar">
        <BuddyAvatar :buddy-id="buddyId" :src="buddy?.avatar" />
      </span>
      <span class="buddy-chat-agent-identity__name" :class="{ 'has-mention': canMention }">
        <span class="buddy-chat-agent-identity__label">{{ name }}</span>
        <span v-if="canMention" class="buddy-chat-agent-identity__hint" aria-hidden="true">@</span>
      </span>
    </button>
    <span v-if="completed" class="buddy-chat-agent-identity__status" :class="{ 'is-failed': completed.status === 'failed' }" :data-execution-status-run-id="runId">
      <span class="buddy-chat-agent-identity__status-label">{{ t(`run.status.${completed.status}`) }}</span>
      <span class="buddy-chat-agent-identity__duration">{{ duration }}</span>
    </span>
  </component>
</template>

<style scoped lang="scss">
.buddy-chat-agent-identity {
  display: inline-flex;
  width: fit-content;
  min-width: 0;
  align-items: center;
  gap: var(--buddy-chat-avatar-gap);
}

.buddy-chat-agent-identity__mention {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: var(--buddy-chat-avatar-gap);
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;

  &:enabled {
    cursor: pointer;

    &:hover,
    &:focus-visible {
      color: var(--buddy-accent-text);
    }
  }
}

.buddy-chat-agent-identity__avatar {
  position: relative;
  width: var(--buddy-chat-avatar-size);
  height: var(--buddy-chat-avatar-size);
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50%;
}

.buddy-chat-agent-identity__avatar img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.buddy-chat-agent-identity__name {
  position: relative;
  min-width: 0;
  overflow: hidden;
  color: inherit;
  font: inherit;

  &.has-mention {
    padding-right: 1em;
  }
}

.buddy-chat-agent-identity__label,
.buddy-chat-agent-identity__hint {
  display: block;
  transition: transform calc(var(--buddy-motion-state-duration) * 2) var(--buddy-motion-state-easing);
}

.buddy-chat-agent-identity__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.buddy-chat-agent-identity__hint {
  position: absolute;
  top: 0;
  left: 0;
  width: 1em;
  transform: translateX(-100%);
}

.buddy-chat-agent-identity__mention:enabled:is(:hover, :focus-visible) {
  .buddy-chat-agent-identity__label {
    transform: translateX(1em);
  }

  .buddy-chat-agent-identity__hint {
    transform: translateX(0);
  }
}

.buddy-chat-agent-identity.has-status {
  width: 100%;
}

.buddy-chat-agent-identity__status {
  display: inline-flex;
  flex: none;
  align-items: baseline;
  gap: 6px;
  margin-inline-start: auto;
  color: var(--buddy-text-muted);
  font-size: var(--buddy-chat-tool-font-size);
  line-height: 20px;

  &.is-failed {
    color: var(--buddy-chat-danger-color);
  }
}

.buddy-chat-agent-identity__duration {
  font-variant-numeric: tabular-nums;
}
</style>
