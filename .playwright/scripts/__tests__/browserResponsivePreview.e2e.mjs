import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import process from 'node:process'
import { expect, test } from '../fixtures/electron.mjs'

async function fixtureSite() {
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Responsive preview fixture</title><style>*{box-sizing:border-box}body{margin:0;padding:20px;font:16px system-ui;color:#222;background:#fff}header{padding:16px;background:#eef2f5}#layout::before{content:'Wide layout'}@media(max-width:500px){#layout::before{content:'Compact layout'}header{background:#dcecdf}}input,button{display:block;margin-top:20px;padding:12px;width:100%}.columns{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:20px}.columns>div{height:140px;background:#eef2f5;padding:12px}@media(max-width:500px){.columns{grid-template-columns:1fr}}footer{margin-top:20px;padding:16px;background:#dcecdf}</style><header><strong>Responsive layout</strong><div id="layout"></div></header><input id="draft" placeholder="Write a draft"><button id="click" onclick="this.textContent='Clicked correctly'">Click in scaled preview</button><div class="columns"><div>First section</div><div>Second section</div></div><footer>Preview boundary</footer>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve)) }
}
async function launch(buddy, url) {
  const instance = await buddy.createInstance('browser-responsive-preview')
  const { app, page } = await instance.launch()
  await page.evaluate(() => {
    window.lexoraDesktop.browser.onStateChanged((value) => {
      window.__previewState = value
    })
  })
  await page.keyboard.press('Control+Shift+P')
  await page.getByPlaceholder('输入命令名称').fill('浏览器')
  await page.getByPlaceholder('输入命令名称').press('Enter')
  await page.getByTestId('browser-address').fill(url)
  await page.getByTestId('browser-address').press('Enter')
  await expect(page.getByTestId('browser-pick-element')).toBeEnabled()
  return { app, page }
}
async function guest(app, url, expression) {
  return app.evaluate(async ({ webContents }, { url, expression }) => {
    const target = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
    return target.executeJavaScript(expression)
  }, { url, expression })
}
async function toggleResponsive(page) {
  const active = await page.getByTestId('browser-viewport-controls').isVisible()
  await page.getByTestId('browser-more').click()
  await page.getByText(active ? '退出响应式预览' : '响应式预览', { exact: true }).click()
}
async function state(page) {
  return page.evaluate(() => window.__previewState)
}
async function nativeScreenshot(app, url, name) {
  const image = await app.evaluate(async ({ webContents }, url) => {
    const target = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
    return (await target.capturePage()).toPNG().toString('base64')
  }, url)
  await writeFile(test.info().outputPath(name), Buffer.from(image, 'base64'))
  if (process.platform === 'win32') {
    const id = await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      const handle = window.getNativeWindowHandle()
      return (handle.length === 8 ? handle.readBigUInt64LE() : BigInt(handle.readUInt32LE())).toString()
    })
    await new Promise((resolvePromise, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-File', resolve('.playwright/scripts/capture-responsive-window.ps1'), '-Handle', id, '-Path', test.info().outputPath(name.replace('guest', 'desktop'))], { windowsHide: true }, error => error ? reject(error) : resolvePromise())
    })
  }
}

