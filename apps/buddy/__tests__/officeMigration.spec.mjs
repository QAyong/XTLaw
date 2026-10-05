import { readdir, readFile } from 'node:fs/promises'
import { strToU8, zipSync } from 'fflate'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const plugin = new URL('../../../plugins/office/', import.meta.url)
const { validateDocx, readDocx } = await import(new URL('docx.js', plugin).href)
const { createOfficeBridge } = await import(new URL('bridge.js', plugin).href)
const docx = () => zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<document/>') })

function fixture() {
  const bytes = docx()
  const resource = { id: 'test-document', name: '合同.docx', size: bytes.length }
  const controller = new AbortController()
  const ui = { busy: vi.fn(), file: vi.fn(), status: vi.fn(), error: vi.fn(), confirmDiscard: vi.fn(async () => true) }
  const context = {
    signal: controller.signal,
    environment: { language: 'zh-CN', colorScheme: 'light' },
    onEnvironmentChange: vi.fn(() => ({ dispose: vi.fn() })),
    resources: {
      pickFiles: vi.fn(async () => [resource]),
      readBytes: vi.fn(async (_file, options) => ({ data: bytes.slice(options.offset, options.offset + options.length), size: bytes.length, eof: options.offset + options.length >= bytes.length })),
      saveFile: vi.fn(async () => true),
    },
  }
  const bridge = createOfficeBridge(context, ui)
  const opened = vi.fn()
  bridge.desktop.onOpenDocx(opened)
  bridge.desktop.onCloseCheck(() => bridge.desktop.reportCloseCheck({ dirty: true, autoSave: false }))
  return { bytes, resource, context, ui, controller, bridge, opened }
}

beforeEach(() => vi.restoreAllMocks())

