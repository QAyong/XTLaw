// @vitest-environment jsdom
import type { ExtensionCapabilityImpact } from '@buddy-shared/extensions/extensionCapabilities'
import { afterEach, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import DesktopExtensionUninstallDialog from '../DesktopExtensionUninstallDialog.vue'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup()
  document.body.innerHTML = ''
})

async function mount(impact: ExtensionCapabilityImpact) {
  const root = document.createElement('div')
  document.body.append(root)
  const choices: boolean[] = []
  const app = createApp({ render: () => h(DesktopExtensionUninstallDialog, {
    name: 'Legal pack',
    language: 'zh-CN',
    busy: false,
    impact,
    onRemove: clearData => choices.push(clearData),
  }) })
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  await nextTick()
  return choices
}

it('explains retained configuration and dependency loss without deleting user copies', async () => {
  const choices = await mount({
    retained: [{ kind: 'subagent', name: 'Law finder' }, { kind: 'mcp', name: 'Legal search' }],
    dependents: [{ id: 'custom-law', name: 'My legal assistant' }],
  })
  const retained = document.querySelector('[data-testid="extension-uninstall-retained"]')!
  expect(retained.textContent).toContain('能力将停用')
  expect([...retained.querySelectorAll('li')].map(item => item.textContent?.trim())).toEqual(['NPC · Law finder', 'MCP · Legal search'])
  const dependents = document.querySelector('[data-testid="extension-uninstall-dependents"]')!
  expect(dependents.textContent).toContain('My legal assistant')
  expect(dependents.textContent).toContain('不会删除这些副本')
  expect(dependents.textContent).toContain('失去相应依赖')
  expect(document.body.textContent).toContain('配置和凭据')
  expect(document.body.textContent).toContain('无法撤销')
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')]
  buttons.find(button => button.textContent?.trim() === '卸载')!.click()
  buttons.find(button => button.textContent?.trim() === '卸载并清理')!.click()
  expect(choices).toEqual([false, true])
})

it('does not invent affected capabilities or dependents for a successful empty preview', async () => {
  await mount({ retained: [], dependents: [] })
  expect(document.querySelector('[data-testid="extension-uninstall-retained"]')).toBeNull()
  expect(document.querySelector('[data-testid="extension-uninstall-dependents"]')).toBeNull()
  expect(document.body.textContent).toContain('普通卸载会停用插件能力')
})
