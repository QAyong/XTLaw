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

it('shows type and source tags on cards and filters by them', async () => {
  const listing = (id: string, kind: string, source: string) => ({
    kind,
    source,
    manifest: extensionManifestSchema.parse({ schemaVersion: 1, id, name: id, version: '1.0.0', apiVersion: 4, engines: { lexora: '>=0.9.0' }, permissions: {}, contributes: {} }),
    repository: 'https://github.com/QAyong/XTLaw',
    artifact: { url: 'https://example.com/a.lexora-extension', sha256: 'a'.repeat(64), size: 100 },
    compatible: true,
    incompatibility: null,
  })
  const catalog = vi.fn(async () => ({ plugins: [listing('tests.plugin', 'plugin', 'official'), listing('tests.cli', 'cli', 'listed')], invalidEntries: 0, error: null, stale: false, cachedAt: null }))
  context.read = () => ({ state: { installed: shallowRef([]), unavailable: shallowRef([]), api: { catalog } }, language: shallowRef('zh-CN') })
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(DesktopExtensionCatalog, { busy: false }) })
  cleanup.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  await vi.waitFor(() => expect(element.querySelectorAll('[data-catalog-id]')).toHaveLength(2))
  const card = (id: string) => element.querySelector(`[data-catalog-id="${id}"]`)!
  expect(card('tests.plugin').querySelector('[data-testid="catalog-kind"]')?.textContent?.trim()).toBe('插件')
  expect(card('tests.plugin').querySelector('[data-testid="catalog-source"]')).toBeNull()
  expect(card('tests.cli').querySelector('[data-testid="catalog-kind"]')?.textContent?.trim()).toBe('CLI')
  expect(card('tests.cli').querySelector('[data-testid="catalog-source"]')?.textContent?.trim()).toBe('推荐 · 第三方')
  expect(element.querySelector('[data-testid="catalog-kind-filter"]')).not.toBeNull()
  expect(element.querySelector('[data-testid="catalog-source-filter"]')).not.toBeNull()
})

it('shows a bundled Office card as installed, and allows reinstall after it is removed', async () => {
  const manifest = extensionManifestSchema.parse({ schemaVersion: 1, id: 'tests.office', name: 'Office DOCX', version: '0.1.1', apiVersion: 4, engines: { lexora: '>=0.9.0' }, permissions: {}, contributes: {} })
  const entry = { manifest, repository: 'https://github.com/QAyong/XTLaw', artifact: { kind: 'bundled' as const, file: 'office.lexora-extension', sha256: 'a'.repeat(64), size: 100 }, compatible: true }
  const status: ExtensionStatus = { manifest, revision: 'package-1', enabled: true, compatible: true, development: false, pending: null, state: 'inactive', generation: null, error: null, activationMs: null, logs: [] }
  const installed = shallowRef([status])
  const catalog = vi.fn(async () => ({ plugins: [{ ...entry, incompatibility: null }], invalidEntries: 0, error: null, stale: false, cachedAt: null }))
  context.read = () => ({ state: { installed, unavailable: shallowRef([]), api: { catalog } }, language: shallowRef('zh-CN') })
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

it('shows a built-in capability as built in without an install button', async () => {
  const listing = (id: string, kind: string) => ({
    kind,
    source: 'official',
    manifest: extensionManifestSchema.parse({ schemaVersion: 1, id, name: id, version: '1.0.0', apiVersion: 4, engines: { lexora: '>=0.9.0' }, permissions: {}, contributes: {} }),
    repository: 'https://github.com/QAyong/XTLaw',
    artifact: { url: 'https://example.com/a.lexora-extension', sha256: 'a'.repeat(64), size: 100 },
    compatible: true,
    incompatibility: null,
  })
  const catalog = vi.fn(async () => ({ plugins: [listing('xtlaw.pkulaw', 'mcp'), listing('xtlaw.legal-research', 'skill'), listing('xtlaw.legal-search', 'mcp'), listing('xtlaw.pkulaw-plugin', 'plugin')], invalidEntries: 0, error: null, stale: false, cachedAt: null }))
  context.read = () => ({ state: { installed: shallowRef([]), unavailable: shallowRef([]), api: { catalog } }, language: shallowRef('zh-CN') })
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(DesktopExtensionCatalog, { busy: false }) })
  cleanup.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  // Built-in items ship with the application, so the grid lists only what can actually be installed.
  await vi.waitFor(() => expect(element.querySelectorAll('[data-catalog-id]')).toHaveLength(2))
  const card = (id: string) => element.querySelector(`[data-catalog-id="${id}"]`)!
  for (const id of ['xtlaw.pkulaw', 'xtlaw.legal-research'])
    expect(element.querySelector(`[data-catalog-id="${id}"]`)).toBeNull()
  for (const id of ['xtlaw.legal-search', 'xtlaw.pkulaw-plugin'])
    expect(card(id).querySelector('button')?.textContent).toContain('安装')
})

