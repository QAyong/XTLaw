import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '../fixtures/electron.mjs'
import { ROOT } from '../shared.mjs'

const plugins = [
  ['office', 'docx', '.ribbon-tabs'],
  ['office-pptx', 'pptx', '.ribbon-tabs'],
  ['office-xlsx', 'xlsx', '.excel-header .ribbon-tabs'],
  ['office-pdf', 'pdf', '.ribbon-tabs'],
]

for (const [folder, kind, tabs] of plugins) {
  test(`Office ${kind} menus remain reachable in narrow panes`, async ({ buddy }, testInfo) => {
    test.setTimeout(180000)
    const source = path.join(ROOT, 'plugins', folder)
    const manifest = JSON.parse(await fs.readFile(path.join(source, 'extension.json'), 'utf8'))
    const archive = testInfo.outputPath(`${folder}-${manifest.version}.lexora-extension`)
    execFileSync(process.execPath, [path.join(ROOT, 'apps/buddy/extensions/tools-run.mjs'), 'pack', source, archive], { cwd: ROOT, timeout: 45000 })
    const instance = await buddy.createInstance(`office-${kind}`)
    const { app, page } = await instance.launch()
    await page.locator('.desktop-app-sidebar').getByRole('button', { name: '插件', exact: true }).click()
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
    }, archive)
    await page.getByTestId('extension-install-options').click()
    await page.getByTestId('extension-install').click()
    const review = page.getByTestId('extension-install-review')
    await expect(review).toBeVisible()
    await review.getByTestId('extension-confirm-install').click()
    await expect(review).toBeHidden()
    const card = page.locator(`[data-extension-id="${manifest.id}"]`)
    await card.getByRole('button', { name: '打开', exact: true }).click()
    let frame
    await expect.poll(async () => {
      frame = page.frames().find(item => item.url().startsWith('lexora-extension:') && !item.isDetached())
      return frame && await frame.locator(tabs).first().isVisible().catch(() => false)
    }, { timeout: 45000 }).toBe(true)
    await testInfo.attach('initial-controls', { body: JSON.stringify(await frame.locator('button').evaluateAll(items => items.slice(0, 100).map(item => ({ text: item.textContent.trim(), title: item.title, class: item.className }))), null, 2), contentType: 'application/json' })
    await page.screenshot({ path: testInfo.outputPath(`${kind}-initial.png`), animations: 'disabled' })
    // Resize the plugin's real iframe to exercise a narrow workbench pane without altering editor CSS.
    const iframe = await frame.frameElement()
    await iframe.evaluate(element => { element.style.width = '480px'; element.style.flex = '0 0 480px' })
    await expect.poll(() => frame.evaluate(() => innerWidth)).toBeLessThanOrEqual(480)
    const row = frame.locator(tabs).first()
    await expect.poll(() => row.evaluate(element => getComputedStyle(element).overflowX)).toBe('auto')
    const last = row.locator('button').last()
    await last.scrollIntoViewIfNeeded()
    await last.click({ trial: true })
    await page.screenshot({ path: testInfo.outputPath(`${kind}-narrow.png`), animations: 'disabled' })
    await testInfo.attach('narrow-controls', { body: JSON.stringify(await row.locator('button').evaluateAll(items => items.map(item => ({ text: item.textContent.trim(), title: item.title, class: item.className }))), null, 2), contentType: 'application/json' })
  })
}
