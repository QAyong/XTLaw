<script setup lang="ts">
import type { LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import type { TaskIndex } from '../../contracts'

import type { BuddyLocale } from '@/i18n/buddyI18n'
import { TaskListSquareLtr20Regular } from '@vicons/fluent'
import { NButton, NInput, NModal, useMessage } from 'naive-ui'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopSpaceIcon from '../space/DesktopSpaceIcon.vue'
import { useTaskHistorySearch } from './useTaskHistorySearch'

const props = defineProps<{
  search: TaskIndex['history']['search']
  language: BuddyLocale
  spaces: ReadonlyArray<LocalSpace>
  show: boolean
}>()
const emit = defineEmits<{
  'openTask': [conversation: LocalConversationSummary]
  'openSpace': [spaceId: string]
  'update:show': [show: boolean]
}>()

const { t } = useBuddyI18n(() => props.language)
const message = useMessage()
const resultsElement = useTemplateRef<HTMLElement>('resultsElement')
const historySearch = useTaskHistorySearch({
  show: () => props.show,
  search: (query, cursor) => props.search(query, cursor),
  onError: () => message.error(t('desktop.search.failed')),
})
const { query, normalizedQuery, items, loading, failed, nextCursor } = historySearch
const activeSpaces = computed(() => props.spaces.filter(space => space.revokedAt === null))
const spaceNames = computed(() => new Map(activeSpaces.value.map(space => [space.id, space.name])))
const matchingConversations = computed(() => items.value.map(item => item.conversation))
const matchingSpaces = computed(() => {
  if (!normalizedQuery.value)
    return []
  const query = normalizedQuery.value.toLocaleLowerCase()
  return activeSpaces.value.filter(space => (
    space.name.toLocaleLowerCase().includes(query)
    || space.primaryDirectory?.root.toLocaleLowerCase().includes(query)
    || space.additionalDirectories.some(directory => directory.root.toLocaleLowerCase().includes(query))
  ))
})
const hasResults = computed(() => matchingConversations.value.length > 0 || matchingSpaces.value.length > 0)
watch(() => props.show, (show) => {
  if (show)
    query.value = ''
}, { flush: 'sync' })

async function loadMore(event: MouseEvent) {
  const focused = document.activeElement === event.currentTarget
  await historySearch.loadMore()
  await nextTick()
  if (focused && !nextCursor.value && !failed.value) {
    const tasks = resultsElement.value?.querySelectorAll<HTMLElement>('.desktop-task-search-dialog__task')
    tasks?.[tasks.length - 1]?.focus({ preventScroll: true })
  }
}

function formatTaskTitle(conversation: LocalConversationSummary) {
  return conversation.title?.trim() || t('desktop.tasks.untitled')
}

function taskContext(conversation: LocalConversationSummary) {
  return conversation.spaceId === null
    ? t('desktop.search.taskContext')
    : spaceNames.value.get(conversation.spaceId) ?? t('desktop.search.spaceContext')
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    class="desktop-task-search-dialog"
    :style="{ width: 'min(44rem, calc(100vw - 2rem))' }"
    :title="t('desktop.search.title')"
    @update:show="emit('update:show', $event)"
  >
    <NInput
      v-model:value="query"
      clearable
      :maxlength="512"
      size="large"
      :placeholder="t('desktop.search.placeholder')"
    >
      <template #prefix>
        <DesktopIcon name="toolSearch" :size="18" />
      </template>
    </NInput>

    <div v-if="!normalizedQuery" class="desktop-task-search-dialog__initial">
      <span aria-hidden="true">
        <DesktopIcon name="toolSearch" :size="18" />
      </span>
      <p>{{ t('desktop.search.description') }}</p>
    </div>

    <div v-else ref="resultsElement" class="desktop-task-search-dialog__results" :aria-busy="loading || undefined">
      <template v-if="hasResults">
        <section v-if="matchingConversations.length" class="desktop-task-search-dialog__section">
          <h3 class="desktop-task-search-dialog__section-title">
            {{ t('desktop.search.taskCount', { count: matchingConversations.length }) }}
          </h3>
          <button
            v-for="conversation in matchingConversations"
            :key="conversation.id"
            class="desktop-task-search-dialog__result desktop-task-search-dialog__task"
            type="button"
            @click="emit('openTask', conversation)"
          >
            <DesktopIcon :component="TaskListSquareLtr20Regular" />
            <span>
              <strong>{{ formatTaskTitle(conversation) }}</strong>
              <small>{{ taskContext(conversation) }}</small>
            </span>
          </button>
        </section>

        <section v-if="matchingSpaces.length" class="desktop-task-search-dialog__section">
          <h3 class="desktop-task-search-dialog__section-title">
            {{ t('desktop.search.spaceCount', { count: matchingSpaces.length }) }}
          </h3>
          <button
            v-for="space in matchingSpaces"
            :key="space.id"
            class="desktop-task-search-dialog__result"
            type="button"
            @click="emit('openSpace', space.id)"
          >
            <DesktopSpaceIcon :icon="space.icon" :icon-color="space.iconColor" />
            <span>
              <strong>{{ space.name }}</strong>
              <small>{{ space.primaryDirectory?.root ?? t('desktop.tasks.spaceDirectoryEmpty') }}</small>
            </span>
          </button>
        </section>
      </template>

      <div v-if="loading" class="desktop-task-search-dialog__status" role="status">
        {{ t('common.loading') }}
      </div>
      <div v-else-if="failed" class="desktop-task-search-dialog__status" role="status">
        {{ t('desktop.search.failed') }}
      </div>
      <NButton v-if="nextCursor || failed" :loading="loading" :disabled="loading" @click="loadMore">
        {{ failed ? t('desktop.tasks.retryHistory') : t('desktop.search.moreResults') }}
      </NButton>
      <div v-else-if="!hasResults && !loading" class="desktop-task-search-dialog__no-results">
        <DesktopIcon name="toolSearch" :size="18" />
        <p>{{ t('desktop.search.noResults') }}</p>
      </div>
    </div>
  </NModal>
</template>

<style scoped lang="scss">
.desktop-task-search-dialog__initial,
.desktop-task-search-dialog__results {
  height: min(22rem, calc(100vh - 13rem));
  min-height: 15rem;
  margin-top: 1rem;
}

.desktop-task-search-dialog__initial {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  text-align: center;

  > span {
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border-radius: 0.75rem;
    background: var(--buddy-surface-subtle);
    color: var(--buddy-text-secondary);
    font-size: 1.4rem;
  }

  > p {
    margin: 1rem 0 0;
    color: var(--buddy-text-secondary);
    font-size: 0.82rem;
  }
}

.desktop-task-search-dialog__results {
  display: grid;
  align-content: start;
  gap: 1rem;
  overflow-y: auto;
  padding-right: 0.2rem;
}

.desktop-task-search-dialog__status {
  padding: 0 0.75rem;
  color: var(--buddy-text-secondary);
}

.desktop-task-search-dialog__section {
  display: grid;
  gap: 0.25rem;
}

.desktop-task-search-dialog__section-title {
  margin: 0;
  color: var(--buddy-text-secondary);
  font-size: var(--buddy-sidebar-section-font-size);
  font-weight: var(--buddy-sidebar-section-font-weight);
  padding: 0.25rem 0.4rem;
}

.desktop-task-search-dialog__result {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 0.75rem;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  padding: 0.65rem 0.75rem;
  text-align: left;

  > .n-icon {
    flex: none;
    font-size: 1rem;
  }

  > span {
    display: grid;
    min-width: 0;
    gap: 0.15rem;
  }

  strong,
  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  strong {
    color: var(--buddy-text-strong);
    font-size: 0.84rem;
    font-weight: 500;
  }

  small {
    color: var(--buddy-text-secondary);
    font-size: 0.72rem;
  }

  &:hover {
    background: var(--buddy-state-selected);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.desktop-task-search-dialog__no-results {
  display: grid;
  height: 100%;
  place-items: center;
  align-content: center;
  gap: 0.75rem;
  color: var(--buddy-text-secondary);
  text-align: center;

  > .n-icon {
    font-size: 1.5rem;
  }

  > p {
    margin: 0;
    font-size: 0.82rem;
  }
}
</style>
