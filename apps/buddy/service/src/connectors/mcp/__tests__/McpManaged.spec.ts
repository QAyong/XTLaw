import type { ConnectorCredential } from '../../../../../shared/connectors/connectorCredentials'
import type { ExtensionMcpConnectorContribution } from '../../../../../shared/extensions/extensionMcpConnectors'
import type { RuntimeRequestHandler } from '../../../../../shared/runtime/rpcPeer'
import type { ManagedCapabilityInput } from '../../../storage/managedCapabilityRepository'
import type { McpConnectionEvent, McpConnectorEvent } from '../mcpEvents'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectorSchema } from '../../../../../shared/connectors/connectorApi'
import { createConnectorRepository } from '../../../storage/connectorRepository'
import { openBuddyDatabase } from '../../../storage/database'
import { createManagedCapabilityRepository } from '../../../storage/managedCapabilityRepository'
import { sanitizeRestoredDatabase } from '../../../storage/restorePolicy'
import { McpConnectorService } from '../McpConnectorService'
import { registerMcpConnectorRpc } from '../registerMcpConnectorRpc'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse())
    await dispose()
  vi.unstubAllGlobals()
})

function fixture(authentication: ExtensionMcpConnectorContribution['authentication'] = 'bearer') {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  const managed = createManagedCapabilityRepository(database)
  const connectors = createConnectorRepository(database)
  const secrets = new Map<string, ConnectorCredential>()
  const requests: Array<{ url: string, authorization: string | null, method: string }> = []
  let beforeWrite: (() => Promise<void>) | undefined
  let oauth = authentication === 'oauth'
  const localFetch = globalThis.fetch
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input)
    const headers = new Headers(init?.headers)
    const message = typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) : {}
    requests.push({ url, authorization: headers.get('authorization'), method: message.method ?? init?.method ?? 'GET' })
    const target = new URL(url)
    if (oauth) {
      const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } })
      if (target.pathname.startsWith('/.well-known/oauth-protected-resource'))
        return json({ resource: `${target.origin}/mcp`, authorization_servers: [target.origin], scopes_supported: ['read'] })
      if (target.pathname.startsWith('/.well-known/oauth-authorization-server'))
        return json({ issuer: target.origin, authorization_endpoint: `${target.origin}/authorize`, token_endpoint: `${target.origin}/token`, registration_endpoint: `${target.origin}/register`, response_types_supported: ['code'], grant_types_supported: ['authorization_code', 'refresh_token'], code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'] })
      if (target.pathname === '/register')
        return json({ ...message, client_id: 'fixture-client', token_endpoint_auth_method: 'none' }, 201)
      if (target.pathname === '/token')
        return json({ access_token: 'fixture-oauth', token_type: 'Bearer', refresh_token: 'fixture-refresh', expires_in: 3600 })
      if (target.pathname === '/mcp' && headers.get('authorization') !== 'Bearer fixture-oauth')
        return new Response('{}', { status: 401, headers: { 'content-type': 'application/json', 'WWW-Authenticate': `Bearer resource_metadata="${target.origin}/.well-known/oauth-protected-resource/mcp"` } })
    }
    if (message.id === undefined)
      return new Response(null, { status: 202 })
    const result = message.method === 'server/discover'
      ? { supportedVersions: ['2026-07-28'], capabilities: { tools: {} }, _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'fixture', version: '1' } } }
      : message.method === 'tools/list'
        ? { ttlMs: 60000, cacheScope: 'private', tools: [{ name: 'echo', inputSchema: { type: 'object' } }] }
        : { content: [{ type: 'text', text: 'fixture-result' }] }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { ...result, resultType: 'complete' } }), { headers: { 'content-type': 'application/json', 'MCP-Protocol-Version': '2026-07-28' } })
  })
  const service = new McpConnectorService({
    connectors,
    managed,
    secrets: {
      read: async id => secrets.get(id) ?? null,
      write: async (id, value) => {
        await beforeWrite?.()
        secrets.set(id, value)
      },
      delete: async (id) => { secrets.delete(id) },
    },
    openExternal: async (url) => {
      const authorization = new URL(url)
      const callback = new URL(authorization.searchParams.get('redirect_uri')!)
      callback.searchParams.set('code', 'fixture-code')
      callback.searchParams.set('state', authorization.searchParams.get('state')!)
      await localFetch(callback)
    },
  })
  const events: McpConnectionEvent[] = []
  const changes: McpConnectorEvent[] = []
  service.onDidChange(event => changes.push(event))
  service.onDidChangeConnection(event => events.push(event))
  const input: ManagedCapabilityInput = {
    extensionId: 'fixture.plugin',
    extensionName: 'Fixture plugin',
    contributionId: 'remote',
    kind: 'mcp',
    revision: 'v1',
    state: 'enabled',
    definition: { id: 'remote', name: 'Remote', transport: 'streamable-http', url: 'https://old.example.test/mcp', authentication },
  }
  const source = managed.upsertSource(input)
  const config = () => ({
    id: source.id,
    name: 'Remote',
    transport: 'streamable-http' as const,
    url: 'https://old.example.test/mcp',
    enabled: managed.get(source.id)!.userEnabled,
    credentialRef: null,
  })
  cleanup.push(async () => {
    await service.close()
    database.close()
  })
  return {
    database,
    managed,
    connectors,
    secrets,
    requests,
    service,
    source,
    input,
    config,
    events,
    changes,
    enableOAuth: () => { oauth = true },
    beforeWrite: (action?: () => Promise<void>) => { beforeWrite = action },
  }
}

