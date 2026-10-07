// @vitest-environment jsdom
import type { ExtensionStatus } from '@buddy-shared/extensions/extensionApi'
import { extensionManifestSchema } from '@buddy-shared/extensions/extensionManifest'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import DesktopExtensionCatalog from '../DesktopExtensionCatalog.vue'

const context = vi.hoisted(() => ({ read: () => ({}) }))
vi.mock('../../extensionContext', () => ({ useExtensionContext: () => context.read() }))
const cleanup: Array<() => void> = []
afterEach(() => {
  for (const action of cleanup.splice(0).reverse()) action()
})

it('shows a bundled Office card as installed, and allows reinstall after it is removed', async () => {
  const manifest = extensionManifestSchema.parse({ schemaVersion: 1, id: 'tests.office', name: 'Office DOCX', version: '0.1.1', apiVersion: 4, engines: { lexora: '>=0.9.0' }, permissions: {}, contributes: {} })
  const entry = { manifest, repository: 'https://github.com/QAyong/XTLaw', artifact: { kind: 'bundled' as const, file: 'office.lexora-extension', sha256: 'a'.repeat(64), size: 100 }, compatible: true }
  const status: ExtensionStatus = { manifest, revision: 'package-1', enabled: true, compatible: true, development: false, pending: null, state: 'inactive', generation: null, error: null, activationMs: null, logs: [] }
  const installed = shallowRef([status])
  const catalog = vi.fn(async () => ({ plugins: [entry], error: null, stale: false, cachedAt: null }))
  context.read = () => ({ state: { installed, api: { catalog } }, language: shallowRef('zh-CN') })
  const install = vi.fn()
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(DesktopExtensionCatalog, { busy: false, onInstall: install }) })
  cleanup.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  await vi.waitFor(() => expect(element.querySelector('[data-catalog-id="tests.office"]')).not.toBeNull())
  const card = () => element.querySelector('[data-catalog-id="tests.office"]')!
  const button = () => card().querySelector('button')!
  expect(card().textContent).toContain('Office DOCX')
  expect(button().textContent).toContain('已安装')
  expect(button().disabled).toBe(true)
  installed.value = []
  await nextTick()
  expect(button().textContent).toContain('安装')
  expect(button().disabled).toBe(false)
  button().click()
  expect(install).toHaveBeenCalledWith(expect.objectContaining({ manifest: expect.objectContaining({ id: manifest.id }), artifact: expect.objectContaining({ kind: 'bundled' }) }))
})
