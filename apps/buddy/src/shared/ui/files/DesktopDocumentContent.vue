<script setup lang="ts">
import type { BuddyResourceQuote, BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { FileDocumentMode } from './fileDocumentPresentation'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { CaptureMonacoResourceQuote } from '@/shared/ui/selection/useMonacoResourceQuote'
import { computed, useTemplateRef } from 'vue'
import DesktopMarkdownContent from '@/shared/ui/markdown/DesktopMarkdownContent.vue'
import DesktopMediaPreview from '@/shared/ui/media/DesktopMediaPreview.vue'
import { readResourceTextSelection } from '@/shared/ui/selection/resourceQuoteSelection'
import { useQuoteHighlight } from '@/shared/ui/selection/useQuoteHighlight'
import DesktopMonacoFile from './DesktopMonacoFile.vue'

const props = withDefaults(defineProps<{ mode: FileDocumentMode | null, name: string, text?: string | null, imageUrl?: string | null, mediaKind?: 'audio' | 'video' | null, mediaUrl?: string | null, visible?: boolean, language: BuddyLocale, writeClipboardText: (text: string) => Promise<void>, wrap?: boolean, sourceReady?: boolean, revealSource?: (quote: BuddyTextQuote) => boolean, quoteSource?: BuddyTextQuote['source'], prepareQuote?: (quote: BuddyResourceQuote, x: number, y: number) => (() => void) | null, captureMonacoQuote?: CaptureMonacoResourceQuote }>(), { wrap: true, visible: true })
defineEmits<{ previewError: [] }>()
defineSlots<{ source?: () => unknown, preview?: () => unknown }>()
const markdown = useTemplateRef<HTMLElement>('markdown')
const monaco = useTemplateRef<InstanceType<typeof DesktopMonacoFile>>('monaco')
const highlight = useQuoteHighlight('buddy-resource-quote')
const ready = computed(() => props.mode === 'preview' ? !!markdown.value : props.sourceReady ?? monaco.value?.ready ?? false)
function reveal(quote: BuddyTextQuote) {
  if (props.mode === 'preview')
    return !!markdown.value && highlight.show(markdown.value, quote, markdown.value)
  return props.revealSource?.(quote) ?? monaco.value?.reveal(quote) ?? false
}
defineExpose({ ready, reveal })
function quoteText(event: MouseEvent) {
  if (!props.quoteSource || !props.prepareQuote || !(event.currentTarget instanceof HTMLElement))
    return
  const quote = readResourceTextSelection(event.currentTarget, window.getSelection(), props.quoteSource)
  if (!quote || !(event.target instanceof Node) || !window.getSelection()?.containsNode(event.target, true))
    return
  const show = props.prepareQuote(quote, event.clientX, event.clientY)
  if (show) {
    event.preventDefault()
    show()
  }
}
</script>

<template>
  <div class="desktop-document-content">
    <slot v-if="mode === 'preview' && $slots.preview" name="preview" />
    <DesktopMediaPreview v-else-if="mode === 'preview' && mediaKind && mediaUrl" :kind="mediaKind" :src="mediaUrl" :name="name" :language="language" :visible="visible" />
    <article v-else-if="mode === 'preview' && text != null" ref="markdown" class="desktop-document-content__markdown" @contextmenu="quoteText">
      <DesktopMarkdownContent :content="text" code-overflow="scroll" :language="language" :write-clipboard-text="writeClipboardText" />
    </article>
    <div v-else-if="mode === 'preview' && imageUrl" class="desktop-document-content__image">
      <img :key="imageUrl" :src="imageUrl" :alt="name" @error="$emit('previewError')">
    </div>
    <template v-else-if="(mode === 'source' || mode === 'edit') && text != null">
      <slot name="source">
        <DesktopMonacoFile ref="monaco" :language="language" :text="text" :path="name" :wrap="wrap" :quote-source="quoteSource" :capture-monaco-quote="captureMonacoQuote" />
      </slot>
    </template>
    <div v-else class="desktop-document-content__empty">
      {{ name }}
    </div>
  </div>
</template>

<style scoped>
.desktop-document-content { display: flex; flex: 1; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; background: var(--buddy-surface-base); }
.desktop-document-content__markdown { flex: 1; min-height: 0; overflow: auto; padding: 20px 24px 32px; color: var(--buddy-text-primary); font-family: var(--buddy-font-ui); overflow-wrap: anywhere; --buddy-chat-final-font-size: 0.875rem; --buddy-chat-final-line-height: 1.75; }
.desktop-document-content__image { display: grid; flex: 1; min-height: 0; overflow: auto; padding: 16px; place-items: center; }
.desktop-document-content__markdown :deep(::highlight(buddy-resource-quote)) { background: var(--buddy-accent-solid); color: var(--buddy-text-on-accent); }
.desktop-document-content__image img { max-width: 100%; max-height: 100%; object-fit: contain; }
.desktop-document-content__empty { display: grid; flex: 1; min-height: 0; place-content: center; padding: 24px; overflow-wrap: anywhere; color: var(--buddy-text-muted); font-size: 13px; }
</style>
