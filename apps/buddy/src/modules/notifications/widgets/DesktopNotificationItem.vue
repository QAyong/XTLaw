<script setup lang="ts">
import type { DesktopNotification } from '../contracts'

import type { BuddyLocale } from '@/i18n/buddyI18n'
import { BUILTIN_BUDDY_ID } from '@buddy-shared/buddies/buddyApi'
import { ArrowDownload20Regular, BookOpen20Regular, Bot20Regular, CheckmarkCircle12Filled, Heart20Regular, Megaphone20Regular, Warning12Filled } from '@vicons/fluent'
import { computed } from 'vue'

import { useBuddyI18n } from '@/i18n/buddyI18n'
import { BuddyAvatar, useBuddyIdentity } from '@/modules/buddies'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{
  language: BuddyLocale
  notification: DesktopNotification
}>()
const emit = defineEmits<{
  open: [notification: DesktopNotification]
}>()
const { t } = useBuddyI18n(() => props.language)
const dateFormatter = computed(() => new Intl.DateTimeFormat(props.language, {
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
}))
const title = computed(() => {
  if (props.notification.kind === 'site.notice')
    return props.notification.payload.title
  if (props.notification.kind === 'app.update-available')
    return t('desktop.update.notificationTitle', { version: props.notification.payload.version })
  if (props.notification.kind === 'model.source-parameters-updated') {
    return t('desktop.notifications.modelSourceUpdatedTitle', {
      count: props.notification.payload.modelCount,
    })
  }
  return props.notification.payload.automationName
})
const description = computed(() => {
  if (props.notification.kind === 'site.notice')
    return props.notification.payload.summary || t('desktop.notifications.siteOpenHint')
  if (props.notification.kind === 'app.update-available')
    return t('desktop.update.notificationDescription')
  if (props.notification.kind === 'model.source-parameters-updated')
    return t('desktop.notifications.modelSourceUpdatedDescription')
  return t(props.notification.kind === 'automation.run.completed'
    ? 'desktop.notifications.automationCompletedDescription'
    : 'desktop.notifications.automationFailedDescription')
})
const buddy = useBuddyIdentity(BUILTIN_BUDDY_ID)
const siteIcons = { announcement: Megaphone20Regular, sponsor: Heart20Regular, tutorial: BookOpen20Regular } as const
const originLabel = computed(() => props.notification.kind === 'site.notice'
  ? t(`desktop.notifications.siteCategory.${props.notification.payload.category}`)
  : t(`desktop.notifications.origin.${props.notification.origin}`))
const isAutomationRun = computed(() => props.notification.kind === 'automation.run.completed' || props.notification.kind === 'automation.run.failed')
const icon = computed(() => {
  if (props.notification.kind === 'site.notice')
    return siteIcons[props.notification.payload.category]
  if (props.notification.kind === 'app.update-available')
    return ArrowDownload20Regular
  return Bot20Regular
})
// Notion-style tag colors, one per kind; automation runs show the buddy avatar, so the tone only drives the status badge.
const siteTones = { announcement: 'orange', sponsor: 'pink', tutorial: 'purple' } as const
const tone = computed(() => {
  if (props.notification.kind === 'site.notice')
    return siteTones[props.notification.payload.category]
  if (props.notification.kind === 'app.update-available')
    return 'blue'
  if (props.notification.kind === 'automation.run.completed')
    return 'green'
  if (props.notification.kind === 'automation.run.failed')
    return 'red'
  return 'gray'
})
</script>

<template>
  <button
    class="desktop-notification-item"
    :class="[`is-${tone}`, { 'is-unseen': notification.attention === 'unseen' }]"
    type="button"
    @click="emit('open', notification)"
  >
    <span class="desktop-notification-item__icon" :class="{ 'is-avatar': isAutomationRun }" aria-hidden="true">
      <template v-if="isAutomationRun">
        <BuddyAvatar class="desktop-notification-item__avatar" :buddy-id="BUILTIN_BUDDY_ID" :src="buddy?.avatar" />
        <span class="desktop-notification-item__badge">
          <DesktopIcon :component="notification.kind === 'automation.run.failed' ? Warning12Filled : CheckmarkCircle12Filled" />
        </span>
      </template>
      <DesktopIcon v-else :component="icon" />
    </span>
    <span class="desktop-notification-item__copy">
      <strong>{{ title }}</strong>
      <span>{{ description }}</span>
      <small>
        {{ originLabel }}
        · {{ dateFormatter.format(new Date(notification.occurredAt)) }}
      </small>
    </span>
    <i v-if="notification.attention === 'unseen'" aria-hidden="true" />
  </button>
