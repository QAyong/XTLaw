<script setup lang="ts">
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { BUILTIN_BUDDY_ID } from '@buddy-shared/buddies/buddyApi'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { BuddyAvatar, useBuddyIdentity } from '@/modules/buddies'
import { useChatBuddyId } from './chatBuddyIdentity'

const props = defineProps<{
  as?: 'header' | 'span'
  language: BuddyLocale
  runId?: string | null
}>()

const { t } = useBuddyI18n(() => props.language)
const buddyId = useChatBuddyId(() => props.runId)
const buddy = useBuddyIdentity(buddyId)
const name = computed(() => buddy.value?.name ?? (buddyId.value === BUILTIN_BUDDY_ID ? t('desktop.chat.agentName') : props.language === 'en-US' ? 'Assistant' : '助手'))
</script>

<template>
  <component :is="props.as ?? 'header'" :data-buddy-id="buddyId" class="buddy-chat-agent-identity">
    <span class="buddy-chat-agent-identity__avatar">
      <BuddyAvatar :buddy-id="buddyId" :src="buddy?.avatar" />
    </span>
    <span class="buddy-chat-agent-identity__name">
      {{ name }}
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
</style>
