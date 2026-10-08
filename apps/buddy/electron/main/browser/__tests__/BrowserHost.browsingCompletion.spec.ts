import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { browserNoticeOrigin, fileChooserFilters } from '../browserHumanActions'
import { configureSemanticObservation, createFixture } from './browserHostFixture'

async function setup(options: Parameters<typeof createFixture>[0] = {}) {
  const fixture = createFixture(options)
  const state = fixture.host.ensureSession('conversation', 'manual')
  fixture.host.setSurface({ sessionId: state.sessionId, visible: true })
  configureSemanticObservation(fixture.webContents)
  await fixture.host.navigate(state.sessionId, 'https://example.com/upload?secret=hidden')
  return { ...fixture, state }
}
function click(f: Awaited<ReturnType<typeof setup>>) {
  f.webContents.emit('before-mouse-event', {}, { type: 'mouseDown', button: 'left', clickCount: 1, x: 10, y: 10 })
}
function chooser(f: Awaited<ReturnType<typeof setup>>) {
  f.webContents.debuggerEvents.emit('message', {}, 'Page.fileChooserOpened', { backendNodeId: 42, frameId: 'main-frame', mode: 'selectSingle' })
}
function dialog(f: Awaited<ReturnType<typeof setup>>, overrides = {}) {
  f.webContents.debuggerEvents.emit('message', {}, 'Page.javascriptDialogOpening', { type: 'confirm', message: 'Proceed?', url: 'https://frame.example.com/dialog?token=hidden', hasBrowserHandler: false, ...overrides })
}

