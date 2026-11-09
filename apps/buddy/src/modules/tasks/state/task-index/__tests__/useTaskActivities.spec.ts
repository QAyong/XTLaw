import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'
import type { LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'
import type { LocalExecution } from '@buddy-shared/executions/executionPresentationApi'
import type { ShallowRef } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useTaskActivities } from '../useTaskActivities'

const scopes: ReturnType<typeof effectScope>[] = []
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  vi.useRealTimers()
})

function task(id: string, activity: LocalConversationSummary['activity'] = 'running'): LocalConversationSummary {
  return {
    buddyId: 'default',
    id,
    title: id,
    activity,
    activeBranchId: 'branch',
    spaceId: null,
    deletedAt: null,
    createdAt: '2026-11-09T00:00:00.000Z',
    updatedAt: '2026-11-09T00:00:00.000Z',
    approvalPolicy: 'policy',
    executionProfile: 'workspace_write',
    modelSelection: null,
    automationOccurrence: null,
  }
}

function execution(patch: Partial<LocalExecution> = {}): LocalExecution {
  return {
    phase: 'waiting',
    waitingFor: 'user_answer',
    stopping: false,
    ...patch,
  } as LocalExecution
}

function mount(options: {
  tasks?: ShallowRef<readonly LocalConversationSummary[]>
  executions?: LocalExecution[]
} = {}) {
  const tasks: ShallowRef<readonly LocalConversationSummary[]> = options.tasks ?? shallowRef([task('task')])
  const listed: Array<{ conversationId: string, branchId: string }> = []
  const listeners = new Set<(event: { conversationId: string }) => void>()
  const errors: unknown[] = []
  let executions = options.executions ?? [execution()]
  const api = {
    list: vi.fn(async (input: { conversationId: string, branchId: string }) => {
      listed.push(input)
      return executions
    }),
    onChanged: (listener: (event: { conversationId: string }) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
  const scope = effectScope()
  scopes.push(scope)
  const state = scope.run(() => useTaskActivities({
    api: api as unknown as LexoraDesktopApi['localChat']['executions'],
    tasks,
    onError: error => errors.push(error),
  }))!
  return {
    api,
    errors,
    listed,
    listeners,
    state,
    tasks,
    setExecutions: (next: LocalExecution[]) => {
      executions = next
    },
  }
}

const running = () => mount()

describe('useTaskActivities', () => {
  it('marks a running task as awaiting an answer without changing stored activity', async () => {
    const { listed, state } = running()
    await vi.waitFor(() => expect(state.activities.value.get('task')).toBe('awaiting_answer'))
    expect(listed).toEqual([{ conversationId: 'task', branchId: 'branch' }])
  })

  it('keeps the spinner state when the wait is not for the user', async () => {
    const { api, state } = mount({ executions: [execution({ waitingFor: 'approval', stopping: true })] })
    await vi.waitFor(() => expect(api.list).toHaveBeenCalled())
    await api.list.mock.results[0]?.value
    expect(state.activities.value.get('task')).toBe('running')
  })

  it('does not query idle tasks and clears the overlay when running ends', async () => {
    const tasks = shallowRef<readonly LocalConversationSummary[]>([task('task', 'idle')])
    const { api, state } = mount({ tasks })
    await Promise.resolve()
    expect(api.list).not.toHaveBeenCalled()
    expect(state.activities.value.get('task')).toBe('idle')

    tasks.value = [task('task')]
    await vi.waitFor(() => expect(state.activities.value.get('task')).toBe('awaiting_answer'))
    tasks.value = [task('task', 'awaiting_approval')]
    await vi.waitFor(() => expect(state.activities.value.get('task')).toBe('awaiting_approval'))
  })

  it('refreshes after an execution change and reports list failures', async () => {
    const { api, errors, listeners, state } = running()
    await vi.waitFor(() => expect(state.activities.value.get('task')).toBe('awaiting_answer'))
    api.list.mockRejectedValueOnce(new Error('offline'))
    listeners.forEach(listener => listener({ conversationId: 'task' }))
    await vi.waitFor(() => expect(errors).toEqual([new Error('offline')]))
    expect(state.activities.value.get('task')).toBe('running')
  })
})
