<script setup lang="ts">
import type { LocalBuddy } from '@buddy-shared/buddies/buddyApi'
import { NAlert, NButton } from 'naive-ui'
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import { useDesktopUi } from '@/shared/ui/desktopUiContext'
import { buddyLabels } from '../buddyLabels'

const props = defineProps<{ buddy: LocalBuddy, disabled: boolean }>()
const emit = defineEmits<{ duplicate: [] }>()
const { language } = useDesktopUi()
const labels = computed(() => buddyLabels(language.value))
const stateLabel = computed(() => {
  const source = props.buddy.managed
  if (!source)
    return ''
  if (source.unavailableReason)
    return labels.value.managedReasons[source.unavailableReason]
  return source.state === 'enabled' && !source.userEnabled ? labels.value.paused : labels.value.managedStates[source.state]
})
</script>

<template>
  <NAlert v-if="buddy.managed" :type="buddy.enabled ? 'info' : 'warning'" :show-icon="false" data-testid="buddy-managed-notice">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <strong>{{ labels.managedSource(buddy.managed.extensionName) }}</strong>
      <span>{{ stateLabel }}</span>
    </div>
    <p class="my-2">
      {{ labels.managedDefinitionHint }}
    </p>
    <p v-if="!buddy.enabled" class="my-2">
      {{ labels.managedUnavailable }}
    </p>
    <p class="my-2">
      {{ labels.duplicateHint }}
    </p>
    <div class="flex flex-wrap items-center gap-3">
      <NButton size="small" :disabled="disabled || !!buddy.deletedAt" @click="emit('duplicate')">
        {{ labels.duplicate }}
      </NButton>
      <RouterLink :to="desktopRouteLocations.extensions()" class="ui-focus-ring text-accent-text">
        {{ labels.managePlugin }}
      </RouterLink>
    </div>
  </NAlert>
</template>
