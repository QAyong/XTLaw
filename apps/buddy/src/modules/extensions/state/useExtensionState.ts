import type { ExtensionTaskAction } from '@buddy-shared/extensions/extensionActionApi'
import type { ExtensionApi, ExtensionReview, ExtensionStatus, ExtensionUnavailableInstallation } from '@buddy-shared/extensions/extensionApi'
import type { ExtensionInstallation } from '@buddy-shared/extensions/extensionInstallation'
import type { FileOpeningChoice } from '@buddy-shared/files/fileOpening'
import { computed, onScopeDispose, shallowReactive, shallowRef } from 'vue'

export function useExtensionState(api: ExtensionApi) {
  const taskActions = shallowRef<ExtensionTaskAction[]>([])
  const installed = shallowRef<ExtensionStatus[]>([])
  const pendingActions = shallowReactive(new Map<string, readonly string[]>())
  const unavailable = shallowRef<ExtensionUnavailableInstallation[]>([])
  const unavailableError = shallowRef('')
  const installedError = shallowRef('')
  const installationsError = shallowRef('')
  const error = computed(() => installedError.value || unavailableError.value || installationsError.value)
  const installations = shallowRef<ExtensionInstallation[]>([])
  let revision = 0
  let disposed = false
  async function refresh() {
    const current = ++revision
    const currentResult = () => !disposed && current === revision
    await Promise.all([
      api.unavailable().then((items) => {
        if (currentResult()) {
          unavailable.value = items
          unavailableError.value = ''
        }
      }).catch((reason) => {
        if (currentResult())
          unavailableError.value = extensionErrorCode(reason)
      }),
      api.taskActions().then((items) => {
        if (currentResult())
          taskActions.value = items
      }).catch(() => {
        if (currentResult())
          taskActions.value = []
      }),
      api.list().then((snapshot) => {
        if (currentResult()) {
          installed.value = snapshot
          installedError.value = ''
        }
      }).catch((reason) => {
        if (currentResult())
          installedError.value = extensionErrorCode(reason)
      }),
      api.installations().then((jobs) => {
        if (currentResult()) {
          installations.value = jobs
          installationsError.value = ''
        }
      }).catch((reason) => {
        if (currentResult())
          installationsError.value = extensionErrorCode(reason)
      }),
    ])
  }
  onScopeDispose(api.onChanged(() => void refresh()))
  onScopeDispose(() => {
    disposed = true
    revision++
  })
  async function install(review: ExtensionReview, applyUpdate: boolean, choices: FileOpeningChoice[] = []) {
    await api.install(review.token, choices)
    if (review.currentVersion && applyUpdate)
      await api.applyUpdate(review.manifest.id)
  }
  async function executeAction(id: string, menu: string) {
    if (disposed || pendingActions.get(id)?.includes(menu))
      return false
    pendingActions.set(id, [...pendingActions.get(id) ?? [], menu])
    try {
      await api.executeMenu(id, menu, { target: 'extension.actions', resource: null })
      return !disposed
    }
    catch (reason) {
      if (!disposed)
        throw reason
      return false
    }
    finally {
      const remaining = pendingActions.get(id)?.filter(value => value !== menu) ?? []
      if (remaining.length)
        pendingActions.set(id, remaining)
      else pendingActions.delete(id)
    }
  }
  return { api, taskActions, installed, unavailable, installations, error, refresh, install, pendingActions, executeAction }
}

export function extensionErrorCode(reason: unknown): string {
  return reason instanceof Error ? reason.message.match(/EXTENSION_[A-Z_]+/)?.[0] ?? 'EXTENSION_OPERATION_FAILED' : 'EXTENSION_OPERATION_FAILED'
}
