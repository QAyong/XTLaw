<script setup lang="ts">
import type { BuddyResourceQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { Document20Regular, Globe20Regular } from '@vicons/fluent'
import { NButton, NPopover, useMessage } from 'naive-ui'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { FileIcon } from '@/shared/ui/file-icon'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import ReferenceCard from './ReferenceCard.vue'
import { useSelectionReferences } from './workbenchSelectionReferences'

const props = defineProps<{ quotes: readonly BuddyResourceQuote[], language: BuddyLocale, removable?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ remove: [id: string] }>()
const { t } = useBuddyI18n(() => props.language)
const references = useSelectionReferences()
const message = useMessage()
const expanded = shallowRef(false)
const locating = shallowRef<string | null>(null)
let mounted = true
const highlighted = shallowRef<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
const shown = computed(() => expanded.value ? props.quotes : props.quotes.slice(0, 3))
watch(() => props.quotes.map(quote => quote.id), (ids, previous) => {
  if (!props.removable)
    return
  const added = ids.find(id => !previous.includes(id))
  if (added) {
    clearTimeout(timer)
    highlighted.value = added
    timer = setTimeout(() => highlighted.value = null, 1400)
    if (ids.indexOf(added) >= 3)
      expanded.value = true
  }
})
onBeforeUnmount(() => {
  mounted = false
  clearTimeout(timer)
})
function label(quote: BuddyResourceQuote) {
  if ('element' in quote)
    return quote.source.title
  const title = quote.source.kind === 'artifact' ? `${t('desktop.chat.turnOutputs')} · ${quote.source.title}` : quote.source.title
  return `${title}${quote.range ? ` · L${quote.range.startLineNumber}–${quote.range.endLineNumber}` : ''}`
}
async function locate(quote: BuddyResourceQuote) {
  locating.value = quote.id
  try {
    const found = await references?.locate(quote)
    if (mounted && !found)
      message.info(t('desktop.chat.resourceQuoteSourceUnavailable'))
  }
  finally {
    if (locating.value === quote.id)
      locating.value = null
  }
}
</script>

<template>
  <div v-if="quotes.length" class="resource-quote-strip flex flex-wrap min-w-0 max-w-full max-h-[180px] gap-2 overflow-auto pb-[6px]" data-quote-exclude>
    <NPopover v-for="quote in shown" :key="quote.id" trigger="click" placement="top-start" :show-arrow="false">
      <template #trigger>
        <ReferenceCard
          class="resource-quote-card" :class="{ 'is-highlighted': highlighted === quote.id }" :data-resource-quote-id="quote.id"
          :icon="'element' in quote ? Globe20Regular : Document20Regular" :label="label(quote)" :text="quote.text"
          :removable="removable" :disabled="disabled" :remove-label="t('desktop.chat.removeQuote')"
          :action-label="t('desktop.chat.resourceQuotePreview', { title: label(quote) })" @remove="emit('remove', quote.id)"
        >
          <template v-if="!('element' in quote)" #icon>
            <FileIcon :name="quote.source.title" class="flex-none mt-[2px]" />
          </template>
        </ReferenceCard>
      </template>
      <section class="resource-quote-preview w-[min(400px,_calc(100vw_-_48px))] max-w-full text-fg" :aria-label="t('desktop.chat.resourceQuotePreview', { title: label(quote) })">
        <header class="flex items-center gap-2 text-[13px] font-600">
          <DesktopIcon v-if="'element' in quote" :component="Globe20Regular" class="flex-none text-muted" />
          <FileIcon v-else :name="quote.source.title" class="flex-none" />
          <span class="min-w-0 [overflow-wrap:anywhere]">{{ label(quote) }}</span>
        </header>
        <p class="my-2 text-[12px] leading-[1.5] text-muted [overflow-wrap:anywhere]">
          {{ 'element' in quote ? quote.source.url : quote.source.kind === 'file' ? quote.source.file.path : quote.source.path }}
        </p>
        <div v-if="'element' in quote" class="flex items-center justify-between gap-3 mb-3 text-[12px] text-muted">
          <code class="truncate rounded-micro bg-subtle px-[6px] py-[2px] font-mono text-fg">{{ quote.element.tagName }}{{ quote.element.attributes.id ? `#${quote.element.attributes.id}` : '' }}</code>
          <span class="flex-none tabular-nums">{{ Math.round(quote.element.rect.width) }} × {{ Math.round(quote.element.rect.height) }}</span>
        </div>
        <pre class="max-h-[min(320px,_45vh)] overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere] border-y border-y-solid border-y-border py-3 my-3 text-[length:var(--buddy-chat-user-font-size)] leading-[var(--buddy-chat-user-line-height)] select-text" :class="!('element' in quote) && quote.range ? 'font-mono' : '[font-family:var(--buddy-font-body)]'">{{ quote.text }}</pre>
        <NButton v-if="references" size="small" secondary :loading="locating === quote.id" :disabled="locating !== null" @click="locate(quote)">
          {{ t('desktop.chat.resourceQuoteLocate') }}
        </NButton>
      </section>
    </NPopover>
    <NButton v-if="quotes.length > 3" class="self-center" size="tiny" quaternary @click="expanded = !expanded">
      {{ expanded ? t('desktop.chat.resourceQuoteCollapse') : t('desktop.chat.resourceQuoteMore', { count: quotes.length - 3 }) }}
    </NButton>
  </div>
</template>

<style scoped lang="scss">
.resource-quote-strip {
  overscroll-behavior: contain;
}
.resource-quote-card.is-highlighted {
  border-color: var(--buddy-accent-text);
}
</style>
