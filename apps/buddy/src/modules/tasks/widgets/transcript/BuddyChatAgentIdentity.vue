<script setup lang="ts">
import type { ChatTranscriptExecutionStatus } from '../../model/transcript/chatTranscriptTypes'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { BUILTIN_BUDDY_ID } from '@buddy-shared/buddies/buddyApi'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { BuddyAvatar, useBuddyIdentity } from '@/modules/buddies'
import { formatChatRunDuration } from '../../model/transcript/chatRunDuration'
import { useChatBuddyId } from './chatBuddyIdentity'

const props = defineProps<{
  as?: 'header' | 'span'
  language: BuddyLocale
  runId?: string | null
  executionStatus?: ChatTranscriptExecutionStatus
}>()

const { t } = useBuddyI18n(() => props.language)
const buddyId = useChatBuddyId(() => props.runId)
const buddy = useBuddyIdentity(buddyId)
const name = computed(() => buddy.value?.name ?? (buddyId.value === BUILTIN_BUDDY_ID ? t('desktop.chat.agentName') : props.language === 'en-US' ? 'Assistant' : '助手'))
const completed = computed(() => props.executionStatus && props.executionStatus.status !== 'queued' && props.executionStatus.status !== 'running' ? props.executionStatus : null)
const duration = computed(() => completed.value ? formatChatRunDuration(completed.value.startedAt, completed.value.completedAt, Date.now()) : null)
</script>

<template>
  <component :is="props.as ?? 'header'" :data-buddy-id="buddyId" :data-run-id="runId" class="buddy-chat-agent-identity" :class="{ 'has-status': completed }">
    <span class="buddy-chat-agent-identity__avatar">
      <BuddyAvatar :buddy-id="buddyId" :src="buddy?.avatar" />
    </span>
    <span class="buddy-chat-agent-identity__name">
      {{ name }}
    </span>
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
  min-width: 0;
  color: inherit;
  font: inherit;
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
