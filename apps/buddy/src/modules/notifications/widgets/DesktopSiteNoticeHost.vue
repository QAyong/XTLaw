<script setup lang="ts">
import type { SiteFeed } from '../state/useSiteFeed'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useMessage } from 'naive-ui'
import { shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { requireDesktopApi } from '@/platform/desktop/desktopApi'
import DesktopSiteNoticeDialog from './DesktopSiteNoticeDialog.vue'

const props = defineProps<{
  language: BuddyLocale
  siteFeed: Pick<SiteFeed, 'details' | 'open' | 'close'>
}>()
const api = requireDesktopApi()
const message = useMessage()
const { t } = useBuddyI18n(() => props.language)
const pending = shallowRef(false)

async function openLink(itemId: string) {
  if (pending.value)
    return
  pending.value = true
  try {
    await props.siteFeed.open(itemId)
  }
  catch {
    message.error(t('desktop.notifications.siteOpenFailed'))
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <DesktopSiteNoticeDialog
    :show="siteFeed.details.value !== null"
    :notice="siteFeed.details.value"
    :language="language"
    :pending="pending"
    :write-clipboard-text="api.clipboard.writeText"
    @update:show="!$event && siteFeed.close()"
    @open-link="openLink"
  />
</template>
