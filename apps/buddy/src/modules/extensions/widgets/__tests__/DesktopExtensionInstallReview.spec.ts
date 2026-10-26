// @vitest-environment jsdom
import type { ExtensionReview } from '@buddy-shared/extensions/extensionApi'
import type { FileOpeningChoice } from '@buddy-shared/files/fileOpening'
import { BUNDLED_EXTENSION_CATALOG_URL } from '@buddy-shared/extensions/extensionCatalog'
import { extensionManifestSchema } from '@buddy-shared/extensions/extensionManifest'
import { afterEach, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import DesktopExtensionInstallReview from '../DesktopExtensionInstallReview.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  document.body.innerHTML = ''
})
const review: ExtensionReview = {
  token: 'review-token',
  manifest: extensionManifestSchema.parse({ schemaVersion: 1, id: 'test.panel', name: 'Reader', version: '1.0.0', apiVersion: 1, engines: { lexora: '*' }, contributes: {} }),
  sha256: 'hash',
  development: false,
  currentVersion: null,
  addedPermissions: [],
  fileAssociations: [
    { extension: '.md', location: 'inline', providerId: 'test.reader', title: 'Reader', currentProviderId: 'lexora.markdown', requestDefault: true },
    { extension: '.md', location: 'standalone', providerId: 'test.reader', title: 'Reader', currentProviderId: 'test.reader', requestDefault: true },
  ],
}

async function mount(value: ExtensionReview = review) {
  const root = document.createElement('div')
  document.body.append(root)
  const submissions: { applyUpdate: boolean, choices: FileOpeningChoice[] }[] = []
  const app = createApp({ render: () => h(DesktopExtensionInstallReview, {
    review: value,
    language: 'en-US',
    busy: false,
    onInstall: (applyUpdate: boolean, choices: FileOpeningChoice[]) => submissions.push({ applyUpdate, choices }),
  }) })
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  await nextTick()
  const content = document.querySelector<HTMLElement>('[data-testid="extension-file-associations"]')!
  const submit = () => document.querySelector<HTMLButtonElement>('[data-testid="extension-confirm-install"]')!.click()
  return { content, submissions, submit }
}

it('preselects requested associations and keeps existing defaults when replacements are cleared', async () => {
  const { content, submissions, submit } = await mount({
    ...review,
    manifest: extensionManifestSchema.parse({
      ...review.manifest,
      apiVersion: 4,
      contributes: { skills: [{ id: 'test.panel.review', path: 'skills/review/SKILL.md' }] },
    }),
  })
  expect(document.querySelector('[data-testid="extension-included-skills"]')?.textContent).toContain('$panel:review')
  const checkboxes = content.querySelectorAll<HTMLElement>('[role="checkbox"]')
  expect(checkboxes[0]?.getAttribute('aria-checked')).toBe('true')
  expect(checkboxes[1]?.getAttribute('aria-checked')).toBe('true')
  submit()
  expect(submissions).toEqual([{ applyUpdate: true, choices: [{ extension: '.md', location: 'inline', providerId: 'test.reader' }] }])
  checkboxes[0]!.click()
  await nextTick()
  submit()
  expect(submissions.at(-1)).toEqual({ applyUpdate: true, choices: [] })
  expect(checkboxes[1]?.getAttribute('aria-checked')).toBe('true')
})

it('leaves opt-out replacements unselected and supports individual and column selection independently', async () => {
  const { content, submissions, submit } = await mount({
    ...review,
    fileAssociations: [
      ...review.fileAssociations!.map(choice => ({ ...choice, requestDefault: false })),
      { ...review.fileAssociations![0]!, extension: '.txt', requestDefault: false },
      { ...review.fileAssociations![0]!, extension: '.txt', location: 'standalone', requestDefault: false },
    ],
  })
  const selectAll = content.querySelector<HTMLElement>('thead [role="checkbox"]')!
  const preview = content.querySelector<HTMLElement>('tbody [role="checkbox"]')!
  expect(preview.getAttribute('aria-checked')).toBe('false')
  expect(content.querySelectorAll('tbody [aria-checked="true"]')).toHaveLength(1)
  submit()
  expect(submissions.at(-1)?.choices).toEqual([])
  preview.click()
  await nextTick()
  expect(selectAll.getAttribute('aria-checked')).toBe('mixed')
  submit()
  expect(submissions.at(-1)?.choices).toEqual([{ extension: '.md', location: 'inline', providerId: 'test.reader' }])
  selectAll.click()
  await nextTick()
  expect(selectAll.getAttribute('aria-checked')).toBe('true')
  submit()
  expect(submissions.at(-1)?.choices).toEqual([
    { extension: '.md', location: 'inline', providerId: 'test.reader' },
    { extension: '.txt', location: 'inline', providerId: 'test.reader' },
  ])
  selectAll.click()
  await nextTick()
  submit()
  expect(submissions.at(-1)?.choices).toEqual([])
  expect(content.querySelectorAll('tbody [aria-checked="true"]')).toHaveLength(1)
})

