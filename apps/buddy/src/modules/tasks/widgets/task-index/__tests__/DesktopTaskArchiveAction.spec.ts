// @vitest-environment jsdom
import type { LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'
import type { TaskArchiveActions } from '../../../contracts'
import { deferred } from '@buddy-tests/deferred'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import DesktopTaskArchiveAction from '../DesktopTaskArchiveAction.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  document.body.innerHTML = ''
})
function task(id: string, activity: LocalConversationSummary['activity']): LocalConversationSummary {
  return { id, title: id, activity, buddyId: 'default', activeBranchId: `branch-${id}`, spaceId: null, createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', deletedAt: null, archivedAt: null, approvalPolicy: 'policy', executionProfile: 'workspace_write', modelSelection: null, automationOccurrence: null, metadataRevision: 4 }
}
async function mount() {
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true }))
  const target = shallowRef<LocalConversationSummary | null>(null)
  const busy = shallowRef(false)
  const ready = shallowRef(true)
  const revision = shallowRef(5)
  const archive = vi.fn<TaskArchiveActions['archive']>().mockResolvedValue(true)
  const restore = vi.fn<TaskArchiveActions['restore']>().mockResolvedValue(true)
  const get = vi.fn(async (id: string) => ({ ...task(id, 'idle'), archivedAt: '2026-09-02T00:00:00Z', metadataRevision: revision.value }))
  const actions: TaskArchiveActions = { onChanged: () => () => {}, get, ready, archive, restore, delete: vi.fn(), list: vi.fn(), getPolicy: vi.fn(), setPolicy: vi.fn() }
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(DesktopTaskArchiveAction, { actions, language: 'zh-CN', target: target.value, busy: busy.value, 'onUpdate:target': value => target.value = value, 'onUpdate:busy': value => busy.value = value }) })
  app.mount(root)
  cleanups.push(() => app.unmount())
  await nextTick()
  return { target, busy, ready, revision, archive, restore, get, root, archiveTask: async (value: LocalConversationSummary) => { target.value = value; await nextTick() } }
}
function button(label: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === label)
}

it.each(['running', 'awaiting_approval'] as const)('archives an active %s session directly without a confirmation or automatic undo', async (activity) => {
  const f = await mount()
  await f.archiveTask(task('active', activity))
  await vi.waitFor(() => expect(f.archive).toHaveBeenCalledWith('active', 4))
  await vi.waitFor(() => expect(f.target.value).toBeNull())
  expect(document.querySelector('[data-testid="task-archive-confirm"]')).toBeNull()
  expect(document.body.textContent).not.toContain('停止此任务及其子执行')
  expect(button('撤销归档')).toBeUndefined()
  expect(f.get).not.toHaveBeenCalled()
  expect(f.busy.value).toBe(false)
})

it('gives idle archives an undo receipt and restores by the archived revision', async () => {
  const f = await mount()
  await f.archiveTask(task('idle', 'idle'))
  await vi.waitFor(() => expect(f.target.value).toBeNull())
  await vi.waitFor(() => expect(button('撤销归档')?.disabled).toBe(false))
  expect(document.querySelector('[data-testid="task-archive-confirm"]')).toBeNull()
  expect(f.get).toHaveBeenCalledWith('idle')
  f.revision.value = 6
  button('撤销归档')!.click()
  await vi.waitFor(() => expect(f.restore.mock.calls).toEqual([['idle', 5]]))
  await vi.waitFor(() => expect(button('撤销归档')).toBeUndefined())
})

it('keeps a failed task in the caller list and reports the archive error without opening a dialog', async () => {
  const f = await mount()
  f.archive.mockResolvedValueOnce(false)
  await f.archiveTask(task('retryable', 'idle'))
  await vi.waitFor(() => expect(f.target.value).toBeNull())
  expect(document.querySelector('[data-testid="task-archive-confirm"]')).toBeNull()
  expect(f.root.textContent).toContain('操作未完成')
  expect(f.get).not.toHaveBeenCalled()
})

it('does not clear a replacement target when an earlier archive finishes late', async () => {
  const f = await mount()
  const gate = deferred<boolean>()
  f.archive.mockReturnValueOnce(gate.promise)
  await f.archiveTask(task('first', 'idle'))
  await vi.waitFor(() => expect(f.busy.value).toBe(true))
  f.target.value = task('replacement', 'idle')
  await nextTick()
  gate.resolve(true)
  await nextTick()
  await nextTick()
  expect(f.target.value?.id).toBe('replacement')
  expect(f.busy.value).toBe(false)
})
