import type { Session } from 'electron'
import { rm } from 'node:fs/promises'
import { afterEach, expect, it } from 'vitest'
import { createStore, manifest, reviewPackage } from '../../../../platform/extensions/__tests__/fixtures'
import { ExtensionProtocol } from '../ExtensionProtocol'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})
it('serves verified package media with range semantics and invalidates disposed endpoints', async () => {
  const { root, store } = await createStore()
  roots.push(root)
  await store.install((await reviewPackage(root, store, manifest(), { 'clip.mp3': '0123456789' })).token)
  const protocol = new ExtensionProtocol(store)
  const endpoint = protocol.register(store.installed['tests.reader']!.current, 'view')
  let respond!: (request: Request) => Promise<Response>
  protocol.install({ protocol: { handle: (_scheme: string, handler: typeof respond) => {
    respond = handler
  } } } as unknown as Session, 'view')
  const url = new URL('/__package/clip.mp3', endpoint.url)
  const part = await respond(new Request(url, { headers: { range: 'bytes=3-6' } }))
  expect(part.status).toBe(206)
  expect(part.headers.get('content-type')).toBe('audio/mpeg')
  expect(part.headers.get('content-length')).toBe('4')
  expect(await part.text()).toBe('3456')
  expect((await respond(new Request(url, { headers: { range: 'bytes=99-' } }))).status).toBe(416)
  const head = await respond(new Request(url, { method: 'HEAD' }))
  expect(head.headers.get('content-length')).toBe('10')
  expect(await head.text()).toBe('')
  const signal = new AbortController().signal
  const file = await store.resources.import('tests.reader', 'download.mp3', 'audio/mpeg', new Response('downloaded media'), signal, () => {})
  const resourceUrl = new URL(`/__resource/${file.id}`, endpoint.url)
  const resource = await respond(new Request(resourceUrl, { headers: { range: 'bytes=0-9' } }))
  expect(resource.status).toBe(206)
  expect(await resource.text()).toBe('downloaded')
  const other = await store.resources.import('tests.other', 'private.mp3', 'audio/mpeg', new Response('private'), signal, () => {})
  expect((await respond(new Request(new URL(`/__resource/${other.id}`, endpoint.url)))).status).toBe(403)
  await store.resources.release('tests.reader', file.id, () => {})
  expect((await respond(new Request(resourceUrl))).status).toBe(403)
  endpoint.dispose()
  expect((await respond(new Request(url))).status).toBe(403)
})

async function viewResponder(permissions: { webAssembly?: boolean }, kind: 'host' | 'view' = 'view') {
  const { root, store } = await createStore()
  roots.push(root)
  const input = manifest({ permissions: { selectedResource: 'read', network: [], ...permissions } })
  await store.install((await reviewPackage(root, store, input, { 'engine.wasm': '\0asm' })).token)
  const protocol = new ExtensionProtocol(store)
  const endpoint = protocol.register(store.installed['tests.reader']!.current, kind)
  let respond!: (request: Request) => Promise<Response>
  protocol.install({ protocol: { handle: (_scheme: string, handler: typeof respond) => {
    respond = handler
  } } } as unknown as Session, kind)
  return { endpoint, respond }
}

it('keeps WebAssembly and workers blocked unless the extension declares the permission', async () => {
  const { endpoint, respond } = await viewResponder({})
  const csp = (await respond(new Request(new URL('/__view.html', endpoint.url)))).headers.get('content-security-policy')!
  expect(csp).not.toContain('wasm-unsafe-eval')
  expect(csp).toContain('worker-src \'none\'')
})

it('opens WebAssembly and workers for views of extensions that declare webAssembly, without allowing eval', async () => {
  const { endpoint, respond } = await viewResponder({ webAssembly: true })
  const origin = endpoint.url.slice(0, endpoint.url.lastIndexOf('/'))
  const response = await respond(new Request(new URL('/__view.html', endpoint.url)))
  const csp = response.headers.get('content-security-policy')!
  expect(csp).toContain(`script-src ${origin}/__package/ ${origin}/__view.js 'wasm-unsafe-eval';`)
  expect(csp).toContain(`worker-src ${origin}/__package/ blob:;`)
  expect(csp.replaceAll('\'wasm-unsafe-eval\'', '')).not.toContain('unsafe-eval')
  expect(csp).toContain('sandbox allow-scripts allow-forms')
  const wasm = await respond(new Request(new URL('/__package/engine.wasm', endpoint.url)))
  expect(wasm.headers.get('content-type')).toBe('application/wasm')
})

it('never opens WebAssembly for the extension host page', async () => {
  const { endpoint, respond } = await viewResponder({ webAssembly: true }, 'host')
  const csp = (await respond(new Request(new URL('/__host.html', endpoint.url)))).headers.get('content-security-policy')!
  expect(csp).not.toContain('wasm-unsafe-eval')
  expect(csp).toContain('worker-src \'none\'')
})