</template>

<style scoped>
.desktop-notification-item {
  position: relative;
  display: grid;
  box-sizing: border-box;
  width: calc(100% - 16px);
  height: 66px;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 9px;
  margin: 3px 8px;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 9px 22px 9px 10px;
  text-align: left;
}

.desktop-notification-item:hover,
.desktop-notification-item:focus-visible {
  background: var(--buddy-surface-subtle);
}

.desktop-notification-item:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: -2px;
}

/* Notion tag palette: soft background with the matching text color. */
.desktop-notification-item {
  --tone-bg: #e3e2e0;
  --tone-fg: #787774;
}

.desktop-notification-item.is-blue { --tone-bg: #d3e5ef; --tone-fg: #337ea9; }
.desktop-notification-item.is-green { --tone-bg: #dbeddb; --tone-fg: #448361; }
.desktop-notification-item.is-orange { --tone-bg: #fadec9; --tone-fg: #d9730d; }
.desktop-notification-item.is-pink { --tone-bg: #f5e0e9; --tone-fg: #c14c8a; }
.desktop-notification-item.is-purple { --tone-bg: #e8deee; --tone-fg: #9065b0; }
.desktop-notification-item.is-red { --tone-bg: #ffe2dd; --tone-fg: #d44c47; }

:global(:root[data-buddy-theme='dark']) .desktop-notification-item {
  --tone-bg: #454b4e;
  --tone-fg: #9b9b9b;
}

:global(:root[data-buddy-theme='dark']) .desktop-notification-item.is-blue { --tone-bg: #364954; --tone-fg: #529cca; }
:global(:root[data-buddy-theme='dark']) .desktop-notification-item.is-green { --tone-bg: #354c4b; --tone-fg: #4dab9a; }
:global(:root[data-buddy-theme='dark']) .desktop-notification-item.is-orange { --tone-bg: #594a3a; --tone-fg: #ffa344; }
:global(:root[data-buddy-theme='dark']) .desktop-notification-item.is-pink { --tone-bg: #533b4c; --tone-fg: #e255a1; }
:global(:root[data-buddy-theme='dark']) .desktop-notification-item.is-purple { --tone-bg: #443f57; --tone-fg: #9a6dd7; }
:global(:root[data-buddy-theme='dark']) .desktop-notification-item.is-red { --tone-bg: #594141; --tone-fg: #df5452; }

.desktop-notification-item__icon {
  position: relative;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border-radius: 6px;
  background: var(--tone-bg);
  color: var(--tone-fg);
  font-size: 16px;
}

.desktop-notification-item__icon.is-avatar {
  background: transparent;
}

.desktop-notification-item__avatar {
  width: 28px;
  height: 28px;
}

.desktop-notification-item__badge {
  position: absolute;
  right: -3px;
  bottom: -3px;
  display: grid;
  width: 14px;
  height: 14px;
  place-items: center;
  border-radius: 50%;
  background: var(--tone-bg);
  box-shadow: 0 0 0 2px var(--buddy-surface-raised, var(--buddy-surface-base, #fff));
  color: var(--tone-fg);
  font-size: 12px;
}

.desktop-notification-item__copy {
  display: grid;
  min-width: 0;
}

.desktop-notification-item__copy strong {
  overflow: hidden;
  color: var(--buddy-text-primary);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-notification-item.is-unseen .desktop-notification-item__copy strong {
  color: var(--buddy-text-strong);
  font-weight: 600;
}

.desktop-notification-item__copy > span {
  display: -webkit-box;
  overflow: hidden;
  color: var(--buddy-text-secondary);
  font-size: 11px;
  line-height: 16px;
  text-overflow: ellipsis;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}

.desktop-notification-item__copy small {
  color: var(--buddy-text-muted);
  font-size: 10px;
  line-height: 14px;
  margin-top: 2px;
}

.desktop-notification-item > i {
  position: absolute;
  top: 14px;
  right: 10px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--buddy-accent-solid);
}
</style>
