import type { LocalExecution } from '../../../shared/executions/executionPresentationApi'
import type { DesktopSystemNotification } from '../DesktopNotificationService'
import { describe, expect, it, vi } from 'vitest'
import { DesktopNotificationService } from '../DesktopNotificationService'

type TestNotification = DesktopSystemNotification & {
  click: () => void
  dismiss: (reason?: 'userCanceled' | 'applicationHidden' | 'timedOut') => void
  fail: () => void
}

function fixture(kind: LocalExecution['kind'] = 'root') {
  const notifications: TestNotification[] = []
  const target = { conversationId: 'conversation-1', runId: 'run-1' }
  const openTarget = vi.fn()
  const onError = vi.fn()
  const settings = { notificationsEnabled: true, subtaskNotificationsEnabled: true, notifyWhenFocused: false }
  const execution: LocalExecution = {
    runId: 'run-1',
    rootRunId: kind === 'root' ? 'run-1' : 'root',
    parentRunId: kind === 'root' ? null : 'root',
    buddyId: 'default',
    buddyName: '审查者',
    ordinal: kind === 'root' ? null : 2,
    kind,
    phase: 'closed',
    status: 'completed',
    startedAt: '2026-08-19T07:59:00.000Z',
    completedAt: '2026-08-19T08:00:00.000Z',
    updatedAt: '2026-08-19T08:00:00.000Z',
    progress: null,
    toolCount: 1,
    stopping: false,
    task: '检查发布产物\n  与升级路径',
    waitingFor: null,
    activeChildren: 0,
    canCancel: false,
    canAnswer: false,
    canSend: false,
    cleanup: 'clean',
    errorCode: null,
    affectedResources: [],
    questions: [],
  }
  const service = new DesktopNotificationService({
    createNotification() {
      let click = () => {}
      let dismiss: (reason?: 'userCanceled' | 'applicationHidden' | 'timedOut') => void = () => {}
      let fail = () => {}
      const notification = {
        close: vi.fn(),
        click: () => click(),
        dismiss: (reason?: 'userCanceled' | 'applicationHidden' | 'timedOut') => dismiss(reason),
        fail: () => fail(),
        onClick(listener) {
          click = listener
        },
        onClose(listener) {
          dismiss = listener
        },
        onFailed(listener) {
          fail = listener
        },
        show: vi.fn(),
      } satisfies TestNotification
      notifications.push(notification)
      return notification
    },
    getLanguage: () => 'zh-CN',
    getSettings: () => settings,
    isWindowFocused: () => false,
    onError,
    openTarget,
    request: async (method) => {
      if (method === 'executions.list')
        return [{ ...execution, runId: target.runId }]
      if (method === 'runs.get') {
        return {
          approvalPolicy: 'policy',
          buddyId: 'default',
          branchId: 'branch-1',
          completedAt: '2026-08-19T08:00:00.000Z',
          conversationId: target.conversationId,
          errorCode: null,
          executionProfile: 'workspace_write',
          id: target.runId,
          modelId: 'gpt-5',
          providerId: 'openai',
          purpose: 'chat',
          reasoningLevel: 'high',
          startedAt: '2026-08-19T07:59:00.000Z',
          status: 'completed',
          triggeringMessageId: 'message-1',
        }
      }
      return {
        buddyId: 'default',
        activeBranchId: 'branch-1',
        approvalPolicy: 'policy',
        createdAt: '2026-08-19T07:58:00.000Z',
        deletedAt: null,
        executionProfile: 'workspace_write',
        id: target.conversationId,
        modelSelection: null,
        spaceId: null,
        title: '整理发布说明',
        updatedAt: '2026-08-19T08:00:00.000Z',
      }
    },
  })
  const event = {
    method: 'run.event',
    params: {
      createdAt: '2026-08-19T08:00:00.000Z',
      payload: { errorCode: null },
      runId: 'run-1',
      sequence: 8,
      type: 'run.completed',
    },
  }

  return { service, notifications, openTarget, onError, event, target, settings }
}

describe('desktopNotificationService', () => {
  it('shows one notification for concurrent or replayed events and opens its target once', async () => {
    const f = fixture()
    await Promise.all([f.service.handle(f.event), f.service.handle(f.event)])
    await f.service.handle(f.event)

    expect(f.notifications).toHaveLength(1)
    expect(f.notifications[0]!.show).toHaveBeenCalledOnce()
    f.notifications[0]!.click()
    f.notifications[0]!.click()
    await vi.waitFor(() => expect(f.openTarget).toHaveBeenCalledOnce())
    expect(f.openTarget).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      runId: 'run-1',
    })
  })

  it('keeps the original target clickable after banner timeout and another conversation notification', async () => {
    const f = fixture()
    await f.service.handle(f.event)
    f.target.conversationId = 'conversation-2'
    f.target.runId = 'run-2'
    await f.service.handle({ ...f.event, params: { ...f.event.params, runId: 'run-2', sequence: 9 } })
    const older = f.notifications[0]!
    older.dismiss('timedOut')
    older.dismiss('applicationHidden')
    older.click()
    await vi.waitFor(() => expect(f.openTarget).toHaveBeenCalledWith({ conversationId: 'conversation-1', runId: 'run-1' }))
    f.service.dispose()
    expect(older.close).not.toHaveBeenCalled()
    expect(f.notifications[1]!.close).toHaveBeenCalledOnce()
  })

  it('ignores dismissed clicks and closes retained notifications when the service stops', async () => {
    const f = fixture()
    await f.service.handle(f.event)
    f.notifications[0]!.dismiss('userCanceled')
    f.notifications[0]!.click()
    await f.service.handle({ ...f.event, params: { ...f.event.params, sequence: 9 } })
    f.notifications[1]!.dismiss('timedOut')
    f.service.dispose()
    f.service.dispose()
    f.notifications[1]!.click()
    await f.service.handle({ ...f.event, params: { ...f.event.params, sequence: 10 } })
    await Promise.resolve()
    expect(f.openTarget).not.toHaveBeenCalled()
    expect(f.notifications).toHaveLength(2)
    expect(f.notifications[0]!.close).not.toHaveBeenCalled()
    expect(f.notifications[1]!.close).toHaveBeenCalledOnce()
  })

  it('releases failed deliveries for retry and reports rejected click navigation', async () => {
    const f = fixture()
    await f.service.handle(f.event)
    f.notifications[0]!.fail()
    await f.service.handle(f.event)
    f.notifications[0]!.click()
    const error = new Error('Window unavailable')
    f.openTarget.mockRejectedValueOnce(error)
    f.notifications[1]!.click()
    await vi.waitFor(() => expect(f.onError).toHaveBeenCalledWith(error))
    expect(f.openTarget).toHaveBeenCalledOnce()
    expect(f.notifications).toHaveLength(2)
  })

  it.each(['npc_child', 'actor_child'] as const)('shows %s notifications and stops them when subtask notifications are turned off', async (kind) => {
    const f = fixture(kind)
    await f.service.handle(f.event)
    expect(f.notifications).toHaveLength(1)
    expect(f.notifications[0]!.show).toHaveBeenCalledOnce()
    f.settings.subtaskNotificationsEnabled = false
    await f.service.handle({ ...f.event, params: { ...f.event.params, sequence: 9 } })
    expect(f.notifications).toHaveLength(1)
  })
})
