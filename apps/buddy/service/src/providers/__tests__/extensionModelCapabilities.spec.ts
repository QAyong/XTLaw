import type { ModelRuntime } from '@earendil-works/pi-coding-agent'
import { InMemoryCredentialStore, InMemoryModelsStore } from '@earendil-works/pi-ai'
import { builtinProviders } from '@earendil-works/pi-ai/providers/all'
import { ModelRuntime as PiModelRuntime } from '@earendil-works/pi-coding-agent'
import { describe, expect, it, vi } from 'vitest'
import { openBuddyDatabase } from '../../storage/database'
import { createProviderStateRepository } from '../../storage/providerStateRepository'
import { createProviderModelRuntime } from '../createProviderModelRuntime'
import { createExtensionModelCapabilities } from '../extensionModelCapabilities'
import { ProviderRequestHeaders } from '../ProviderRequestHeaders'

const SESSION_HEADER = 'x-opencode-session'

function completion(content: string) {
  const chunk = { id: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: 'stop' }] }
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
}

describe('extension model capabilities request context', () => {
  it('sends the provider routing session header for plugin requests like chat requests do', async () => {
    const database = openBuddyDatabase({ databasePath: ':memory:' })
    try {
      const credentials = new InMemoryCredentialStore()
      const states = createProviderStateRepository(database)
      const runtime = await PiModelRuntime.create({ credentials, modelsPath: null, modelsStore: new InMemoryModelsStore(), refreshOnCreate: false })
      const registration = createProviderModelRuntime(runtime, new ProviderRequestHeaders(states))
      registration.registerNativeProvider(builtinProviders().find(provider => provider.id === 'opencode-go')!)
      states.upsert({ providerId: 'opencode-go', enabled: true, createdAt: 'now', updatedAt: 'now' })
      await credentials.modify('opencode-go', async () => ({ type: 'api_key', key: 'fixture-key' }))
      const model = runtime.getModels('opencode-go').find(candidate => candidate.api === 'openai-completions')!

      const headers: Headers[] = []
      const fetchFixture: typeof fetch = async (_input, init) => {
        headers.push(new Headers(init?.headers))
        return completion('Title')
      }
      // Only the transport is replaced; credentials, header wrappers and provider adapters are the real runtime.
      const transport = { completeSimple: (...[target, context, options]: Parameters<ModelRuntime['completeSimple']>) => runtime.completeSimple(target, context, { ...options, fetch: fetchFixture }) } as unknown as ModelRuntime
      const handler = createExtensionModelCapabilities(
        { resolveSession: async () => ({ model, runtime: transport }) },
        { record: vi.fn(), recordInvocation: vi.fn() },
        { model: { providerId: 'opencode-go', modelId: model.id }, assertCurrent: () => {} },
      )['models.generateText']
      const scope = { conversationId: 'task', runId: null, action: { id: 'tests.title.generate', cause: { type: 'user' as const } }, extensionId: 'tests.title', invocationId: 'invocation', signal: new AbortController().signal }
      const generate = (callNumber: number) => handler({ system: 'Return a title.', prompt: 'Review the lease contract', maxTokens: 256 }, { ...scope, callNumber })

      await expect(generate(1)).resolves.toMatchObject({ text: 'Title' })
      await expect(generate(2)).resolves.toMatchObject({ text: 'Title' })

      expect(headers).toHaveLength(2)
      for (const header of headers)
        expect(header.get(SESSION_HEADER), 'plugin request must carry the routing session header').toBeTruthy()
      expect(headers[0]!.get(SESSION_HEADER)).not.toBe(headers[1]!.get(SESSION_HEADER))

      // Control: the same runtime reports the original failure without a session id and accepts a chat-style one.
      const context = { messages: [{ role: 'user' as const, content: 'hello', timestamp: 1 }] }
      await runtime.completeSimple(model, context, { fetch: fetchFixture })
      expect(headers.at(-1)!.get(SESSION_HEADER)).toBeNull()
      await runtime.completeSimple(model, context, { fetch: fetchFixture, sessionId: 'chat-session' })
      expect(headers.at(-1)!.get(SESSION_HEADER)).toBe('chat-session')
    }
    finally {
      database.close()
    }
  })
})
