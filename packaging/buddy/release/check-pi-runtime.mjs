import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { once } from 'node:events'
import { readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { writeOutput } from '../../shared/cli-output.mjs'

async function main() {
  const buddy = fileURLToPath(new URL('../../../apps/buddy/', import.meta.url))
  const codingAgentRoot = realpathSync(join(buddy, 'node_modules/@earendil-works/pi-coding-agent'))
  const codingAgentPackage = JSON.parse(readFileSync(join(codingAgentRoot, 'package.json'), 'utf8'))
  assert.equal(codingAgentPackage.version, '1.6.1', 'Pi coding-agent must be 1.6.1')

  const dependencyRoot = dirname(dirname(codingAgentRoot))
  const codemodeRoot = realpathSync(join(dependencyRoot, '@earendil-works/pi-codemode'))
  const codemodePackage = JSON.parse(readFileSync(join(codemodeRoot, 'package.json'), 'utf8'))
  assert.equal(codemodePackage.version, '1.6.1', 'Pi codemode must be 1.6.1')
  const codemodeEntry = join(codemodeRoot, codemodePackage.exports['.'].import)
  const codemodeRequire = createRequire(pathToFileURL(codemodeEntry))
  const wasmPath = realpathSync(codemodeRequire.resolve('quickjs-wasi/quickjs.wasm'))
  const wasmBytes = readFileSync(wasmPath)
  assert.deepEqual(wasmBytes.subarray(0, 4), Buffer.from([0, 97, 115, 109]), 'quickjs-wasi asset must be a WebAssembly module')

  const { CodemodeSandbox, loadQuickJSWasm } = await import(pathToFileURL(codemodeEntry).href)
  const sandbox = new CodemodeSandbox({
    wasm: loadQuickJSWasm(wasmPath),
    tools: [{ name: 'double', execute: ({ value }) => value * 2 }],
  })
  try {
    const result = await sandbox.execute('return await tools.double({ value: 21 })')
    assert.equal(result.ok, true, JSON.stringify(result.error))
    assert.equal(result.value, 42)
  }
  finally {
    await sandbox.close()
  }

  const imageResizeModule = join(codingAgentRoot, 'dist/utils/image-resize.js')
  const imageResizeWorker = join(dirname(imageResizeModule), 'image-resize-worker.js')
  assert.ok(readFileSync(imageResizeModule).length > 0, 'Pi image-resize module must be present')
  assert.ok(readFileSync(imageResizeWorker).length > 0, 'Pi image-resize worker must be present beside its module')

  const input = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4n6YERAwQCgAuRgYdRC83+AAAAABJRU5ErkJggg==', 'base64')
  const worker = new Worker(pathToFileURL(imageResizeWorker))
  try {
    const responsePromise = once(worker, 'message')
    worker.postMessage({ inputBytes: input, mimeType: 'image/png', options: { maxWidth: 1, maxHeight: 1 } })
    const [response] = await responsePromise
    assert.equal(response.type, 'pi:image-resize-response')
    assert.equal(response.result?.wasResized, true, response.error ?? 'Pi image-resize worker did not resize PNG')
    assert.deepEqual(
      [response.result.originalWidth, response.result.originalHeight, response.result.width, response.result.height],
      [2, 2, 1, 1],
    )
  }
  finally {
    await worker.terminate()
  }

  const codingAgentEntry = join(codingAgentRoot, codingAgentPackage.exports['.'].import)
  const { resizeImage } = await import(pathToFileURL(codingAgentEntry).href)
  const resized = await resizeImage(input, 'image/png', { maxWidth: 1, maxHeight: 1 })
  assert.equal(resized?.wasResized, true, 'Pi resizeImage must resolve and run its package-relative worker')
  assert.deepEqual([resized?.width, resized?.height], [1, 1])

  writeOutput(`Pi 1.6.1 runtime assets verified: ${wasmPath}; ${imageResizeWorker}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
