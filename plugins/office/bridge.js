import { readDocx, validateDocx } from './docx.js'

function noop() {}
const unsubscribe = () => noop

// No XTLaw paths, Node process, AI providers, network, or PDF APIs cross here.
export function createOfficeBridge(context, ui) {
  let current = null
  let openHandler = null
  let editorReady = null
  let readyTimer = null
  let closeCheck = null
  let closeSave = null
  let checkWaiter = null
  let saveWaiter = null
  let disposed = false
  let opening = false
  let saving = false
  const subscriptions = []
  let preferences = { side: 'left', fontSize: 'default', customFontSize: 14, spellcheck: true }
  const language = () => context.environment.language.startsWith('zh') ? 'zh' : 'en'
  const failure = error => ({ ok: false, error: ui.describeError?.(error) ?? error?.message ?? 'OFFICE_OPERATION_FAILED' })
  const denied = () => Promise.resolve({ ok: false, error: 'OFFICE_FEATURE_UNAVAILABLE' })
  function assertActive() {
    context.signal.throwIfAborted()
    if (disposed)
      throw new Error('OFFICE_VIEW_CLOSED')
  }
  function changed(type, listener) {
    const subscription = context.onEnvironmentChange(environment => listener(type === 'language' ? (environment.language.startsWith('zh') ? 'zh' : 'en') : environment.colorScheme))
    subscriptions.push(subscription)
    return () => subscription.dispose()
  }
  function queryState() {
    assertActive()
    if (!closeCheck)
      return Promise.resolve(null)
    return new Promise((resolve) => {
      const timer = setTimeout(finish, 2000, null)
      function finish(value) {
        clearTimeout(timer)
        if (checkWaiter === finish)
          checkWaiter = null
        resolve(value)
      }
      checkWaiter = finish
      closeCheck()
    })
  }
  async function openFile(selectedResource = null) {
    assertActive()
    if (opening || saving)
      return
    opening = true
    ui.busy(true)
    try {
      if (current) {
        const state = await queryState()
        if (!state)
          throw new Error('OFFICE_EDITOR_NOT_READY')
        if (state.dirty && !(await ui.confirmDiscard()))
          return
      }
      let resource = selectedResource
      if (!resource)
        [resource] = await context.resources.pickFiles({ filters: [{ name: 'Word DOCX', extensions: ['docx'] }], multiple: false })
      assertActive()
      if (!resource)
        return
      if (resource.size === undefined) {
        const metadata = await context.resources.readBytes(resource, { offset: 0, length: 1 })
        resource = { ...resource, size: metadata.size }
      }
      const bytes = await readDocx(context.resources, resource, context.signal)
      assertActive()
      if (!openHandler) {
        await new Promise((resolve) => {
          editorReady = resolve
          readyTimer = setTimeout(resolve, 10000)
        })
        clearTimeout(readyTimer)
        editorReady = null
        assertActive()
      }
      if (!openHandler)
        throw new Error('OFFICE_EDITOR_NOT_READY')
      const previous = current
      // This is an editor-only identity, not a local file path.
      const file = { path: `document/${resource.id}/${resource.name}`, name: resource.name, data: bytes.buffer }
      current = { resource, file }
      try {
        await openHandler(file)
      }
      catch (error) {
        current = previous
        throw error
      }
      ui.file(resource.name)
      ui.status('opened')
    }
    catch (error) {
      ui.error(error)
    }
    finally {
      opening = false
      if (!disposed)
        ui.busy(false)
    }
  }
  async function saveData(path, data, auto = false, saveAs = false) {
    assertActive()
    if (saving || opening || !current || path !== current.file.path)
      return { ok: false, error: 'OFFICE_SAVE_UNAVAILABLE' }
    const resource = !saveAs && current.resource.id === context.resource?.id ? context.resource : null
    // Background saves must never open an export dialog for a picked file.
    if (auto && !resource)
      return { ok: false, error: 'OFFICE_SAVE_UNAVAILABLE' }
    saving = true
    ui.busy(true)
    try {
      const bytes = validateDocx(data)
      const saved = await context.resources.saveFile({ name: current.resource.name, data: bytes, ...(resource ? { resource } : {}) })
      assertActive()
      if (!saved)
        return { ok: false }
      ui.status(resource ? 'saved' : 'savedCopy')
      // The editor uses a virtual identity; the host resolves the authorized file.
      return { ok: true, path: current.file.path }
    }
    catch (error) {
      ui.error(error)
      return failure(error)
    }
    finally {
      saving = false
      if (!disposed)
        ui.busy(false)
    }
  }
  async function saveCopy() {
    assertActive()
    if (!current || !closeSave || saving || opening)
      return
    ui.status('saving')
    return new Promise((resolve) => {
      const timer = setTimeout(finish, 125000, false)
      function finish(ok) {
        clearTimeout(timer)
        if (saveWaiter === finish)
          saveWaiter = null
        if (!ok && !disposed)
          ui.status('saveCancelled')
        resolve(ok)
      }
      saveWaiter = finish
      closeSave()
    })
  }
  const desktop = new Proxy({
    getLanguage: async () => language(),
    getTheme: async () => context.environment.colorScheme,
    onLanguageChanged: listener => changed('language', listener),
    onThemeChanged: listener => changed('theme', listener),
    getAutoSaveDefault: async () => ({ on: !!context.resource, updatedAt: 0 }),
    onAutoSaveDefaultChanged: unsubscribe,
    getAiPanelPrefs: async () => preferences,
    setAiPanelPrefs: async (patch) => {
      preferences = { ...preferences, ...patch }
      return preferences
    },
    onAiPanelPrefsChanged: unsubscribe,
    getCurrentDocxPath: () => current?.file.path ?? null,
    consumePendingOpenDocx: async () => null,
    consumeNewBlankDoc: async () => false,
    consumeAiDocContent: async () => null,
    consumeHeadlessExport: async () => null,
    openDocx: async () => null,
    openDocxPath: async path => path === current?.file.path ? current.file : null,
    openDocxDecrypt: denied,
    onOpenDocx: (listener) => {
      openHandler = listener
      editorReady?.()
      return () => {
        if (openHandler === listener)
          openHandler = null
      }
    },
    saveDocx: saveData,
    saveDocxAs: (_name, data, path) => saveData(path ?? current?.file.path, data, false, true),
    saveDocxNew: denied,
    saveDocxTo: denied,
    writeRecoveryCopy: denied,
    createDocument: denied,
    convertAltChunkHtml: async () => null,
    setDocPassword: denied,
    docPasswordIntentRevision: async () => 0,
    discardDocPasswordIntents: async () => ({ ok: true }),
    getRecentFiles: async () => [],
    pickImage: async () => null,
    fontMetrics: async () => null,
    getAiSettings: async () => ({ provider: 'disabled', providers: {} }),
    setAiSettings: denied,
    copyImageToClipboard: async () => false,
    getPathForFile: () => null,
    onCloseCheck: (listener) => {
      closeCheck = listener
      return () => {
        if (closeCheck === listener)
          closeCheck = null
      }
    },
    reportCloseCheck: value => checkWaiter?.(value),
    onCloseSaveRequest: (listener) => {
      closeSave = listener
      return () => {
        if (closeSave === listener)
          closeSave = null
      }
    },
    reportCloseSaveResult: value => saveWaiter?.(value === true),
    reportViewMenuState: noop,
    onTeardown: noop,
    respellKick: async () => {},
    spellDiag: noop,
  }, {
    get(target, property) {
      if (property in target)
        return target[property]
      if (String(property).startsWith('on'))
        return unsubscribe
      return denied
    },
  })
  function dispose() {
    disposed = true
    clearTimeout(readyTimer)
    editorReady?.()
    checkWaiter?.(null)
    saveWaiter?.(false)
    for (const subscription of subscriptions) subscription.dispose()
    current = null
    openHandler = null
    closeCheck = null
    closeSave = null
  }
  context.signal.addEventListener('abort', dispose, { once: true })
  return { desktop, openFile, saveCopy, queryState, dispose }
}
