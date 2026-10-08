import type { DesktopBrowserState } from '@buddy-electron/shared/desktopApi'
import { describe, expect, it, vi } from 'vitest'
import { createMessageWebLinkOpener } from '../openMessageWebLink'

function fixture(conversationId: string | null = 'conversation') {
  const state = { sessionId: 'session', error: null } as DesktopBrowserState
  const options = {
    browser: {
      ensureSession: vi.fn().mockResolvedValue(state),
      navigate: vi.fn().mockResolvedValue(state),
    },
    conversationId: () => conversationId,
    openBrowser: vi.fn(),
    retainBrowserSession: vi.fn(),
    updateBrowserState: vi.fn(),
    openExternal: vi.fn(),
    onError: vi.fn(),
  }
  return { options, state, open: createMessageWebLinkOpener(options) }
}

describe('message web links', () => {
  it('routes successive links through the same conversation session and updates panel state', async () => {
    const { options, state, open } = fixture()
    await Promise.all([open('https://example.com'), open('http://127.0.0.1:4173/')])
    expect(options.browser.ensureSession.mock.calls).toEqual([['conversation'], ['conversation']])
    expect(options.browser.navigate.mock.calls).toEqual([
      ['session', 'https://example.com'], ['session', 'http://127.0.0.1:4173/'],
    ])
    expect(options.retainBrowserSession).toHaveBeenCalledWith(state)
    expect(options.updateBrowserState).toHaveBeenCalledWith(state)
    expect(options.openExternal).not.toHaveBeenCalled()
    expect(options.onError).not.toHaveBeenCalled()
  })

  it.each(['missing conversation', 'session rejection', 'navigation rejection', 'error state'])('provides visible failure feedback: %s', async (failure) => {
    const { options, state, open } = fixture(failure === 'missing conversation' ? null : 'conversation')
    if (failure === 'session rejection')
      options.browser.ensureSession.mockRejectedValue(new Error('unavailable'))
    if (failure === 'navigation rejection')
      options.browser.navigate.mockRejectedValue(new Error('unavailable'))
    if (failure === 'error state')
      options.browser.navigate.mockResolvedValue({ ...state, error: { code: 'BROWSER_NAVIGATION_BLOCKED', message: 'blocked' } })
    await open('http://localhost:4173/')
    expect(options.onError).toHaveBeenCalledOnce()
    expect(options.openExternal).not.toHaveBeenCalled()
    await open('https://example.com')
    expect(options.openExternal).toHaveBeenCalledWith('https://example.com')
  })

  it('ignores file links', async () => {
    const { options, open } = fixture()
    await open('sandbox:/workspace/test.md')
    expect(options.openBrowser).not.toHaveBeenCalled()
  })
})
