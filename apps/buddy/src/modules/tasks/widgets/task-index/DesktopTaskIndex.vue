<script setup lang="ts">
import type { DesktopTaskPinnedItem } from '@buddy-electron/shared/desktopApi'
import type { LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'

import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'

import type { TaskIndex, TaskMarks, TaskSidebarActivity } from '../../contracts'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { SpaceDirectorySource, TaskSpaceInput } from '@/modules/tasks/state/task-index/typing'
import { Tag20Regular } from '@vicons/fluent'
import { NAlert, NButton, NInput, NModal, NTooltip, useMessage } from 'naive-ui'
import { computed, shallowRef, toRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSpaceDialog from '@/modules/tasks/widgets/task-index/DesktopSpaceDialog.vue'
import DesktopTaskRow from '@/modules/tasks/widgets/task-index/DesktopTaskRow.vue'
import DesktopTaskSearchDialog from '@/modules/tasks/widgets/task-index/DesktopTaskSearchDialog.vue'
import DesktopTaskSidebarExpandRow from '@/modules/tasks/widgets/task-index/DesktopTaskSidebarExpandRow.vue'
import DesktopTaskSidebarSection from '@/modules/tasks/widgets/task-index/DesktopTaskSidebarSection.vue'
import DesktopTaskSpaceRow from '@/modules/tasks/widgets/task-index/DesktopTaskSpaceRow.vue'
import {
  DESKTOP_TASK_SIDEBAR_ROW_HEIGHT,
  DESKTOP_TASK_SIDEBAR_ROW_SIZE,
  DESKTOP_TASK_SIDEBAR_SECTION_HEADER_SIZE,
  DESKTOP_TASK_SIDEBAR_SECTION_PRIORITIES,
} from '@/modules/tasks/widgets/task-index/taskSidebarLayout'
import { useTaskIndexController } from '@/modules/tasks/widgets/task-index/useTaskIndexController'
import { resolveLocalChatErrorMessage } from '@/shared/lib/localChatError'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopTaskArchiveAction from './DesktopTaskArchiveAction.vue'
import DesktopTaskMarkManager from './DesktopTaskMarkManager.vue'
import DesktopTaskMoveToSpaceDialog from './DesktopTaskMoveToSpaceDialog.vue'

const props = defineProps<{
  archive: TaskIndex['archive']
  activeConversationId: string | null
  pendingConversationIds?: readonly string[]
  marks: TaskMarks
  search: TaskIndex['history']['search']
  language: BuddyLocale
  pinnedItems: ReadonlyArray<DesktopTaskPinnedItem>
  sidebar: TaskIndex['sidebar']
  spaces: ReadonlyArray<LocalSpace>
  selectSpaceDirectory: (source?: SpaceDirectorySource) => Promise<string | null>
  createSpace: (input: TaskSpaceInput) => Promise<boolean>
  moveTaskToSpace: (taskId: string, spaceId: string) => Promise<boolean>
  updateSpace: (input: TaskSpaceInput & { spaceId: string }) => Promise<boolean>
  tasks: ReadonlyArray<LocalConversationSummary>
  activities: ReadonlyMap<string, TaskSidebarActivity>
}>()
const emit = defineEmits<{
  deleteSpace: [spaceId: string]
  deleteTask: [conversationId: string, expectedRevision: number]
  newTask: [spaceId: string | null]
  openSpaceDirectory: [spaceId: string]
  openTask: [conversationId: string]
  renameTask: [conversationId: string, title: string]
  updatePinnedItems: [items: DesktopTaskPinnedItem[]]
}>()
defineSlots<{ footer?: () => unknown, navigation?: () => unknown }>()

const { t } = useBuddyI18n(() => props.language)
const marksOpen = shallowRef(false)
const searchOpen = shallowRef(false)
const archiveTarget = shallowRef<LocalConversationSummary | null>(null)
const archiveBusy = shallowRef(false)
function requestTaskArchive(task: LocalConversationSummary) {
  if (archiveBusy.value || !props.archive.ready.value)
    return
  archiveTarget.value = task
}
function markBindings(conversationId: string) {
  return {
    loading: props.pendingConversationIds?.includes(conversationId),
    marks: props.marks.items.value,
    markState: props.marks.states.value.get(conversationId),
    marksBusy: props.marks.busy.value,
    onAssignMark: (markId: string) => props.marks.assign(conversationId, markId),
    onClearMarks: () => props.marks.clear(conversationId),
    onSetRead: (read: boolean) => props.marks.setRead(conversationId, read),
    onManageMarks: () => marksOpen.value = true,
  }
}
const taskMoveTargetId = shallowRef<string | null>(null)
const taskMoveTarget = computed(() => props.tasks.find(task => task.id === taskMoveTargetId.value) ?? null)
const taskMoveBusy = computed(() => Boolean(taskMoveTargetId.value && props.pendingConversationIds?.includes(taskMoveTargetId.value)))
const moveTargets = computed(() => props.spaces
  .filter(space => space.revokedAt === null)
  .map(space => ({ id: space.id, name: space.name })))
function taskMenuBindings(task: LocalConversationSummary) {
  const archiveBindings = {
    archiveBusy: archiveBusy.value || !props.archive.ready.value,
    onArchive: () => requestTaskArchive(task),
  }
  return task.spaceId === null
    ? {
        ...archiveBindings,
        moveToSpaceAvailable: moveTargets.value.length > 0 && task.activity === 'idle' && !props.pendingConversationIds?.includes(task.id),
        onMoveToSpace: () => taskMoveTargetId.value = task.id,
      }
    : archiveBindings
}
function revealMovedTask(spaceId: string) {
  void props.sidebar.setSectionExpanded('spaces', true)
  void props.sidebar.setSpaceExpanded(spaceId, true)
}
// 拖入空间不经过确认对话框，失败时直接提示。
const message = useMessage()
async function moveDroppedTask(taskId: string, spaceId: string) {
  try {
    if (await props.moveTaskToSpace(taskId, spaceId))
      revealMovedTask(spaceId)
  }
  catch (error) {
    message.error(resolveLocalChatErrorMessage(error, props.language))
  }
}
const sidebarLayoutStyle = {
  '--buddy-task-sidebar-row-height': `${DESKTOP_TASK_SIDEBAR_ROW_HEIGHT}px`,
  '--buddy-task-sidebar-row-size': `${DESKTOP_TASK_SIDEBAR_ROW_SIZE}px`,
  '--buddy-task-sidebar-section-header-size': `${DESKTOP_TASK_SIDEBAR_SECTION_HEADER_SIZE}px`,
}
const {
  beginPinnedDrag,
  confirmTaskDelete,
  confirmTaskRename,
  confirmSpaceDelete,
  draggedPinnedItemKey,
  dropPinnedItem,
  endPinnedDrag,
  enterPinnedDropTarget,
  expandConversationGroup,
  getTaskTitle,
  getPinnedDropPosition,
  isSectionExpanded,
  isSpaceExpanded,
  openSpaceCreator,
  pinTask,
  pinSpace,
  pinnedItems: visiblePinnedItems,
  pinnedRows,
  recordScrollAnchor,
  scrollAnchors,
  setSectionExpanded,
  spaceDeleteTarget,
  spaceDialogOpen,
  spaceEditTarget,
  spaceRows,
  relativeTimeNow,
  requestTaskDelete,
  requestTaskRename,
  spaceActivities,
  taskActivities,
  tasksSectionActivity,
  saveSpace,
  selectSpaceMenuAction,
  taskRows,
  taskDeleteTarget,
  taskRenameTarget,
  taskTitleDraft,
  toggleSpace,
  unpinItem,
} = useTaskIndexController({
  getUntitledLabel: () => t('desktop.tasks.untitled'),
  markStates: () => props.marks.states.value,
  onCreateSpace: input => props.createSpace(input),
  onDeleteTask: (conversationId, expectedRevision) => emit('deleteTask', conversationId, expectedRevision),
  onDeleteSpace: spaceId => emit('deleteSpace', spaceId),
  onNewTask: spaceId => emit('newTask', spaceId),
  onOpenSpaceDirectory: spaceId => emit('openSpaceDirectory', spaceId),
  onRenameTask: (conversationId, title) => emit('renameTask', conversationId, title),
  onUpdatePinnedItems: items => emit('updatePinnedItems', items),
  onUpdateSpace: input => props.updateSpace(input),
  activities: () => props.activities,
  pinnedItems: toRef(props, 'pinnedItems'),
  sidebar: () => props.sidebar,
  spaces: toRef(props, 'spaces'),
  tasks: toRef(props, 'tasks'),
})

function taskActivity(task: LocalConversationSummary) {
  return taskActivities.value.get(task.id) ?? task.activity
}
function sectionActivityLabel(activity: TaskSidebarActivity | undefined) {
  if (activity === 'awaiting_answer')
    return t('activity.awaitingAnswer')
  if (activity === 'awaiting_approval')
    return t('activity.approval')
  return t('run.status.running')
}
function openSearchTask(conversation: LocalConversationSummary) {
  searchOpen.value = false
  emit('openTask', conversation.id)
}

function openSearchSpace(spaceId: string) {
  searchOpen.value = false
  emit('newTask', spaceId)
}
</script>

<template>
  <aside id="desktop-task-sidebar" class="desktop-task-sidebar">
    <header class="desktop-task-sidebar__header">
      <button class="desktop-task-sidebar__search-trigger" type="button" :aria-label="t('desktop.search.title')" @click="searchOpen = true">
        <DesktopIcon name="toolSearch" :size="14" />
        <span>{{ t('desktop.search.title') }}</span>
      </button>
      <NTooltip>
        <template #trigger>
          <button class="desktop-task-sidebar__marks-trigger" type="button" :aria-label="t('desktop.marks.manage')" @click="marksOpen = true">
            <DesktopIcon :component="Tag20Regular" :size="16" />
          </button>
        </template>
        {{ t('desktop.marks.manage') }}
      </NTooltip>
    </header>

    <slot name="navigation" />

    <NAlert v-if="marks.error.value && !marksOpen" type="error" :show-icon="false">
      {{ marks.error.value }}
      <NButton text @click="marks.refresh">
        {{ t('desktop.marks.retry') }}
      </NButton>
    </NAlert>
    <div class="desktop-task-sidebar__content">
      <nav :style="sidebarLayoutStyle">
        <DesktopTaskSidebarSection
          v-if="visiblePinnedItems.length > 0"
          :expanded="isSectionExpanded('pinned')"
          :items="pinnedRows"
          key-field="key"
          :label="t('desktop.tasks.pinnedSection')"
          :priority="DESKTOP_TASK_SIDEBAR_SECTION_PRIORITIES.pinned"
          :scroll-index="scrollAnchors.pinned"
          section="pinned"
          @scroll="index => recordScrollAnchor('pinned', index)"
          @update:expanded="value => setSectionExpanded('pinned', value)"
        >
          <template #default="{ item }">
            <div v-if="item.kind === 'space'" class="desktop-task-sidebar__space-item">
              <DesktopTaskSpaceRow
                :dragging="draggedPinnedItemKey === item.pinKey"
                :drop-position="item.pinnedTopLevel ? getPinnedDropPosition(item.pinKey) : undefined"
                :expanded="isSpaceExpanded(item.space.id)"
                :language="language"
                pin-mode="unpin"
                :activity="spaceActivities.get(item.space.id)"
                :space="item.space"
                :reorderable="item.pinnedTopLevel"
                reorder-target
                @drag-end="endPinnedDrag"
                @drag-over="enterPinnedDropTarget(item.pinKey!, $event)"
                @drag-start="beginPinnedDrag(item.pinKey!)"
                @drop="dropPinnedItem(item.pinKey!, $event)"
                @menu="selectSpaceMenuAction(item.space, $event)"
                @pin="unpinItem(item.pinKey!)"
                @toggle="toggleSpace(item.space.id)"
              />
            </div>
            <DesktopTaskSidebarExpandRow
              v-else-if="item.kind === 'expand'"
              :label="t('desktop.tasks.expandRemaining', { count: item.remaining })"
              space-task
              @expand="expandConversationGroup(item.groupKey)"
            />
            <DesktopTaskRow
              v-else
              :task-id="item.task.id"
              :active="item.task.id === activeConversationId"
              :activity="taskActivity(item.task)"
              v-bind="{ ...markBindings(item.task.id), ...taskMenuBindings(item.task) }"
              :dragging="item.pinnedTopLevel && draggedPinnedItemKey === item.pinKey"
              :drop-position="item.pinnedTopLevel ? getPinnedDropPosition(item.pinKey) : undefined"
              :language="language"
              :now="relativeTimeNow"
              :occurred-at="item.task.automationOccurrence?.scheduledFor ?? item.task.updatedAt"
              :pin-mode="item.pinnedTopLevel ? 'unpin' : 'pin'"
              :space-task="item.spaceTask"
              :reorderable="item.pinnedTopLevel"
              :reorder-target="item.pinnedTopLevel"
              :title="getTaskTitle(item.task)"
              @delete="requestTaskDelete(item.task)"
              @drag-end="endPinnedDrag"
              @drag-over="enterPinnedDropTarget(item.pinKey!, $event)"
              @drag-start="beginPinnedDrag(item.pinKey!)"
              @drop="dropPinnedItem(item.pinKey!, $event)"
              @open="emit('openTask', item.task.id)"
              @pin="item.pinnedTopLevel ? unpinItem(item.pinKey!) : pinTask(item.task.id)"
              @rename="requestTaskRename(item.task)"
            />
          </template>
        </DesktopTaskSidebarSection>

        <DesktopTaskSidebarSection
          :expanded="isSectionExpanded('spaces')"
          :items="spaceRows"
          key-field="key"
          :label="t('desktop.tasks.spacesSection')"
          :priority="DESKTOP_TASK_SIDEBAR_SECTION_PRIORITIES.spaces"
          :scroll-index="scrollAnchors.spaces"
          section="spaces"
          show-add
          @add="openSpaceCreator"
          @scroll="index => recordScrollAnchor('spaces', index)"
          @update:expanded="value => setSectionExpanded('spaces', value)"
        >
          <template #default="{ item }">
            <div v-if="item.kind === 'space'" class="desktop-task-sidebar__space-item">
              <DesktopTaskSpaceRow
                :expanded="isSpaceExpanded(item.space.id)"
                :language="language"
                pin-mode="pin"
                :activity="spaceActivities.get(item.space.id)"
                :space="item.space"
                @menu="selectSpaceMenuAction(item.space, $event)"
                @move-task="moveDroppedTask($event, item.space.id)"
                @pin="pinSpace(item.space.id)"
                @toggle="toggleSpace(item.space.id)"
              />
            </div>
            <DesktopTaskSidebarExpandRow
              v-else-if="item.kind === 'expand'"
              :label="t('desktop.tasks.expandRemaining', { count: item.remaining })"
              space-task
              @expand="expandConversationGroup(item.groupKey)"
            />
            <DesktopTaskRow
              v-else
              :task-id="item.task.id"
              :active="item.task.id === activeConversationId"
              :activity="taskActivity(item.task)"
              :language="language"
              :now="relativeTimeNow"
              :occurred-at="item.task.automationOccurrence?.scheduledFor ?? item.task.updatedAt"
              pin-mode="pin"
              :space-task="item.spaceTask"
              v-bind="{ ...markBindings(item.task.id), ...taskMenuBindings(item.task) }"
              :title="getTaskTitle(item.task)"
              @delete="requestTaskDelete(item.task)"
              @open="emit('openTask', item.task.id)"
              @pin="pinTask(item.task.id)"
              @rename="requestTaskRename(item.task)"
            />
          </template>
        </DesktopTaskSidebarSection>

        <DesktopTaskSidebarSection
          :activity="tasksSectionActivity"
          :activity-label="sectionActivityLabel(tasksSectionActivity)"
          :expanded="isSectionExpanded('tasks')"
          :items="taskRows"
          key-field="key"
          :label="t('desktop.tasks.tasksSection')"
          :priority="DESKTOP_TASK_SIDEBAR_SECTION_PRIORITIES.tasks"
          :scroll-index="scrollAnchors.tasks"
          section="tasks"
          show-add
          @add="emit('newTask', null)"
          @scroll="index => recordScrollAnchor('tasks', index)"
          @update:expanded="value => setSectionExpanded('tasks', value)"
        >
          <template #default="{ item }">
            <DesktopTaskSidebarExpandRow
              v-if="item.kind === 'expand'"
              :label="t('desktop.tasks.expandRemaining', { count: item.remaining })"
              @expand="expandConversationGroup(item.groupKey)"
            />
            <DesktopTaskRow
              v-else-if="item.kind === 'task'"
              :task-id="item.task.id"
              :active="item.task.id === activeConversationId"
              :activity="taskActivity(item.task)"
              v-bind="{ ...markBindings(item.task.id), ...taskMenuBindings(item.task) }"
              :language="language"
              :now="relativeTimeNow"
              :occurred-at="item.task.automationOccurrence?.scheduledFor ?? item.task.updatedAt"
              pin-mode="pin"
              :title="getTaskTitle(item.task)"
              @delete="requestTaskDelete(item.task)"
              @open="emit('openTask', item.task.id)"
              @pin="pinTask(item.task.id)"
              @rename="requestTaskRename(item.task)"
            />
          </template>
        </DesktopTaskSidebarSection>
      </nav>
    </div>

    <DesktopTaskArchiveAction v-model:target="archiveTarget" v-model:busy="archiveBusy" :actions="archive" :language="language" />

    <DesktopTaskSearchDialog
      v-model:show="searchOpen"
      :search="(query, cursor) => search(query, cursor)"
      :language="language"
      :spaces="spaces"
      @open-task="openSearchTask"
      @open-space="openSearchSpace"
    />

    <DesktopTaskMarkManager v-model:show="marksOpen" :marks="marks" :language="language" />

    <DesktopTaskMoveToSpaceDialog
      :show="taskMoveTargetId !== null"
      :task="taskMoveTarget"
      :busy="taskMoveBusy"
      :language="language"
      :spaces="moveTargets"
      :move-task-to-space="moveTaskToSpace"
      @update:show="!$event && (taskMoveTargetId = null)"
      @moved="revealMovedTask"
    />

    <DesktopSpaceDialog
      v-model:show="spaceDialogOpen"
      :language="language"
      :space="spaceEditTarget"
      :select-directory="selectSpaceDirectory"
      :save="saveSpace"
    />

    <NModal
      :show="spaceDeleteTarget !== null"
      preset="dialog"
      type="warning"
      :title="t('desktop.tasks.deleteSpaceTitle')"
      @update:show="!$event && (spaceDeleteTarget = null)"
    >
      <div class="desktop-task-sidebar__delete-space-content">
        <p>
          {{ t('desktop.tasks.deleteSpaceMessage', { name: spaceDeleteTarget?.name ?? '' }) }}
        </p>
        <NAlert
          v-if="spaceDeleteTarget && spaceDeleteTarget.activeRunCount > 0"
          :show-icon="false"
          type="warning"
        >
          {{ t('desktop.tasks.deleteSpaceActiveRunWarning', { count: spaceDeleteTarget.activeRunCount }) }}
        </NAlert>
        <p v-else class="desktop-task-sidebar__delete-space-retention">
          {{ t('desktop.tasks.deleteSpaceRetention') }}
        </p>
      </div>
      <template #action>
        <NButton @click="spaceDeleteTarget = null">
          {{ spaceDeleteTarget && spaceDeleteTarget.activeRunCount > 0 ? t('common.close') : t('common.cancel') }}
        </NButton>
        <NButton
          v-if="spaceDeleteTarget && spaceDeleteTarget.activeRunCount === 0"
          type="error"
          @click="confirmSpaceDelete"
        >
          {{ t('common.delete') }}
        </NButton>
      </template>
    </NModal>

    <NModal
      :show="taskRenameTarget !== null"
      preset="dialog"
      :title="t('desktop.tasks.renameTask')"
      @update:show="!$event && (taskRenameTarget = null)"
    >
      <div class="desktop-task-sidebar__rename-content">
        <NInput
          v-model:value="taskTitleDraft"
          maxlength="80"
          show-count
          autofocus
          @keyup.enter="confirmTaskRename"
        />
      </div>
      <template #action>
        <NButton @click="taskRenameTarget = null">
          {{ t('common.cancel') }}
        </NButton>
        <NButton
          type="primary"
          :disabled="!taskTitleDraft.trim()"
          @click="confirmTaskRename"
        >
          {{ t('common.save') }}
        </NButton>
      </template>
    </NModal>

    <NModal
      :show="taskDeleteTarget !== null"
      data-testid="task-permanent-delete-confirm"
      preset="dialog"
      type="warning"
      :title="t('desktop.tasks.deleteTaskConfirmTitle')"
      @update:show="!$event && (taskDeleteTarget = null)"
    >
      {{ t('desktop.tasks.deleteTaskConfirmMessage', { title: taskDeleteTarget ? getTaskTitle(taskDeleteTarget) : '' }) }}
      <template #action>
        <NButton @click="taskDeleteTarget = null">
          {{ t('common.cancel') }}
        </NButton>
        <NButton type="error" :disabled="!archive.ready.value || taskDeleteTarget?.metadataRevision === undefined" @click="confirmTaskDelete">
          {{ t('common.delete') }}
        </NButton>
      </template>
    </NModal>

    <slot name="footer" />
  </aside>
</template>

<style scoped lang="scss">
.desktop-task-sidebar {
  display: flex;
  width: var(--buddy-workspace-sidebar-width);
  height: 100%;
  min-height: 0;
  flex: none;
  flex-direction: column;
  border-right: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-workspace-sidebar);
}

.desktop-task-sidebar__header {
  display: flex;
  height: var(--buddy-region-header-height);
  flex: none;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
}

.desktop-task-sidebar__search-trigger {
  display: flex;
  min-width: 0;
  height: 1.75rem;
  flex: 1;
  align-items: center;
  gap: 0.4rem;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.5rem;
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  padding: 0 0.5rem;
  text-align: left;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    border-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &:hover {
    border-color: var(--buddy-border-strong);
    background: var(--buddy-state-hover);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.desktop-task-sidebar__marks-trigger {
  display: grid;
  width: 1.75rem;
  height: 1.75rem;
  flex: none;
  place-items: center;
  border: 0;
  padding: 0;
  border-radius: var(--buddy-icon-button-radius);
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: pointer;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &:hover {
    background: var(--buddy-state-hover);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.desktop-task-sidebar__content {
  min-height: 0;
  flex: 1;
  overflow: hidden;
  padding: 0.25rem 0 0.5rem;
}

.desktop-task-sidebar nav {
  --buddy-task-sidebar-section-gap: 0.25rem;
  --buddy-task-sidebar-section-font-size: 13px;
  --buddy-task-sidebar-item-font-size: 13px;
  --buddy-task-sidebar-action-gap: 0.125rem;
  --buddy-task-sidebar-action-inset: 0.4rem;
  --buddy-task-sidebar-action-size: 1.5rem;
  --buddy-task-sidebar-scrollbar-gutter: 0.5rem;
  --buddy-task-sidebar-state-radius: 6px;

  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  gap: var(--buddy-task-sidebar-section-gap);
  overflow: hidden;
}

.desktop-task-sidebar__space-item {
  height: var(--buddy-task-sidebar-row-size);
  padding-right: var(--buddy-task-sidebar-scrollbar-gutter);
  padding-bottom: calc(var(--buddy-task-sidebar-row-size) - var(--buddy-task-sidebar-row-height));
  padding-left: var(--buddy-task-sidebar-scrollbar-gutter);
}

.desktop-task-sidebar__rename-content {
  margin-top: 0.75rem;
}

.desktop-task-sidebar__delete-space-content {
  display: grid;
  gap: 0.85rem;
}

.desktop-task-sidebar__delete-space-content p {
  margin: 0;
  line-height: 1.65;
}

.desktop-task-sidebar__delete-space-retention {
  color: var(--buddy-text-secondary);
  font-size: 0.75rem;
}
</style>
