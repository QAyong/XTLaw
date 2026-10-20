import { lstat, open } from 'node:fs/promises'
import { Readable } from 'node:stream'
import { mediaMimeType, parseMediaRange } from '../../shared/files/mediaFiles'

// Streams a local audio or video file with HTTP Range support, so media elements can seek without loading it whole.
export async function serveMediaFile(path: string, rangeHeader: string | null, signal?: AbortSignal): Promise<Response> {
  const mimeType = mediaMimeType(path)
  if (!mimeType)
    return new Response(null, { status: 415 })
  // The path is canonical when located; refusing a leaf that has since become a link narrows the swap window.
  const linked = await lstat(path)
  if (!linked.isFile())
    return new Response(null, { status: 404 })
  const handle = await open(path, 'r')
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile() || metadata.size !== linked.size) {
      await handle.close()
      return new Response(null, { status: 404 })
    }
    const headers: Record<string, string> = {
      'accept-ranges': 'bytes',
      'cache-control': 'private, no-store',
      'content-type': mimeType,
      'x-content-type-options': 'nosniff',
    }
    const range = rangeHeader ? parseMediaRange(rangeHeader, metadata.size) : null
    if (range === 'unsatisfiable') {
      await handle.close()
      return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${metadata.size}` } })
    }
    if (metadata.size === 0) {
      await handle.close()
      return new Response(null, { status: 200, headers: { ...headers, 'content-length': '0' } })
    }
    const start = range?.start ?? 0
    const end = range?.end ?? metadata.size - 1
    const stream = handle.createReadStream({ start, end, autoClose: true })
    signal?.addEventListener('abort', () => stream.destroy(), { once: true })
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: range ? 206 : 200,
      headers: {
        ...headers,
        'content-length': String(end - start + 1),
        ...(range ? { 'content-range': `bytes ${start}-${end}/${metadata.size}` } : {}),
      },
    })
  }
  catch (error) {
    await handle.close().catch(() => {})
    throw error
  }
}
