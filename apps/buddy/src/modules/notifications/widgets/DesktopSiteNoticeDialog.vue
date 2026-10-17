<script setup lang="ts">
import type { DesktopSiteNotification } from '@buddy-electron/shared/siteFeed'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ArrowUpRight20Regular, BookOpen20Regular, Heart20Regular, Megaphone20Regular } from '@vicons/fluent'
import { NButton, NModal, NScrollbar } from 'naive-ui'
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopMarkdownContent from '@/shared/ui/markdown/DesktopMarkdownContent.vue'

const props = defineProps<{
  language: BuddyLocale
  notice: DesktopSiteNotification | null
  pending: boolean
  show: boolean
  writeClipboardText: (text: string) => Promise<void>
}>()
const emit = defineEmits<{
  'openLink': [itemId: string]
  'update:show': [show: boolean]
}>()

const { t } = useBuddyI18n(() => props.language)
const icons = { announcement: Megaphone20Regular, sponsor: Heart20Regular, tutorial: BookOpen20Regular } as const
const category = computed(() => props.notice?.payload.category ?? 'announcement')
const published = computed(() => props.notice
  ? new Intl.DateTimeFormat(props.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(props.notice.occurredAt))
  : '')
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="desktop-site-notice-dialog"
    :style="{ width: 'min(36rem, calc(100vw - 2rem))', maxHeight: 'calc(100vh - 2rem)' }"
    content-class="min-h-0 flex flex-col"
    :title="t(`desktop.notifications.siteCategory.${category}`)"
    :auto-focus="false"
    @update:show="emit('update:show', $event)"
  >
    <template v-if="notice">
      <header class="desktop-site-notice-dialog__header">
        <div class="desktop-site-notice-dialog__icon">
          <DesktopIcon :component="icons[category]" :size="22" aria-hidden="true" />
        </div>
        <div class="desktop-site-notice-dialog__copy">
          <h2>{{ notice.payload.title }}</h2>
          <p>{{ published }}</p>
        </div>
      </header>
      <p v-if="notice.payload.summary" class="desktop-site-notice-dialog__summary">
        {{ notice.payload.summary }}
      </p>
      <NScrollbar
        v-if="notice.payload.body"
        :key="notice.id"
        class="min-h-0"
        style="max-height: min(50vh, 30rem)"
      >
        <section class="desktop-site-notice-dialog__body" tabindex="0">
          <DesktopMarkdownContent
            :content="notice.payload.body"
            :allow-images="false"
            :language="language"
            :write-clipboard-text="writeClipboardText"
            code-overflow="scroll"
          />
        </section>
      </NScrollbar>
    </template>

    <template #footer>
      <div class="desktop-site-notice-dialog__actions">
        <NButton @click="emit('update:show', false)">
          {{ t('common.close') }}
        </NButton>
        <NButton type="primary" :disabled="pending || !notice" @click="notice && emit('openLink', notice.payload.itemId)">
          <template #icon>
            <DesktopIcon :component="ArrowUpRight20Regular" :size="16" />
          </template>
          {{ t('desktop.notifications.siteOpenInBrowser') }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.desktop-site-notice-dialog__header {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: none;
  padding: 2px 0 12px;
}

.desktop-site-notice-dialog__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 44px;
  height: 44px;
  border: 1px solid var(--buddy-accent-border, transparent);
  border-radius: 12px;
  background: var(--buddy-accent-surface);
  color: var(--buddy-accent-text);
}

.desktop-site-notice-dialog__copy {
  min-width: 0;
  flex: 1;
}

.desktop-site-notice-dialog__copy h2 {
  margin: 0;
  color: var(--buddy-text-strong);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.desktop-site-notice-dialog__copy p {
  margin: 3px 0 0;
  color: var(--buddy-text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.desktop-site-notice-dialog__summary {
  margin: 0 0 12px;
  color: var(--buddy-text-primary);
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}

.desktop-site-notice-dialog__body {
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 8px;
  background: var(--buddy-surface-raised);
  color: var(--buddy-text-primary);
  padding: 12px 14px;
  overflow-wrap: anywhere;
  --buddy-chat-final-font-size: 13px;
  --buddy-chat-final-line-height: 1.7;
}

.desktop-site-notice-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
</style>
