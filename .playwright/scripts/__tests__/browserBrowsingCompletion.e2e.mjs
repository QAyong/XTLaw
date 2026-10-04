import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '../fixtures/electron.mjs'

async function site() {
  const server = createServer((req, res) => {
    if (req.url === '/download') {
      res.setHeader('Content-Disposition', 'attachment; filename="report.csv"')
      res.end('name,value\nfixture,42\n')
      return
    }
    if (req.url === '/icon.svg') {
      res.setHeader('Content-Type', 'image/svg+xml')
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="green"/></svg>')
      return
    }
    res.setHeader('Content-Type', 'text/html')
    res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Browser completion fixture</title><link rel="icon" href="/icon.svg"><style>body{margin:0;padding:20px}input,button,a{display:block;margin:10px;padding:10px}</style><input id="draft" value=""><input id="file" type="file" accept=".txt" multiple><a id="download" href="/download">Download report</a><button id="confirm" onclick="document.body.dataset.confirmed=String(confirm('Continue?'))">Confirm</button><a id="popup" target="_blank" href="/destination">Popup</a><div style="height:2000px">State preservation</div>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise(resolve => server.close(resolve)) }
}
async function open(page, url) {
  await expect(page.locator('.desktop-workbench-area__tasks .tiptap:visible').first()).toBeVisible()
  await page.keyboard.press('Control+Shift+P')
  await page.getByPlaceholder('输入命令名称').fill('浏览器')
  await page.getByPlaceholder('输入命令名称').press('Enter')
  const address = page.getByTestId('browser-address')
  await address.fill(url)
  await address.press('Enter')
  await expect(page.getByTestId('browser-pick-element')).toBeEnabled()
}
async function clickGuest(app, url, selector) {
  await app.evaluate(async ({ webContents }, { url, selector }) => {
    const guest = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
    guest.focus()
    const rect = await guest.executeJavaScript(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    const position = { x: Math.round(rect.x * guest.getZoomFactor()), y: Math.round(rect.y * guest.getZoomFactor()) }
    guest.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...position })
    guest.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...position })
  }, { url, selector })
}
async function guestValue(app, url, expression) {
  return app.evaluate(async ({ webContents }, { url, expression }) => {
    const guest = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
    return guest.executeJavaScript(expression)
  }, { url, expression })
}

test('human upload uses the intercepted DOM input and download bytes match the reported completion', async ({ buddy }) => {
  const fixture = await site()
  const directory = await mkdtemp(join(tmpdir(), 'lexora-browser-completion-'))
  const upload = join(directory, 'upload.txt')
  const saved = join(directory, 'report.csv')
  await writeFile(upload, 'fixture upload')
  try {
    const instance = await buddy.createInstance('browser-upload-download')
    const { app, page } = await instance.launch()
    await app.evaluate(({ dialog }, upload) => {
      globalThis.__chooserOptions = null
      dialog.showOpenDialog = async (_window, options) => {
        globalThis.__chooserOptions = options
        return { canceled: false, filePaths: [upload] }
      }
    }, upload)
    await open(page, fixture.url)
    await clickGuest(app, fixture.url, '#file')
    await expect.poll(() => guestValue(app, fixture.url, 'document.querySelector("#file").files[0]?.name')).toBe('upload.txt')
    expect(await app.evaluate(() => globalThis.__chooserOptions)).toMatchObject({ properties: ['openFile', 'multiSelections'], filters: [{ name: '.txt', extensions: ['txt'] }, { name: '*', extensions: ['*'] }] })
    await app.evaluate(({ webContents }, { url, saved }) => {
      const guest = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
      guest.session.once('will-download', (_event, item) => item.setSavePath(saved))
    }, { url: fixture.url, saved })
    await clickGuest(app, fixture.url, '#download')
    await expect(page.getByTestId('browser-notice')).toContainText('已下载 report.csv')
    await expect(page.getByTestId('browser-notice-reveal')).toBeVisible()
    expect(await readFile(saved, 'utf8')).toBe('name,value\nfixture,42\n')
    await page.screenshot({ path: test.info().outputPath('upload-download-completed.png') })
  }
  finally { await fixture.close() }
})

test('confirm cancellation preserves page semantics with a source-bound host dialog', async ({ buddy }) => {
  const fixture = await site()
  try {
    const instance = await buddy.createInstance('browser-confirm')
    const { app, page } = await instance.launch()
    // The product owns these dialogs. Prevent Playwright's default auto-dismiss from racing it.
    app.context().on('page', guest => guest.on('dialog', () => {}))
    for (const target of app.context().pages())
      target.on('dialog', () => {})
    await app.evaluate(({ dialog }) => {
      globalThis.__hostDialogOptions = []
      dialog.showMessageBoxSync = (_window, options) => {
        globalThis.__hostDialogOptions.push(options)
        return 0
      }
    })
    await open(page, fixture.url)
    await clickGuest(app, fixture.url, '#confirm')
    await expect.poll(() => guestValue(app, fixture.url, 'document.body.dataset.confirmed')).toBe('false')
    expect(await app.evaluate(() => globalThis.__hostDialogOptions)).toEqual([expect.objectContaining({ message: new URL(fixture.url).origin, detail: 'Continue?' })])
  }
  finally { await fixture.close() }
})

test('responsive viewport and tab switching preserve the same guest and unsaved input', async ({ buddy }) => {
  const fixture = await site()
  try {
    const instance = await buddy.createInstance('browser-responsive')
    const { app, page } = await instance.launch()
    await open(page, fixture.url)
    await guestValue(app, fixture.url, 'document.querySelector("#draft").value="unsaved draft"')
    const descriptors = await page.evaluate(() => window.lexoraDesktop.browser.listGuests())
    const sessionId = descriptors[0].sessionId
    await page.evaluate(({ sessionId }) => window.lexoraDesktop.browser.setViewport(sessionId, { width: 390, height: 844, scale: 0.5 }), { sessionId })
    await expect.poll(() => guestValue(app, fixture.url, 'window.innerWidth')).toBe(390)
    await expect.poll(() => guestValue(app, fixture.url, 'window.innerHeight')).toBe(844)
    expect(await guestValue(app, fixture.url, 'document.querySelector("#draft").value')).toBe('unsaved draft')
    await page.getByTestId('browser-more').click()
    await page.getByText('退出响应式预览', { exact: true }).click()
    await expect.poll(() => guestValue(app, fixture.url, 'window.innerWidth')).not.toBe(390)
    await clickGuest(app, fixture.url, '#popup')
    await expect(page.getByTestId('browser-address')).toHaveValue(`${fixture.url}destination`)
    const tabs = page.getByRole('tab', { name: 'Browser completion fixture' })
    await tabs.first().click()
    await expect(page.getByTestId('browser-address')).toHaveValue(fixture.url)
    expect(await guestValue(app, fixture.url, 'document.querySelector("#draft").value')).toBe('unsaved draft')
    expect((await page.evaluate(() => window.lexoraDesktop.browser.listGuests())).map(item => item.sessionId)).toContain(sessionId)
  }
  finally { await fixture.close() }
})
