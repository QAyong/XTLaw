<script setup lang="ts">
import type { LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'
import type { LocalTaskMark, LocalTaskMarkState } from '@buddy-shared/conversation/taskMarkApi'
import type { DropdownOption } from 'naive-ui'

import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { DesktopTaskPinnedDropPosition } from '@/modules/tasks/widgets/task-index/taskPinnedItems'
import {
  ApprovalsApp20Regular,
  MoreHorizontal20Regular,
  SpinnerIos20Regular,
} from '@vicons/fluent'
import { NDropdown, NTooltip } from 'naive-ui'
import { computed, h, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopOverflowingLabel from '@/modules/tasks/widgets/task-index/DesktopOverflowingLabel.vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopTaskMarkSwatch from './DesktopTaskMarkSwatch.vue'
import { formatTaskRelativeTime } from './taskRelativeTime'
import { useTaskHistoryDrag } from './useTaskHistoryDrag'
import { useTaskMenuActions } from './useTaskMenuActions'

const props = defineProps<{
  taskId: string
  active: boolean
  loading?: boolean
  marks: readonly LocalTaskMark[]
  markState?: LocalTaskMarkState
  marksBusy: boolean
  activity: LocalConversationSummary['activity']
  /** 仅无空间任务传入。 */
  moveTargets?: ReadonlyArray<{ id: string, name: string }>
  movable?: boolean
  dragging?: boolean
  dropPosition?: DesktopTaskPinnedDropPosition
  language: BuddyLocale
  now: number
  occurredAt: string
  pinMode?: 'pin' | 'unpin'
  spaceTask?: boolean
  reorderable?: boolean
  reorderTarget?: boolean
  title: string
}>()

const emit = defineEmits<{
  delete: []
  assignMark: [markId: string]
  clearMarks: []
  setRead: [read: boolean]
  manageMarks: []
  moveToSpace: [spaceId: string]
  dragEnd: []
  dragOver: [position: DesktopTaskPinnedDropPosition]
  dragStart: []
  drop: [position: DesktopTaskPinnedDropPosition]
  open: []
  pin: []
  rename: []
}>()

const { t } = useBuddyI18n(() => props.language)
const opening = shallowRef(false)
watch(() => props.loading, (loading, _, cleanup) => {
  opening.value = false
  if (loading) {
    const timer = setTimeout(() => opening.value = true, 200)
    cleanup(() => clearTimeout(timer))
  }
}, { immediate: true })
const relativeTimeLabel = computed(() => (
  formatTaskRelativeTime(props.occurredAt, props.now, props.language)
))
const activityIcon = computed(() => props.activity === 'awaiting_approval'
  ? ApprovalsApp20Regular
  : SpinnerIos20Regular)
const activityLabel = computed(() => props.activity === 'awaiting_approval'
  ? t('activity.approval')
  : t('run.status.running'))
const pinLabel = computed(() => props.pinMode === 'pin'
  ? t('desktop.tasks.pin')
  : t('desktop.tasks.unpin'))
const marker = computed(() => props.marks.find(mark => mark.id === props.markState?.markId)
  ?? (props.markState?.unread ? { name: t('desktop.marks.unread'), description: t('desktop.marks.unreadDescription'), color: 'var(--buddy-accent-solid)' } : null))
const { actions: taskActions, select: selectTaskAction } = useTaskMenuActions({
  task: () => props,
  language: () => props.language,
  assignMark: (_, markId) => emit('assignMark', markId),
  clearMarks: () => emit('clearMarks'),
  setRead: (_, read) => emit('setRead', read),
  manageMarks: () => emit('manageMarks'),
  moveTargets: () => props.moveTargets,
  movable: () => props.movable,
  moveToSpace: (_, spaceId) => emit('moveToSpace', spaceId),
})
const actions = computed<DropdownOption[]>(() => [
  ...taskActions.value,
  {
    icon: () => h(DesktopIcon, { name: props.pinMode === 'pin' ? 'windowPin' : 'pinOff' }),
    key: 'pin',
    label: pinLabel.value,
    show: props.pinMode !== undefined,
  },
  { icon: () => h(DesktopIcon, { name: 'edit' }), key: 'rename', label: t('desktop.tasks.renameTask') },
])

function handleAction(action: string | number) {
  selectTaskAction(action)
  if (action === 'rename')
    emit('rename')
  if (action === 'pin')
    emit('pin')
  if (action === 'delete')
    emit('delete')
}

// 右键行弹出与“更多”相同的菜单，位置跟随鼠标。
// 位置单独保存：关闭时保留最后的坐标，菜单才会在原位消失，而不是飞到左上角。
const contextMenuOpen = shallowRef(false)
const contextMenuPosition = shallowRef({ x: 0, y: 0 })
function openContextMenu(event: MouseEvent) {
  contextMenuPosition.value = { x: event.clientX, y: event.clientY }
  contextMenuOpen.value = true
}
function handleContextAction(action: string | number) {
  contextMenuOpen.value = false
  handleAction(action)
}

const dragId = useId()
const element = useTemplateRef<HTMLElement>('row')
const handle = useTemplateRef<HTMLElement>('handle')
useTaskHistoryDrag({
  id: () => dragId,
  element,
  handle,
  type: 'workbench-task',
  data: () => ({
    title: props.title,
    resource: { scheme: 'task', id: props.taskId, data: {} },
    // 置顶区的任务拖拽用于排序，不参与“拖入空间”。
    moveTaskId: props.moveTargets && props.movable && !props.reorderable ? props.taskId : null,
  }),
  disabled: () => false,
  reorderable: () => !!props.reorderable,
  reorderTarget: () => !!props.reorderTarget,
  start: () => emit('dragStart'),
  end: () => emit('dragEnd'),
  over: position => emit('dragOver', position),
  drop: position => emit('drop', position),
})
</script>

<template>
  <div
    ref="row"
    class="desktop-task-row"
    :data-task-id="taskId"
    :class="{
      'is-active': active,
      'is-dragging': dragging,
      'is-drop-after': dropPosition === 'after',
      'is-drop-before': dropPosition === 'before',
      'is-space-task': spaceTask,
      'is-reorderable': reorderable,
    }"
    @contextmenu.prevent="openContextMenu"
  >
    <NDropdown
      class="buddy-spaced-submenus"
      trigger="manual"
      placement="bottom-start"
      :show="contextMenuOpen"
      :x="contextMenuPosition.x"
      :y="contextMenuPosition.y"
      :options="actions"
      @clickoutside="contextMenuOpen = false"
      @select="handleContextAction"
    />
    <div
      class="desktop-task-row__surface"
      :class="{ 'is-active': active, 'is-space': spaceTask }"
    >
      <span class="desktop-task-row__mark" :data-mark-id="markState?.markId ?? (markState?.unread ? 'system:unread' : undefined)">
        <NTooltip v-if="marker" placement="right">
          <template #trigger>
            <span role="img" :aria-label="marker.name"><DesktopTaskMarkSwatch :color="marker.color" compact /></span>
          </template>
          <div class="desktop-task-row__mark-tooltip">
            <strong>{{ marker.name }}</strong>
            <p v-if="marker.description">{{ marker.description }}</p>
          </div>
        </NTooltip>
        <DesktopTaskMarkSwatch v-else compact />
      </span>
      <button
        ref="handle"
        class="desktop-task-sidebar__task"
        :class="{ 'is-active': active }"
        type="button"
        :aria-busy="loading || undefined"
        @click="emit('open')"
      >
        <span v-if="opening" class="desktop-task-row__opening" aria-hidden="true"><DesktopIcon :component="SpinnerIos20Regular" /></span>
        <DesktopOverflowingLabel :paused="dragging" :text="title" />
      </button>
      <div class="desktop-task-row__trailing">
        <time
          v-if="activity === 'idle'"
          class="desktop-task-row__relative-time"
          :datetime="occurredAt"
        >{{ relativeTimeLabel }}</time>
        <span
          v-else
          class="desktop-task-row__activity"
          :class="{
            'is-awaiting-approval': activity === 'awaiting_approval',
            'is-running': activity === 'running',
          }"
          role="status"
          :aria-label="activityLabel"
        >
          <DesktopIcon :component="activityIcon" />
        </span>
        <div class="desktop-task-row__actions">
          <NDropdown class="buddy-spaced-submenus" trigger="click" placement="bottom-start" :options="actions" @select="handleAction">
            <button
              class="desktop-task-sidebar__more"
              type="button"
              :aria-label="t('desktop.tasks.moreActions')"
            >
              <DesktopIcon :component="MoreHorizontal20Regular" />
            </button>
          </NDropdown>
          <button
            class="desktop-task-sidebar__more desktop-task-sidebar__delete"
            type="button"
            :aria-label="t('desktop.tasks.deleteTask')"
            @click="emit('delete')"
          >
            <DesktopIcon name="delete" :size="16" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.desktop-task-row {
  position: relative;
  height: var(--buddy-task-sidebar-row-size, 2.5rem);
  min-width: 0;
  padding-right: var(--buddy-task-sidebar-scrollbar-gutter, 0);
  padding-bottom: calc(var(--buddy-task-sidebar-row-size, 2.5rem) - var(--buddy-task-sidebar-row-height, 2.25rem));
  padding-left: var(--buddy-task-sidebar-scrollbar-gutter, 0);

  &.is-space-task {
    padding-left: 1.75rem;
  }

  &.is-reorderable {
    cursor: grab;
  }

  &.is-dragging {
    opacity: 0.48;
  }

  &.is-drop-before::before,
  &.is-drop-after::after {
    position: absolute;
    z-index: 1;
    right: var(--buddy-task-sidebar-scrollbar-gutter, 0);
    left: var(--buddy-task-sidebar-scrollbar-gutter, 0);
    height: 2px;
    background: var(--buddy-accent-solid);
    content: '';
    pointer-events: none;
  }

  &.is-drop-before::before {
    top: 0;
  }

  &.is-drop-after::after {
    bottom: 0;
  }
}

