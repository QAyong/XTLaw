<script setup lang="ts">
import type { LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'
import type { TaskArchiveActions } from '../../contracts'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NAlert, NButton } from 'naive-ui'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'

const props = defineProps<{ actions: TaskArchiveActions, language: BuddyLocale }>()
const target = defineModel<LocalConversationSummary | null>('target', { required: true })
const busy = defineModel<boolean>('busy', { required: true })
const { t } = useBuddyI18n(() => props.language)
const error = shallowRef<string | null>(null)
const undoTarget = shallowRef<{ id: string, revision: number | null } | null>(null)
let generation = 0
let activeOperation = 0
let disposed = false
const undoAvailable = computed(() => !!undoTarget.value && undoTarget.value.revision !== null)
watch(target, (task) => {
  if (!task)
    return
  const token = ++generation
  error.value = null
  void archive(task, token)
}, { flush: 'sync' })
onScopeDispose(() => {
  disposed = true
  generation++
})

async function archive(task: LocalConversationSummary, token: number) {
  if (busy.value)
    return
  if (!props.actions.ready.value) {
    if (token === generation) {
      error.value = t('desktop.archive.unavailable')
      target.value = null
    }
    return
  }
  busy.value = true
  activeOperation = token
  undoTarget.value = null
  try {
    if (!await props.actions.archive(task.id, task.metadataRevision)) {
      if (token === generation)
        error.value = t('desktop.archive.notCompleted')
      return
    }
    if (token !== generation || disposed)
      return
    const receipt = task.activity === 'idle' ? { id: task.id, revision: null } : null
    undoTarget.value = receipt
    if (target.value?.id === task.id)
      target.value = null
    if (!receipt)
      return
    try {
      const archived = await props.actions.get(task.id)
      if (token !== generation || disposed || undoTarget.value !== receipt)
        return
      if (archived?.archivedAt && archived.metadataRevision !== undefined)
        undoTarget.value = { id: task.id, revision: archived.metadataRevision }
      else
        error.value = t('desktop.archive.undoUnavailable')
    }
    catch {
      if (token === generation && !disposed && undoTarget.value === receipt)
        error.value = t('desktop.archive.undoUnavailable')
    }
  }
  catch (cause) {
    if (token === generation && !disposed)
      error.value = resolveLocalChatErrorMessage(cause, props.language)
  }
  finally {
    if (target.value?.id === task.id && token === generation)
      target.value = null
    if (activeOperation === token) {
      activeOperation = 0
      busy.value = false
    }
  }
}

async function undo() {
  const snapshot = undoTarget.value
  if (!snapshot || snapshot.revision === null || busy.value || !props.actions.ready.value)
    return
  busy.value = true
  const token = generation
  try {
    if (!await props.actions.restore(snapshot.id, snapshot.revision)) {
      if (token === generation)
        error.value = t('desktop.archive.notCompleted')
      return
    }
    if (token === generation && undoTarget.value === snapshot)
      undoTarget.value = null
  }
  catch (cause) {
    if (token === generation)
      error.value = resolveLocalChatErrorMessage(cause, props.language)
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <NAlert v-if="error" :show-icon="false" type="error" closable @close="error = null">
    {{ error }}
  </NAlert>
  <NAlert v-if="undoTarget" :show-icon="false" type="info" closable @close="undoTarget = null">
    {{ t('desktop.archive.archived') }}
    <NButton text :disabled="busy || !actions.ready.value || !undoAvailable" @click="undo">
      {{ t('desktop.archive.undo') }}
    </NButton>
  </NAlert>
</template>
