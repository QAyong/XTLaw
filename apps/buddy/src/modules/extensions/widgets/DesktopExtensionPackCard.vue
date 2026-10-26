<script setup lang="ts">
import type { PackMember, ResolvedPack } from '@buddy-shared/extensions/extensionPacks'
import { NButton, NEllipsis, NTag } from 'naive-ui'
import { computed } from 'vue'
import DesktopPluginIcon from '@/shared/ui/icon/DesktopPluginIcon.vue'
import { extensionLabels } from '../extensionLabels'

const props = defineProps<{ resolved: ResolvedPack, language: string, busy: boolean }>()
const emit = defineEmits<{ install: [], details: [] }>()
const labels = computed(() => extensionLabels(props.language))
const pack = computed(() => props.resolved.pack)
// The emblem is the members' own icons stacked; three is where the overlap stops reading as a group.
const emblem = computed(() => props.resolved.members.slice(0, 3))
const MEMBER_ROWS = 4
const rows = computed(() => props.resolved.members.slice(0, MEMBER_ROWS))
const hidden = computed(() => Math.max(0, props.resolved.members.length - MEMBER_ROWS))
const installAll = computed(() => props.resolved.remaining.length === props.resolved.members.length ? labels.value.packInstall : labels.value.packInstallRemaining.replace('{n}', String(props.resolved.remaining.length)))
const status = computed(() => props.resolved.state === 'complete'
  ? labels.value.packInstalled
  : props.resolved.state === 'unavailable' ? labels.value.packUnavailable : labels.value.packRemaining.replace('{n}', String(props.resolved.remaining.length)))
const memberName = (member: PackMember) => member.listing?.manifest.name ?? member.id
const done = (member: PackMember) => member.state === 'builtin' || member.state === 'installed'
</script>

<template>
  <article class="pack-card" data-testid="catalog-pack" :data-pack-id="pack.id" :data-pack-state="resolved.state">
    <header class="pack-card__band">
      <div class="pack-card__emblem" aria-hidden="true">
        <span v-for="member in emblem" :key="member.id" class="pack-card__tile">
          <DesktopPluginIcon :src="member.listing?.iconUrl" :size="24" />
        </span>
      </div>
      <span class="pack-card__status" :data-state="resolved.state" data-testid="pack-status">{{ status }}</span>
    </header>
    <div class="pack-card__body">
      <h3 class="pack-card__title">
        {{ pack.name }}
      </h3>
      <NEllipsis v-if="pack.description" :tooltip="false" :line-clamp="2" class="pack-card__description">
        {{ pack.description }}
      </NEllipsis>
      <ul class="pack-card__members" :aria-label="labels.packMembers">
        <li v-for="member in rows" :key="member.id" :data-member-state="member.state">
          <svg class="pack-card__glyph" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6.25" />
            <path v-if="done(member)" d="m5.4 8.2 1.8 1.8 3.4-3.7" />
            <path v-else-if="member.state !== 'installable'" d="M8 5v3.4m0 2.1v.1" />
          </svg>
          <span class="pack-card__member-name">{{ memberName(member) }}</span>
          <span class="pack-card__member-state">{{ labels.packMemberStates[member.state] }}</span>
        </li>
        <li v-if="hidden" class="pack-card__more">
          +{{ hidden }}
        </li>
      </ul>
      <div v-if="pack.source === 'listed' || pack.tags.length" class="pack-card__tags">
        <NTag v-if="pack.source === 'listed'" size="small" :bordered="false" type="warning">
          {{ labels.sources[pack.source] }}
        </NTag>
        <NTag v-for="tag in pack.tags" :key="tag" size="small" :bordered="false">
          {{ tag }}
        </NTag>
      </div>
    </div>
    <footer class="pack-card__footer">
      <NButton v-if="resolved.state === 'available'" size="small" type="primary" :disabled="busy" data-testid="pack-install" @click="emit('install')">
        {{ installAll }}
      </NButton>
      <NButton text size="small" data-testid="pack-details" @click="emit('details')">
        {{ labels.packDetails }}
      </NButton>
    </footer>
  </article>
</template>

<style scoped>
.pack-card { display: flex; min-width: 0; flex-direction: column; overflow: hidden; border: 1px solid var(--buddy-border-subtle); border-radius: var(--buddy-radius-micro); background: var(--buddy-surface-base); transition: border-color 140ms ease; }
.pack-card:hover { border-color: var(--buddy-accent-border, var(--buddy-border-subtle)); }
.pack-card__band { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 18px 16px; background: var(--buddy-accent-surface-subtle, var(--buddy-surface-subtle)); }
.pack-card__emblem { display: flex; align-items: center; padding-left: 14px; }
.pack-card__tile { display: grid; width: 44px; height: 44px; margin-left: -14px; place-items: center; border-radius: 12px; background: var(--buddy-surface-base); box-shadow: 0 0 0 2px var(--buddy-accent-surface-subtle, var(--buddy-surface-subtle)), 0 1px 3px rgb(0 0 0 / 0.1); }
.pack-card__tile:nth-child(2) { transform: translateY(2px); }
.pack-card__tile:nth-child(3) { transform: translateY(-1px); }
.pack-card__status { flex: none; border-radius: 999px; padding: 3px 10px; background: var(--buddy-surface-base); color: var(--buddy-text-secondary); font-size: 12px; line-height: 1.5; }
.pack-card__status[data-state='complete'] { color: var(--buddy-accent-success, var(--buddy-accent-text)); }
.pack-card__status[data-state='available'] { color: var(--buddy-accent-text); }
.pack-card__status[data-state='unavailable'] { color: var(--buddy-accent-warning, var(--buddy-text-secondary)); }
.pack-card__body { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 8px; padding: 16px 18px 4px; }
.pack-card__title { margin: 0; color: var(--buddy-text-strong); font-size: 15px; font-weight: 600; line-height: 1.5; overflow-wrap: anywhere; }
.pack-card__description { color: var(--buddy-text-secondary); font-size: 13px; line-height: 1.7; }
.pack-card__members { display: grid; gap: 6px; margin: 6px 0 0; padding: 0; list-style: none; }
.pack-card__members li { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 8px; font-size: 13px; line-height: 1.5; }
.pack-card__glyph { width: 16px; height: 16px; fill: none; stroke: var(--buddy-text-secondary); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; opacity: 0.6; }
.pack-card__members li[data-member-state='builtin'] .pack-card__glyph, .pack-card__members li[data-member-state='installed'] .pack-card__glyph { stroke: var(--buddy-accent-success, var(--buddy-accent-solid)); opacity: 1; }
.pack-card__members li[data-member-state='incompatible'] .pack-card__glyph, .pack-card__members li[data-member-state='missing'] .pack-card__glyph { stroke: var(--buddy-accent-warning, var(--buddy-text-secondary)); opacity: 1; }
.pack-card__member-name { min-width: 0; overflow: hidden; color: var(--buddy-text-primary); text-overflow: ellipsis; white-space: nowrap; }
.pack-card__member-state { color: var(--buddy-text-secondary); font-size: 12px; }
.pack-card__more { grid-template-columns: 1fr !important; padding-left: 24px; color: var(--buddy-text-secondary); font-size: 12px !important; }
.pack-card__tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.pack-card__footer { display: flex; min-width: 0; flex-wrap: wrap; align-items: center; gap: 12px; padding: 12px 18px 16px; }
@media (prefers-reduced-motion: reduce) { .pack-card { transition: none; } }
</style>
