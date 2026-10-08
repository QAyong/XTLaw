<script setup lang="ts">
import type { BuddyMessageQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { TextQuote20Regular } from '@vicons/fluent'
import { inject } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import ChatReferenceCard from '../references/ChatReferenceCard.vue'
import { chatQuoteNavigationKey } from './chatQuoteContext'

const props = defineProps<{
  quotes: readonly BuddyMessageQuote[]
  language: BuddyLocale
  removable?: boolean
  disabled?: boolean
  navigate?: (quote: BuddyMessageQuote) => void
}>()
const emit = defineEmits<{ remove: [id: string] }>()
const { t } = useBuddyI18n(() => props.language)
const locate = inject(chatQuoteNavigationKey, null)
</script>

<template>
  <div v-if="quotes.length" class="chat-quote-strip" data-quote-exclude>
    <ChatReferenceCard
      v-for="quote in quotes" :key="quote.id" class="chat-quote-card" :data-quote-id="quote.id"
      :icon="TextQuote20Regular" :label="t(quote.source.role === 'assistant' ? 'desktop.chat.quoteFromAssistant' : 'desktop.chat.quoteFromUser')"
      :text="quote.text" :removable="removable" :disabled="disabled" :remove-label="t('desktop.chat.removeQuote')"
      @navigate="(navigate ?? locate)?.(quote)" @remove="emit('remove', quote.id)"
    />
  </div>
</template>

<style scoped>
.chat-quote-strip { display: flex; min-width: 0; max-width: 100%; gap: 8px; overflow-x: auto; overscroll-behavior-inline: contain; padding-bottom: 6px; }
</style>
