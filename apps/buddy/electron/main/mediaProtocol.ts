import type { BuddyServiceSupervisor } from './runtime/BuddyServiceSupervisor'
import { protocol } from 'electron'
import { MEDIA_PROTOCOL, parseMediaUrl } from '../../shared/files/mediaFiles'
import { spaceFilesRpc } from '../../shared/spaces/spaceFileApi'
import { serveMediaFile } from './serveMediaFile'

export const mediaSchemePrivileges: Electron.CustomScheme = {
  scheme: MEDIA_PROTOCOL,
  privileges: { secure: true, standard: true, stream: true, supportFetchAPI: true },
}

export function installMediaProtocol(runtime: Pick<BuddyServiceSupervisor, 'request'>): () => void {
  protocol.handle(MEDIA_PROTOCOL, async (request) => {
    if (request.method !== 'GET')
      return new Response(null, { status: 405 })
    const target = parseMediaUrl(request.url)
    if (!target)
      return new Response(null, { status: 400 })
    try {
      // The service re-checks the space, directory grant and revision on every request, as it does for any file read.
      const located = spaceFilesRpc.locate.response.parse(await runtime.request(spaceFilesRpc.locate.method, spaceFilesRpc.locate.input.parse(target)))
      if (located.kind !== 'file')
        return new Response(null, { status: 404 })
      return await serveMediaFile(located.path, request.headers.get('range'), request.signal)
    }
    catch {
      return new Response(null, { status: 404 })
    }
  })
  return () => protocol.unhandle(MEDIA_PROTOCOL)
}
