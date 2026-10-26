<script setup lang="ts">
import type { PackMember, ResolvedPack } from '@buddy-shared/extensions/extensionPacks'
import { NAlert, NButton, NModal, NTag } from 'naive-ui'
import { computed } from 'vue'
import DesktopPluginIcon from '@/shared/ui/icon/DesktopPluginIcon.vue'
import { extensionLabels } from '../extensionLabels'

const props = defineProps<{ resolved: ResolvedPack, language: string, busy: boolean }>()
const emit = defineEmits<{ close: [], install: [], installMember: [member: PackMember] }>()
const labels = computed(() => extensionLabels(props.language))
const tagType = { builtin: 'info', installed: 'success', installable: 'default', incompatible: 'warning', missing: 'warning' } as const
</script>

<template>
  <NModal show preset="card" :title="resolved.pack.name" class="pack-detail" data-testid="pack-detail" @update:show="value => { if (!value) emit('close') }">
    <p v-if="resolved.pack.description" class="pack-detail__description">
      {{ resolved.pack.description }}
    </p>
    <h3 class="pack-detail__heading">
      {{ labels.packMembers }}
    </h3>
    <ul class="pack-detail__members">
      <li v-for="member in resolved.members" :key="member.id" :data-member-id="member.id" :data-member-state="member.state">
        <DesktopPluginIcon :src="member.listing?.iconUrl" :size="24" />
        <div class="pack-detail__text">
          <strong>{{ member.listing?.manifest.name ?? member.id }}</strong>
          <span v-if="member.listing" class="pack-detail__meta">{{ labels.kinds[member.listing.kind] }} · {{ labels.sources[member.listing.source] }} · {{ member.listing.manifest.version }}</span>
        </div>
        <NTag size="small" :bordered="false" :type="tagType[member.state]">
          {{ labels.packMemberStates[member.state] }}
        </NTag>
        <NButton v-if="member.state === 'installable'" size="small" :disabled="busy" data-testid="pack-member-install" @click="emit('installMember', member)">
          {{ language === 'en-US' ? 'Install' : '安装' }}
        </NButton>
      </li>
    </ul>
    <NAlert v-if="resolved.state === 'unavailable'" type="warning" :show-icon="false">
      {{ labels.packUnavailableHint }}
    </NAlert>
    <p v-else-if="resolved.state === 'available'" class="pack-detail__hint">
      {{ labels.packReviewHint }}
    </p>
    <p class="pack-detail__hint">
      {{ labels.packUninstallHint }}
    </p>
    <template #footer>
      <div class="pack-detail__actions">
        <NButton @click="emit('close')">
          {{ labels.cancel }}
        </NButton>
        <NButton v-if="resolved.state === 'available'" type="primary" :disabled="busy" data-testid="pack-detail-install" @click="emit('install')">
          {{ resolved.remaining.length === resolved.members.length ? labels.packInstall : labels.packInstallRemaining.replace('{n}', String(resolved.remaining.length)) }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
:global(.pack-detail) { width: min(560px, calc(100vw - 48px)); max-height: calc(100dvh - 48px); overflow-y: auto; }
.pack-detail__description { margin: 0 0 16px; color: var(--buddy-text-secondary); font-size: 13px; line-height: 1.7; overflow-wrap: anywhere; }
.pack-detail__heading { margin: 0 0 12px; color: var(--buddy-text-strong); font-size: 13px; font-weight: 600; }
.pack-detail__members { display: grid; gap: 12px; margin: 0 0 16px; padding: 0; list-style: none; }
.pack-detail__members li { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto auto; align-items: center; gap: 10px; }
.pack-detail__text { display: grid; min-width: 0; gap: 2px; color: var(--buddy-text-primary); font-size: 13px; overflow-wrap: anywhere; }
.pack-detail__meta { color: var(--buddy-text-secondary); font-size: 12px; }
.pack-detail__hint { margin: 8px 0 0; color: var(--buddy-text-secondary); font-size: 12px; line-height: 1.6; }
.pack-detail__actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
