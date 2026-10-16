import { expect, test } from '../fixtures/electron.mjs'

// Every select in the settings pages opens on click and closes on the next click, including the
// filterable ones that Naive UI would otherwise keep open.
const pages = ['常规', '外观', '日志']

test('settings selects close when their trigger is clicked again', async ({ buddy }) => {
  const instance = await buddy.createInstance('settings-selects')
  const { page } = await instance.launch()
  await page.waitForTimeout(2500)
  await page.evaluate(() => {
    window.location.hash = '/settings/appearance'
  })
  const checked = []
  for (const name of pages) {
    await page.getByText(name, { exact: true }).filter({ visible: true }).first().click()
    await page.waitForTimeout(800)
    const selects = page.locator('.n-select')
    for (let index = 0; index < await selects.count(); index++) {
      const select = selects.nth(index)
      if (!await select.isVisible())
        continue
      await select.scrollIntoViewIfNeeded()
      const box = (await select.locator('.n-base-selection').boundingBox())
      const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
      const menus = page.locator('.n-base-select-menu:visible')
      await page.mouse.click(x, y)
      await expect(menus).toHaveCount(1)
      await page.mouse.click(x, y)
      await expect(menus, `${name} select ${index}`).toHaveCount(0)
      checked.push(`${name}:${index}`)
    }
  }
  expect(checked.length).toBeGreaterThanOrEqual(10)
  await instance.stop()
})
