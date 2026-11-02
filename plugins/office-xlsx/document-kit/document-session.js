// Document kit: edit the file behind a selected-file handle (context.resource) through the host's working copy (context.documents).
// Copied into plugins by sync.mjs; edit the original in apps/buddy/extensions/document-kit.
//
// The host keeps the version this view opened. Saving checks that version and the file identity, so the plugin never overwrites
// a file that changed on disk (an agent edit counts like any other program). A refused save keeps the unsaved content as a
// recovery copy. This session adds what the host leaves to the plugin: noticing the change, and letting the reader decide.
//
// The reader is never left in a half state. A change on disk ends with the view showing the file as it is now: right away when
// nothing was unsaved, otherwise after the reader dropped their edits or kept them as a copy first.
//
// The editor stays in charge of its own buffer and UI. A plugin supplies:
//   validate(bytes)            throws for content the editor cannot open; returns the bytes
//   isDirty()                  true / false when the editor knows whether it holds unsaved edits, undefined when it cannot tell
//   reload({ silent })         shows the file's current content: refresh() in place, or discard() and reload the page
//   saveCopy()                 asks the editor to export its current content as a copy; resolves true once a copy was written
//   ask()                      resolves 'reload' (drop my edits) or 'copy' (save my edits as a copy first)
//   recover(document)          resolves 'copy' or 'discard' for unsaved content left behind by an earlier refused save

const CONFLICT = /FILE_CONFLICT|FILE_RECOVERY_REQUIRED|FILE_OPERATION_ID_CONFLICT/
const POLL_MS = 20000

export const isConflict = error => CONFLICT.test(error?.message ?? '')

const zh = {
  changedAsk: '文件已被其他程序（例如 AI）修改，而你还有没保存的修改。',
  reload: '丢弃我的修改，重新加载',
  copy: '先把我的修改另存为副本，再重新加载',
  reloaded: '文件已被外部修改，已重新加载最新内容。',
  recover: '上次有一些修改没能保存（当时文件已被其他程序修改）。',
  recoverCopy: '另存为副本',
  recoverDiscard: '放弃这些修改',
  readOnly: '此文件正在另一个视图中编辑，或为只读，修改无法保存。可以使用“另存为”保存副本。',
  conflict: '文件已被其他程序修改，未覆盖。',
}
const en = {
  changedAsk: 'The file was changed by another program (for example the AI), and you have unsaved edits.',
  reload: 'Discard my edits and reload',
  copy: 'Save my edits as a copy, then reload',
  reloaded: 'The file changed outside the editor and was reloaded.',
  recover: 'Some edits could not be saved last time (the file had been changed by another program).',
  recoverCopy: 'Save as a copy',
  recoverDiscard: 'Discard these edits',
  readOnly: 'This file is being edited in another view or is read-only, so changes cannot be saved. Use Save As to keep a copy.',
  conflict: 'The file was changed by another program and was not overwritten.',
}

export const documentMessages = language => (String(language).startsWith('zh') ? zh : en)

/*
 * A modal choice that settles with the pressed button's index; the cancel key and aborting the view settle with cancelId.
 * @param container element that hosts the dialog
 * @param signal context.signal
 */
export function showChoice(container, signal, { message, buttons, cancelId = buttons.length - 1 }) {
  return new Promise((resolve) => {
    const dialog = globalThis.document.createElement('dialog')
    const text = globalThis.document.createElement('p')
    text.textContent = message
    text.style.whiteSpace = 'pre-wrap'
    const abort = () => finish()
    function finish(index = cancelId) {
      signal.removeEventListener('abort', abort)
      dialog.close()
      dialog.remove()
      resolve(index)
    }
    signal.addEventListener('abort', abort, { once: true })
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault()
      finish()
    })
    const controls = buttons.map((label, index) => {
      const button = globalThis.document.createElement('button')
      button.type = 'button'
      button.textContent = label
      button.addEventListener('click', () => finish(index))
      return button
    })
    dialog.append(text, ...controls)
    container.append(dialog)
    dialog.showModal()
    controls[0]?.focus()
  })
}

