import type { ExtensionApi, ExtensionStatus } from '@buddy-shared/extensions/extensionApi'
import type { ExtensionInstallation } from '@buddy-shared/extensions/extensionInstallation'
import { extensionManifestSchema } from '@buddy-shared/extensions/extensionManifest'
import { deferred } from '@buddy-tests/deferred'
import { expect, it } from 'vitest'
import { effectScope } from 'vue'
import { useExtensionState } from '../useExtensionState'

const extension: ExtensionStatus = {
  manifest: extensionManifestSchema.parse({ schemaVersion: 1, id: 'test.panel', name: 'Panel', version: '1.0.0', apiVersion: 1, engines: { lexora: '*' }, contributes: {} }),
  revision: 'revision',
  enabled: true,
  compatible: true,
  development: false,
  pending: null,
  state: 'inactive',
  generation: null,
  error: null,
  activationMs: null,
  logs: [],
}

it('publishes installed contributions even while installation jobs are pending or fail', async () => {
  const jobs = deferred<ExtensionInstallation[]>()
  const scope = effectScope()
  const api: Partial<ExtensionApi> = { list: async () => [extension], unavailable: async () => [], installations: () => jobs.promise, taskActions: async () => [], onChanged: () => () => {} }
  const state = scope.run(() => useExtensionState(api as ExtensionApi))!
  try {
    const pending = state.refresh()
    await Promise.resolve()
    expect(state.installed.value).toEqual([extension])
    jobs.reject(new Error('EXTENSION_JOBS_UNAVAILABLE'))
    await pending
    expect(state.installed.value).toEqual([extension])
    expect(state.error.value).toBe('EXTENSION_JOBS_UNAVAILABLE')
  }
  finally {
    scope.stop()
  }
})

it('does not let stale or disposed refreshes overwrite current contributions', async () => {
  const delayed = deferred<ExtensionStatus[]>()
  let requests = 0
  const scope = effectScope()
  const api: Partial<ExtensionApi> = { list: () => ++requests === 1 ? delayed.promise : Promise.resolve(requests === 2 ? [extension] : []), unavailable: async () => [], installations: async () => [], taskActions: async () => [], onChanged: () => () => {} }
  const state = scope.run(() => useExtensionState(api as ExtensionApi))!
  const previous = state.refresh()
  await state.refresh()
  delayed.resolve([])
  await previous
  expect(state.installed.value).toEqual([extension])
  scope.stop()
  await state.refresh()
  expect(state.installed.value).toEqual([extension])
})

it('deduplicates the same plugin action while allowing another action to run', async () => {
  let finishWork!: () => void
  const work = new Promise<null>((resolve) => { finishWork = () => resolve(null) })
  const executions: string[] = []
  const scope = effectScope()
  const api = {
    onChanged: () => () => {},
    executeMenu: async (_id: string, menu: string) => {
      executions.push(menu)
      if (menu === 'work')
        await work
      return null
    },
  } as unknown as ExtensionApi
  const state = scope.run(() => useExtensionState(api))!
  try {
    const pending = state.executeAction('test.panel', 'work')
    expect(state.pendingActions.get('test.panel')).toEqual(['work'])
    expect(await state.executeAction('test.panel', 'work')).toBe(false)
    expect(await state.executeAction('test.panel', 'show-result')).toBe(true)
    expect(state.pendingActions.get('test.panel')).toEqual(['work'])
    finishWork()
    expect(await pending).toBe(true)
    expect(executions).toEqual(['work', 'show-result'])
    expect(state.pendingActions.size).toBe(0)
  }
  finally {
    finishWork()
    scope.stop()
  }
})
