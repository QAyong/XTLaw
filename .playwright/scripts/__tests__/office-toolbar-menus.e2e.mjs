import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { withArtifactPreview } from '../fixtures/artifact-preview.mjs'
import { expect, test } from '../fixtures/electron.mjs'
import { officeDocument } from '../fixtures/office-documents.mjs'
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
    await withArtifactPreview(buddy, {
      label: `office-${kind}`,
      prepare: async (directory) => {
        await fs.writeFile(path.join(directory, `toolbar.${kind}`), officeDocument(kind))
        return [`toolbar.${kind}`]
      },
    }, async ({ app, page, output }) => {
      const taskHash = await page.evaluate(() => location.hash)
      await page.getByRole('button', { name: '市场', exact: true }).click()
      await app.evaluate(({ dialog }, file) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
      }, archive)
      await page.getByTestId('extension-add').click()
      await page.getByTestId('extension-add-package').click()
      const review = page.getByTestId('extension-install-review')
      await expect(review).toBeVisible()
      await review.getByTestId('extension-confirm-install').click()
      await expect(review).toBeHidden()
      await expect.poll(() => page.evaluate(async id => (await window.lexoraDesktop.extensions.list()).some(item => item.manifest.id === id && item.enabled), manifest.id)).toBe(true)
      await page.evaluate(hash => { location.hash = hash }, taskHash)
      await output(`toolbar.${kind}`).getByRole('button', { name: `toolbar.${kind}`, exact: true }).click()
      let frame
      await expect.poll(async () => {
        frame = page.frames().find(item => item.url().startsWith('lexora-extension:') && !item.isDetached())
        return frame && await frame.locator(tabs).first().isVisible().catch(() => false)
      }, { timeout: 45000 }).toBe(true)
      await testInfo.attach('initial-controls', { body: JSON.stringify(await frame.locator('button').evaluateAll(items => items.slice(0, 100).map(item => ({ text: item.textContent.trim(), title: item.title, class: item.className }))), null, 2), contentType: 'application/json' })
      await page.screenshot({ path: testInfo.outputPath(`${kind}-initial.png`), animations: 'disabled' })
      // Change only the real host iframe's width, preserving the plugin DOM and styles.
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
  })
}