it('can restore the current provider after selecting another provider for the same location', async () => {
  const { content, submissions, submit } = await mount({
    ...review,
    fileAssociations: [
      review.fileAssociations![1]!,
      { ...review.fileAssociations![1]!, providerId: 'test.alternate', title: 'Alternate' },
    ],
  })
  const [current, alternate] = content.querySelectorAll<HTMLElement>('tbody [role="checkbox"]')
  alternate!.click()
  await nextTick()
  expect(current!.getAttribute('aria-checked')).toBe('false')
  submit()
  expect(submissions.at(-1)?.choices).toEqual([{ extension: '.md', location: 'standalone', providerId: 'test.alternate' }])
  current!.click()
  await nextTick()
  expect(alternate!.getAttribute('aria-checked')).toBe('false')
  expect(current!.getAttribute('aria-checked')).toBe('true')
  submit()
  expect(submissions.at(-1)?.choices).toEqual([])
})

it('preselects the first requested provider when several providers apply to the same location', async () => {
  const { content, submissions, submit } = await mount({
    ...review,
    fileAssociations: [
      { ...review.fileAssociations![0]!, requestDefault: false },
      { ...review.fileAssociations![0]!, providerId: 'test.alternate', title: 'Alternate' },
      { ...review.fileAssociations![0]!, providerId: 'test.third', title: 'Third' },
    ],
  })
  const checked = content.querySelectorAll('tbody [aria-checked="true"]')
  expect(checked).toHaveLength(1)
  expect(checked[0]?.textContent).toContain('Alternate')
  submit()
  expect(submissions.at(-1)?.choices).toEqual([{ extension: '.md', location: 'inline', providerId: 'test.alternate' }])
})

async function mountReview(source: ExtensionReview['source'], permissions: Record<string, unknown>) {
  const manifest = extensionManifestSchema.parse({ schemaVersion: 1, id: 'tests.docs', name: 'Docs', version: '1.0.0', apiVersion: 4, engines: { lexora: '>=0.1.0' }, permissions: { selectedResource: 'read', ...permissions }, contributes: {} })
  const value: ExtensionReview = { token: 'token', manifest, sha256: 'a'.repeat(64), development: false, currentVersion: null, addedPermissions: [], ...(source ? { source } : {}) }
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(DesktopExtensionInstallReview, { review: value, language: 'zh-CN', busy: false }) })
  cleanups.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  await nextTick()
  return document.body.textContent ?? ''
}

const bundled = { catalog: BUNDLED_EXTENSION_CATALOG_URL, artifact: `${BUNDLED_EXTENSION_CATALOG_URL}/docs.lexora-extension`, sha256: 'a'.repeat(64) }
const remote = { catalog: 'https://example.com/index.json', artifact: 'https://example.com/docs.lexora-extension', sha256: 'b'.repeat(64) }

it('marks write-back, but not WebAssembly, as high risk for plugins that did not ship with XTLaw', async () => {
  const text = await mountReview(remote, { selectedResourceWrite: true, webAssembly: true, composerReference: true })
  expect(document.body.querySelectorAll('[data-testid="extension-permission-risk"]')).toHaveLength(1)
  expect(text).toContain('此插件可以覆盖它所打开的文件')
  expect(text).toContain('编译代码')
  expect(text).toContain('将文件选区引用到聊天')
})

