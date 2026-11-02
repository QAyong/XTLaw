import { describe, expect, it } from 'vitest'

const kit = new URL('../extensions/document-kit/', import.meta.url)
const { openDocumentSession, isConflict, documentMessages } = await import(new URL('document-session.js', kit).href)

const bytes = text => new TextEncoder().encode(text)
const text = data => new TextDecoder().decode(data)
function rejectBad(data) {
  if (text(data) === 'bad')
    throw new Error('INVALID')
  return data
}
// The conflict prompt starts from a rejected save without being awaited by it.
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

// A stand-in for context.documents that follows the host's rules: one version per file, a refused save keeps a recovery copy.
function fakeHost(initial = 'v1') {
  const host = {
    disk: initial,
    version: 1,
    recovery: null,
    base: initial,
    owner: false,
    writable: true,
    calls: [],
    copies: [],
    handle() {
      return { id: 'doc', name: 'a.bin', version: String(host.version), revision: String(host.version) + (host.recovery ?? ''), writable: host.writable, kind: 'file', recovery: host.recovery !== null }
    },
  }
  host.documents = {
    open: async () => {
      host.calls.push('open')
      // The base snapshot only moves while this view does not hold the file and nothing is kept for recovery.
      if (!host.owner && host.recovery === null)
        host.base = host.disk
      host.owner = true
      return host.handle()
    },
    resume: async () => {
      host.calls.push('resume')
      return host.handle()
    },
    read: async (_document, options) => {
      host.calls.push(`read:${options.recovery}`)
      return bytes(options.recovery && host.recovery !== null ? host.recovery : host.base)
    },
    save: async (document, options) => {
      host.calls.push('save')
      if (document.version !== String(host.version) || host.disk !== host.base) {
        host.recovery = text(options.data)
        throw new Error('FILE_CONFLICT')
      }
      host.disk = host.base = text(options.data)
      host.version += 1
      host.recovery = null
      return host.handle()
    },
    status: async () => ({ changed: host.disk !== host.base }),
    discardRecovery: async () => {
      host.calls.push('discardRecovery')
      host.recovery = null
    },
    close: async () => {
      host.calls.push('close')
      host.owner = false
    },
  }
  // Exporting a copy through the host's save dialog; the answer is false while the reader cancels.
  host.answers = []
  host.resources = {
    saveFile: async (options) => {
      const saved = host.answers.length ? host.answers.shift() : true
      if (saved)
        host.copies.push(text(options.data))
      return saved
    },
  }
  return host
}

function context(host, extra = {}) {
  const controller = new AbortController()
  return { documents: host.documents, resources: host.resources, resource: { id: 'r', name: 'a.bin' }, signal: controller.signal, controller, ...extra }
}

// Makes the agent change the file under a session that is open.
function agentEdits(host, content = 'agent edit') {
  host.disk = content
  host.version += 1
}