describe('managed MCP source and configuration', () => {
  it('can explicitly re-enable a restored unauthenticated connector after its plugin is available', async () => {
    const f = fixture('none')
    await f.service.applyManaged(f.source)
    await f.service.setEnabled(f.source.id, true)
    sanitizeRestoredDatabase(f.database)
    await f.service.refreshManaged(f.source.id)
    expect(f.connectors.findById(f.source.id)?.enabled).toBe(false)
    f.managed.setState(f.source.id, 'enabled')
    await f.service.applyManaged(f.managed.get(f.source.id)!)
    expect(f.connectors.findById(f.source.id)?.enabled).toBe(false)
    await f.service.setEnabled(f.source.id, true)
    expect(f.connectors.findById(f.source.id)).toMatchObject({ enabled: true, managed: { unavailableReason: null } })
  })

  it('starts disabled, binds credentials, and preserves the user switch through plugin suspension and restoration', async () => {
    const f = fixture()
    await f.service.applyManaged(f.source)
    expect(f.connectors.findById(f.source.id)).toMatchObject({
      enabled: false,
      toolExposure: 'deferred',
      managed: { userEnabled: false, unavailableReason: 'authentication_required' },
    })
    expect(await f.service.test(f.source.id)).toMatchObject({ errorCode: 'MCP_CONNECTOR_DISABLED' })
    await expect(f.service.setEnabled(f.source.id, true)).rejects.toMatchObject({ code: 'MCP_AUTHENTICATION_REQUIRED' })
    expect(f.requests).toEqual([])
    await f.service.saveCredential(f.source.id, { type: 'http', bearerToken: 'fixture-first' })
    expect(f.connectors.findById(f.source.id)).toMatchObject({ enabled: false, managed: { userEnabled: false, unavailableReason: null } })
    expect(f.managed.get(f.source.id)?.credentialTarget).toContain('old.example.test')
    await f.service.setEnabled(f.source.id, true)
    expect(await f.service.test(f.source.id)).toMatchObject({ status: 'ready' })
    expect(f.requests.some(request => request.authorization === 'Bearer fixture-first')).toBe(true)
    const tools = f.service.getTools()
    const tool = tools.tools[0]!
    expect(tools.available(tool.name)).toBe(true)
    f.managed.setState(f.source.id, 'disabled')
    expect(tools.available(tool.name)).toBe(false)
    const requests = f.requests.length
    await f.service.refreshManaged(f.source.id)
    expect(f.connectors.findById(f.source.id)).toMatchObject({ enabled: false, managed: { state: 'disabled', userEnabled: true } })
    expect(await f.service.test(f.source.id)).toMatchObject({ errorCode: 'MCP_CONNECTOR_DISABLED' })
    expect(f.requests).toHaveLength(requests)
    f.managed.setState(f.source.id, 'unavailable')
    await f.service.applyManaged(f.managed.get(f.source.id)!)
    f.managed.setState(f.source.id, 'enabled')
    await f.service.refreshManaged(f.source.id)
    expect(f.connectors.findById(f.source.id)).toMatchObject({ enabled: true, managed: { userEnabled: true, unavailableReason: null } })
    expect(tools.available(tool.name)).toBe(false)
    expect(f.events.filter(event => event.type === 'generation').length).toBeGreaterThan(2)
  })

  it('materializes idempotently and preserves the connection and catalog for metadata-only updates', async () => {
    const f = fixture('none')
    await f.service.applyManaged(f.source)
    await f.service.setEnabled(f.source.id, true)
    await f.service.test(f.source.id)
    const before = f.connectors.findStoredById(f.source.id)
    const requests = f.requests.length
    f.events.length = 0
    f.changes.length = 0
    await f.service.applyManaged(f.managed.get(f.source.id)!)
    expect(f.connectors.findStoredById(f.source.id)).toEqual(before)
    expect(f.events).toEqual([])
    expect(f.changes).toEqual([])
    const renamed = f.managed.upsertSource({ ...f.input, revision: 'v2', definition: { ...f.source.definition as ExtensionMcpConnectorContribution, name: 'Renamed' } })
    await f.service.applyManaged(renamed)
    expect(f.service.state(f.source.id)).toMatchObject({ status: 'ready', toolCount: 1 })
    expect(f.events.filter(event => ['generation', 'catalog'].includes(event.type))).toEqual([])
    expect(f.changes.at(-1)).toMatchObject({ type: 'configuration', executionChanged: false })
    expect(f.requests).toHaveLength(requests)
    f.managed.setState(f.source.id, 'disabled')
    await f.service.applyManaged(f.managed.get(f.source.id)!)
    await f.service.refreshManaged(f.source.id)
    expect(f.connectors.readCatalog(f.source.id)).not.toBeNull()
    expect(f.service.state(f.source.id)).toMatchObject({ status: 'disabled', toolCount: 1 })
  })

  it('blocks stale connections before refresh and never sends saved credentials to a changed target', async () => {
    const f = fixture()
    await f.service.applyManaged(f.source)
    await f.service.saveCredential(f.source.id, { type: 'http', bearerToken: 'fixture-old' })
    await f.service.setEnabled(f.source.id, true)
    await f.service.test(f.source.id)
    const tools = f.service.getTools()
    const changed = f.managed.upsertSource({ ...f.input, revision: 'v2', definition: { ...f.source.definition as ExtensionMcpConnectorContribution, url: 'https://new.example.test/mcp' } })
    expect(f.connectors.findById(f.source.id)).toMatchObject({ enabled: false, managed: { unavailableReason: 'target_changed' } })
    expect(tools.available(tools.tools[0]!.name)).toBe(false)
    const count = f.requests.length
    await tools.tools[0]!.execute('fixture-call', {}, undefined, undefined, {} as never).catch(() => {})
    await f.service.test(f.source.id)
    await f.service.applyManaged(changed)
    await f.service.test(f.source.id)
    expect(f.requests).toHaveLength(count)
    expect(f.secrets.get(f.source.id)).toEqual({ type: 'http', bearerToken: 'fixture-old' })
    await f.service.saveCredential(f.source.id, { type: 'http', bearerToken: 'fixture-new' })
    expect(await f.service.test(f.source.id)).toMatchObject({ status: 'ready' })
    const sent = f.requests.slice(count)
    expect(sent.length).toBeGreaterThan(0)
    expect(sent.every(request => request.url === 'https://new.example.test/mcp' && request.authorization === 'Bearer fixture-new')).toBe(true)
  })

  it('rejects changes to source fields and deletion while allowing user exposure preferences', async () => {
    const f = fixture('none')
    await f.service.applyManaged(f.source)
    for (const patch of [{ name: 'Overridden' }, { url: 'https://other.example.test/mcp' }])
      await expect(f.service.upsert({ ...f.config(), ...patch })).rejects.toMatchObject({ code: 'MCP_MANAGED_READ_ONLY' })
    await expect(f.service.remove(f.source.id)).rejects.toMatchObject({ code: 'MCP_MANAGED_READ_ONLY' })
    await expect(f.service.saveCredential(f.source.id, { type: 'http', bearerToken: 'unexpected' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await f.service.upsert({ ...f.config(), toolExposure: 'codemode' })
    expect(f.connectors.findById(f.source.id)).toMatchObject({ name: 'Remote', toolExposure: 'codemode', managed: { userEnabled: false } })
    expect(f.secrets.size).toBe(0)
  })

  it('keeps a credential-free target change blocked across preference edits until explicit confirmation', async () => {
    const f = fixture('none')
    await f.service.applyManaged(f.source)
    f.managed.setUserEnabled(f.source.id, true)
    f.managed.upsertSource({ ...f.input, revision: 'v2', definition: { ...f.source.definition as ExtensionMcpConnectorContribution, url: 'https://new.example.test/mcp' } })
    await f.service.save({ config: { ...f.config(), url: 'https://new.example.test/mcp', toolExposure: 'direct' }, credential: { mode: 'keep' } })
    expect(f.connectors.findById(f.source.id)).toMatchObject({ enabled: false, managed: { unavailableReason: 'target_changed' } })
    expect(f.requests).toEqual([])
    await f.service.clearCredential(f.source.id)
    expect(f.connectors.findById(f.source.id)).toMatchObject({ enabled: true, credentialRef: null, managed: { unavailableReason: null } })
    expect(await f.service.test(f.source.id)).toMatchObject({ status: 'ready' })
    expect(f.requests.every(request => request.url === 'https://new.example.test/mcp' && request.authorization === null)).toBe(true)
  })

  it('retains credentials after uninstall and explicitly clears configuration without deleting source identity', async () => {
    const f = fixture()
    await f.service.applyManaged(f.source)
    await f.service.save({ config: { ...f.config(), toolExposure: 'direct' }, credential: { mode: 'replace', value: { type: 'http', bearerToken: 'fixture-retained' } } })
    f.managed.setState(f.source.id, 'removed')
    await f.service.refreshManaged(f.source.id)
    expect(f.secrets.has(f.source.id)).toBe(true)
    expect(f.connectors.findById(f.source.id)).toMatchObject({ credentialRef: f.source.id, managed: { state: 'removed', extensionId: 'fixture.plugin' } })
    await f.service.remove(f.source.id)
    expect(f.secrets.has(f.source.id)).toBe(false)
    expect(f.connectors.findById(f.source.id)).toMatchObject({ credentialRef: null, enabled: false, toolExposure: 'deferred', managed: { state: 'removed' } })
    expect(f.managed.get(f.source.id)).toMatchObject({ id: f.source.id, credentialTarget: null, userEnabled: false })
  })

  it('rejects a credential write crossing a source target change and restores the previous secret', async () => {
    const f = fixture()
    await f.service.applyManaged(f.source)
    await f.service.saveCredential(f.source.id, { type: 'http', bearerToken: 'fixture-retained' })
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    f.beforeWrite(async () => {
      f.beforeWrite()
      entered.resolve()
      await release.promise
    })
    const pending = f.service.saveCredential(f.source.id, { type: 'http', bearerToken: 'fixture-raced' })
    await entered.promise
    f.managed.upsertSource({ ...f.input, revision: 'v2', definition: { ...f.source.definition as ExtensionMcpConnectorContribution, authentication: 'oauth' } })
    release.resolve()
    await expect(pending).rejects.toMatchObject({ code: 'MCP_CONNECTOR_CHANGED' })
    expect(f.secrets.get(f.source.id)).toEqual({ type: 'http', bearerToken: 'fixture-retained' })
    expect(f.connectors.findById(f.source.id)).toMatchObject({ enabled: false, managed: { unavailableReason: 'target_changed' } })
    expect(f.requests).toEqual([])
  })

  it('rebinds a changed authentication target only after fresh OAuth without sending the old bearer token', async () => {
    const f = fixture()
    await f.service.applyManaged(f.source)
    await f.service.saveCredential(f.source.id, { type: 'http', bearerToken: 'fixture-old-bearer' })
    const source = f.managed.upsertSource({ ...f.input, revision: 'v2', definition: { ...f.source.definition as ExtensionMcpConnectorContribution, authentication: 'oauth' } })
    await f.service.applyManaged(source)
    f.enableOAuth()
    f.service.login(f.source.id)
    await vi.waitUntil(() => f.changes.some(event => event.type === 'login' && ['succeeded', 'failed'].includes(event.status)))
    expect(f.changes.filter(event => event.type === 'login').at(-1)).toMatchObject({ status: 'succeeded' })
    expect(f.secrets.get(f.source.id)).toMatchObject({ type: 'oauth', tokens: { access_token: 'fixture-oauth' } })
    expect(f.managed.get(f.source.id)).toMatchObject({ unavailableReason: null, userEnabled: false })
    expect(f.requests.every(request => request.authorization !== 'Bearer fixture-old-bearer')).toBe(true)
    expect(f.requests.some(request => request.url.endsWith('/token'))).toBe(true)
    await f.service.setEnabled(f.source.id, true)
    expect(await f.service.test(f.source.id)).toMatchObject({ status: 'ready' })
  })

  it('rejects a late OAuth secret write when its source is suspended', async () => {
    const f = fixture('oauth')
    await f.service.applyManaged(f.source)
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    f.beforeWrite(async () => {
      f.beforeWrite()
      entered.resolve()
      await release.promise
    })
    f.service.login(f.source.id)
    await entered.promise
    f.managed.setState(f.source.id, 'disabled')
    release.resolve()
    await vi.waitUntil(() => f.changes.some(event => event.type === 'login' && event.status === 'failed'))
    expect(f.secrets.size).toBe(0)
    expect(f.managed.get(f.source.id)).toMatchObject({ credentialTarget: null, userEnabled: false })
    expect(f.connectors.findById(f.source.id)).toMatchObject({ credentialRef: null, enabled: false })
  })

  it('atomically retains credential binding and configuration when the SQL commit fails', async () => {
    const f = fixture()
    await f.service.applyManaged(f.source)
    await f.service.saveCredential(f.source.id, { type: 'http', bearerToken: 'fixture-original' })
    const target = f.managed.get(f.source.id)!.credentialTarget
    await f.service.applyManaged(f.managed.upsertSource({ ...f.input, revision: 'v2', definition: { ...f.source.definition as ExtensionMcpConnectorContribution, url: 'https://changed.example.test/mcp' } }))
    f.database.exec('CREATE TRIGGER fail_managed_user BEFORE UPDATE OF user_enabled ON extension_capabilities BEGIN SELECT RAISE(FAIL, \'fixture SQL failure\'); END')
    await expect(f.service.saveCredential(f.source.id, { type: 'http', bearerToken: 'fixture-replacement' })).rejects.toThrow('fixture SQL failure')
    expect(f.secrets.get(f.source.id)).toEqual({ type: 'http', bearerToken: 'fixture-original' })
    expect(f.managed.get(f.source.id)).toMatchObject({ credentialTarget: target, unavailableReason: 'target_changed' })
    await expect(f.service.clearManagedConfiguration(f.source.id)).rejects.toThrow('fixture SQL failure')
    expect(f.secrets.get(f.source.id)).toEqual({ type: 'http', bearerToken: 'fixture-original' })
    expect(f.connectors.findById(f.source.id)).toMatchObject({ credentialRef: f.source.id, enabled: false, managed: { unavailableReason: 'target_changed' } })
    expect(f.requests).toEqual([])
  })

  it.each(['disabled', 'removed', 'unavailable'] as const)('blocks login and networking for a %s plugin', async (state) => {
    const f = fixture('oauth')
    f.managed.setState(f.source.id, state)
    await f.service.applyManaged(f.managed.get(f.source.id)!)
    expect(() => f.service.login(f.source.id)).toThrow(expect.objectContaining({ code: 'MCP_CONNECTOR_DISABLED' }))
    expect(await f.service.test(f.source.id)).toMatchObject({ errorCode: 'MCP_CONNECTOR_DISABLED' })
    expect(f.requests).toEqual([])
  })

  it('publishes source metadata only for managed RPC records', async () => {
    const f = fixture('none')
    await f.service.applyManaged(f.source)
    await f.service.upsert({ ...f.config(), id: 'user-connection' })
    const handlers = new Map<string, RuntimeRequestHandler>()
    registerMcpConnectorRpc({ onRequest: (method, handler) => {
      handlers.set(method, handler)
      return () => {}
    } }, f.service)
    const result = await handlers.get('connectors.list')!({})
    expect(Array.isArray(result)).toBe(true)
    const records = (result as unknown[]).map(record => connectorSchema.parse(record))
    expect(records.find(record => record.id === f.source.id)?.managed?.extensionId).toBe('fixture.plugin')
    expect(records.find(record => record.id === 'user-connection')).not.toHaveProperty('managed')
  })
})
