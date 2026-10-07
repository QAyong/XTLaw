import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const root = fileURLToPath(new URL('../../', import.meta.url))
const buddy = path.join(root, 'apps/buddy')
const require = createRequire(path.join(buddy, 'package.json'))
const { strToU8, zipSync, unzipSync } = require('fflate')
const pluginId = 'pd2ec0b9018e6402d8ada6873f7fa8721.office'
const runRoot = path.join(root, '.playwright/runs')
await mkdir(runRoot, { recursive: true })
const run = await mkdtemp(path.join(runRoot, 'office-migration-'))
// Keep the application profile under the user's private temp tree. Workspace
// volumes may inherit broad write ACLs and correctly fail startup validation.
const home = await mkdtemp(path.join(tmpdir(), 'lexora-office-smoke-'))
await writeFile(path.join(home, 'config.toml'), '[desktop]\nlanguage="zh-CN"\nnotifications_enabled=false\nlaunch_at_login=false\n[pet]\nenabled=false\n[proxy]\nmode="direct"\nserver=""\n')
const input = path.join(run, 'sample.docx')
const output = path.join(run, 'saved.docx')
const sample = zipSync({
  '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
  '_rels/.rels': strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
  'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Office migration smoke</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>'),
})
await writeFile(input, sample)
const environment = Object.fromEntries(Object.entries(process.env).filter(([key, value]) => value !== undefined && !/^(?:XTLAW_|LEXORA_|ELECTRON_|PI_)/.test(key)))
const app = await electron.launch({
  executablePath: require('electron'),
  args: ['--disable-gpu', '--remote-debugging-port=9237', buddy],
  cwd: root,
  env: { ...environment, XTLAW_HOME: home, XTLAW_BUDDY_PROFILE: 'test', LEXORA_EXTENSION_DEVELOPMENT_PATH: path.join(root, 'plugins/office') },
  timeout: 45000,
})
const report = { profile: 'isolated test', nativeDialogs: 'stubbed to bounded test files; requires manual native-dialog acceptance', errors: [], steps: [] }
let stderr = ''
app.process().stderr?.on('data', (chunk) => { stderr = `${stderr}${chunk}`.slice(-32768) })
async function mainWindow() {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    const page = app.windows().find(page => page.url().startsWith('lexora-app:'))
    if (page) return page
    if (app.process().exitCode !== null) throw new Error(`Application exited: ${stderr}`)
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error(`Main window not ready; URLs: ${app.windows().map(page => page.url().slice(0, 120)).join(', ')}; ${stderr}`)
}
try {
  const page = await mainWindow()
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()) })
  await page.waitForFunction(() => location.protocol === 'lexora-app:', undefined, { timeout: 45000 })
  await page.waitForFunction(async () => (await window.lexoraDesktop?.app.startup.getState())?.status === 'ready', undefined, { timeout: 45000 })
  const info = await page.evaluate(() => window.lexoraDesktop.app.getInfo())
  assert.equal(info.runtimeProfile, 'test')
  assert.equal(path.dirname(info.configPath), home)
  const newTask = page.getByRole('button', { name: '新任务', exact: true })
  if (await newTask.count()) await newTask.first().click()
  await page.waitForFunction(async id => (await window.lexoraDesktop.extensions.list()).some(item => item.manifest.id === id && item.enabled), pluginId)
  await page.evaluate(id => window.lexoraDesktop.extensions.execute(id, `${id}.open`, null), pluginId)
  const frame = page.frameLocator('iframe[src^="lexora-extension:"]').first()
  await frame.getByRole('button', { name: '打开 DOCX', exact: true }).waitFor({ timeout: 30000 })
  await frame.locator('.ribbon-tabs').waitFor({ timeout: 30000 })
  report.steps.push('real isolated plugin view loaded under unchanged CSP')
  await page.screenshot({ path: path.join(run, 'editor-empty.png') })
  // Stub only Electron native dialogs; all view, RPC, authorization, file reading,
  // serialization and save transactions are the actual application implementation.
  await app.evaluate(({ dialog }, files) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [files.input] })
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.output })
  }, { input, output })
  await frame.getByRole('button', { name: '打开 DOCX', exact: true }).click()
  await frame.locator('[contenteditable="true"]').first().waitFor({ timeout: 30000 })
  await frame.getByText('Office migration smoke', { exact: true }).first().waitFor({ timeout: 30000 })
  report.steps.push('DOCX read and rendered')
  const editor = frame.locator('[contenteditable="true"]').first()
  await editor.click()
  await editor.press('Control+End')
  await editor.press('Enter')
  await editor.pressSequentially('Verified DOCX edit')
  await frame.getByRole('button', { name: '另存为', exact: true }).first().click()
  await frame.locator('.office-status').filter({ hasText: '已另存为' }).waitFor({ timeout: 30000 })
  const saved = unzipSync(await readFile(output))
  assert(new TextDecoder().decode(saved['word/document.xml']).includes('Verified DOCX edit'))
  assert.deepEqual(await readFile(input), sample)
  report.steps.push('actual editor serialization and host Save As completed; source unchanged')
  await page.screenshot({ path: path.join(run, 'editor-saved.png') })
  report.ok = true
  if (process.env.LEXORA_OFFICE_SMOKE_HOLD === '1') await new Promise(resolve => setTimeout(resolve, 90000))
}
catch (error) {
  report.ok = false
  report.failure = error.message
  report.stderr = stderr
  const page = app.windows().find(page => !page.url().startsWith('lexora-extension:'))
  await page?.screenshot({ path: path.join(run, 'failure.png') }).catch(() => {})
  process.exitCode = 1
}
finally {
  await writeFile(path.join(run, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ run, ...report }, null, 2)}\n`)
  await app.close()
}