describe('document session', () => {
  it('opens the working copy, validates what it read and writes saves back with the latest handle', async () => {
    const host = fakeHost()
    const session = await openDocumentSession(context(host), { validate: rejectBad })
    expect(text(session.bytes)).toBe('v1')
    expect(session.writable).toBe(true)
    await session.save(bytes('v2'))
    await session.save(bytes('v3'))
    expect(host.disk).toBe('v3')
    expect(host.version).toBe(3)
    await expect(openDocumentSession(context(fakeHost('bad')), { validate: rejectBad })).rejects.toThrow('INVALID')
  })

  it('refuses to write without editing rights and reports a file another view owns as read-only', async () => {
    await expect(openDocumentSession({ resource: { id: 'r' }, signal: new AbortController().signal })).rejects.toThrow('DOCUMENT_EDITING_UNAVAILABLE')
    const host = fakeHost()
    host.writable = false
    const session = await openDocumentSession(context(host))
    expect(session.writable).toBe(false)
    await expect(session.save(bytes('x'))).rejects.toThrow('DOCUMENT_READ_ONLY')
    expect(host.calls).not.toContain('save')
  })

  it('keeps the reader\'s edits as a copy before reloading when a save finds the file changed', async () => {
    const host = fakeHost()
    const steps = []
    const session = await openDocumentSession(context(host), {
      ask: async () => 'copy',
      saveCopy: async () => {
        steps.push('copy')
        host.copies.push('mine')
        return true
      },
      reload: async (info) => {
        steps.push(info.silent ? 'silent' : 'reload')
        await session.refresh()
      },
    })
    agentEdits(host)
    await expect(session.save(bytes('mine'))).rejects.toThrow('DOCUMENT_CONFLICT')
    await settle()
    expect(steps).toEqual(['copy', 'reload'])
    expect(host.copies).toEqual(['mine'])
    // The view now shows the agent's file, holds nothing stale and saves normally again.
    expect(text(session.bytes)).toBe('agent edit')
    expect(host.recovery).toBeNull()
    expect(session.conflict).toBe(false)
    await session.save(bytes('after'))
    expect(host.disk).toBe('after')
  })

  it('drops the reader\'s edits only when they ask to', async () => {
    const host = fakeHost()
    const steps = []
    const session = await openDocumentSession(context(host), {
      ask: async () => 'reload',
      saveCopy: async () => {
        steps.push('copy')
        return true
      },
      reload: async (info) => {
        steps.push(info.silent ? 'silent' : 'reload')
        await session.refresh()
      },
    })
    agentEdits(host)
    await expect(session.save(bytes('mine'))).rejects.toThrow('DOCUMENT_CONFLICT')
    await settle()
    expect(steps).toEqual(['reload'])
    expect(text(session.bytes)).toBe('agent edit')
  })

  it('asks again while the copy is not written, so cancelling the save dialog never loses edits', async () => {
    const host = fakeHost()
    const answers = [false, false, true]
    let asked = 0
    const reloads = []
    const session = await openDocumentSession(context(host), {
      ask: async () => {
        asked += 1
        return 'copy'
      },
      saveCopy: async () => answers.shift(),
      reload: async (info) => {
        reloads.push(info)
        await session.refresh()
      },
    })
    agentEdits(host)
    await expect(session.save(bytes('mine'))).rejects.toThrow('DOCUMENT_CONFLICT')
    await settle()
    expect(asked).toBe(3)
    expect(reloads).toEqual([{ silent: false }])
  })

  it('refuses saves while the reader is deciding, never writing over the changed file', async () => {
    const host = fakeHost()
    let answer
    const decision = new Promise((resolve) => {
      answer = resolve
    })
    const session = await openDocumentSession(context(host), { ask: () => decision, reload: async () => session.refresh() })
    agentEdits(host)
    await expect(session.save(bytes('mine'))).rejects.toThrow('DOCUMENT_CONFLICT')
    host.calls.length = 0
    // An editor's AutoSave fires while the dialog is open.
    await expect(session.save(bytes('mine 2'))).rejects.toThrow('DOCUMENT_CONFLICT')
    expect(host.calls).toEqual([])
    expect(host.disk).toBe('agent edit')
    answer('reload')
    await settle()
  })

  it('reloads without asking when the editor knows nothing is unsaved, and asks when it cannot tell', async () => {
    for (const [dirty, expected] of [[false, 'silent'], [undefined, 'asked'], [true, 'asked']]) {
      const host = fakeHost()
      const seen = []
      const session = await openDocumentSession(context(host), {
        isDirty: () => dirty,
        ask: async () => {
          seen.push('ask')
          return 'reload'
        },
        reload: async (info) => {
          seen.push(info.silent ? 'silent' : 'loud')
          await session.refresh()
        },
      })
      agentEdits(host)
      expect(await session.check()).toBe(true)
      expect(seen[0] === 'silent' ? 'silent' : 'asked').toBe(expected)
    }
  })

  it('does nothing when the file is unchanged', async () => {
    const host = fakeHost()
    let asked = 0
    const session = await openDocumentSession(context(host), {
      isDirty: () => true,
      ask: async () => {
        asked += 1
        return 'reload'
      },
      reload: async () => session.refresh(),
    })
    expect(await session.check()).toBe(false)
    agentEdits(host)
    expect(await session.check()).toBe(true)
    expect(await session.check()).toBe(false)
    expect(asked).toBe(1)
  })

  it('offers to keep content left by a refused save as a copy, then opens the file as it is now', async () => {
    const host = fakeHost()
    const first = await openDocumentSession(context(host))
    agentEdits(host)
    await expect(first.save(bytes('mine'))).rejects.toThrow('DOCUMENT_CONFLICT')
    await settle()
    // Closing the view keeps what the refused save left for recovery.
    await host.documents.close()
    expect(host.recovery).toBe('mine')

    const answers = ['copy', 'copy']
    host.answers.push(false)
    const reopened = await openDocumentSession(context(host), { recover: async () => answers.shift() })
    // The first copy was cancelled, so the reader is asked again; the second wrote it.
    expect(host.copies).toEqual(['mine'])
    expect(answers).toEqual([])
    expect(text(reopened.bytes)).toBe('agent edit')
    expect(host.recovery).toBeNull()
  })

  it('drops content left by a refused save when the reader says so', async () => {
    const host = fakeHost()
    host.disk = 'agent edit'
    host.recovery = 'mine'
    const session = await openDocumentSession(context(host), { recover: async () => 'discard' })
    expect(text(session.bytes)).toBe('agent edit')
    expect(host.recovery).toBeNull()
    expect(host.copies).toEqual([])
  })

  it('refresh gives the file back before opening it again so the host takes a new snapshot', async () => {
    const host = fakeHost()
    const session = await openDocumentSession(context(host))
    agentEdits(host)
    host.calls.length = 0
    expect(text(await session.refresh())).toBe('agent edit')
    expect(host.calls.filter(call => ['discardRecovery', 'close', 'open'].includes(call))).toEqual(['discardRecovery', 'close', 'open'])
  })

  it('recognises the host\'s conflict errors and picks messages by language', () => {
    for (const code of ['FILE_CONFLICT', 'FILE_RECOVERY_REQUIRED', 'FILE_OPERATION_ID_CONFLICT'])
      expect(isConflict(new Error(code))).toBe(true)
    expect(isConflict(new Error('EXTENSION_DOCUMENT_READ_ONLY'))).toBe(false)
    expect(documentMessages('zh-CN').reload).toContain('重新加载')
    expect(documentMessages('en-US').reload).toContain('reload')
  })
})
