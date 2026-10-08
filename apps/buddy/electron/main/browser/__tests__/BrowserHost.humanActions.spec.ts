import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { configureSemanticObservation, createFixture } from './browserHostFixture'

type Fixture = ReturnType<typeof createFixture>

function openHandler(fixture: Fixture) {
  const handler = fixture.webContents.setWindowOpenHandler.mock.calls.at(-1)?.[0]
  expect(handler).toBeTypeOf('function')
  return handler as (details: { disposition: string, postBody?: unknown, url: string }) => { action: string }
}

type FakePage = Fixture['webContents']

function handlerFor(page: FakePage) {
  const handler = page.setWindowOpenHandler.mock.calls.at(-1)?.[0]
  expect(handler).toBeTypeOf('function')
  return handler as (details: { disposition: string, postBody?: unknown, url: string }) => { action: string }
}

function clickHumanOn(page: FakePage, modifiers: string[] = []) {
  page.emit('before-mouse-event', {}, {
    button: 'left',
    clickCount: 1,
    modifiers,
    type: 'mouseDown',
    x: 12,
    y: 12,
  })
}

function clickHuman(fixture: Fixture, modifiers: string[] = []) {
  clickHumanOn(fixture.webContents, modifiers)
}

function createDownloadItem(name = 'report.csv') {
  const events = new EventEmitter()
  return {
    events,
    item: {
      cancel: vi.fn(() => events.emit('done', {}, 'cancelled')),
      getFilename: () => name,
      getSavePath: () => `C:\\Users\\tester\\Downloads\\${name}`,
      once: (event: string, listener: (...args: unknown[]) => void) => {
        events.once(event, listener)
      },
    },
  }
}

/** A visible human-controlled session, which is the state every human action is judged against. */
function createHumanSession(fixture: Fixture) {
  const session = fixture.host.ensureSession(null, 'manual')
  fixture.host.setSurface({ sessionId: session.sessionId, visible: true })
  fixture.onStateChanged.mockClear()
  return session
}

async function navigateHumanSession(fixture: Fixture, url = 'https://example.com/') {
  const session = createHumanSession(fixture)
  configureSemanticObservation(fixture.webContents)
  await fixture.host.navigate(session.sessionId, url)
  fixture.onStateChanged.mockClear()
  return session
}

function emitFileChooser(fixture: Fixture, params: Record<string, unknown> = {}, humanClick = true) {
  if (humanClick)
    clickHuman(fixture)
  fixture.webContents.debuggerEvents.emit('message', {}, 'Page.fileChooserOpened', {
    backendNodeId: 42,
    frameId: 'main-frame',
    mode: 'selectSingle',
    ...params,
  })
}

