<script setup lang="ts">
import type { AutomationApprovalAllowlistEntry } from '@buddy-shared/automation/approvalAllowlist'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { useBuddyI18n } from '@/i18n/buddyI18n'

const props = defineProps<{
  entries: ReadonlyArray<AutomationApprovalAllowlistEntry>
  language: BuddyLocale
}>()

const { t } = useBuddyI18n(() => props.language)

function entryLabel(entry: AutomationApprovalAllowlistEntry): string {
  if (entry.kind === 'domain')
    return t('desktop.approval.allowlist.domain')
  return t(entry.access === 'write' ? 'desktop.approval.allowlist.directoryWrite' : 'desktop.approval.allowlist.directoryRead')
}

function entryTarget(entry: AutomationApprovalAllowlistEntry): string {
  return entry.kind === 'domain' ? entry.host : entry.path
}
</script>

<template>
  <ul v-if="entries.length" class="desktop-approval-allowlist">
    <li v-for="entry in entries" :key="`${entry.kind}:${entryTarget(entry)}`" class="desktop-approval-allowlist__item">
      <span class="desktop-approval-allowlist__kind">{{ entryLabel(entry) }}</span>
      <code class="desktop-approval-allowlist__target">{{ entryTarget(entry) }}</code>
    </li>
  </ul>
  <span v-else class="desktop-approval-allowlist__empty">{{ t('desktop.approval.allowlist.empty') }}</span>
</template>

<style scoped lang="scss">
.desktop-approval-allowlist {
  display: grid;
  margin: 0;
  padding: 0;
  gap: 0.35rem;
  list-style: none;
}

.desktop-approval-allowlist__item {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 0.5rem;
}

.desktop-approval-allowlist__kind {
  flex: none;
  color: var(--buddy-text-muted);
  font-size: 0.72rem;
}

.desktop-approval-allowlist__target {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--buddy-text-primary);
  font-size: 0.78rem;
}

.desktop-approval-allowlist__empty {
  color: var(--buddy-text-muted);
  font-size: 0.78rem;
}
</style>
