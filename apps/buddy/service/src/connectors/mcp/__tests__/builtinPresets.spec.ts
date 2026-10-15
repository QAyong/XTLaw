import type { DatabaseSync } from 'node:sqlite'
import type { ConnectorCredential } from '../../../../../shared/connectors/connectorCredentials'
import { afterEach, describe, expect, it } from 'vitest'
import { PKULAW_CONNECTOR_ID } from '../../../../../shared/connectors/builtinConnectors'
import { createConnectorRepository } from '../../../storage/connectorRepository'
import { openBuddyDatabase } from '../../../storage/database'
import { BUILTIN_CONNECTOR_PRESETS, ensureBuiltinConnectors } from '../builtinPresets'
import { McpConnectorService } from '../McpConnectorService'
import { mcpServerConfigSchema } from '../mcpSchemas'

const services: McpConnectorService[] = []
const databases: DatabaseSync[] = []

afterEach(async () => {
  await Promise.all(services.splice(0).map(service => service.close()))
  for (const database of databases.splice(0))
    database.close()
})

function createFixture() {
  const database = openBuddyDatabase({ databasePath: ':memory:' })
  databases.push(database)
  const repository = createConnectorRepository(database)
  const secrets = new Map<string, ConnectorCredential>()
  const service = new McpConnectorService({
    connectors: repository,
    secrets: {
      delete: async (id) => { secrets.delete(id) },
      read: async id => secrets.get(id) ?? null,
      write: async (id, value) => { secrets.set(id, value) },
    },
  })
  services.push(service)
  return { repository, secrets, service }
}

describe('builtin connector presets', () => {
  it('declares presets that satisfy the connector schema', () => {
    for (const preset of BUILTIN_CONNECTOR_PRESETS)
      expect(mcpServerConfigSchema.safeParse(preset).success).toBe(true)
    expect(BUILTIN_CONNECTOR_PRESETS.map(preset => preset.id)).toEqual([PKULAW_CONNECTOR_ID])
  })

  it('creates the missing presets disabled and without credentials', async () => {
    const { repository, secrets, service } = createFixture()
    await ensureBuiltinConnectors(service)
    const record = repository.findById(PKULAW_CONNECTOR_ID)
    expect(record).toMatchObject({
      credentialRef: null,
      enabled: false,
      id: PKULAW_CONNECTOR_ID,
      toolExposure: 'deferred',
      toolNamespace: 'pkulaw',
      transport: 'streamable-http',
    })
    expect(secrets.size).toBe(0)
  })

  it('keeps an existing preset, including its credential, on later runs', async () => {
    const { repository, secrets, service } = createFixture()
    await ensureBuiltinConnectors(service)
    await service.saveCredential(PKULAW_CONNECTOR_ID, { type: 'http', bearerToken: 'fixture-token' })
    const before = repository.findById(PKULAW_CONNECTOR_ID)
    await ensureBuiltinConnectors(service)
    expect(repository.findById(PKULAW_CONNECTOR_ID)).toEqual(before)
    expect(secrets.get(PKULAW_CONNECTOR_ID)).toEqual({ type: 'http', bearerToken: 'fixture-token' })
  })

  it('recreates a preset that the user removed', async () => {
    const { repository, service } = createFixture()
    await ensureBuiltinConnectors(service)
    await service.remove(PKULAW_CONNECTOR_ID)
    expect(repository.findById(PKULAW_CONNECTOR_ID)).toBeNull()
    await ensureBuiltinConnectors(service)
    expect(repository.findById(PKULAW_CONNECTOR_ID)).toMatchObject({ enabled: false, credentialRef: null })
  })
})
