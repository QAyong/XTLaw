export class DownloadRouteError extends Error {
  readonly kind: 'network' | 'timeout' | 'response' | 'url' | 'integrity'

  constructor(kind: DownloadRouteError['kind'], options?: ErrorOptions) {
    super(`DOWNLOAD_${kind.toUpperCase()}`, options)
    this.kind = kind
  }
}

export async function* downloadBytes(options: {
  url: string
  get: (url: string, init: { signal: AbortSignal }) => Promise<Response>
  signal: AbortSignal
  validateUrl: (url: string) => void
  timeoutMs?: number
}): AsyncGenerator<Uint8Array> {
  const controller = new AbortController()
  const signal = AbortSignal.any([options.signal, controller.signal])
  let response: Response | undefined
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  async function receive<T>(operation: () => Promise<T>): Promise<T> {
    signal.throwIfAborted()
    const timer = setTimeout(() => controller.abort(new DownloadRouteError('timeout')), options.timeoutMs ?? 30_000)
    try {
      return await operation()
    }
    catch (cause) {
      options.signal.throwIfAborted()
      if (controller.signal.aborted)
        throw controller.signal.reason
      throw new DownloadRouteError('network', { cause })
    }
    finally {
      clearTimeout(timer)
    }
  }
  try {
    let url = options.url
    for (let redirects = 0; ; redirects++) {
      signal.throwIfAborted()
      try {
        options.validateUrl(url)
      }
      catch (cause) {
        throw new DownloadRouteError('url', { cause })
      }
      response = await receive(() => options.get(url, { signal }))
      if (![301, 302, 303, 307, 308].includes(response.status))
        break
      await response.body?.cancel()
      const location = response.headers.get('location')
      if (!location || redirects === 5)
        throw new DownloadRouteError('url')
      try {
        url = new URL(location, url).href
      }
      catch (cause) {
        throw new DownloadRouteError('url', { cause })
      }
    }
    if (!response.ok || !response.body)
      throw new DownloadRouteError('response')
    reader = response.body.getReader()
    while (true) {
      const { done, value } = await receive(() => reader!.read())
      signal.throwIfAborted()
      if (done)
        break
      yield value
    }
  }
  finally {
    controller.abort()
    if (reader) {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    else {
      await response?.body?.cancel().catch(() => {})
    }
  }
}
