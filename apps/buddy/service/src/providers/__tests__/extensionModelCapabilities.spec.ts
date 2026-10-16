import { describe, expect, it, vi } from 'vitest'
import { createExtensionModelCapabilities } from '../extensionModelCapabilities'

function createGenerate(stopReason: 'stop' | 'length' | 'error' | 'aborted') {
  const model = { provider: 'fixture', id: 'fixture-model' }
  const completeSimple = vi.fn(async () => ({ model: model.id, provider: model.provider, usage: {}, stopReason, content: [{ type: 'text', text: 'Partial answer' }] }))
  const handler = createExtensionModelCapabilities(
    { resolveSession: async () => ({ model, runtime: { completeSimple } }) } as never,
    { record: vi.fn(), recordInvocation: vi.fn() },
    { conversationId: 'task', branchId: 'branch', model: { providerId: model.provider, modelId: model.id }, assertCurrent: () => {} },
  )['models.generateText']
  const context = { conversationId: 'task', runId: null, extensionId: 'tests.title', invocationId: 'invocation', signal: new AbortController().signal, callNumber: 1 }
  return () => handler({ system: 'Return a title.', prompt: 'Review the lease contract', maxTokens: 256 }, context as never)
}

describe('extension model capabilities', () => {
  it('returns the generated text when the model finished', async () => {
    await expect(createGenerate('stop')()).resolves.toMatchObject({ text: 'Partial answer' })
  })

  it('reports output cut off by the token limit separately and never returns the partial text', async () => {
    await expect(createGenerate('length')()).rejects.toThrow('EXTENSION_MODEL_TRUNCATED')
  })

  it.each(['error', 'aborted'] as const)('reports a %s generation as a request failure', async (stopReason) => {
    await expect(createGenerate(stopReason)()).rejects.toThrow('EXTENSION_MODEL_FAILED')
  })
})
