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
    const archive = process.env.OFFICE_MENU_PACKAGE_DIR
      ? path.join(process.env.OFFICE_MENU_PACKAGE_DIR, `${folder}-${manifest.version}.lexora-extension`)
      : testInfo.outputPath(`${folder}-${manifest.version}.lexora-extension`)
    if (!process.env.OFFICE_MENU_PACKAGE_DIR)
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
      await page.getByText('安装插件包', { exact: true }).click()
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
      }, { timeout: 15000 }).toBe(true).catch(async (error) => {
        console.log('Office frame diagnostics', await Promise.all(page.frames().map(async item => ({ url: item.url(), text: await item.locator('body').innerText().catch(() => ''), classes: await item.locator('main').getAttribute('class').catch(() => '') }))))
        throw error
      })
      await fs.writeFile(testInfo.outputPath('initial-controls.json'), JSON.stringify(await frame.locator('button').evaluateAll(items => items.slice(0, 100).map(item => ({ text: item.textContent.trim(), title: item.title, class: item.className }))), null, 2))
      await page.screenshot({ path: testInfo.outputPath(`${kind}-initial.png`), animations: 'disabled' })
      // Change only the real host iframe's width, preserving the plugin DOM and styles.
      const iframe = await frame.frameElement()
      const narrowWidth = Math.min(400, await frame.evaluate(() => innerWidth))
      await iframe.evaluate((element, width) => { element.style.width = `${width}px`; element.style.maxWidth = '100%'; element.style.flex = `0 0 ${width}px` }, narrowWidth)
      await expect.poll(() => frame.evaluate(() => innerWidth)).toBeLessThanOrEqual(480)
      const row = frame.locator(tabs).first()
      await expect.poll(() => row.evaluate(element => getComputedStyle(element).overflowX)).toBe('auto')
      const last = row.locator('button').last()
      await last.scrollIntoViewIfNeeded()
      await last.click({ trial: true, timeout: 3000 })
      const commands = frame.locator('.pi-office-toolbar-scroll').first()
      const next = frame.locator('.pi-office-toolbar-nav-next').first()
      await expect(next).toBeEnabled()
      const previousScroll = await commands.evaluate(element => element.scrollLeft)
      await next.click()
      await expect.poll(() => commands.evaluate(element => element.scrollLeft)).toBeGreaterThan(previousScroll)
      if (kind === 'docx') {
        for (const width of [narrowWidth, 320]) {
          await iframe.evaluate((element, size) => { element.style.width = `${size}px`; element.style.flex = `0 0 ${size}px` }, width)
          for (const index of [0, 1]) {
            const wrapper = frame.locator('.ribbon-mode-cluster .mode-menu-wrap').nth(index)
            const trigger = wrapper.locator(':scope > button')
            const menu = wrapper.locator('.mode-menu')
            const order = index === 0 ? [0, 1] : [0, 1, 2, 0]
            for (const choice of order) {
              await trigger.scrollIntoViewIfNeeded()
              await trigger.click()
              await expect(menu).toBeVisible()
              await expect.poll(() => menu.evaluate(element => getComputedStyle(element).position)).toBe('fixed')
              const items = menu.locator('button')
              for (let item = 0; item < await items.count(); item++)
                await items.nth(item).click({ trial: true, timeout: 3000 })
              await page.screenshot({ path: testInfo.outputPath(`docx-${width}-menu-${index}-${choice}.png`), animations: 'disabled' })
              await items.nth(choice).click()
              await expect(menu).toHaveCount(0)
              if (index === 1 && choice === 2) {
                await frame.getByRole('button', { name: /^退出阅读视图/ }).click()
                await expect(trigger).toBeVisible()
              }
            }
          }
        }
      }
      await page.screenshot({ path: testInfo.outputPath(`${kind}-narrow.png`), animations: 'disabled' })
      await testInfo.attach('narrow-controls', { body: JSON.stringify(await row.locator('button').evaluateAll(items => items.map(item => ({ text: item.textContent.trim(), title: item.title, class: item.className }))), null, 2), contentType: 'application/json' })
    })
  })
}
