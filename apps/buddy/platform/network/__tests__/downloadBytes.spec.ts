import { afterEach, expect, it, vi } from 'vitest'
import { downloadBytes } from '../downloadBytes'

const options = { url: 'https://download.example/file', signal: new AbortController().signal, validateUrl: () => {}, timeoutMs: 1000 }
afterEach(() => vi.useRealTimers())

it('times out a stalled response body and aborts the underlying request', async () => {
  vi.useFakeTimers()
  let requestSignal: AbortSignal | undefined
  const iterator = downloadBytes({ ...options, get: async (_url, { signal }) => {
    requestSignal = signal
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true })
      },
    }))
  } })
  expect((await iterator.next()).value).toEqual(new Uint8Array([1]))
  const stalled = expect(iterator.next()).rejects.toMatchObject({ kind: 'timeout' })
  await vi.advanceTimersByTimeAsync(1000)
  await stalled
  expect(requestSignal?.aborted).toBe(true)
  expect(vi.getTimerCount()).toBe(0)
})

it('allows a download longer than the idle timeout while data keeps arriving', async () => {
  vi.useFakeTimers()
  let count = 0
  const iterator = downloadBytes({ ...options, get: async () => new Response(new ReadableStream({
    async pull(controller) {
      if (count === 4) {
        controller.close()
        return
      }
      await new Promise(resolve => setTimeout(resolve, 800))
      controller.enqueue(new Uint8Array([++count]))
    },
  }, { highWaterMark: 0 })) })
  const chunks: Uint8Array[] = []
  const completed = (async () => {
    for await (const chunk of iterator)
      chunks.push(chunk)
  })()
  await vi.advanceTimersByTimeAsync(4000)
  await completed
  expect(chunks.flatMap(chunk => [...chunk])).toEqual([1, 2, 3, 4])
  expect(vi.getTimerCount()).toBe(0)
})

it('cancels an HTTP error body and stops requests on caller cancellation', async () => {
  let cancelled = false
  let requestSignal: AbortSignal | undefined
  const failure = downloadBytes({ ...options, get: async (_url, { signal }) => {
    requestSignal = signal
    return new Response(new ReadableStream({
      cancel() { cancelled = true },
    }), { status: 503 })
  } })
  await expect(failure.next()).rejects.toMatchObject({ kind: 'response' })
  expect(cancelled).toBe(true)
  expect(requestSignal?.aborted).toBe(true)

  const controller = new AbortController()
  const reason = new Error('User cancelled')
  const cancelledRequest = downloadBytes({ ...options, signal: controller.signal, get: async (_url, { signal }) => {
    controller.abort(reason)
    signal.throwIfAborted()
    return new Response()
  } })
  await expect(cancelledRequest.next()).rejects.toBe(reason)
})