it('sends an installed MCP entry that still lacks its token to settings instead of showing it as done', async () => {
  const manifest = extensionManifestSchema.parse({ schemaVersion: 1, id: 'tests.legal', name: 'Legal', version: '1.0.0', apiVersion: 4, engines: { lexora: '>=0.9.0' }, permissions: {}, contributes: { mcpConnectors: [{ id: 'legal-search', name: 'Legal search', transport: 'streamable-http', url: 'https://legal.example.com/mcp', credential: 'bearer' }] } })
  const status: ExtensionStatus = { manifest, revision: 'package-1', enabled: true, compatible: true, development: false, pending: null, state: 'inactive', generation: null, error: null, activationMs: null, logs: [] }
  const catalog = vi.fn(async () => ({ plugins: [{ kind: 'mcp', source: 'official', manifest, repository: 'https://github.com/QAyong/XTLaw', artifact: { url: 'https://example.com/a.lexora-extension', sha256: 'a'.repeat(64), size: 100 }, compatible: true, incompatibility: null }], invalidEntries: 0, error: null, stale: false, cachedAt: null }))
  const connectors = shallowRef<unknown[]>([{ id: 'legal-search', credentialConfigured: false, enabled: false }])
  const loadConnectors = vi.fn()
  context.read = () => ({ state: { installed: shallowRef([status]), unavailable: shallowRef([]), api: { catalog } }, language: shallowRef('zh-CN'), capabilityStatus: { connectors, buddies: shallowRef([]), defaultBuddyId: shallowRef(null), loadConnectors } })
  const configure = vi.fn()
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(DesktopExtensionCatalog, { busy: false, onConfigure: configure }) })
  cleanup.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  await vi.waitFor(() => expect(element.querySelector('[data-catalog-id="tests.legal"]')).not.toBeNull())
  const card = () => element.querySelector('[data-catalog-id="tests.legal"]')!
  expect(loadConnectors).toHaveBeenCalled()
  expect(card().querySelector('[data-testid="catalog-needs-setup"]')?.textContent?.trim()).toBe('待配置')
  card().querySelector<HTMLElement>('[data-testid="catalog-configure"]')!.click()
  expect(configure).toHaveBeenCalledWith('tests.legal')
  connectors.value = [{ id: 'legal-search', credentialConfigured: true, enabled: true }]
  await nextTick()
  expect(card().querySelector('[data-testid="catalog-needs-setup"]')).toBeNull()
  expect(card().querySelector('button')?.textContent).toContain('已安装')
})

it('shows packs as a shelf whose state follows their members, and hands the missing ones over', async () => {
  const listing = (id: string) => ({
    kind: 'plugin',
    source: 'official',
    manifest: extensionManifestSchema.parse({ schemaVersion: 1, id, name: id, version: '1.0.0', apiVersion: 4, engines: { lexora: '>=0.9.0' }, permissions: {}, contributes: {} }),
    repository: 'https://github.com/QAyong/XTLaw',
    artifact: { url: 'https://example.com/a.lexora-extension', sha256: 'a'.repeat(64), size: 100 },
    compatible: true,
    incompatibility: null,
  })
  const pack = (id: string, includes: string[]) => ({ id, name: `Pack ${id}`, description: '', tags: [], source: 'official', includes })
  const catalog = vi.fn(async () => ({
    plugins: [listing('tests.docx'), listing('tests.pptx')],
    packs: [pack('office', ['tests.docx', 'tests.pptx']), pack('done', ['tests.docx']), pack('broken', ['tests.docx', 'tests.gone'])],
    invalidEntries: 0,
    error: null,
    stale: false,
    cachedAt: null,
  }))
  const status = (id: string) => ({ manifest: listing(id).manifest, revision: 'package-1', enabled: true, compatible: true, development: false, pending: null, state: 'inactive', generation: null, error: null, activationMs: null, logs: [] }) as ExtensionStatus
  const installed = shallowRef([status('tests.docx')])
  context.read = () => ({ state: { installed, unavailable: shallowRef([]), api: { catalog } }, language: shallowRef('zh-CN') })
  const installPack = vi.fn()
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(DesktopExtensionCatalog, { busy: false, onInstallPack: installPack }) })
  cleanup.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  await vi.waitFor(() => expect(element.querySelectorAll('[data-testid="catalog-pack"]')).toHaveLength(3))
  const card = (id: string) => element.querySelector(`[data-pack-id="${id}"]`)!
  expect(card('office').getAttribute('data-pack-state')).toBe('available')
  expect(card('office').querySelector('[data-testid="pack-install"]')?.textContent?.trim()).toBe('安装剩余 1 项')
  expect(card('done').getAttribute('data-pack-state')).toBe('complete')
  expect(card('done').querySelector('[data-testid="pack-install"]')).toBeNull()
  expect(card('broken').getAttribute('data-pack-state')).toBe('unavailable')
  expect(card('broken').querySelector('[data-testid="pack-install"]')).toBeNull()
  ;(card('office').querySelector('[data-testid="pack-install"]') as HTMLElement).click()
  expect(installPack).toHaveBeenCalledOnce()
  expect((installPack.mock.calls[0]![0] as Array<{ manifest: { id: string } }>).map(entry => entry.manifest.id)).toEqual(['tests.pptx'])
  installed.value = [...installed.value, status('tests.pptx')]
  await vi.waitFor(() => expect(card('office').getAttribute('data-pack-state')).toBe('complete'))
  const filter = (value: string) => Array.from(element.querySelectorAll('[data-testid="catalog-pack"]')).filter(node => node.textContent?.includes(value))
  expect(filter('Pack office')).toHaveLength(1)
})

