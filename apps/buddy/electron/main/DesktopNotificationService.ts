import type { LexoraConfig } from '../shared/desktopApi'
import type { DesktopNotificationSettings } from './desktopNotificationPolicy'
import type { DesktopRuntimeGateway } from './localChatIpc'
import { conversationResponseSchemas } from '../../shared/conversation/conversationApi'
import { executionPresentationRpc } from '../../shared/executions/executionPresentationApi'
import { runsRequestSchemas, runsResponseSchemas } from '../../shared/runs/runApi'

import { shouldShowDesktopNotification } from './desktopNotificationPolicy'

export interface DesktopNotificationInput {
  body: string
  title: string
}

export interface DesktopSystemNotification {
  close: () => void
  onClick: (listener: () => void) => void
  onClose: (listener: (reason?: 'userCanceled' | 'applicationHidden' | 'timedOut') => void) => void
  onFailed: (listener: () => void) => void
  show: () => void
}

export interface DesktopNotificationTarget {
  conversationId: string
  runId: string
}

export interface DesktopNotificationServiceOptions {
  createNotification: (input: DesktopNotificationInput) => DesktopSystemNotification
  getLanguage: () => LexoraConfig['desktop']['language']
  getSettings: () => DesktopNotificationSettings
  isWindowFocused: () => boolean
  onError: (error: unknown) => void
  openTarget: (target: DesktopNotificationTarget) => Promise<void> | void
  request: DesktopRuntimeGateway['request']
}

const BODY_LABELS = {
  'zh-CN': {
    task: {
      'approval.requested': '等待你的确认',
      'run.completed': '任务已完成',
      'run.failed': '任务失败',
    },
    subtask: {
      'approval.requested': '子任务等待你的确认',
      'run.completed': '子任务已完成',
      'run.failed': '子任务失败',
    },
    subtaskName: '子任务',
    untitled: '未命名对话',
  },
  'en-US': {
    task: {
      'approval.requested': 'Waiting for your approval',
      'run.completed': 'Task completed',
      'run.failed': 'Task failed',
    },
    subtask: {
      'approval.requested': 'Subtask waiting for your approval',
      'run.completed': 'Subtask completed',
      'run.failed': 'Subtask failed',
    },
    subtaskName: 'Subtask',
    untitled: 'Untitled conversation',
  },
} as const

export class DesktopNotificationService {
  readonly #options: DesktopNotificationServiceOptions
  readonly #shownEvents = new Set<string>()
  readonly #pendingEvents = new Set<string>()
  // Keep native click handlers alive independently of the selected conversation.
  readonly #notifications = new Map<string, DesktopSystemNotification>()
  #disposed = false

  constructor(options: DesktopNotificationServiceOptions) {
    this.#options = options
  }

  async handle(notification: { method: string, params: unknown }): Promise<void> {
    if (this.#disposed || notification.method !== 'run.event')
      return
    const event = runsRequestSchemas.runStateEvent.safeParse(notification.params)
    if (!event.success)
      return
    const eventKey = `${event.data.runId}:${event.data.sequence}:${event.data.type}`
    if (this.#shownEvents.has(eventKey) || this.#pendingEvents.has(eventKey))
      return
    if (!shouldShowDesktopNotification({
      eventType: event.data.type,
      isWindowFocused: this.#options.isWindowFocused(),
      settings: this.#options.getSettings(),
    })) {
      return
    }

    this.#pendingEvents.add(eventKey)
    try {
      const run = runsResponseSchemas.run.parse(
        await this.#options.request('runs.get', { runId: event.data.runId }),
      )
      if (this.#disposed)
        return
      const [conversationResult, executionsResult] = await Promise.all([
        this.#options.request('conversations.get', { conversationId: run.conversationId }),
        this.#options.request('executions.list', { conversationId: run.conversationId, branchId: run.branchId }),
      ])
      if (this.#disposed)
        return
      const conversation = conversationResponseSchemas.conversation.parse(conversationResult)
      const execution = executionPresentationRpc.list.response.parse(executionsResult).find(item => item.runId === run.id)
      if (!execution)
        return
      const isSubtask = execution.kind === 'npc_child' || execution.kind === 'actor_child'
      if (!shouldShowDesktopNotification({
        eventType: event.data.type,
        isSubtask,
        isWindowFocused: this.#options.isWindowFocused(),
        settings: this.#options.getSettings(),
      })) {
        return
      }
      const labels = BODY_LABELS[this.#options.getLanguage()]
      const eventType = event.data.type as keyof typeof labels.task
      const title = conversation.title?.trim() || labels.untitled
      const task = execution.task.replace(/\s+/g, ' ').trim()
      const systemNotification = this.#options.createNotification({
        body: isSubtask
          ? [`${execution.buddyName} · ${labels.subtask[eventType]}`, task].filter(Boolean).join('\n')
          : labels.task[eventType],
        title: isSubtask ? `${labels.subtaskName} #${execution.ordinal} · ${title}` : title,
      })
      this.#notifications.set(eventKey, systemNotification)
      const release = () => {
        if (this.#notifications.get(eventKey) !== systemNotification)
          return false
        this.#notifications.delete(eventKey)
        return true
      }
      systemNotification.onClick(() => {
        if (!release())
          return
        void Promise.resolve().then(() => {
          if (!this.#disposed) {
            return this.#options.openTarget({
              conversationId: run.conversationId,
              runId: run.id,
            })
          }
        }).catch(error => this.#options.onError(error))
      })
      systemNotification.onClose((reason) => {
        // A timed-out/hidden Windows banner can still be clicked in Action Center.
        if (reason === 'userCanceled')
          release()
      })
      systemNotification.onFailed(() => {
        if (release())
          this.#shownEvents.delete(eventKey)
      })
      this.#shownEvents.add(eventKey)
      try {
        systemNotification.show()
      }
      catch (error) {
        release()
        this.#shownEvents.delete(eventKey)
        throw error
      }
    }
    finally {
      this.#pendingEvents.delete(eventKey)
    }
  }

  dispose(): void {
    this.#disposed = true
    const notifications = [...this.#notifications.values()]
    this.#notifications.clear()
    this.#shownEvents.clear()
    this.#pendingEvents.clear()
    for (const notification of notifications) {
      try {
        notification.close()
      }
      catch (error) {
        this.#options.onError(error)
      }
    }
  }
}
