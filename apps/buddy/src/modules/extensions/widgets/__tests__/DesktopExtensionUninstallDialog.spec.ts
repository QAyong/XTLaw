// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import DesktopExtensionUninstallDialog from '../DesktopExtensionUninstallDialog.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  document.body.innerHTML = ''
})

async function mount(kept?: { kind: 'mcp' | 'agent', name: string }[]) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(DesktopExtensionUninstallDialog, { name: 'Legal pack', language: 'zh-CN', busy: false, kept }) })
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  await nextTick()
}

it('lists what the user changed and will keep before the uninstall is confirmed', async () => {
  await mount([{ kind: 'agent', name: 'Law finder' }, { kind: 'mcp', name: 'Legal search' }])
  const kept = document.querySelector('[data-testid="extension-uninstall-kept"]')!
  expect(kept.textContent).toContain('你修改过的内容会保留')
  expect([...kept.querySelectorAll('li')].map(item => item.textContent?.trim())).toEqual(['子代理 · Law finder', 'MCP · Legal search'])
})

it('shows no keep notice when nothing was changed', async () => {
  await mount([])
  expect(document.querySelector('[data-testid="extension-uninstall-kept"]')).toBeNull()
  await mount()
  expect(document.querySelector('[data-testid="extension-uninstall-kept"]')).toBeNull()
})