it('shows no shelf for catalogs that carry no packs', async () => {
  const catalog = vi.fn(async () => ({ plugins: [], invalidEntries: 0, error: null, stale: false, cachedAt: null }))
  context.read = () => ({ state: { installed: shallowRef([]), unavailable: shallowRef([]), api: { catalog } }, language: shallowRef('zh-CN') })
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(DesktopExtensionCatalog, { busy: false }) })
  cleanup.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  await vi.waitFor(() => expect(catalog).toHaveBeenCalled())
  await nextTick()
  expect(element.querySelector('[data-testid="catalog-packs"]')).toBeNull()
})

it('keeps built-in members in the pack card, listed as built in, while the grid hides them', async () => {
  const listing = (id: string, kind: string, name: string) => ({
    kind,
    source: 'official',
    manifest: extensionManifestSchema.parse({ schemaVersion: 1, id, name, version: '1.0.0', apiVersion: 4, engines: { lexora: '>=0.9.0' }, permissions: {}, contributes: {} }),
    repository: 'https://github.com/QAyong/XTLaw',
    artifact: { url: 'https://example.com/a.lexora-extension', sha256: 'a'.repeat(64), size: 100 },
    compatible: true,
    incompatibility: null,
  })
  const catalog = vi.fn(async () => ({
    plugins: [listing('xtlaw.pkulaw', 'mcp', '北大法宝'), listing('xtlaw.legal-research', 'skill', '法律检索'), listing('xtlaw.legal-research-agent', 'agent', '法律检索员')],
    packs: [{ id: 'legal-research', name: '法律检索', description: '', tags: [], source: 'official', includes: ['xtlaw.legal-research', 'xtlaw.pkulaw', 'xtlaw.legal-research-agent'] }],
    invalidEntries: 0,
    error: null,
    stale: false,
    cachedAt: null,
  }))
  context.read = () => ({ state: { installed: shallowRef([]), unavailable: shallowRef([]), api: { catalog } }, language: shallowRef('zh-CN') })
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(DesktopExtensionCatalog, { busy: false }) })
  cleanup.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  await vi.waitFor(() => expect(element.querySelectorAll('[data-testid="catalog-pack"]')).toHaveLength(1))
  expect(Array.from(element.querySelectorAll('[data-catalog-id]')).map(node => node.getAttribute('data-catalog-id'))).toEqual(['xtlaw.legal-research-agent'])
  const members = Array.from(element.querySelectorAll('[data-testid="catalog-pack"] li[data-member-state]')).map(node => [node.getAttribute('data-member-state'), node.querySelector('.pack-card__member-name')?.textContent, node.querySelector('.pack-card__member-state')?.textContent])
  expect(members).toEqual([['builtin', '法律检索', '内置'], ['builtin', '北大法宝', '内置'], ['installable', '法律检索员', '未安装']])
  expect(element.querySelector('[data-testid="pack-status"]')?.textContent?.trim()).toBe('还差 1 项')
})
