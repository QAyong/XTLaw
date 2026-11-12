import type { LocalConversation } from '@buddy-shared/conversation/conversationApi'
import type { LocalSpace } from '@buddy-shared/spaces/spaceApi'
import { expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useTaskIndexManagement } from '../useTaskIndexManagement'

it('holds permanent deletion behind the existing confirmation target and submits its captured revision only on confirm', () => {
  const scope = effectScope()
  const deleteTask = vi.fn()
  const target: LocalConversation = {
    id: 'task-one', title: 'Task one', buddyId: 'default', activeBranchId: 'branch', spaceId: null,
    createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', deletedAt: null,
    archivedAt: null, metadataRevision: 12, approvalPolicy: 'policy', executionProfile: 'workspace_write',
    modelSelection: null,
  }
  const controller = scope.run(() => useTaskIndexManagement({
    spaces: shallowRef<readonly LocalSpace[]>([]),
    getUntitledLabel: () => 'Untitled',
    onCreateSpace: async () => true,
    onDeleteTask: deleteTask,
    onDeleteSpace() {},
    onNewTask() {},
    onOpenSpaceDirectory() {},
    onRenameTask() {},
    onUpdateSpace: async () => true,
  }))!
  try {
    controller.requestTaskDelete(target)
    expect(controller.taskDeleteTarget.value).toEqual(target)
    expect(deleteTask).not.toHaveBeenCalled()
    controller.confirmTaskDelete()
    expect(deleteTask).toHaveBeenCalledWith('task-one', 12)
    expect(controller.taskDeleteTarget.value).toBeNull()
  }
  finally {
    scope.stop()
  }
})