describe('browser human action routing', () => {
  it('routes a clicked target=_blank link into a managed tab that inherits the source profile', async () => {
    const fixture = createFixture()
    const source = await navigateHumanSession(fixture)
    clickHuman(fixture)

    expect(openHandler(fixture)({ disposition: 'foreground-tab', url: 'https://example.com/video' })).toEqual({ action: 'deny' })
    await vi.waitFor(() => {
      expect(fixture.host.listGuests()).toHaveLength(2)
    })
    const popup = fixture.host.listGuests().at(-1)!
    expect(popup.partition).toBe('persist:buddy-browser-default-v1')
    await vi.waitFor(() => {
      expect(fixture.host.getState(popup.sessionId)).toMatchObject({
        openedFrom: { sessionId: source.sessionId, tabId: expect.any(String) },
        url: 'https://example.com/video',
      })
    })
    expect(fixture.createPage).toHaveBeenCalledTimes(2)
    fixture.host.dispose()
  })

  it('blocks a popup that arrives without a fresh click and never opens a native window', () => {
    const fixture = createFixture()
    createHumanSession(fixture)

    expect(openHandler(fixture)({ disposition: 'foreground-tab', url: 'https://example.com/popup' })).toEqual({ action: 'deny' })
    expect(fixture.createPage).toHaveBeenCalledOnce()
    expect(fixture.onStateChanged.mock.calls.at(-1)?.[0]).toMatchObject({
      error: { action: 'popup', code: 'BROWSER_PERMISSION_DENIED' },
    })

    // A second identical interception inside the dedupe window must not republish the notice.
    fixture.onStateChanged.mockClear()
    openHandler(fixture)({ disposition: 'foreground-tab', url: 'https://example.com/popup' })
    expect(fixture.onStateChanged).not.toHaveBeenCalled()
    fixture.host.dispose()
  })

  it('rejects popup targets that carry credentials, a body or a non-web scheme', () => {
    const fixture = createFixture()
    createHumanSession(fixture)
    const handler = openHandler(fixture)
    clickHuman(fixture)

    expect(handler({ disposition: 'foreground-tab', url: 'https://user:secret@example.com/private' })).toEqual({ action: 'deny' })
    expect(handler({ disposition: 'foreground-tab', postBody: {}, url: 'https://example.com/post' })).toEqual({ action: 'deny' })
    expect(handler({ disposition: 'foreground-tab', url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
    expect(fixture.createPage).toHaveBeenCalledOnce()
    fixture.host.dispose()
  })

  it('hands modifier clicks to the system browser instead of opening an internal tab', async () => {
    const openExternal = vi.fn(async () => {})
    const fixture = createFixture({ openExternal })
    createHumanSession(fixture)
    clickHuman(fixture, ['control'])

    expect(openHandler(fixture)({ disposition: 'foreground-tab', url: 'https://example.com/external' })).toEqual({ action: 'deny' })
    await vi.waitFor(() => expect(openExternal).toHaveBeenCalledExactlyOnceWith('https://example.com/external'))
    expect(fixture.createPage).toHaveBeenCalledOnce()
    fixture.host.dispose()
  })

  it('never copies private browsing into the system browser', async () => {
    const openExternal = vi.fn(async () => {})
    const fixture = createFixture({ openExternal })
    const source = await navigateHumanSession(fixture)
    const incognito = await fixture.host.setProfileMode(source.sessionId, 'incognito')
    fixture.host.setSurface({ sessionId: incognito.sessionId, visible: true })
    const incognitoPage = fixture.webContentsInstances.at(-1)!
    clickHumanOn(incognitoPage)

    expect(handlerFor(incognitoPage)({ disposition: 'background-tab', url: 'https://example.com/external' })).toEqual({ action: 'deny' })
    await vi.waitFor(() => {
      expect(fixture.host.getState(incognito.sessionId).error).toMatchObject({ code: 'BROWSER_NAVIGATION_BLOCKED' })
    })
    expect(openExternal).not.toHaveBeenCalled()
    fixture.host.dispose()
  })

  it('blocks a modifier click when the system browser is unavailable', async () => {
    const fixture = createFixture()
    const session = createHumanSession(fixture)
    clickHuman(fixture, ['control'])

    expect(openHandler(fixture)({ disposition: 'foreground-tab', url: 'https://example.com/external' })).toEqual({ action: 'deny' })
    await vi.waitFor(() => {
      expect(fixture.host.getState(session.sessionId).error).toMatchObject({ code: 'BROWSER_NAVIGATION_BLOCKED' })
    })
    fixture.host.dispose()
  })

  it('delivers human file selections to the intercepted chooser', async () => {
    const selectFiles = vi.fn(async () => ['C:\\Users\\tester\\Pictures\\avatar.png'])
    const fixture = createFixture({ selectFiles })
    const session = await navigateHumanSession(fixture)
    emitFileChooser(fixture, { mode: 'selectMultiple' })

    await vi.waitFor(() => expect(selectFiles).toHaveBeenCalledExactlyOnceWith({ multiple: true }))
    await vi.waitFor(() => expect(fixture.webContents.debugger.sendCommand).toHaveBeenCalledWith('DOM.setFileInputFiles', {
      backendNodeId: 42,
      files: ['C:\\Users\\tester\\Pictures\\avatar.png'],
    }))
    expect(fixture.host.getState(session.sessionId).error).toBeNull()
    fixture.host.dispose()
  })

  it('treats a cancelled file selection as a no-op', async () => {
    const selectFiles = vi.fn(async () => null)
    const fixture = createFixture({ selectFiles })
    const session = await navigateHumanSession(fixture)
    emitFileChooser(fixture)

    await vi.waitFor(() => expect(selectFiles).toHaveBeenCalledOnce())
    expect(fixture.webContents.debugger.sendCommand).not.toHaveBeenCalledWith('DOM.setFileInputFiles', expect.anything())
    expect(fixture.host.getState(session.sessionId).error).toBeNull()
    fixture.host.dispose()
  })

  it('cancels a file selection when the page starts loading while the dialog is open', async () => {
    let resolveSelection: (files: string[] | null) => void = () => {}
    const selectFiles = vi.fn(() => new Promise<string[] | null>((resolve) => {
      resolveSelection = resolve
    }))
    const fixture = createFixture({ selectFiles })
    const session = await navigateHumanSession(fixture)
    emitFileChooser(fixture)
    await vi.waitFor(() => expect(selectFiles).toHaveBeenCalledOnce())

    // The document the chooser belonged to is replaced before the user confirms.
    fixture.webContents.emit('did-start-loading')
    resolveSelection(['C:\\Users\\tester\\Pictures\\avatar.png'])

    await vi.waitFor(() => {
      expect(fixture.host.getState(session.sessionId).error).toMatchObject({ action: 'file-chooser' })
    })
    expect(fixture.webContents.debugger.sendCommand).not.toHaveBeenCalledWith('DOM.setFileInputFiles', expect.anything())
    fixture.host.dispose()
  })

  it('blocks a file chooser requested while the agent controls the page', async () => {
    const selectFiles = vi.fn(async () => ['C:\\Users\\tester\\secret.txt'])
    const fixture = createFixture({ selectFiles })
    const session = fixture.host.ensureSession('conversation', 'manual')
    fixture.host.setSurface({ sessionId: session.sessionId, visible: true })
    configureSemanticObservation(fixture.webContents)
    await fixture.host.navigate(session.sessionId, 'https://example.com/')
    const observation = await fixture.host.observe({ pageId: session.pageId, sessionId: session.sessionId })
    const lease = fixture.host.acquireControl({ pageId: session.pageId, sessionId: session.sessionId })
    const sendCommand = fixture.webContents.debugger.sendCommand.getMockImplementation()!
    fixture.webContents.debugger.sendCommand.mockImplementation(async (method, params) => {
      if (method === 'Input.dispatchMouseEvent') {
        fixture.webContents.emit('before-mouse-event', {}, {
          button: 'left',
          clickCount: 1,
          type: 'mouseDown',
          x: 30,
          y: 30,
        })
      }
      return sendCommand(method, params)
    })
    await fixture.host.act({
      action: { kind: 'click', ref: 'e1' },
      controlEpoch: lease.controlEpoch,
      documentRevision: observation.documentRevision,
      frameId: 'main-frame',
      observationId: observation.observationId,
      pageId: session.pageId,
      sessionId: session.sessionId,
    })
    expect(fixture.host.getState(session.sessionId).controller).toBe('agent')
    emitFileChooser(fixture, {}, false)

    await vi.waitFor(() => {
      expect(fixture.host.getState(session.sessionId).error).toMatchObject({ action: 'file-chooser' })
    })
    expect(selectFiles).not.toHaveBeenCalled()
    fixture.host.dispose()
  })

  it('opens developer tools for the current page only while a human controls it', async () => {
    const fixture = createFixture()
    const session = fixture.host.ensureSession('conversation', 'manual')
    fixture.host.setSurface({ sessionId: session.sessionId, visible: true })
    configureSemanticObservation(fixture.webContents)
    await fixture.host.navigate(session.sessionId, 'https://example.com/')

    expect(fixture.host.openDevTools(session.sessionId)).toBe(true)
    expect(fixture.webContents.openDevTools).toHaveBeenCalledExactlyOnceWith({ mode: 'detach' })

    const observation = await fixture.host.observe({ pageId: session.pageId, sessionId: session.sessionId })
    const lease = fixture.host.acquireControl({ pageId: session.pageId, sessionId: session.sessionId })
    const sendCommand = fixture.webContents.debugger.sendCommand.getMockImplementation()!
    fixture.webContents.debugger.sendCommand.mockImplementation(async (method, params) => {
      if (method === 'Input.dispatchMouseEvent') {
        fixture.webContents.emit('before-mouse-event', {}, {
          button: 'left',
          clickCount: 1,
          type: 'mouseDown',
          x: 30,
          y: 30,
        })
      }
      return sendCommand(method, params)
    })
    await fixture.host.act({
      action: { kind: 'click', ref: 'e1' },
      controlEpoch: lease.controlEpoch,
      documentRevision: observation.documentRevision,
      frameId: 'main-frame',
      observationId: observation.observationId,
      pageId: session.pageId,
      sessionId: session.sessionId,
    })
    expect(() => fixture.host.openDevTools(session.sessionId))
      .toThrowError(expect.objectContaining({ code: 'BROWSER_CONTROL_REQUIRED' }))
    expect(fixture.webContents.openDevTools).toHaveBeenCalledOnce()
    fixture.host.dispose()
  })

  it('allows a human-started download and reports its lifecycle', () => {
    const fixture = createFixture()
    const session = createHumanSession(fixture)
    clickHuman(fixture)
    const event = { preventDefault: vi.fn() }
    const { events, item } = createDownloadItem()
    fixture.webContents.session.emit('will-download', event, item, { id: fixture.webContents.id })

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(fixture.host.getState(session.sessionId).download).toMatchObject({ fileName: 'report.csv', state: 'started' })
    events.emit('done', {}, 'completed')
    expect(fixture.host.getState(session.sessionId).download).toMatchObject({
      fileName: 'report.csv',
      path: 'C:\\Users\\tester\\Downloads\\report.csv',
      state: 'completed',
    })
    fixture.host.dispose()
  })

  it('cancels a download that has no fresh human click and explains why', () => {
    const fixture = createFixture()
    const session = createHumanSession(fixture)
    const event = { preventDefault: vi.fn() }
    const { item } = createDownloadItem()
    fixture.webContents.session.emit('will-download', event, item, { id: fixture.webContents.id })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(fixture.host.getState(session.sessionId)).toMatchObject({
      error: { action: 'download', code: 'BROWSER_PERMISSION_DENIED' },
    })
    expect(fixture.host.getState(session.sessionId).download ?? null).toBeNull()
    fixture.host.dispose()
  })

  it('ignores a download event for a page that this host does not own', () => {
    const fixture = createFixture()
    createHumanSession(fixture)
    clickHuman(fixture)
    const event = { preventDefault: vi.fn() }
    const { item } = createDownloadItem()
    // Another session in the same partition owns this request, so it must not be attributed here.
    fixture.webContents.session.emit('will-download', event, item, { id: 999 })

    expect(event.preventDefault).toHaveBeenCalledOnce()
    fixture.host.dispose()
  })
})
