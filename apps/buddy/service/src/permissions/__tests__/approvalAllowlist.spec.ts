import type { AutomationApprovalAllowlistEntry } from '../../../../shared/automation/approvalAllowlist'
import type { PermissionDecision } from '../permissionContract'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isAskCoveredByAllowlist } from '../approvalAllowlist'

type AskDecision = Extract<PermissionDecision, { type: 'ask' }>

const base = resolve('allowlist-fixture')
const directoryEntry = (access: 'read' | 'write', path = base): AutomationApprovalAllowlistEntry => ({ access, kind: 'directory', path })
const domainEntry = (host: string): AutomationApprovalAllowlistEntry => ({ host, kind: 'domain' })
const ask = (decision: Partial<AskDecision> & Pick<AskDecision, 'kind'>): AskDecision => ({ summary: 'fixture', type: 'ask', ...decision })
const paths = (...names: string[]) => names.map(name => ({ path: join(base, name), zone: 'outside' as const }))

describe('automation approval allowlist', () => {
  it('covers file operations only inside a listed directory with enough access', () => {
    const write = ask({ kind: 'write', paths: paths('out', 'a.txt') })
    expect(isAskCoveredByAllowlist(write, { entries: [directoryEntry('write')] })).toBe(true)
    expect(isAskCoveredByAllowlist(write, { entries: [directoryEntry('read')] })).toBe(false)
    expect(isAskCoveredByAllowlist(ask({ kind: 'read', paths: paths('a.txt') }), { entries: [directoryEntry('read')] })).toBe(true)
    expect(isAskCoveredByAllowlist(ask({ kind: 'delete', paths: paths('a.txt') }), { entries: [directoryEntry('read')] })).toBe(false)
    expect(isAskCoveredByAllowlist(write, { entries: [directoryEntry('write', join(base, 'other'))] })).toBe(false)
    expect(isAskCoveredByAllowlist(write, { entries: [directoryEntry('write', `${base}-sibling`)] })).toBe(false)
  })

  it('requires every touched path and the proposed grant root to be covered', () => {
    const entries = [directoryEntry('write', join(base, 'out'))]
    expect(isAskCoveredByAllowlist(ask({ kind: 'write', paths: [...paths('out/a.txt'), ...paths('elsewhere/b.txt')] }), { entries })).toBe(false)
    expect(isAskCoveredByAllowlist(ask({
      grant: { owner: { id: 'space', kind: 'space' }, root: base },
      kind: 'write',
      paths: paths('out/a.txt'),
    }), { entries })).toBe(false)
  })

  it('covers sandbox directory expansion and network hosts, but never shell or system asks', () => {
    const sandboxDirectory = { access: 'write' as const, device: '1', inode: '1', path: join(base, 'work'), reason: 'fixture' }
    expect(isAskCoveredByAllowlist(ask({ kind: 'write', sandboxDirectory }), { entries: [directoryEntry('write')] })).toBe(true)
    expect(isAskCoveredByAllowlist(ask({ kind: 'read', sandboxDirectory: { ...sandboxDirectory, access: 'read' } }), { entries: [directoryEntry('read')] })).toBe(true)
    expect(isAskCoveredByAllowlist(ask({ kind: 'write', sandboxDirectory }), { entries: [directoryEntry('read')] })).toBe(false)

    const entries = [domainEntry('api.example.com'), domainEntry('*.cdn.example.net')]
    expect(isAskCoveredByAllowlist(ask({ kind: 'network' }), { entries, networkHost: 'API.example.com' })).toBe(true)
    expect(isAskCoveredByAllowlist(ask({ kind: 'network' }), { entries, networkHost: 'img.cdn.example.net' })).toBe(true)
    expect(isAskCoveredByAllowlist(ask({ kind: 'network' }), { entries, networkHost: 'cdn.example.net' })).toBe(false)
    expect(isAskCoveredByAllowlist(ask({ kind: 'network' }), { entries, networkHost: 'evilapi.example.com' })).toBe(false)
    expect(isAskCoveredByAllowlist(ask({ kind: 'network' }), { entries })).toBe(false)

    expect(isAskCoveredByAllowlist(ask({ kind: 'shell', shell: { cwd: base, reason: 'forced-confirmation' } }), { entries: [directoryEntry('write')] })).toBe(false)
    expect(isAskCoveredByAllowlist(ask({ kind: 'system' }), { entries: [directoryEntry('write')] })).toBe(false)
  })

  it('covers nothing when the allowlist is empty', () => {
    expect(isAskCoveredByAllowlist(ask({ kind: 'write', paths: paths('a.txt') }), { entries: [] })).toBe(false)
  })
})
