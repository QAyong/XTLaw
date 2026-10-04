// @vitest-environment jsdom
import type { DesktopBrowserState, DesktopBrowserViewport } from '@buddy-shared/browser/browserDesktopApi'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, shallowRef } from 'vue'
import { useBrowserResponsiveViewport } from '../useBrowserResponsiveViewport'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))
function fixture() {
  const state = shallowRef<DesktopBrowserState>({ sessionId: 'session-a', pageId: 'page-a', conversationId: null, viewport: null, controller: 'human', controlEpoch: 0, visible: true, canGoBack: false, canGoForward: false, error: null, profileMode: 'default', security: { kind: 'blank', origin: null }, status: 'ready', title: 'Fixture', url: 'about:blank', zoomFactor: 1 })
  const visible = shallowRef(true)
  const canvas = shallowRef({ width: 800, height: 458 })
  const flights: { sessionId: string, viewport: DesktopBrowserViewport | null, resolve: (state: DesktopBrowserState) => void, reject: (error: Error) => void }[] = []
  const setViewport = vi.fn((sessionId: string, viewport: DesktopBrowserViewport | null) => new Promise<DesktopBrowserState>((resolve, reject) => flights.push({ sessionId, viewport, resolve, reject })))
  const updateState = vi.fn((value: DesktopBrowserState) => state.value = value)
  const onError = vi.fn()
  let controls!: ReturnType<typeof useBrowserResponsiveViewport>
  const app = createApp({ setup() {
    controls = useBrowserResponsiveViewport({ api: { setViewport }, state, visible, canvas, updateState, onError })
    return () => null
  } })
  const root = document.createElement('div')
  app.mount(root)
  cleanups.push(() => app.unmount())
  function complete(index = 0) {
    flights[index].resolve({ ...state.value, sessionId: flights[index].sessionId, viewport: flights[index].viewport })
  }
  return { controls, state, canvas, visible, flights, setViewport, updateState, onError, complete }
}

describe('responsive viewport request ownership', () => {
  it('enters with Fit and remembers dimensions when exiting', async () => {
    const f = fixture()
    f.controls.toggle()
    expect(f.flights[0].viewport).toEqual({ width: 393, height: 852, scale: 0.5 })
    f.complete()
    await vi.waitFor(() => expect(f.controls.busy.value).toBe(false))
    f.controls.toggle()
    expect(f.flights[1].viewport).toBeNull()
    f.complete(1)
    await vi.waitFor(() => expect(f.controls.busy.value).toBe(false))
    f.controls.toggle()
    expect(f.flights[2].viewport?.width).toBe(393)
  })
  it('serializes and coalesces rapid drag changes; an old response cannot replace the newest size', async () => {
    const f = fixture()
    f.controls.resize({ width: 400, height: 600 })
    f.controls.resize({ width: 420, height: 600 })
    f.controls.resize({ width: 440, height: 600 })
    expect(f.setViewport).toHaveBeenCalledTimes(1)
    f.complete()
    await vi.waitFor(() => expect(f.setViewport).toHaveBeenCalledTimes(2))
    expect(f.updateState).not.toHaveBeenCalled()
    expect(f.flights[1].viewport?.width).toBe(440)
    f.complete(1)
    await vi.waitFor(() => expect(f.controls.busy.value).toBe(false))
    expect(f.state.value.viewport?.width).toBe(440)
  })
  it('discards a response after tab or control ownership changes', async () => {
    const f = fixture()
    f.controls.toggle()
    f.state.value = { ...f.state.value, sessionId: 'session-b', controller: 'agent' }
    await nextTick()
    f.complete()
    await vi.waitFor(() => expect(f.controls.busy.value).toBe(false))
    expect(f.updateState).not.toHaveBeenCalled()
    f.controls.toggle()
    expect(f.setViewport).toHaveBeenCalledTimes(1)
  })
  it('rolls back a failed preview change and reports failure once', async () => {
    const f = fixture()
    f.controls.toggle()
    f.flights[0].reject(new Error('Unavailable'))
    await vi.waitFor(() => expect(f.controls.busy.value).toBe(false))
    expect(f.controls.active.value).toBe(false)
    expect(f.onError).toHaveBeenCalledTimes(1)
  })
})
