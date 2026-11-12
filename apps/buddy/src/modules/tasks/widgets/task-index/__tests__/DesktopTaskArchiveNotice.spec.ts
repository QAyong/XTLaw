// @vitest-environment jsdom
import type { LocalConversation } from '@buddy-shared/conversation/conversationApi'
import type { TaskArchiveActions } from '../../../contracts'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import DesktopTaskArchiveNotice from '../DesktopTaskArchiveNotice.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  document.body.innerHTML = ''
})

it('marks archived history read-only and unarchives without resuming execution or restoring permissions', async () => {
  const ready = shallowRef(true)
  const restore = vi.fn<TaskArchiveActions['restore']>().mockResolvedValue(true)
  const task = {
    id: 'archived-task', title: 'Archived task', buddyId: 'default', activeBranchId: 'branch', activity: 'idle',
    spaceId: null, createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z', deletedAt: null,
    archivedAt: '2026-11-02T00:00:00Z', metadataRevision: 9, approvalPolicy: 'policy', executionProfile: 'workspace_write',
    modelSelection: null, automationOccurrence: null,
  } as unknown as LocalConversation
  const actions = { ready, restore } as unknown as TaskArchiveActions
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(DesktopTaskArchiveNotice, { task, actions, language: 'zh-CN' }) })
  app.mount(root)
  cleanups.push(() => app.unmount())
  await nextTick()

  expect(root.textContent).toContain('此任务已归档，仅可阅读历史')
  expect(root.textContent).toContain('取消归档不会自动恢复执行或权限')
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === '取消归档')!
  button.click()
  await vi.waitFor(() => expect(restore.mock.calls).toEqual([['archived-task', 9]]))
})
