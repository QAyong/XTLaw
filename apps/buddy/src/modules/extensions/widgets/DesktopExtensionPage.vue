<script setup lang="ts">
import type { ExtensionViewInput } from '@buddy-shared/extensions/extensionApi'
import { NButton, NEmpty } from 'naive-ui'
import { computed } from 'vue'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRouter } from 'vue-router'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import DesktopBackToTasksButton from '@/shared/ui/navigation/DesktopBackToTasksButton.vue'
import { useExtensionContext } from '../extensionContext'
import DesktopExtensionSurface from './DesktopExtensionSurface.vue'

const props = defineProps<{ extensionId: string }>()
const router = useRouter()
const { state, views, language } = useExtensionContext()
const viewId = crypto.randomUUID()
onBeforeRouteLeave(() => views.prepareClose(viewId))
onBeforeRouteUpdate((to, from) => to.params.extensionId === from.params.extensionId || views.prepareClose(viewId))
const plugin = computed(() => state.installed.value.find(item => item.manifest.id === props.extensionId && item.enabled && item.compatible))
const input = computed<ExtensionViewInput | null>(() => {
  const navigation = plugin.value?.manifest.contributes.navigation
  return navigation ? { viewId, extensionId: props.extensionId, viewType: navigation.view, resource: null, state: {}, stateVersion: 0 } : null
})
</script>

<template>
  <section class="extension-page" :data-extension-page="extensionId">
    <header v-if="plugin?.manifest.contributes.navigation?.showHeader !== false" class="extension-page__header">
      <strong>{{ views.surfaces.get(viewId)?.documentInfo?.title ?? plugin?.manifest.contributes.navigation?.title ?? (language === 'en-US' ? 'Plugin' : '插件') }}</strong>
    </header>
    <DesktopExtensionSurface v-if="input" :input="input" visible />
    <NEmpty v-else class="extension-page__empty" :description="language === 'en-US' ? 'This plugin is unavailable' : '此插件暂时不可用'">
      <template #extra>
        <NButton @click="router.push(desktopRouteLocations.extensions())">
          {{ language === 'en-US' ? 'Manage plugins' : '管理插件' }}
        </NButton>
      </template>
    </NEmpty>

    <DesktopBackToTasksButton floating :language="language" />
  </section>
</template>

<style scoped>
.extension-page { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0; }
.extension-page__header { display: flex; align-items: center; min-height: var(--buddy-region-header-height); flex: none; padding: 0 20px; border-bottom: 1px solid var(--buddy-border-subtle); font-size: 14px; color: var(--buddy-text-strong); }
.extension-page__empty { margin: auto; }
</style>
