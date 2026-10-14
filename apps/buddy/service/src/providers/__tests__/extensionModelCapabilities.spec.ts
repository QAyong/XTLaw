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

function completion(content: string, finishReason: 'stop' | 'length') {
  const chunk = { id: 'fixture', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: finishReason }] }
  return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } })
}

// Real runtime, credentials, header wrappers and OpenCode Go adapter; only the HTTP transport is replaced.
async function createFixture(respond: (request: { headers: Headers, body: Record<string, unknown> }) => Response) {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  const credentials = new InMemoryCredentialStore()
  const states = createProviderStateRepository(database)
  const runtime = await PiModelRuntime.create({ credentials, modelsPath: null, modelsStore: new InMemoryModelsStore(), refreshOnCreate: false })
  const registration = createProviderModelRuntime(runtime, new ProviderRequestHeaders(states))
  registration.registerNativeProvider(builtinProviders().find(provider => provider.id === 'opencode-go')!)
  states.upsert({ providerId: 'opencode-go', enabled: true, createdAt: 'now', updatedAt: 'now' })
  await credentials.modify('opencode-go', async () => ({ type: 'api_key', key: 'fixture-key' }))
  const model = runtime.getModels('opencode-go').find(candidate => candidate.api === 'openai-completions')!
  const requests: { headers: Headers, body: Record<string, unknown> }[] = []
  const fetchFixture: typeof fetch = async (_input, init) => {
    const request = { headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) as Record<string, unknown> }
    requests.push(request)
    return respond(request)
  }
  const transport = { completeSimple: (...[target, context, options]: Parameters<ModelRuntime['completeSimple']>) => runtime.completeSimple(target, context, { ...options, fetch: fetchFixture }) } as unknown as ModelRuntime
  const handler = createExtensionModelCapabilities(
    { resolveSession: async () => ({ model, runtime: transport }) },
    { record: vi.fn(), recordInvocation: vi.fn() },
    { model: { providerId: 'opencode-go', modelId: model.id }, assertCurrent: () => {} },
  )['models.generateText']
  const scope = { conversationId: 'task', runId: null, action: { id: 'tests.title.generate', cause: { type: 'user' as const } }, extensionId: 'tests.title', invocationId: 'invocation', signal: new AbortController().signal }
  const generate = (callNumber = 1) => handler({ system: 'Return a title.', prompt: 'Review the lease contract', maxTokens: 256 }, { ...scope, callNumber })
  return { database, generate, model, requests, runtime, fetchFixture }
}

describe('extension model capabilities request context', () => {
  it('sends the provider routing session header for plugin requests like chat requests do', async () => {
    const fixture = await createFixture(() => completion('Title', 'stop'))
    try {
      await expect(fixture.generate(1)).resolves.toMatchObject({ text: 'Title' })
      await expect(fixture.generate(2)).resolves.toMatchObject({ text: 'Title' })

      expect(fixture.requests).toHaveLength(2)
      for (const { headers } of fixture.requests)
        expect(headers.get(SESSION_HEADER), 'plugin request must carry the routing session header').toBeTruthy()
      expect(fixture.requests[0]!.headers.get(SESSION_HEADER)).not.toBe(fixture.requests[1]!.headers.get(SESSION_HEADER))

      // Control: the same runtime reports the original failure without a session id and accepts a chat-style one.
      const context = { messages: [{ role: 'user' as const, content: 'hello', timestamp: 1 }] }
      await fixture.runtime.completeSimple(fixture.model, context, { fetch: fixture.fetchFixture })
      expect(fixture.requests.at(-1)!.headers.get(SESSION_HEADER)).toBeNull()
      await fixture.runtime.completeSimple(fixture.model, context, { fetch: fixture.fetchFixture, sessionId: 'chat-session' })
      expect(fixture.requests.at(-1)!.headers.get(SESSION_HEADER)).toBe('chat-session')
    }
    finally {
      fixture.database.close()
    }
  })

  it('reports output cut off by the token limit separately from request failures and never returns the partial text', async () => {
    const truncated = await createFixture(() => completion('Partial answer that was cut', 'length'))
    try {
      await expect(truncated.generate()).rejects.toThrow('EXTENSION_MODEL_TRUNCATED')
    }
    finally {
      truncated.database.close()
    }
    const rejected = await createFixture(() => Response.json({ error: { message: 'fixture-private-rejection' } }, { status: 400 }))
    try {
      await expect(rejected.generate()).rejects.toThrow('EXTENSION_MODEL_FAILED')
    }
    finally {
      rejected.database.close()
    }
  })
})
