<script setup lang="ts">
import type { ManagedCapabilitySource } from '@buddy-shared/extensions/managedCapability'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{ source: ManagedCapabilitySource, language: BuddyLocale }>()
const { t } = useBuddyI18n(() => props.language)
</script>

<template>
  <div class="text-muted text-[0.78rem] mt-2 [overflow-wrap:anywhere]">
    <p class="m-0">
      {{ t('desktop.mcp.managed.source', { name: source.extensionName }) }}
      · {{ t(`desktop.mcp.managed.state.${source.state}`) }}
    </p>
    <p v-if="source.unavailableReason" class="m-0 mt-1 text-warning">
      {{ t(`desktop.mcp.managed.reason.${source.unavailableReason}`) }}
    </p>
  </div>
</template>
