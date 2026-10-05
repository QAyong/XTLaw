import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'

const expectedHash = '91d16c0602689b62523566d914f67d7b6f7ad9b72dc50223dd605a415978413c'
const mainFile = 'index-CiXp5RFk.js'
const pdfFunctions = new Set(['zq', 'EIe', 'Y5'])
const pdfMethods = new Set(['exportPdf', 'printPdfBuffer', 'saveMergedPdf', 'takeExportPdf', 'pickExportImagesTarget', 'writeExportImage'])

// Parse the pinned generated renderer. Never regex-patch arbitrary upstream versions.
export function docxOnlyRenderer(text) {
  assert.equal(createHash('sha256').update(text).digest('hex'), expectedHash, 'Unexpected XTLaw renderer: review the new version before migrating')
  const source = ts.createSourceFile(mainFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  assert.equal(source.parseDiagnostics.length, 0, 'Invalid upstream JavaScript')
  const edits = []
  const functions = new Set()
  let controls = 0
  let calls = 0
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && pdfFunctions.has(node.name?.text)) {
      functions.add(node.name.text)
      edits.push({ start: node.body.getStart(source), end: node.body.end, replacement: '{ return false; }' })
      return
    }
    if (ts.isCaseClause(node) && ts.isStringLiteral(node.expression) && ['export-pdf', 'export-images'].includes(node.expression.text)) {
      edits.push({ start: node.getStart(source), end: node.end, replacement: '' })
      return
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ['window.__exportPdf', 'window.__exportImages'].includes(node.left.getText(source))) {
      edits.push({ start: node.getStart(source), end: node.end, replacement: 'void 0' })
      return
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression
      if (ts.isPropertyAccessExpression(expression) && ['jsx', 'jsxs'].includes(expression.name.text)) {
        const properties = node.arguments[1]
        if (properties && ts.isObjectLiteralExpression(properties)) {
          const tip = properties.properties.filter(property => ts.isPropertyAssignment(property) && ['children', 'data-tip', 'title'].includes(property.name.text)).map(property => property.initializer.getText(source)).join(' ')
          const callback = properties.properties.find(property => ts.isPropertyAssignment(property) && property.name.getText(source) === 'onClick')
          if (/\w+\("(?:appExportPdf|appExportImages|appPrintTitle)"\)/.test(tip) || /"export-(?:pdf|images)"/.test(properties.getText(source)) || (callback && /^(?:Di|Eu)$/.test(callback.initializer.getText(source)))) {
            edits.push({ start: node.getStart(source), end: node.end, replacement: 'null' })
            controls++
            return
          }
        }
      }
      if (ts.isPropertyAccessExpression(expression) && pdfMethods.has(expression.name.text) && expression.expression.getText(source) === 'window.desktop') {
        edits.push({ start: node.getStart(source), end: node.end, replacement: 'Promise.resolve({ok:false,error:"Unavailable in DOCX-only plugin"})' })
        calls++
        return
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.equal(functions.size, 3, 'PDF implementation removal incomplete')
  assert(controls > 0, 'No PDF command controls removed')
  for (const edit of edits.sort((a, b) => b.start - a.start))
    text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end)
  const mount = 'IK.createRoot(document.getElementById("root")).render(g.jsx(ege,{initial:e,children:g.jsx(nze,{})}))'
  assert(text.includes(`,${mount}`), 'Unexpected renderer mounting code')
  text = text.replace(`,${mount}`, ';const root=IK.createRoot(document.getElementById("root"));root.render(g.jsx(ege,{initial:e,children:g.jsx(nze,{})}));window.__lexoraOfficeUnmount=()=>root.unmount()')
  assert(/rze\(\);\s*$/.test(text), 'Unexpected renderer bootstrap')
  text = text.replace(/rze\(\);\s*$/, 'export const ready = rze();\n')
  assert(!/import\([^)]*(?:pdf|worker)/i.test(text), 'PDF dependency remains')
  assert(!/window\.desktop\.(?:exportPdf|printPdfBuffer|saveMergedPdf|takeExportPdf|pickExportImagesTarget|writeExportImage)\(/.test(text), 'PDF bridge call remains')
  assert.equal(ts.createSourceFile(mainFile, text, ts.ScriptTarget.Latest, true).parseDiagnostics.length, 0)
  return { text, controls, calls }
}

export async function migrate(reference, destination) {
  const assetRoot = path.join(reference, 'views', 'assets')
  const text = await fs.readFile(path.join(assetRoot, mainFile), 'utf8')
  const result = docxOnlyRenderer(text)
  await fs.mkdir(path.join(destination, 'assets'), { recursive: true })
  const resources = []
  for (const name of await fs.readdir(assetRoot)) {
    if (/^pdf[.-]/.test(name))
      continue
    const bytes = name === mainFile ? Buffer.from(result.text) : await fs.readFile(path.join(assetRoot, name))
    await fs.writeFile(path.join(destination, 'assets', name), bytes)
    resources.push({ name, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
  }
  for (const name of ['LICENSE', 'LICENSE-OFL.txt', 'LICENSE-UNICODE.txt', 'FONTS-README.md'])
    await fs.copyFile(path.join(reference, name), path.join(destination, name))
  await fs.copyFile(path.join(reference, 'views', 'pi-office-overrides.css'), path.join(destination, 'vendor-overrides.css'))
  await fs.writeFile(path.join(destination, 'provenance.json'), `${JSON.stringify({ upstream: 'https://github.com/genspark-ai/genoffice/', commit: 'd1280d153362071de433a6439ca31585af4af8f7', referenceRendererSha256: expectedHash, pdfControlsRemoved: result.controls, pdfBridgeCallsRemoved: result.calls, resources }, null, 2)}\n`)
  return { ...result, resources: resources.length, bytes: resources.reduce((sum, file) => sum + file.size, 0) }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const [reference, destination] = process.argv.slice(2)
  assert(reference && destination, 'Usage: node extensions/office/migrate.mjs <pi.office reference> <Lexora plugin source>')
  void migrate(path.resolve(reference), path.resolve(destination)).then((result) => {
    process.stdout.write(`${JSON.stringify({ controlsRemoved: result.controls, callsRemoved: result.calls, resources: result.resources, bytes: result.bytes })}\n`)
  }).catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
