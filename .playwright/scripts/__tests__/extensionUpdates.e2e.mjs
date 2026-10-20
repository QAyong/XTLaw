import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { expect, test } from '../fixtures/electron.mjs'

const { strToU8, zipSync } = createRequire(new URL('../../../apps/buddy/package.json', import.meta.url))('fflate/node')
const id = 'tests.updates'

async function writePackage(directory, version) {
  const manifest = {
    schemaVersion: 1,
    id,
    name: '更新验收插件',
    description: '验证更新生效与配置保留。',
    tags: ['主题', '效率'],
    version,
    apiVersion: 3,
    engines: { lexora: '*' },
    contributes: {
      settings: { items: [{ id: `${id}.preference`, key: 'preference', group: 'settings.general.general', type: 'string', title: 'Preference', default: '' }] },
    },
  }
  const file = path.join(directory, `plugin-${version}.lexora-extension`)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(file, zipSync({ 'extension.json': strToU8(JSON.stringify(manifest)) }))
  return file
}

test('plugin updates apply separately from restart and preserve preferences and disabled state', async ({ buddy }) => {
  const instance = await buddy.createInstance('plugin-updates')
  let { app, page, diagnostics } = await instance.launch()
  const directory = path.join(instance.home, 'fixtures')
  const status = () => page.evaluate(async id => (await window.lexoraDesktop.extensions.list()).find(item => item.manifest.id === id), id)
  const card = () => page.locator(`[data-extension-id="${id}"]`)
  const openPlugins = async () => {
    const back = page.locator('.desktop-back-to-tasks')
    if (await back.count())
      await back.click()
    await page.locator('#desktop-task-sidebar').getByRole('button', { name: '插件', exact: true }).click()
  }
  async function install(version, apply = true) {
    const file = await writePackage(directory, version)
    await openPlugins()
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, file)
    await page.getByTestId('extension-install-options').click()
    await page.getByTestId('extension-install').click()
    if (version !== '1.0.0') {
      const checkbox = page.getByRole('checkbox', { name: '安装完成后立即切换插件版本' })
      await expect(checkbox).toBeChecked()
      await checkbox.setChecked(apply)
      await expect(page.getByTestId('extension-confirm-install')).toHaveText(apply ? '安装并切换版本' : '安装新版本')
    }
    await page.getByTestId('extension-confirm-install').click()
    await expect.poll(status).toMatchObject(apply ? { manifest: { version, tags: ['主题', '效率'] }, pending: null } : { pending: { manifest: { version, tags: ['主题', '效率'] } } })
  }
  await install('1.0.0')
  await expect(card().getByTestId('extension-tags')).toContainText('主题')
  await expect(card().getByTestId('extension-tags')).toContainText('效率')
  await page.evaluate(async (id) => {
    await window.lexoraDesktop.extensions.configure(id, { preference: 'retain-this-value' })
  }, id)
  await install('1.0.1')
  expect(await page.evaluate(id => window.lexoraDesktop.extensions.configuration(id), id)).toEqual({ preference: 'retain-this-value' })
  await install('1.0.2', false)
  await expect(card().getByTestId('extension-apply-update')).toBeVisible()
  await expect(card().getByTestId('extension-apply-update')).toHaveText('更新')
  await card().getByTestId('extension-card-more').click()
  await expect(page.getByTestId('extension-apply-update-menu')).toHaveText('更新')
  await expect(page.getByTestId('extension-restart')).toHaveText('重启插件')
  await page.screenshot({ path: path.join(instance.artifactDirectory, 'update-and-restart-menu.png'), animations: 'disabled' })
  await page.getByTestId('extension-restart').click()
  await expect(card().getByTestId('extension-apply-update')).toBeEnabled()
  expect(await status()).toMatchObject({ manifest: { version: '1.0.1' }, pending: { manifest: { version: '1.0.2' } } })
  await card().getByTestId('extension-apply-update').click()
  await expect.poll(status).toMatchObject({ manifest: { version: '1.0.2' }, pending: null })
  await page.evaluate(id => window.lexoraDesktop.extensions.enable(id, false), id)
  await install('1.0.3')
  expect(await status()).toMatchObject({ enabled: false, state: 'disabled' })
  expect(await page.evaluate(id => window.lexoraDesktop.extensions.configuration(id), id)).toEqual({ preference: 'retain-this-value' })
  await install('1.0.4', false)
  // XTLaw does not use a remote plugin catalog, so the pending update is applied from the plugin card.
  await card().getByTestId('extension-apply-update').click()
  await expect.poll(status).toMatchObject({ manifest: { version: '1.0.4' }, pending: null, enabled: false })
  expect(diagnostics.console.filter(item => item.type === 'pageerror')).toEqual([])
  await instance.stop()
  ;({ app, page, diagnostics } = await instance.launch())
  expect(await status()).toMatchObject({ manifest: { version: '1.0.4', tags: ['主题', '效率'] }, pending: null, enabled: false })
  expect(await page.evaluate(id => window.lexoraDesktop.extensions.configuration(id), id)).toEqual({ preference: 'retain-this-value' })
  expect(diagnostics.console.filter(item => item.type === 'pageerror')).toEqual([])
})
