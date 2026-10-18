// @vitest-environment jsdom
import type { ExtensionReview } from '@buddy-shared/extensions/extensionApi'
import { BUNDLED_EXTENSION_CATALOG_URL } from '@buddy-shared/extensions/extensionCatalog'
import { extensionManifestSchema } from '@buddy-shared/extensions/extensionManifest'
import { afterEach, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import DesktopExtensionInstallReview from '../DesktopExtensionInstallReview.vue'

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const action of cleanup.splice(0).reverse()) action()
  document.body.innerHTML = ''
})

async function review(source: ExtensionReview['source'], permissions: Record<string, unknown>) {
  const manifest = extensionManifestSchema.parse({ schemaVersion: 1, id: 'tests.docs', name: 'Docs', version: '1.0.0', apiVersion: 4, engines: { lexora: '>=0.1.0' }, permissions: { selectedResource: 'read', ...permissions }, contributes: {} })
  const value: ExtensionReview = { token: 'token', manifest, sha256: 'a'.repeat(64), development: false, currentVersion: null, addedPermissions: [], ...(source ? { source } : {}) }
  const element = document.createElement('div')
  document.body.append(element)
  const app = createApp({ render: () => h(DesktopExtensionInstallReview, { review: value, language: 'zh-CN', busy: false }) })
  cleanup.push(() => {
    app.unmount()
    element.remove()
  })
  app.mount(element)
  await nextTick()
  return document.body.textContent ?? ''
}

const bundled = { catalog: BUNDLED_EXTENSION_CATALOG_URL, artifact: `${BUNDLED_EXTENSION_CATALOG_URL}/docs.lexora-extension`, sha256: 'a'.repeat(64) }
const remote = { catalog: 'https://example.com/index.json', artifact: 'https://example.com/docs.lexora-extension', sha256: 'b'.repeat(64) }

it('marks write-back and WebAssembly as high risk for plugins that did not ship with XTLaw', async () => {
  const text = await review(remote, { selectedResourceWrite: true, webAssembly: true, composerReference: true })
  expect(document.body.querySelectorAll('[data-testid="extension-permission-risk"]')).toHaveLength(2)
  expect(text).toContain('此插件可以覆盖它所打开的文件')
  expect(text).toContain('编译代码')
  expect(text).toContain('将文件选区引用到聊天')
})

it('marks local packages too, but not bundled Office plugins', async () => {
  await review(undefined, { selectedResourceWrite: true })
  expect(document.body.querySelectorAll('[data-testid="extension-permission-risk"]')).toHaveLength(1)
  cleanup.splice(0).reverse().forEach(action => action())
  document.body.innerHTML = ''
  const text = await review(bundled, { selectedResourceWrite: true, webAssembly: true })
  expect(document.body.querySelectorAll('[data-testid="extension-permission-risk"]')).toHaveLength(0)
  expect(text).toContain('保存当前文件')
  expect(text).not.toContain('覆盖它所打开的文件')
})

it('adds no warning for permissions that carry no such risk', async () => {
  await review(remote, { composerReference: true, resourceExport: true })
  expect(document.body.querySelectorAll('[data-testid="extension-permission-risk"]')).toHaveLength(0)
})