it('marks local packages too, but not bundled Office plugins', async () => {
  await mountReview(undefined, { selectedResourceWrite: true })
  expect(document.body.querySelectorAll('[data-testid="extension-permission-risk"]')).toHaveLength(1)
  cleanups.splice(0).reverse().forEach(action => action())
  document.body.innerHTML = ''
  const text = await mountReview(bundled, { selectedResourceWrite: true, webAssembly: true })
  expect(document.body.querySelectorAll('[data-testid="extension-permission-risk"]')).toHaveLength(0)
  expect(text).toContain('保存当前文件')
  expect(text).not.toContain('覆盖它所打开的文件')
})

it('adds no warning for permissions that carry no such risk', async () => {
  await mountReview(remote, { composerReference: true, resourceExport: true })
  expect(document.body.querySelectorAll('[data-testid="extension-permission-risk"]')).toHaveLength(0)
})

it('groups MCP connections and sub-agents with their source, address and dependencies', async () => {
  const tool = JSON.stringify(['mcp', 'legal-search', 'legal__search'])
  await mount({
    ...review,
    fileAssociations: [],
    source: { catalog: 'https://example.com/catalog.json', artifact: 'https://example.com/legal.lexora-extension', sha256: 'a'.repeat(64) },
    listing: { kind: 'agent', source: 'official' },
    manifest: extensionManifestSchema.parse({
      ...review.manifest,
      id: 'tests.legal',
      apiVersion: 4,
      contributes: {
        mcpConnectors: [{ id: 'legal-search', name: 'Legal search', transport: 'streamable-http', url: 'https://legal.example.com/mcp', credential: 'bearer' }],
        subagents: [{ id: 'law-finder', kind: 'npc', name: 'Law finder', description: 'Finds statutes', instructions: 'Search statutes first.', tools: { mode: 'selected', ids: [tool] }, fileAccess: 'read_only' }],
      },
    }),
  })
  const text = (selector: string) => document.querySelector(selector)?.textContent ?? ''
  expect(document.querySelector('.n-card-header__main')?.textContent).toBe('Install sub-agent')
  expect(document.body.textContent).toContain('XTLaw Market · Sub-agent · Official')
  expect(text('[data-testid="extension-included-mcp"]')).toContain('https://legal.example.com/mcp')
  expect(text('[data-testid="extension-included-mcp"]')).toContain('downloads no code')
  expect(text('[data-testid="extension-included-mcp"]')).toContain('Needs a token')
  expect(text('[data-testid="extension-included-agents"]')).toContain('Law finder')
  expect(text('[data-testid="extension-included-agents"]')).toContain('Limited to 1 selected tools')
  expect(text('[data-testid="extension-included-agents"]')).toContain('Can read files but not change them')
  expect(text('[data-testid="extension-included-agents"]')).toContain('Legal search (installed with this package)')
  expect(text('[data-testid="extension-included-agents"]')).toContain('Xiaoxiao’s delegation list')
})

it('says a sub-agent uses every tool of a built-in connector, and that the connector is built in', async () => {
  await mount({
    ...review,
    fileAssociations: [],
    source: { catalog: 'https://example.com/catalog.json', artifact: 'https://example.com/legal.lexora-extension', sha256: 'a'.repeat(64) },
    listing: { kind: 'agent', source: 'official' },
    manifest: extensionManifestSchema.parse({
      ...review.manifest,
      id: 'tests.legal-agent',
      apiVersion: 4,
      contributes: { subagents: [{ id: 'law-finder', kind: 'npc', name: 'Law finder', instructions: 'Search statutes first.', tools: { mode: 'selected', ids: [JSON.stringify(['builtin', 'core', 'read']), JSON.stringify(['mcp', 'pkulaw', '*'])] }, fileAccess: 'inherit' }] },
    }),
  })
  const agents = document.querySelector('[data-testid="extension-included-agents"]')?.textContent ?? ''
  expect(agents).toContain('Limited to 1 selected tools；Every tool of PKULaw')
  expect(agents).toContain('PKULaw (built in)')
})

it('names the group a local package adds only when it adds one', async () => {
  await mount({ ...review, fileAssociations: [] })
  expect(document.querySelector('[data-testid="extension-included-mcp"]')).toBeNull()
  expect(document.querySelector('[data-testid="extension-included-agents"]')).toBeNull()
  expect(document.querySelector('.n-card-header__main')?.textContent).toBe('Install plugin')
  expect(document.body.textContent).toContain('Local package')
})
