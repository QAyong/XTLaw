<script setup lang="ts">
import type { ExtensionCapabilityImpact } from '@buddy-shared/extensions/extensionCapabilities'
import { NButton, NModal } from 'naive-ui'
import { computed, useTemplateRef, watch } from 'vue'
import { extensionLabels } from '../extensionLabels'

const props = defineProps<{ name: string, language: string, busy: boolean, kept?: ExtensionCapabilityImpact['modified'] }>()
const emit = defineEmits<{ cancel: [], remove: [clearData: boolean] }>()
const labels = computed(() => extensionLabels(props.language))
const cancelButton = useTemplateRef<InstanceType<typeof NButton>>('cancelButton')
watch(cancelButton, button => button?.$el.focus(), { flush: 'post' })
</script>

<template>
  <NModal show preset="dialog" type="warning" :title="labels.removeTitle" :auto-focus="false" :closable="!busy" :mask-closable="!busy" :close-on-esc="!busy" @close="emit('cancel')" @mask-click="!busy && emit('cancel')" @esc="!busy && emit('cancel')">
    <p>{{ name }} · {{ labels.retained }}</p>
    <p class="extension-uninstall__hint">
      {{ labels.cleanupHint }}
    </p>
    <div v-if="kept?.length" class="extension-uninstall__kept" data-testid="extension-uninstall-kept">
      <p>{{ labels.keptTitle }}</p>
      <ul>
        <li v-for="item in kept" :key="`${item.kind}:${item.name}`">
          {{ labels.kinds[item.kind] }} · {{ item.name }}
        </li>
      </ul>
    </div>
    <template #action>
      <div class="extension-uninstall__actions">
        <NButton class="extension-uninstall__cleanup" quaternary type="error" :disabled="busy" @click="emit('remove', true)">
          {{ labels.removeAndClear }}
        </NButton>
        <NButton ref="cancelButton" :disabled="busy" @click="emit('cancel')">
          {{ labels.cancel }}
        </NButton>
        <NButton type="error" :disabled="busy" @click="emit('remove', false)">
          {{ labels.remove }}
        </NButton>
      </div>
    </template>
  </NModal>
</template>

<style scoped>
.extension-uninstall__kept { color: var(--buddy-text-primary); font-size: 0.78rem; }
.extension-uninstall__kept p { margin: 0 0 0.25rem; }
.extension-uninstall__kept ul { margin: 0; padding-left: 1.2rem; }
.extension-uninstall__hint { color: var(--buddy-text-secondary); font-size: 0.78rem; }
.extension-uninstall__actions { display: flex; width: 100%; gap: 0.5rem; }
.extension-uninstall__cleanup { margin-right: auto; }
</style>