describe('browser browsing completion safety', () => {
  it('requires a fresh human gesture for upload even while human-controlled', async () => {
    const selectFiles = vi.fn(async () => ['C:\\file.txt'])
    const f = await setup({ selectFiles })
    chooser(f)
    expect(selectFiles).not.toHaveBeenCalled()
    expect(f.host.getState(f.state.sessionId).error).toMatchObject({ action: 'file-chooser', detail: 'fresh-click', origin: 'https://example.com' })
    f.host.dispose()
  })

  it('does not deliver a file after control changed and was returned to the human', async () => {
    let finish!: (files: string[] | null) => void
    const selectFiles = vi.fn(() => new Promise<string[] | null>((resolve) => {
      finish = resolve
    }))
    const f = await setup({ selectFiles })
    click(f)
    chooser(f)
    await vi.waitFor(() => expect(selectFiles).toHaveBeenCalledOnce())
    const lease = f.host.acquireControl({ sessionId: f.state.sessionId, pageId: f.state.pageId })
    f.host.releaseControl(lease)
    finish(['C:\\file.txt'])
    await vi.waitFor(() => expect(f.host.getState(f.state.sessionId).error?.detail).toBe('target-changed'))
    expect(f.webContents.debugger.sendCommand).not.toHaveBeenCalledWith('DOM.setFileInputFiles', expect.anything())
    f.host.dispose()
  })

  it('passes accept filters to the native chooser without widening file access', async () => {
    const selectFiles = vi.fn(async () => null)
    const f = await setup({ selectFiles })
    const send = f.webContents.debugger.sendCommand.getMockImplementation()!
    f.webContents.debugger.sendCommand.mockImplementation((method, params) => method === 'DOM.describeNode'
      ? Promise.resolve({ node: { nodeName: 'INPUT', attributes: ['type', 'file', 'accept', '.pdf,image/png'] } })
      : send(method, params))
    click(f)
    chooser(f)
    await vi.waitFor(() => expect(selectFiles).toHaveBeenCalledWith({ multiple: false, filters: [{ name: '.pdf,image/png', extensions: ['pdf', 'png'] }, { name: '*', extensions: ['*'] }] }))
    f.host.dispose()
  })

  it('gives repeated interceptions new identities after the dedupe window', async () => {
    const f = await setup()
    chooser(f)
    const first = f.host.getState(f.state.sessionId).error!.noticeId
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 3_001)
    chooser(f)
    expect(f.host.getState(f.state.sessionId).error!.noticeId).not.toBe(first)
    now.mockRestore()
    f.host.dispose()
  })

  it('cancels all active downloads when the session closes without deleting files', async () => {
    const f = await setup()
    const events = new EventEmitter()
    const item = { getFilename: () => 'file.txt', getSavePath: () => 'C:\\file.txt', once: events.once.bind(events), cancel: vi.fn(() => events.emit('done', {}, 'cancelled')) }
    click(f)
    f.webContents.session.emit('will-download', { preventDefault: vi.fn() }, item, { id: f.webContents.id })
    expect(f.host.hasActiveDownloads(f.state.sessionId)).toBe(true)
    f.host.close(f.state.sessionId)
    expect(item.cancel).toHaveBeenCalledOnce()
    f.host.dispose()
  })

  it('reports interrupted download updates before done and removes the update listener on completion', async () => {
    const f = await setup()
    const events = new EventEmitter()
    const item = { getFilename: () => 'file.txt', getSavePath: () => 'C:\\file.txt', on: events.on.bind(events), off: events.off.bind(events), once: events.once.bind(events), cancel: vi.fn() }
    click(f)
    f.webContents.session.emit('will-download', { preventDefault: vi.fn() }, item, { id: f.webContents.id })
    events.emit('updated', {}, 'interrupted')
    expect(f.host.getState(f.state.sessionId).download?.state).toBe('failed')
    expect(f.host.hasActiveDownloads(f.state.sessionId)).toBe(true)
    events.emit('updated', {}, 'progressing')
    expect(f.host.getState(f.state.sessionId).download?.state).toBe('started')
    events.emit('done', {}, 'completed')
    expect(f.host.getState(f.state.sessionId).download?.state).toBe('completed')
    expect(f.host.hasActiveDownloads(f.state.sessionId)).toBe(false)
    expect(events.listenerCount('updated')).toBe(0)
    f.host.dispose()
  })

  it('sets and clears independent viewport metrics without navigating or changing page zoom', async () => {
    const f = await setup()
    const viewport = { width: 390, height: 844, scale: 0.5 }
    expect((await f.host.setViewport(f.state.sessionId, viewport)).viewport).toEqual(viewport)
    expect(f.webContents.debugger.sendCommand).toHaveBeenCalledWith('Emulation.setDeviceMetricsOverride', { width: viewport.width, height: viewport.height, mobile: false, deviceScaleFactor: 0, dontSetVisibleSize: true })
    expect(f.webContents.getZoomFactor()).toBe(1)
    expect((await f.host.setViewport(f.state.sessionId, null)).viewport).toBeNull()
    expect(f.webContents.debugger.sendCommand).toHaveBeenCalledWith('Emulation.clearDeviceMetricsOverride', undefined)
    expect(f.webContents.loadURL).toHaveBeenCalledTimes(1)
    f.host.dispose()
  })

  it('rejects viewport changes while the agent owns the page and invalid dimensions', async () => {
    const f = await setup()
    await expect(f.host.setViewport(f.state.sessionId, { width: 1, height: 844, scale: 1 })).rejects.toThrow()
    f.host.acquireControl({ sessionId: f.state.sessionId, pageId: f.state.pageId })
    await expect(f.host.setViewport(f.state.sessionId, { width: 390, height: 844, scale: 1 })).rejects.toMatchObject({ code: 'BROWSER_CONTROL_REQUIRED' })
    f.host.dispose()
  })

  it('syncs safe favicon URLs and clears stale icons on navigation', async () => {
    const f = await setup()
    f.webContents.emit('page-favicon-updated', {}, ['javascript:alert(1)', 'https://example.com/icon.png'])
    expect(f.host.getState(f.state.sessionId).favicon).toBe('https://example.com/icon.png')
    f.webContents.emit('did-start-loading')
    expect(f.host.getState(f.state.sessionId).favicon).toBeNull()
    f.host.dispose()
  })

  it('returns user cancellation for host confirm dialogs and displays only the trusted origin', async () => {
    const showDialog = vi.fn(async () => false)
    const f = await setup({ showDialog })
    dialog(f)
    await vi.waitFor(() => expect(f.webContents.debugger.sendCommand).toHaveBeenCalledWith('Page.handleJavaScriptDialog', { accept: false }))
    expect(showDialog).toHaveBeenCalledWith({ type: 'confirm', message: 'Proceed?', origin: 'https://frame.example.com' })
    f.host.dispose()
  })

  it('never confirms an agent dialog through the human channel', async () => {
    const showDialog = vi.fn(async () => true)
    const f = await setup({ showDialog })
    f.host.acquireControl({ sessionId: f.state.sessionId, pageId: f.state.pageId })
    dialog(f)
    await vi.waitFor(() => expect(f.webContents.debugger.sendCommand).toHaveBeenCalledWith('Page.handleJavaScriptDialog', { accept: false }))
    expect(showDialog).not.toHaveBeenCalled()
    f.host.dispose()
  })

  it('does not duplicate existing native dialogs and suppresses dialog storms', async () => {
    const showDialog = vi.fn(async () => true)
    const f = await setup({ showDialog })
    dialog(f, { hasBrowserHandler: true })
    expect(showDialog).not.toHaveBeenCalled()
    for (let index = 0; index < 3; index++) {
      dialog(f)
      await vi.waitFor(() => expect(showDialog).toHaveBeenCalledTimes(index + 1))
      await Promise.resolve()
    }
    dialog(f)
    expect(showDialog).toHaveBeenCalledTimes(3)
    expect(f.host.getState(f.state.sessionId).error?.detail).toBe('dialog-suppressed')
    f.host.dispose()
  })
})

describe('browser human action helpers', () => {
  it('never displays tokens, credentials or local paths in source labels', () => {
    expect(browserNoticeOrigin('https://user:password@example.com/file?token=secret')).toBe('https://example.com')
    expect(browserNoticeOrigin('file:///C:/private/account.html')).toBe('file://')
    expect(browserNoticeOrigin('javascript:secret')).toBeUndefined()
  })
  it('handles wildcards and deduplicates extensions; unknown MIME types remain compatible', () => {
    expect(fileChooserFilters('image/*,.png')?.[0]?.extensions.filter(value => value === 'png')).toHaveLength(1)
    expect(fileChooserFilters('application/x-custom')).toBeUndefined()
    expect(fileChooserFilters('.exe/../../secret')).toBeUndefined()
  })
})