.desktop-task-row__surface {
  position: relative;
  display: flex;
  height: 100%;
  min-width: 0;
  align-items: center;
  padding-left: 6px;
  border-radius: var(--buddy-task-sidebar-state-radius, 8px);
  color: var(--buddy-text-primary);
  transition: background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  &:hover,
  &:focus-within {
    background: var(--buddy-state-hover);
  }

  &.is-active {
    background: var(--buddy-nav-selected);
  }

  &.is-active:hover {
    background: var(--buddy-nav-pressed);
  }

}

button {
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}

.desktop-task-row__mark {
  display: grid;
  width: 3px;
  flex: none;
  place-items: center;
  line-height: 0;
}

.desktop-task-row__mark-tooltip {
  max-width: 260px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;

  p { margin: 4px 0 0; font-size: 12px; }
}

.desktop-task-sidebar__task {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  color: var(--buddy-text-primary);
  font-size: var(--buddy-task-sidebar-item-font-size, var(--buddy-sidebar-item-font-size));
  font-weight: var(--buddy-sidebar-item-font-weight);
  line-height: 20px;
  padding: 0 0.5rem 0 4px;
  text-align: left;

  .desktop-overflow-label {
    flex: 1;
  }

  &.is-active {
    color: var(--buddy-nav-foreground);
  }

  &:focus-visible {
    border-radius: 6px;
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.desktop-task-sidebar__more {
  display: grid;
  width: var(--buddy-task-sidebar-action-size, 1.75rem);
  height: var(--buddy-task-sidebar-action-size, 1.75rem);
  flex: none;
  place-items: center;
  padding: 0;
  border-radius: var(--buddy-icon-button-radius);
  color: var(--buddy-text-muted);
  line-height: 1;
  transition:
    background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing),
    color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);

  .n-icon {
    display: flex;
    font-size: 16px;
  }

  &:hover {
    background: var(--buddy-nav-hover);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.desktop-task-row__trailing {
  display: grid;
  width: calc(2 * var(--buddy-task-sidebar-action-size, 1.75rem) + var(--buddy-task-sidebar-action-gap, 0.125rem) + var(--buddy-task-sidebar-action-inset, 0.25rem));
  flex: none;
  align-items: center;
  padding-right: var(--buddy-task-sidebar-action-inset, 0.25rem);
}

.desktop-task-row__relative-time,
.desktop-task-row__activity,
.desktop-task-row__actions {
  grid-area: 1 / 1;
  justify-self: end;
}

.desktop-task-sidebar__delete {
  color: var(--buddy-text-muted);

  &:hover {
    color: var(--buddy-status-danger-text);
  }
}

.desktop-task-row__opening {
  display: flex;
  flex: none;
  margin-right: 6px;
  color: var(--buddy-text-muted);
  .n-icon { font-size: 16px; animation: desktop-task-row-spin 1s linear infinite; }
}

.desktop-task-row__activity {
  display: grid;
  width: var(--buddy-task-sidebar-action-size, 1.75rem);
  height: var(--buddy-task-sidebar-action-size, 1.75rem);
  place-items: center;
  pointer-events: none;

  .n-icon {
    font-size: 16px;
  }

  &.is-running {
    color: var(--buddy-text-muted);

    .n-icon {
      animation: desktop-task-row-spin 1s linear infinite;
    }
  }

  &.is-awaiting-approval {
    color: var(--buddy-status-warning-text);
  }
}

.desktop-task-row__relative-time {
  max-width: 100%;
  overflow: hidden;
  color: var(--buddy-text-muted);
  font-size: 0.75rem;
  line-height: 1;
  pointer-events: none;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-task-row__actions {
  display: flex;
  align-items: center;
  gap: var(--buddy-task-sidebar-action-gap, 0.125rem);
  opacity: 0;
  pointer-events: none;
}

.desktop-task-row:hover .desktop-task-row__relative-time,
.desktop-task-row:has(:focus-visible) .desktop-task-row__relative-time,
.desktop-task-row:hover .desktop-task-row__activity,
.desktop-task-row:has(:focus-visible) .desktop-task-row__activity {
  opacity: 0;
}

.desktop-task-row:hover .desktop-task-row__actions,
.desktop-task-row:has(:focus-visible) .desktop-task-row__actions {
  opacity: 1;
  pointer-events: auto;
}

@keyframes desktop-task-row-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-task-row__activity.is-running .n-icon,
  .desktop-task-row__opening .n-icon {
    animation: none;
  }
}
</style>