export async function openDocumentSession(context, options = {}) {
  const { documents, resource, signal } = context
  if (!documents || !resource)
    throw new Error('DOCUMENT_EDITING_UNAVAILABLE')
  const { validate = bytes => bytes } = options
  let current = null
  let queue = Promise.resolve()
  const state = { conflict: false, prompting: false }

  const serial = (action) => {
    const next = queue.catch(() => {}).then(action)
    queue = next
    return next
  }
  const conflictError = () => new Error('DOCUMENT_CONFLICT')

  async function open() {
    current = await documents.open(resource)
    if (!current)
      throw new Error('DOCUMENT_EDITING_UNAVAILABLE')
  }

  async function load() {
    await open()
    if (current.recovery) {
      // Content kept from a refused save was never written. It is not opened in the editor (the file has moved on since):
      // the reader keeps it as a copy or drops it, and the editor then shows the file as it is now.
      for (;;) {
        const choice = (await options.recover?.(current)) ?? 'discard'
        signal.throwIfAborted()
        if (choice !== 'copy')
          break
        const data = await documents.read(current, { recovery: true, signal })
        if (await context.resources.saveFile({ name: current.name, data }))
          break
      }
      // The base snapshot is only refreshed while no recovery copy exists: drop it, then open again to see the file as it is now.
      try {
        await documents.discardRecovery(current)
        await documents.close(current)
        await open()
      }
      catch {
        // Another view owns the file: reading the base still shows the version this copy was taken from.
      }
    }
    const bytes = validate(await documents.read(current, { recovery: false, signal }))
    signal.throwIfAborted()
    return bytes
  }

  // After a failed write the host holds a newer recovery content than this handle knows about.
  async function resync() {
    try {
      current = await documents.resume(current)
    }
    catch {}
  }

  async function external(info = {}) {
    if (state.prompting || !options.ask || signal.aborted)
      return
    state.prompting = true
    try {
      const dirty = info.dirty ?? await options.isDirty?.()
      if (dirty === false && !state.conflict) {
        await options.reload?.({ silent: true })
        return
      }
      // Edits are only dropped on request, and a copy is asked for again until it is written.
      for (;;) {
        const choice = await options.ask()
        signal.throwIfAborted()
        if (choice === 'copy' && options.saveCopy && !(await options.saveCopy()))
          continue
        await options.reload?.({ silent: false })
        return
      }
    }
    finally {
      state.prompting = false
    }
  }

  const session = {
    bytes: await load(),
    get document() { return current },
    get writable() { return !!current?.writable },
    get conflict() { return state.conflict },

    // Writes the editor's content back. A refused write keeps the content as a recovery copy and asks the reader what to do.
    save(data) {
      return serial(async () => {
        if (!current.writable)
          throw new Error('DOCUMENT_READ_ONLY')
        if (state.conflict)
          throw conflictError()
        try {
          current = await documents.save(current, { data, signal })
        }
        catch (error) {
          await resync()
          if (!isConflict(error))
            throw error
          state.conflict = true
          void external({ dirty: true }).catch(() => {})
          throw conflictError()
        }
      })
    },

    // True when the file on disk differs from the version this session opened; deals with the change once.
    async check() {
      if (state.prompting || signal.aborted)
        return false
      const { changed } = await serial(() => documents.status(current))
      if (changed)
        await external()
      return !!changed
    },

    // Looks for changes when the view regains attention and now and then while it is visible.
    watch() {
      const poll = () => {
        if (globalThis.document.visibilityState !== 'hidden')
          void session.check().catch(() => {})
      }
      globalThis.addEventListener('focus', poll, { signal })
      globalThis.document.addEventListener('visibilitychange', poll, { signal })
      const timer = setInterval(poll, POLL_MS)
      signal.addEventListener('abort', () => clearInterval(timer), { once: true })
    },

    // Drops unsaved content, takes a fresh snapshot of the file and returns it. For editors that can show new content in place.
    refresh() {
      return serial(async () => {
        try {
          await documents.discardRecovery(current)
        }
        catch {}
        await documents.close(current)
        state.conflict = false
        session.bytes = await load()
        return session.bytes
      })
    },

    // Drops unsaved content and gives the file back so the next open takes a fresh snapshot. For editors that can only
    // start over by reloading the page; closing the view without this keeps the recovery copy for the next open.
    discard() {
      return serial(async () => {
        try {
          await documents.discardRecovery(current)
        }
        catch {}
        await documents.close(current)
      })
    },
  }
  return session
}
