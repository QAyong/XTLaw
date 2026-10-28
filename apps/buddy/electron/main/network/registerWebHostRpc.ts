import type { RuntimeRpcPeerContract } from '../../../shared/runtime/rpcPeer'
import type { HostWebService } from './HostWebService'
import { Buffer } from 'node:buffer'
import { createHostNetworkAuthorizer } from '../../../shared/network/networkAuthorization'
import { WebError, webError, webNetworkRequestSchema, webRenderCancelSchema, webRenderInputSchema } from '../../../shared/network/webProtocol'
import { renderWebDocument } from './WebRenderHost'

export function registerWebHostRpc(peer: RuntimeRpcPeerContract, service: HostWebService): () => void {
  const scope = service.scope(peer)
  const network = service.network
  let disposed = false
  const notify = (params: object) => {
    if (!disposed)
      peer.notify('host.web.chunk', params)
  }
  const disposers = [
    peer.onNotification((method, params) => {
      if (method !== 'host.web.cancel')
        return
      const result = webRenderCancelSchema.safeParse(params)
      if (result.success)
        scope.cancel(result.data.requestId)
    }),
    peer.onRequest('host.web.authorize', async (params, signal, requestId) => {
      const input = webRenderInputSchema.pick({ url: true }).parse(params)
      try {
        await network.authorizePublicUrl(input.url)
        await createHostNetworkAuthorizer(peer, requestId, signal)(input.url)
        return { ok: true }
      }
      catch (error) { return { ok: false, code: webError(error, signal).code } }
    }),
    peer.onRequest('host.web.request', (params, parent, requestId) => {
      const input = webNetworkRequestSchema.parse(params)
      const head = Promise.withResolvers<object>()
      void scope.run('network', input, parent, async (signal, track) => {
        const { response, url } = await network.fetch(input, signal, { authorize: createHostNetworkAuthorizer(peer, requestId, signal), track })
        const headers = new Headers(response.headers)
        for (const key of ['set-cookie', 'content-encoding', 'content-length', 'transfer-encoding'])
          headers.delete(key)
        head.resolve({ ok: true, status: response.status, headers: Object.fromEntries(headers), url })
        const reader = response.body?.getReader()
        let length = 0
        try {
          if (reader) {
            while (true) {
              const value = await reader.read()
              signal.throwIfAborted()
              if (value.done)
                break
              length += value.value.byteLength
              if (length > input.limit)
                throw new WebError('WEB_RESPONSE_TOO_LARGE')
              for (let offset = 0; offset < value.value.byteLength; offset += 64 * 1024)
                notify({ requestId: input.requestId, chunk: Buffer.from(value.value.subarray(offset, offset + 64 * 1024)).toString('base64') })
            }
          }
          notify({ requestId: input.requestId, done: true })
        }
        catch (error) {
          notify({ requestId: input.requestId, code: webError(error, signal).code })
          throw error
        }
        finally {
          await reader?.cancel().catch(() => {})
          reader?.releaseLock()
        }
      }).catch((error) => {
        const code = webError(error).code
        head.resolve({ ok: false, code })
        notify({ requestId: input.requestId, code })
      })
      return head.promise
    }),
    peer.onRequest('host.web.render', async (params, parent, requestId) => {
      const input = webRenderInputSchema.parse(params)
      try {
        return await scope.run('render', input, parent, async (signal, track, cleaning) => ({ ok: true, ...await renderWebDocument(network, input.url, signal, createHostNetworkAuthorizer(peer, requestId, signal), track, cleaning) }))
      }
      catch (error) { return { ok: false, code: webError(error).code } }
    }),
  ]
  return () => {
    disposed = true
    disposers.forEach(dispose => dispose())
    scope.dispose()
  }
}