test('responsive preview is centered; zoom changes visual size but not CSS breakpoints or page state', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const { app, page } = await launch(buddy, site.url)
    const before = await state(page)
    await guest(app, site.url, 'document.querySelector("#draft").value="unsaved draft"')
    await toggleResponsive(page)
    await expect(page.getByTestId('browser-viewport-controls')).toBeVisible()
    await expect(page.getByTestId('browser-viewport-device')).toHaveValue('iphone-14-pro')
    await expect(page.getByTestId('browser-viewport-width')).toHaveValue('393')
    await expect(page.getByTestId('browser-viewport-height')).toHaveValue('852')
    await expect(page.getByTestId('browser-viewport-zoom')).toHaveValue('fit')
    await expect.poll(() => guest(app, site.url, 'window.innerWidth')).toBe(393)
    expect(await guest(app, site.url, 'getComputedStyle(document.querySelector("#layout"),"::before").content')).toContain('Compact layout')
    const centered = await page.evaluate(() => {
      const canvas = document.querySelector('[data-testid="browser-preview-canvas"]').getBoundingClientRect()
      const frame = document.querySelector('[data-testid="browser-preview-frame"]').getBoundingClientRect()
      return Math.abs(frame.x + frame.width / 2 - canvas.x - canvas.width / 2)
    })
    expect(centered).toBeLessThan(2)
    await guest(app, site.url, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    await page.mouse.move(500, 100)
    await nativeScreenshot(app, site.url, 'responsive-guest-native.png')
    await page.screenshot({ path: test.info().outputPath('responsive-fit.png') })
    for (const zoom of ['50', '100', '200']) {
      await page.getByTestId('browser-viewport-zoom').selectOption(zoom)
      await expect.poll(async () => (await page.getByTestId('browser-preview-frame').boundingBox()).width).toBeCloseTo(393 * Number(zoom) / 100, 0)
      await expect.poll(() => guest(app, site.url, 'window.innerWidth')).toBe(393)
      expect(await guest(app, site.url, 'document.querySelector("#draft").value')).toBe('unsaved draft')
    }
    await page.getByTestId('browser-viewport-zoom').selectOption('50')
    await expect.poll(async () => (await state(page)).viewport?.scale).toBe(0.5)
    const position = await guest(app, site.url, '(()=>{const r=document.querySelector("#click").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
    const bounds = await page.getByTestId('browser-guest-surface').boundingBox()
    await page.mouse.click(bounds.x + position.x * 0.5, bounds.y + position.y * 0.5)
    await expect.poll(() => guest(app, site.url, 'document.querySelector("#click").textContent')).toBe('Clicked correctly')
    await guest(app, site.url, 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
    await nativeScreenshot(app, site.url, 'responsive-guest-50-percent.png')
    await page.screenshot({ path: test.info().outputPath('responsive-50-percent.png') })
    await toggleResponsive(page)
    await expect(page.getByTestId('browser-viewport-controls')).toHaveCount(0)
    await expect.poll(async () => (await state(page)).viewport).toBeNull()
    expect((await state(page)).pageId).toBe(before.pageId)
    expect(await guest(app, site.url, 'document.querySelector("#draft").value')).toBe('unsaved draft')
  }
  finally { await site.close() }
})

test('dimensions commit on blur or Enter; invalid drafts stay visible and resize handles support drag and keys', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const { app, page } = await launch(buddy, site.url)
    await toggleResponsive(page)
    const width = page.getByTestId('browser-viewport-width')
    await width.fill('430')
    await width.press('Enter')
    await expect.poll(() => guest(app, site.url, 'window.innerWidth')).toBe(430)
    const height = page.getByTestId('browser-viewport-height')
    await height.fill('700')
    await height.press('Tab')
    await expect.poll(() => guest(app, site.url, 'window.innerHeight')).toBe(700)
    await width.fill('100')
    await width.press('Enter')
    await expect(width).toHaveAttribute('aria-invalid', 'true')
    await expect(width).toHaveValue('100')
    expect(await guest(app, site.url, 'window.innerWidth')).toBe(430)
    await width.press('Escape')
    await expect(width).toHaveValue('430')
    await page.getByTestId('browser-viewport-zoom').selectOption('50')
    await expect.poll(async () => (await state(page)).viewport?.scale).toBe(0.5)
    const handle = page.getByTestId('browser-viewport-resize-right')
    await handle.focus()
    await handle.press('Shift+ArrowRight')
    await expect.poll(() => guest(app, site.url, 'window.innerWidth')).toBe(440)
    const box = await handle.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 25, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
    await expect.poll(() => guest(app, site.url, 'window.innerWidth')).toBe(490)
    await expect(page.getByTestId('browser-viewport-device')).toHaveValue('custom')
    await page.getByTestId('browser-viewport-device').selectOption('iphone-se')
    await expect.poll(() => guest(app, site.url, 'window.innerWidth')).toBe(375)
    await expect.poll(() => guest(app, site.url, 'window.innerHeight')).toBe(667)
    await expect(page.getByTestId('browser-viewport-zoom')).toHaveValue('fit')
    await page.screenshot({ path: test.info().outputPath('responsive-resized.png') })
  }
  finally { await site.close() }
})

test('Fit follows available panel height while preserving the logical size and the same guest', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const { app, page } = await launch(buddy, site.url)
    const guestId = await app.evaluate(({ webContents }, url) => webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url).id, site.url)
    await toggleResponsive(page)
    await expect.poll(async () => (await state(page)).viewport?.width).toBe(393)
    const originalScale = (await state(page)).viewport.scale
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 1000))
    await expect.poll(async () => (await state(page)).viewport?.scale).toBeGreaterThan(originalScale)
    expect(await guest(app, site.url, 'window.innerWidth')).toBe(393)
    expect(await guest(app, site.url, 'window.innerHeight')).toBe(852)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 820))
    await expect.poll(async () => (await state(page)).viewport?.scale).toBeCloseTo(originalScale, 2)
    expect(await app.evaluate(({ webContents }, url) => webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url).id, site.url)).toBe(guestId)
  }
  finally { await site.close() }
})
