import type { AutomationApprovalAllowlistEntry } from '../../../../shared/automation/approvalAllowlist'
import type { BuddyApprovalPolicy } from '../../../../shared/permissions/approvalPolicy'
import type { BuddyExecutionProfile } from '../../../../shared/permissions/executionProfile'
import type { BuddyExtensionRunContext } from '../../agent/extensions/BuddyExtensionRunContext'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToolAuthorizationService } from '../ToolAuthorizationService'
import { ToolExecutionPermissions } from '../ToolExecutionPermissions'

interface Scenario {
  allowlist?: readonly AutomationApprovalAllowlistEntry[]
  approvalPolicy: BuddyApprovalPolicy
  executionProfile: BuddyExecutionProfile
  name: string
}

const DENIED = 'APPROVAL_UNAVAILABLE_IN_BACKGROUND'

describe('unattended automation permission matrix', () => {
  let root: string
  let workspace: string
  let allowedDirectory: string
  let otherDirectory: string
  const asked: string[] = []

  beforeEach(async () => {
    asked.length = 0
    root = await mkdtemp(join(tmpdir(), 'buddy-unattended-'))
    workspace = join(root, 'workspace')
    allowedDirectory = join(root, 'allowed')
    otherDirectory = join(root, 'other')
    await Promise.all([workspace, allowedDirectory, otherDirectory].map(path => mkdir(path)))
  })
  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  function authorizer(scenario: Scenario) {
    const run: BuddyExtensionRunContext = {
      runId: 'run-1',
      signal: new AbortController().signal,
      flushProjectedEvents: async () => {},
      onToolExecutionAuthorized: async () => {},
    }
    const service = new ToolAuthorizationService({
      approvalAllowlist: scenario.allowlist,
      approvalAvailable: false,
      approvalPolicy: scenario.approvalPolicy,
      approvalService: {
        request: async () => {
          asked.push('approval requested')
          throw new Error('unattended runs must never wait for approval')
        },
      },
      cwd: workspace,
      executionPermissions: new ToolExecutionPermissions(),
      executionProfile: scenario.executionProfile,
      getGrants: () => [{ canonicalRoot: workspace, root: workspace, grantId: 'workspace', kind: 'workspace' as const }],
      owner: { id: 'conversation', kind: 'conversation' },
    })
    let nextId = 0
    return {
      network: (host: string) => service.authorize({ input: {}, toolCallId: `call-${++nextId}`, toolName: 'bash' }, run, { access: 'network', requireApproval: true }, { network: { host, port: 443 } }),
      shell: () => service.authorize({ input: { command: 'node fixture.mjs' }, toolCallId: `call-${++nextId}`, toolName: 'lexora_host_shell' }, run),
      write: (directory: string) => service.authorize({ input: { content: 'fixture', path: join(directory, 'report.txt') }, toolCallId: `call-${++nextId}`, toolName: 'write' }, run),
    }
  }

  const scenarios: Scenario[] = [
    { name: 'read-only', approvalPolicy: 'policy', executionProfile: 'read_only' },
    { name: 'manual approval', approvalPolicy: 'manual', executionProfile: 'workspace_write' },
    { name: 'smart approval, empty allowlist', approvalPolicy: 'policy', executionProfile: 'workspace_write' },
    {
      allowlist: [{ access: 'write', kind: 'directory', path: '' }, { host: 'api.example.com', kind: 'domain' }],
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
      name: 'smart approval, write directory and domain allowlisted',
    },
    {
      allowlist: [{ access: 'read', kind: 'directory', path: '' }],
      approvalPolicy: 'policy',
      executionProfile: 'workspace_write',
      name: 'smart approval, read-only directory allowlisted',
    },
    {
      allowlist: [{ access: 'write', kind: 'directory', path: '' }, { host: 'api.example.com', kind: 'domain' }],
      approvalPolicy: 'manual',
      executionProfile: 'workspace_write',
      name: 'manual approval with an allowlist present',
    },
    { name: 'full access', approvalPolicy: 'policy', executionProfile: 'full_access' },
  ]

  function resolveScenario(scenario: Scenario): Scenario {
    return {
      ...scenario,
      allowlist: scenario.allowlist?.map(entry => entry.kind === 'directory' ? { ...entry, path: allowedDirectory } : entry),
    }
  }

  it('reports what each permission mode does for unattended operations', async () => {
    const rows: Record<string, Record<string, string | null>> = {}
    for (const scenario of scenarios) {
      const run = authorizer(resolveScenario(scenario))
      rows[scenario.name] = {
        'network other host': await run.network('other.example.org'),
        'network listed host': await run.network('api.example.com'),
        'shell on host': await run.shell(),
        'write in workspace': await run.write(workspace),
        'write outside, listed': await run.write(allowedDirectory),
        'write outside, unlisted': await run.write(otherDirectory),
      }
    }
    const ok = null
    const readOnly = 'READ_ONLY_PROFILE'
    const row = (values: readonly [string | null, string | null, string | null, string | null, string | null, string | null]) => ({
      'network listed host': values[0],
      'network other host': values[1],
      'shell on host': values[2],
      'write in workspace': values[3],
      'write outside, listed': values[4],
      'write outside, unlisted': values[5],
    })

    expect(asked).toEqual([])
    expect(rows).toEqual({
      'read-only': row([DENIED, DENIED, readOnly, readOnly, readOnly, readOnly]),
      'manual approval': row([DENIED, DENIED, DENIED, DENIED, DENIED, DENIED]),
      'smart approval, empty allowlist': row([DENIED, DENIED, DENIED, ok, DENIED, DENIED]),
      'smart approval, write directory and domain allowlisted': row([ok, DENIED, DENIED, ok, ok, DENIED]),
      'smart approval, read-only directory allowlisted': row([DENIED, DENIED, DENIED, ok, DENIED, DENIED]),
      'manual approval with an allowlist present': row([DENIED, DENIED, DENIED, DENIED, DENIED, DENIED]),
      'full access': row([DENIED, DENIED, ok, ok, ok, ok]),
    })
  })
})
