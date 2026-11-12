// @vitest-environment jsdom
import type { SyncState } from '@buddy-shared/sync/syncApi'
import type { SettingsContext } from '../../../settingsContext'
import { deferred } from '@buddy-tests/deferred'
import { NMessageProvider } from 'naive-ui'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import { useProvideSettingsContext } from '../../../settingsContext'
import DesktopSyncSettings from '../DesktopSyncSettings.vue'

function emptyState(): SyncState {
  return { enabled: false, selectedAdapter: 'webdav', activeConnectionId: null, connections: [], activity: null, schedules: [], scheduleError: false }
}

function messageNodes() {
  return [...document.querySelectorAll<HTMLElement>('.n-message')]
}

function retryButton(root: HTMLElement) {
  const result = [...root.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === '重试')
  expect(result, 'Retry button').toBeDefined()
  return result!
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
  await nextTick()
}

function mount(initialState = deferred<SyncState>()) {
  const requests = [initialState]
  let changed: ((state: SyncState) => void) | undefined
  const sync = {
    state: vi.fn(() => requests.shift()!.promise),
    onChanged: vi.fn((listener: (state: SyncState) => void) => {
      changed = listener
      return () => { changed = undefined }
    }),
  }
  Object.defineProperty(window, 'lexoraDesktop', { configurable: true, value: { sync } })

  const context = {
    applicationSettings: {
      config: shallowRef(null),
      language: shallowRef('zh-CN'),
      settingsError: shallowRef(null),
      updateSettings: vi.fn(async () => true),
    },
    cloudBackup: { backupNow: vi.fn(async () => emptyState()) },
  } as unknown as SettingsContext
  const root = document.createElement('div')
  document.body.append(root)
  const visible = shallowRef(true)
  const app = createApp({
    setup() {
      useProvideSettingsContext(context)
      return () => h(NMessageProvider, { duration: 0 }, {
        default: () => visible.value ? h(DesktopSyncSettings) : null,
      })
    },
  })
  app.mount(root)
  return {
    app,
    root,
    requests,
    sync,
    emit(value: SyncState) { changed?.(value) },
    unmountComponent() {
      if (!visible.value)
        return
      visible.value = false
      return nextTick()
    },
    dispose() {
      app.unmount()
      root.remove()
      delete (window as Window & { lexoraDesktop?: unknown }).lexoraDesktop
    },
  }
}

const fixtures: Array<() => void> = []
afterEach(() => fixtures.splice(0).forEach(dispose => dispose()))

describe('DesktopSyncSettings initial state loading', () => {
  it('keeps one failure message, changes it to loading during retry, and clears it on success', async () => {
    const first = deferred<SyncState>()
    const fixture = mount(first)
    fixtures.push(fixture.dispose)
    first.reject(new Error('SYNC_FAILED'))
    await vi.waitFor(() => expect(messageNodes()).toHaveLength(1))
    expect(messageNodes()[0]?.className).toContain('error')

    const retry = deferred<SyncState>()
    fixture.requests.push(retry)
    retryButton(fixture.root).click()
    await settle()
    expect(fixture.sync.state).toHaveBeenCalledTimes(2)
    expect(messageNodes()).toHaveLength(1)
    expect(messageNodes()[0]?.className).toContain('loading')

    retry.reject(new Error('SYNC_FAILED'))
    await vi.waitFor(() => expect(messageNodes()[0]?.className).toContain('error'))
    expect(messageNodes()).toHaveLength(1)

    const finalRetry = deferred<SyncState>()
    fixture.requests.push(finalRetry)
    retryButton(fixture.root).click()
    await settle()
    expect(messageNodes()[0]?.className).toContain('loading')
    finalRetry.resolve(emptyState())
    await vi.waitFor(() => expect(messageNodes()).toHaveLength(0))
  })

  it('clears the persistent loading failure when a state change arrives', async () => {
    const first = deferred<SyncState>()
    const fixture = mount(first)
    fixtures.push(fixture.dispose)
    first.reject(new Error('SYNC_FAILED'))
    await vi.waitFor(() => expect(messageNodes()).toHaveLength(1))
    fixture.emit(emptyState())
    await vi.waitFor(() => expect(messageNodes()).toHaveLength(0))
  })

  it('destroys the message on unmount and ignores a late retry failure', async () => {
    const first = deferred<SyncState>()
    const fixture = mount(first)
    fixtures.push(fixture.dispose)
    first.reject(new Error('SYNC_FAILED'))
    await vi.waitFor(() => expect(messageNodes()).toHaveLength(1))

    const retry = deferred<SyncState>()
    fixture.requests.push(retry)
    retryButton(fixture.root).click()
    await settle()
    expect(messageNodes()[0]?.className).toContain('loading')
    await fixture.unmountComponent()
    await vi.waitFor(() => expect(messageNodes()).toHaveLength(0))
    retry.reject(new Error('SYNC_FAILED'))
    await settle()
    expect(messageNodes()).toHaveLength(0)
  })
})
