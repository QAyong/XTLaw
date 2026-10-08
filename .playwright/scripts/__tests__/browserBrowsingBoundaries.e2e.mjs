import { Buffer } from 'node:buffer'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { expect, test } from '../fixtures/electron.mjs'

const BODY = 'fixture,name\n1,safe-data\n'
async function fixtureSite() {
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname
    if (['/download', '/delayed', '/stream', '/broken'].includes(path)) {
      const send = () => {
        if (response.destroyed)
          return
        response.setHeader('Content-Disposition', 'attachment; filename="report.csv"')
        response.setHeader('Content-Type', 'application/octet-stream')
        if (path === '/stream') {
          response.setHeader('Content-Length', 20 * 1024 * 1024)
          response.flushHeaders()
          let sent = 0
          const timer = setInterval(() => {
            if (sent >= 20 * 1024 * 1024) {
              clearInterval(timer)
              response.end()
            }
            else {
              response.write(Buffer.alloc(64 * 1024, 65))
              sent += 64 * 1024
            }
          }, 50)
          response.on('close', () => clearInterval(timer))
          return
        }
        if (path === '/broken') {
          response.setHeader('Content-Length', 100_000)
          response.write('incomplete fixture')
          const timer = setTimeout(() => response.destroy(), 200)
          response.on('close', () => clearTimeout(timer))
          return
        }
        response.end(BODY)
      }
      if (path === '/delayed') {
        const timer = setTimeout(send, 1_500)
        response.on('close', () => clearTimeout(timer))
      }
      else {
        send()
      }
      return
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end(`<!doctype html><title>Browser boundary fixture</title><style>body{margin:0;padding:10px}input,button,a{display:block;margin:5px;padding:8px}a{width:250px}</style><input id="file" type="file" accept=".txt" multiple><input id="single" type="file" accept="text/plain"><a id="download" href="/download">Download</a><a id="delayed" href="/delayed">Delayed attachment</a><a id="stream" href="/stream">Streaming download</a><a id="broken" href="/broken">Broken download</a><button id="confirm" onclick="document.body.dataset.answer=String(confirm('Fixture confirmation?'))">Confirm</button><button id="alert" onclick="alert('Fixture alert');document.body.dataset.alerted='yes'">Alert</button><button id="blob" onclick="const a=document.createElement('a');a.href=window.URL.createObjectURL(new Blob(['immediate fixture']));a.download='generated.txt';document.body.append(a);a.click()">Immediate blob download</button><button id="generated" onclick="document.body.dataset.generation='scheduled';setTimeout(()=>{const a=document.createElement('a');a.href=window.URL.createObjectURL(new Blob(['generated fixture']));a.download='generated.txt';document.body.append(a);a.click();document.body.dataset.generation='completed'},1500)">Slow generated download</button>`)
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  return {
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections()
      server.close(resolve)
    }),
  }
}
async function launch(buddy, url, label) {
  const instance = await buddy.createInstance(label)
  const { app, page } = await instance.launch()
  await expect(page.locator('.desktop-workbench-area__tasks .tiptap:visible').first()).toBeVisible()
  await page.keyboard.press('Control+Shift+P')
  await page.getByPlaceholder('输入命令名称').fill('浏览器')
  await page.getByPlaceholder('输入命令名称').press('Enter')
  await page.getByTestId('browser-address').fill(url)
  await page.getByTestId('browser-address').press('Enter')
  await expect(page.getByTestId('browser-pick-element')).toBeEnabled()
  const sessionId = (await page.evaluate(() => window.lexoraDesktop.browser.listGuests()))[0].sessionId
  return { app, page, sessionId }
}
async function guest(app, url, expression) {
  return app.evaluate(({ webContents }, { url, expression }) => webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url).executeJavaScript(expression), { url, expression })
}
async function click(app, url, selector) {
  await app.evaluate(async ({ webContents }, { url, selector }) => {
    const page = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
    const rect = await page.executeJavaScript(`(() => {const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'center',behavior:'instant'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    page.focus()
    const point = { x: Math.round(rect.x * page.getZoomFactor()), y: Math.round(rect.y * page.getZoomFactor()) }
    page.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
    page.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
  }, { url, selector })
}
async function saveNext(app, url, path, cancel = false) {
  await app.evaluate(({ webContents }, { url, path, cancel }) => {
    const page = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
    page.session.once('will-download', (_event, item) => {
      globalThis.__fixtureDownload = item
      globalThis.__fixtureDownloadResult = null
      item.once('done', (_event, state) => {
        globalThis.__fixtureDownloadResult = state
      })
      if (cancel)
        item.cancel()
      else item.setSavePath(path)
    })
  }, { url, path, cancel })
}
async function files() {
  const root = test.info().outputPath('fixture-files')
  await mkdir(root, { recursive: true })
  return root
}

test('download cancellation and simulated overwrite consent preserve the existing file until approved', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const { app, page } = await launch(buddy, site.url, 'browser-overwrite')
    const path = join(await files(), 'report.csv')
    await writeFile(path, 'existing fixture -- do not delete')
    await saveNext(app, site.url, path, true)
    await click(app, site.url, '#download')
    await expect(page.getByTestId('browser-notice')).toContainText('已取消下载')
    expect(await readFile(path, 'utf8')).toBe('existing fixture -- do not delete')
    await saveNext(app, site.url, path)
    await click(app, site.url, '#download')
    await expect(page.getByTestId('browser-notice')).toContainText('已下载')
    expect(await readFile(path, 'utf8')).toBe(BODY)
  }
  finally { await site.close() }
})

test('an immediate generated blob download is saved with matching bytes', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const { app, page } = await launch(buddy, site.url, 'browser-blob-download')
    const path = join(await files(), 'generated.txt')
    await saveNext(app, site.url, path)
    await click(app, site.url, '#blob')
    await expect(page.getByTestId('browser-notice')).toContainText('已下载 generated.txt')
    expect(await readFile(path, 'utf8')).toBe('immediate fixture')
  }
  finally { await site.close() }
})

test('closing a streaming download requires confirmation; decline keeps it running and approval stops it', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const { app, page, sessionId } = await launch(buddy, site.url, 'browser-close-download')
    await saveNext(app, site.url, join(await files(), 'stream.csv'))
    await click(app, site.url, '#stream')
    await expect(page.getByTestId('browser-notice')).toContainText('正在下载')
    await app.evaluate(({ dialog }) => {
      globalThis.__closeResponse = 0
      globalThis.__closeOptions = []
      dialog.showMessageBox = async (_window, options) => {
        globalThis.__closeOptions.push(options)
        return { response: globalThis.__closeResponse }
      }
    })
    const rejected = await page.evaluate(async (id) => {
      try {
        await window.lexoraDesktop.browser.close(id)
        return false
      }
      catch { return true }
    }, sessionId)
    expect(rejected).toBe(true)
    expect((await page.evaluate(() => window.lexoraDesktop.browser.listGuests())).map(item => item.sessionId)).toContain(sessionId)
    expect(await app.evaluate(() => globalThis.__fixtureDownload.getState())).toBe('progressing')
    await app.evaluate(() => {
      globalThis.__closeResponse = 1
    })
    await page.evaluate(id => window.lexoraDesktop.browser.close(id), sessionId)
    await expect.poll(() => app.evaluate(() => globalThis.__fixtureDownloadResult)).toBe('cancelled')
    expect((await page.evaluate(() => window.lexoraDesktop.browser.listGuests())).map(item => item.sessionId)).not.toContain(sessionId)
    expect(await app.evaluate(() => globalThis.__closeOptions)).toEqual([expect.objectContaining({ defaultId: 0, cancelId: 0 }), expect.objectContaining({ defaultId: 0, cancelId: 0 })])
  }
  finally { await site.close() }
})

test('an interrupted transfer is reported as failed without a reveal-file action', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const { app, page } = await launch(buddy, site.url, 'browser-download-failure')
    await saveNext(app, site.url, join(await files(), 'broken.csv'))
    await click(app, site.url, '#broken')
    await expect(page.getByTestId('browser-notice')).toContainText('下载失败', { timeout: 30_000 })
    await expect(page.getByTestId('browser-notice-reveal')).toHaveCount(0)
  }
  finally { await site.close() }
})

for (const selector of ['#generated', '#delayed']) {
  test(`slow download ${selector} fails closed with explicit feedback`, async ({ buddy }) => {
    const site = await fixtureSite()
    try {
      const { app, page } = await launch(buddy, site.url, 'browser-slow-download')
      if (selector === '#generated') {
        await guest(app, site.url, 'window.addEventListener("error",event=>document.body.dataset.fixtureError=event.message)')
        await app.evaluate(({ webContents }, url) => {
          globalThis.__generatedEvents = []
          const page = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
          page.session.on('will-download', (_event, item, source) => globalThis.__generatedEvents.push({ id: source?.id, name: item.getFilename() }))
        }, site.url)
      }
      await click(app, site.url, selector)
      if (selector === '#generated') {
        await expect.poll(() => guest(app, site.url, '({state:document.body.dataset.generation,error:document.body.dataset.fixtureError??""})')).toEqual({ state: 'completed', error: '' })
        await expect.poll(() => app.evaluate(() => globalThis.__generatedEvents.length)).toBe(1)
      }
      await expect(page.getByTestId('browser-notice')).toContainText('已拦截')
      await expect(page.getByTestId('browser-notice-reveal')).toHaveCount(0)
    }
    finally { await site.close() }
  })
}

test('single and multiple upload selections, cancel, and navigation during selection keep target ownership', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const { app, page, sessionId } = await launch(buddy, site.url, 'browser-upload-boundaries')
    const root = await files()
    const paths = [join(root, 'first.txt'), join(root, 'second.txt')]
    await Promise.all(paths.map((path, index) => writeFile(path, `fixture ${index}`)))
    await app.evaluate(({ dialog }, paths) => {
      globalThis.__uploadMode = 'single'
      globalThis.__uploadOptions = []
      dialog.showOpenDialog = async (_window, options) => {
        globalThis.__uploadOptions.push(options)
        if (globalThis.__uploadMode === 'pending')
          return new Promise((resolve) => { globalThis.__finishUpload = resolve })
        return { canceled: globalThis.__uploadMode === 'cancel', filePaths: globalThis.__uploadMode === 'multiple' ? paths : [paths[0]] }
      }
    }, paths)
    await click(app, site.url, '#single')
    await expect.poll(() => guest(app, site.url, 'document.querySelector("#single").files.length')).toBe(1)
    await app.evaluate(() => {
      globalThis.__uploadMode = 'multiple'
    })
    await click(app, site.url, '#file')
    await expect.poll(() => guest(app, site.url, 'document.querySelector("#file").files.length')).toBe(2)
    await app.evaluate(() => {
      globalThis.__uploadMode = 'cancel'
    })
    await click(app, site.url, '#file')
    await expect.poll(() => app.evaluate(() => globalThis.__uploadOptions.length)).toBe(3)
    expect(await guest(app, site.url, 'document.querySelector("#file").files.length')).toBe(2)
    await app.evaluate(() => {
      globalThis.__uploadMode = 'pending'
    })
    await click(app, site.url, '#file')
    await expect.poll(() => app.evaluate(() => typeof globalThis.__finishUpload)).toBe('function')
    const replacement = `${site.url}replacement`
    await page.evaluate(({ sessionId, replacement }) => window.lexoraDesktop.browser.navigate(sessionId, replacement), { sessionId, replacement })
    await app.evaluate((_electron, paths) => globalThis.__finishUpload({ canceled: false, filePaths: paths }), paths)
    await expect(page.getByTestId('browser-notice')).toContainText('上传已取消')
    expect(await guest(app, replacement, 'document.querySelector("#file").files.length')).toBe(0)
    expect((await app.evaluate(() => globalThis.__uploadOptions))[0].properties).toEqual(['openFile'])
  }
  finally { await site.close() }
})

test('alert and confirm use trusted origins and preserve decisions; dialog storms are suppressed', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const url = `${site.url}?token=fixture-secret`
    const { app, page } = await launch(buddy, url, 'browser-dialog-boundaries')
    app.context().on('page', target => target.on('dialog', () => {}))
    for (const target of app.context().pages())
      target.on('dialog', () => {})
    await app.evaluate(({ dialog }) => {
      globalThis.__dialogOptions = []
      globalThis.__dialogResponses = [1, 0, 0]
      dialog.showMessageBoxSync = (_window, options) => {
        globalThis.__dialogOptions.push(options)
        return globalThis.__dialogResponses.shift() ?? 0
      }
    })
    await click(app, url, '#confirm')
    await expect.poll(() => guest(app, url, 'document.body.dataset.answer')).toBe('true')
    await click(app, url, '#confirm')
    await expect.poll(() => guest(app, url, 'document.body.dataset.answer')).toBe('false')
    await click(app, url, '#alert')
    await expect.poll(() => guest(app, url, 'document.body.dataset.alerted')).toBe('yes')
    await click(app, url, '#confirm')
    await expect(page.getByTestId('browser-notice')).toContainText('网页对话框已抑制')
    const options = await app.evaluate(() => globalThis.__dialogOptions)
    expect(options).toHaveLength(3)
    expect(options.every(option => option.message === new URL(url).origin && !option.message.includes('fixture-secret'))).toBe(true)
    expect(await guest(app, url, '({desktop:typeof lexoraDesktop,node:typeof require,process:typeof process})')).toEqual({ desktop: 'undefined', node: 'undefined', process: 'undefined' })
  }
  finally { await site.close() }
})

test('cache-only cleanup keeps fixture login and storage; clearing all removes browser data but not app data', async ({ buddy }) => {
  const site = await fixtureSite()
  try {
    const { app, page } = await launch(buddy, site.url, 'browser-clear-data')
    await guest(app, site.url, 'localStorage.setItem("fixture-login","signed-in")')
    await app.evaluate(async ({ BrowserWindow, webContents }, url) => {
      const guest = webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url)
      await guest.session.cookies.set({ url, name: 'fixture-login', value: 'signed-in' })
      await BrowserWindow.getAllWindows()[0].webContents.session.cookies.set({ url, name: 'app-sentinel', value: 'unchanged' })
    }, site.url)
    expect(await page.evaluate(() => window.lexoraDesktop.browser.clearData({ cache: true, siteData: false }))).toEqual({ ok: true })
    expect(await guest(app, site.url, 'localStorage.getItem("fixture-login")')).toBe('signed-in')
    const cookieCount = () => app.evaluate(async ({ webContents }, url) => webContents.getAllWebContents().find(item => item.getType() === 'webview' && item.getURL() === url).session.cookies.get({ name: 'fixture-login' }).then(items => items.length), site.url)
    expect(await cookieCount()).toBe(1)
    expect(await page.evaluate(() => window.lexoraDesktop.browser.clearData({ cache: true, siteData: true }))).toEqual({ ok: true })
    await expect.poll(cookieCount).toBe(0)
    expect(await guest(app, site.url, 'localStorage.getItem("fixture-login")')).toBeNull()
    expect(await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].webContents.session.cookies.get({ name: 'app-sentinel' })).length)).toBe(1)
  }
  finally { await site.close() }
})
