import type { RuntimeRequestHandler, RuntimeRpcPeerContract } from '../../../../shared/runtime/rpcPeer'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { registerSandboxHostRpc } from '../registerSandboxHostRpc'

vi.mock('electron', () => ({ utilityProcess: { fork: vi.fn() } }))
vi.mock('../../../../service/src/sandbox/sandboxProcess?modulePath', () => ({ default: '/unused/sandboxProcess.js' }))
vi.mock('../WindowsSandboxPreparation', () => ({
  WindowsSandboxPreparation: class {
    start() {}
    async dispose() {}
  },
}))

it('reports a rejected sandbox request as unstarted without calling the worker', async () => {
  const requests = new Map<string, RuntimeRequestHandler>()
  const peer: RuntimeRpcPeerContract = {
    request: vi.fn(),
    notify: vi.fn(),
    close: vi.fn(),
    onNotification: () => () => {},
    onRequest(method, handler) {
      requests.set(method, handler)
      return () => requests.delete(method)
    },
  }
  const host = registerSandboxHostRpc(peer, { buddyHome: '/workspace', searchDirectory: '/tools' })
  try {
    const execute = requests.get('host.sandbox.exec')!
    await expect(execute({ requestId: randomUUID(), command: '' })).resolves.toEqual({ ok: false, code: 'SANDBOX_UNAVAILABLE', notStarted: true })
    expect(peer.request).not.toHaveBeenCalled()
  }
  finally {
    await host.dispose()
  }
})
