<script setup lang="ts">
import type { ExtensionCapabilityImpact } from '@buddy-shared/extensions/extensionCapabilities'
import { NButton, NModal } from 'naive-ui'
import { computed, useTemplateRef, watch } from 'vue'
import { extensionLabels } from '../extensionLabels'

const props = defineProps<{ name: string, language: string, busy: boolean, impact: ExtensionCapabilityImpact }>()
const emit = defineEmits<{ cancel: [], remove: [clearData: boolean] }>()
const labels = computed(() => extensionLabels(props.language))
const cancelButton = useTemplateRef<InstanceType<typeof NButton>>('cancelButton')
watch(cancelButton, button => button?.$el.focus(), { flush: 'post' })
</script>

<template>
  <NModal show preset="dialog" type="warning" :title="labels.removeTitle" :auto-focus="false" :closable="!busy" :mask-closable="!busy" :close-on-esc="!busy" @close="emit('cancel')" @mask-click="!busy && emit('cancel')" @esc="!busy && emit('cancel')">
    <p>{{ name }} · {{ labels.retained }}</p>
    <p class="text-muted text-[0.78rem]">
      {{ labels.cleanupHint }}
    </p>
    <div v-if="impact.retained.length" class="mt-2 text-fg text-[0.78rem]" data-testid="extension-uninstall-retained">
      <p class="m-0 mb-1">
        {{ labels.retainedTitle }}
      </p>
      <ul class="m-0 pl-5">
        <li v-for="(item, index) in impact.retained" :key="index">
          {{ labels.retainedKinds[item.kind] }} · {{ item.name }}
        </li>
      </ul>
    </div>
    <div v-if="impact.dependents.length" class="mt-3 text-fg text-[0.78rem]" data-testid="extension-uninstall-dependents">
      <p class="m-0 mb-1">
        {{ labels.dependentsTitle }}
      </p>
      <ul class="m-0 pl-5">
        <li v-for="item in impact.dependents" :key="item.id">
          {{ item.name }}
        </li>
      </ul>
      <p class="mt-1 mb-0 text-warning">
        {{ labels.dependentsHint }}
      </p>
    </div>
    <template #action>
      <div class="flex w-full gap-2">
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

<style scoped lang="scss">
.extension-uninstall__cleanup {
  margin-right: auto;
}
</style>