describe('dOCX migration container budgets', () => {
  it('accepts a bounded DOCX and rejects PDF, generic ZIP and traversal', () => {
    expect(validateDocx(docx())).toBeInstanceOf(Uint8Array)
    expect(() => validateDocx(strToU8('%PDF-1.7'))).toThrow('OFFICE_INVALID_DOCX')
    expect(() => validateDocx(zipSync({ 'file.txt': strToU8('text') }))).toThrow('OFFICE_INVALID_DOCX')
    expect(() => validateDocx(zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': strToU8('<document/>'), '../escape': strToU8('bad') }))).toThrow('OFFICE_INVALID_DOCX')
  })
  it('checks actual inflation, not just attacker-controlled ZIP metadata', () => {
    const bytes = zipSync({ '[Content_Types].xml': strToU8('<Types/>'), 'word/document.xml': new Uint8Array(100000) })
    const view = new DataView(bytes.buffer)
    for (let index = 0; index < bytes.length - 46; index++) {
      if (view.getUint32(index, true) === 0x04034B50 && view.getUint32(index + 22, true) === 100000)
        view.setUint32(index + 22, 1, true)
      if (view.getUint32(index, true) === 0x02014B50 && view.getUint32(index + 24, true) === 100000)
        view.setUint32(index + 24, 1, true)
    }
    expect(() => validateDocx(bytes)).toThrow('OFFICE_INVALID_DOCX')
  })
  it('rejects stale size, short chunks, unsupported names and cancelled reads', async () => {
    const f = fixture()
    f.context.resources.readBytes.mockResolvedValue({ data: new Uint8Array(1), size: f.bytes.length, eof: true })
    await expect(readDocx(f.context.resources, f.resource, f.controller.signal)).rejects.toThrow('OFFICE_RESOURCE_CHANGED')
    await expect(readDocx(f.context.resources, { ...f.resource, name: 'report.pdf' }, f.controller.signal)).rejects.toThrow('OFFICE_UNSUPPORTED_DOCX')
    f.controller.abort(new Error('closed'))
    await expect(readDocx(f.context.resources, f.resource, f.controller.signal)).rejects.toThrow('closed')
  })
})

describe('dOCX view bridge', () => {
  it('reads only a selected opaque resource and exports through Save As', async () => {
    const f = fixture()
    await f.bridge.openFile()
    const file = f.opened.mock.calls[0][0]
    expect(file.name).toBe('合同.docx')
    expect(file.path).toBe('document/test-document/合同.docx')
    expect(await f.bridge.desktop.openDocxPath('C:\\private\\contract.docx')).toBeNull()
    expect(await f.bridge.desktop.saveDocx(file.path, f.bytes)).toMatchObject({ ok: true, path: file.path })
    expect(f.context.resources.saveFile).toHaveBeenCalledWith({ name: '合同.docx', data: f.bytes })
    expect(f.ui.status).toHaveBeenCalledWith('savedCopy')
    f.bridge.dispose()
  })
  it('does not claim success or discard the current editor when Save As is cancelled', async () => {
    const f = fixture()
    await f.bridge.openFile()
    const file = f.opened.mock.calls[0][0]
    f.context.resources.saveFile.mockResolvedValue(false)
    expect(await f.bridge.desktop.saveDocx(file.path, f.bytes)).toEqual({ ok: false })
    expect(f.ui.status).not.toHaveBeenCalledWith('savedCopy')
    expect(await f.bridge.queryState()).toMatchObject({ dirty: true })
    f.ui.confirmDiscard.mockResolvedValue(false)
    await f.bridge.openFile()
    expect(f.context.resources.pickFiles).toHaveBeenCalledTimes(1)
    expect(f.opened).toHaveBeenCalledTimes(1)
    f.bridge.dispose()
  })
  it('keeps failed saves editable and refuses autosave and other resource identities', async () => {
    const f = fixture()
    await f.bridge.openFile()
    const file = f.opened.mock.calls[0][0]
    f.context.resources.saveFile.mockRejectedValue(new Error('EXTENSION_RESOURCE_SAVE_TARGET_CHANGED'))
    expect(await f.bridge.desktop.saveDocx(file.path, f.bytes)).toMatchObject({ ok: false })
    expect(f.ui.error).toHaveBeenCalled()
    expect(await f.bridge.desktop.saveDocx(file.path, f.bytes, true)).toMatchObject({ ok: false })
    expect(await f.bridge.desktop.saveDocx('another-file', f.bytes)).toMatchObject({ ok: false })
    expect(f.context.resources.saveFile).toHaveBeenCalledTimes(1)
    f.bridge.dispose()
  })
  it('routes editor serialization through the save callback and disposes pending state checks', async () => {
    const f = fixture()
    await f.bridge.openFile()
    f.bridge.desktop.onCloseSaveRequest(async () => {
      const result = await f.bridge.desktop.saveDocx(f.opened.mock.calls[0][0].path, f.bytes)
      f.bridge.desktop.reportCloseSaveResult(result.ok)
    })
    expect(await f.bridge.saveCopy()).toBe(true)
    f.bridge.desktop.onCloseCheck(() => {})
    const pending = f.bridge.queryState()
    f.controller.abort()
    expect(await pending).toBeNull()
    await expect(f.bridge.openFile()).rejects.toThrow()
  })
})

it('ships fonts but no PDF assets, dynamic imports, export bridge calls or network permission', async () => {
  const names = await readdir(new URL('assets/', plugin))
  expect(names.filter(name => /\.(?:ttf|woff2)$/.test(name))).toHaveLength(33)
  expect(names.some(name => /^pdf[.-]/.test(name))).toBe(false)
  const renderer = await readFile(new URL('assets/index-CiXp5RFk.js', plugin), 'utf8')
  expect(renderer).not.toMatch(/import\([^)]*(?:pdf|worker)/i)
  expect(renderer).not.toMatch(/window\.desktop\.(?:exportPdf|printPdfBuffer|saveMergedPdf|takeExportPdf|pickExportImagesTarget|writeExportImage)\(/)
  expect(renderer).toContain('export const ready = rze()')
  const manifest = JSON.parse(await readFile(new URL('extension.json', plugin), 'utf8'))
  expect(manifest.permissions).toEqual({ localResources: true, resourceExport: true })
})
