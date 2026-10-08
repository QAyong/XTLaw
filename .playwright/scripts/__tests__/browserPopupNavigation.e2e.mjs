import { createServer } from 'node:http'
import { expect, test } from '../fixtures/electron.mjs'

const pages = {
  '/': '<!doctype html><title>Video search</title><a id="video" target="_blank" href="/video" style="display:block;padding:40px">Open video</a>',
  '/attachment': 'attachment body',
  '/timer-download': '<!doctype html><title>Slow export</title><div style="padding:40px">Exporting…</div><script>setTimeout(() => { location.href = "/attachment" }, 600)</script>',
  '/timer-popup': '<!doctype html><title>Popup storm</title><div style="padding:40px">Popup storm</div><script>setTimeout(() => { window.open("/video") }, 600)</script>',
  '/video': '<!doctype html><title>Video destination</title><h1>Video destination</h1>',
}

/** Fixture site covering the managed-page flows Lexora has to route, block or explain. */
async function startFixtureSite() {
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname
    if (path === '/attachment') {
      response.setHeader('Content-Disposition', 'attachment; filename="report.csv"')
      response.setHeader('Content-Type', 'text/csv')
      response.end(pages[path])
      return
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(pages[path] ?? pages['/'])
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    close: () => new Promise(resolve => server.close(resolve)),
    url: `http://127.0.0.1:${server.address().port}`,
  }
}

/** Opens the browser panel through the command palette, the same path a user takes. */
async function openBrowser(page) {
  await expect(page.locator('.desktop-workbench-area__tasks .tiptap:visible').first()).toBeVisible()
  await page.keyboard.press('Control+Shift+P')
  await page.getByPlaceholder('输入命令名称').fill('浏览器')
  await page.getByPlaceholder('输入命令名称').press('Enter')
  const address = page.getByTestId('browser-address')
  await expect(address).toBeVisible()
  return address
}

function listManagedPages(app, url) {
  return app.evaluate(({ webContents }, prefix) => webContents
    .getAllWebContents()
    .filter(item => item.getType() === 'webview' && item.getURL().startsWith(prefix))
    .map(item => item.getURL()), url)
}

test('manual target blank links open a managed browser tab and retain the source', async ({ buddy }) => {
  const site = await startFixtureSite()
  try {
    const url = `${site.url}/`
    const instance = await buddy.createInstance('browser-popup')
    const { app, page } = await instance.launch()
    const address = await openBrowser(page)
    await address.fill(url)
    await address.press('Enter')
    await expect(page.getByTestId('browser-pick-element')).toBeEnabled()
    await app.evaluate(async ({ webContents }, url) => {
      const guest = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
      guest.focus()
      const point = await guest.executeJavaScript('(() => {const r=document.querySelector("#video").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
      const position = { x: Math.round(point.x * guest.getZoomFactor()), y: Math.round(point.y * guest.getZoomFactor()) }
      guest.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...position })
      guest.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...position })
    }, url)
    await expect(address).toHaveValue(`${url}video`)
    expect(await listManagedPages(app, site.url)).toEqual(expect.arrayContaining([url, `${url}video`]))
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  }
  finally {
    await site.close()
  }
})

test('a scripted popup without a click is blocked and explained in the panel', async ({ buddy }) => {
  const site = await startFixtureSite()
  try {
    const instance = await buddy.createInstance('browser-popup-blocked')
    const { app, page } = await instance.launch()
    const address = await openBrowser(page)
    const url = `${site.url}/timer-popup`
    await address.fill(url)
    await address.press('Enter')

    const notice = page.getByTestId('browser-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('已拦截')
    expect(await listManagedPages(app, site.url)).toEqual([url])
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)

    await page.getByTestId('browser-notice-dismiss').click()
    await expect(notice).toBeHidden()
  }
  finally {
    await site.close()
  }
})

test('a scripted download without a click is cancelled and explained in the panel', async ({ buddy }) => {
  const site = await startFixtureSite()
  try {
    const instance = await buddy.createInstance('browser-download-blocked')
    const { app, page } = await instance.launch()
    const address = await openBrowser(page)
    const url = `${site.url}/timer-download`
    await address.fill(url)
    await address.press('Enter')

    const notice = page.getByTestId('browser-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('已拦截')
    await expect(address).toHaveValue(url)
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  }
  finally {
    await site.close()
  }
})
