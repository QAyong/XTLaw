import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai'
import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import type { ExtensionCapabilityContext } from '../../plugins/extensionAgentHandlers'
import { describe, expect, it, vi } from 'vitest'
import { RuntimeRpcPeer } from '../../../../platform/ipc/runtimeRpcPeer'
import { extensionAgentRpc } from '../../../../shared/extensions/extensionAgent'
import { extensionError } from '../../../../shared/extensions/extensionApi'
import { createExtensionModelCapabilities } from '../extensionModelCapabilities'

function createGenerate(stopReason: AssistantMessage['stopReason'], owner: 'action' | 'tool' = 'action') {
  const model: Model<Api> = { provider: 'fixture', id: 'fixture-model', name: 'Fixture', api: 'openai-completions', baseUrl: 'https://fixture.invalid', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 8192, maxTokens: 4096 }
  const result: AssistantMessage = { role: 'assistant', api: model.api, model: model.id, provider: model.provider, usage: { input: 12, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason, content: [{ type: 'text', text: 'Synthetic answer' }], timestamp: 1 }
  const completeSimple = vi.fn(async () => result)
  const usage = { record: vi.fn(async () => null), recordInvocation: vi.fn(() => null) }
  const handler = createExtensionModelCapabilities(
    { resolveSession: async () => ({ model, runtime: { completeSimple } as unknown as ModelRuntime }) },
    usage,
    { conversationId: 'task', branchId: 'branch', model: { providerId: model.provider, modelId: model.id }, assertCurrent: () => {} },
  )['models.generateText']
  const controller = new AbortController()
  const context: ExtensionCapabilityContext = { conversationId: 'task', runId: owner === 'tool' ? 'run' : null, extensionId: 'tests.title', invocationId: 'invocation', signal: controller.signal, callNumber: 1, ...(owner === 'action' ? { action: { id: 'title', cause: { type: 'user' as const } } } : {}) }
  let receiveClient: (message: unknown) => void = () => {}
  let receiveServer: (message: unknown) => void = () => {}
  const client = new RuntimeRpcPeer({ transport: {
    postMessage: message => receiveServer(structuredClone(message)),
    subscribe: (listener) => {
      receiveClient = listener
      return () => {
        receiveClient = () => {}
      }
    },
  } })
  const server = new RuntimeRpcPeer({ transport: {
    postMessage: message => receiveClient(structuredClone(message)),
    subscribe: (listener) => {
      receiveServer = listener
      return () => {
        receiveServer = () => {}
      }
    },
  } })
  server.onRequest(extensionAgentRpc.request, params => handler(params, context))
  const input = { system: 'Return a title.', prompt: 'Synthetic task', maxTokens: 256 }
  return {
    usage,
    result,
    controller,
    completeSimple,
    generateDirect: () => handler(input, context),
    generate: async () => {
      try {
        return await client.request(extensionAgentRpc.request, input)
      }
      catch (error) {
        throw new Error(extensionError(error))
      }
    },
    close: () => {
      client.close(new Error('Fixture closed'))
      server.close(new Error('Fixture closed'))
    },
  }
}

describe('extension model capabilities', () => {
  it('returns complete text and model identity across RPC', async () => {
    const f = createGenerate('stop')
    try {
      await expect(f.generate()).resolves.toEqual({ text: 'Synthetic answer', model: { providerId: 'fixture', modelId: 'fixture-model' } })
    }
    finally { f.close() }
  })

  it.each([
    ['length', 'EXTENSION_MODEL_TRUNCATED'],
    ['error', 'EXTENSION_MODEL_FAILED'],
    ['aborted', 'EXTENSION_MODEL_FAILED'],
  ] as const)('preserves %s as %s at the plugin boundary without returning partial text', async (stopReason, code) => {
    const f = createGenerate(stopReason)
    try {
      await expect(f.generate()).rejects.toThrow(new Error(code))
    }
    finally { f.close() }
  })

  it.each(['action', 'tool'] as const)('records truncated output usage against its original %s before rejecting', async (owner) => {
    const f = createGenerate('length', owner)
    try {
      await expect(f.generate()).rejects.toThrow('EXTENSION_MODEL_TRUNCATED')
      const records = owner === 'action' ? f.usage.recordInvocation.mock.calls : f.usage.record.mock.calls
      expect(records).toEqual([[{
        createdAt: expect.any(String),
        model: 'fixture-model',
        provider: 'fixture',
        sourceEntryId: 'plugin:tests.title:invocation:1',
        usage: f.result.usage,
        ...(owner === 'action' ? { invocationId: 'invocation' } : { runId: 'run', purpose: 'tool' }),
      }]])
      expect(owner === 'action' ? f.usage.record.mock.calls : f.usage.recordInvocation.mock.calls).toEqual([])
    }
    finally { f.close() }
  })

  it('does not replace cancellation with a truncation error after a model response', async () => {
    const f = createGenerate('length')
    f.completeSimple.mockImplementationOnce(async () => {
      f.controller.abort()
      return f.result
    })
    try {
      await expect(f.generateDirect()).rejects.toMatchObject({ name: 'AbortError' })
    }
    finally { f.close() }
  })

  it.each(['EXTENSION_PRIVATE_DETAIL', 'PRIVATE_PROVIDER_FAILURE', 'EXTENSION_MODEL_TRUNCATED: private text', null])('does not expose unapproved remote error data %s', (code) => {
    const error = Object.assign(new Error('Private provider response'), { data: { code } })
    expect(extensionError(error)).toBe('EXTENSION_OPERATION_FAILED')
  })
})
