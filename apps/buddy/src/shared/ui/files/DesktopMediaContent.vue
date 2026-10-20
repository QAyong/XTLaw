<script setup lang="ts">
import type { MediaKind } from '@buddy-shared/files/mediaFiles'
import { shallowRef, watch } from 'vue'

const props = defineProps<{ kind: MediaKind, url: string, name: string, failedLabel: string }>()
const failed = shallowRef(false)
watch(() => props.url, () => failed.value = false)
</script>

<template>
  <div class="desktop-media-content" :class="`is-${kind}`">
    <p v-if="failed" class="desktop-media-content__notice" role="alert">
      {{ failedLabel }}
    </p>
    <video v-if="kind === 'video'" :key="url" class="desktop-media-content__video" :src="url" :aria-label="name" controls playsinline preload="metadata" @error="failed = true" />
    <audio v-else :key="url" class="desktop-media-content__audio" :src="url" :aria-label="name" controls preload="metadata" @error="failed = true" />
  </div>
</template>

<style scoped>
.desktop-media-content { box-sizing: border-box; width: 100%; height: 100%; display: flex; flex: 1; flex-direction: column; align-items: center; justify-content: center; gap: 12px; min-width: 0; min-height: 0; padding: 16px; }
.desktop-media-content__video { max-width: 100%; max-height: 100%; min-height: 0; background: #000; }
.desktop-media-content__audio { width: min(680px, 100%); }
.desktop-media-content__notice { margin: 0; color: var(--buddy-text-secondary); font-size: 12px; text-align: center; overflow-wrap: anywhere; }
</style>
