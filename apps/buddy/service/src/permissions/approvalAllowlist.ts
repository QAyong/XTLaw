import type { AutomationApprovalAllowlistEntry } from '../../../shared/automation/approvalAllowlist'
import type { PermissionDecision } from './permissionContract'
import { containsCanonicalPath } from '../../../platform/filesystem/filePaths'

export interface ApprovalAllowlistScope {
  entries: readonly AutomationApprovalAllowlistEntry[]
  networkHost?: string
}

type AskDecision = Extract<PermissionDecision, { type: 'ask' }>

/**
 * Decides whether an unattended run may proceed with an operation that would
 * otherwise need confirmation. Only directories and network hosts that the
 * automation lists explicitly are covered; shell and system asks never are.
 */
export function isAskCoveredByAllowlist(decision: AskDecision, scope: ApprovalAllowlistScope): boolean {
  if (!scope.entries.length || decision.shell)
    return false
  if (decision.sandboxDirectory)
    return isDirectoryAllowed(scope.entries, decision.sandboxDirectory.path, decision.sandboxDirectory.access)
  if (decision.kind === 'network')
    return !!scope.networkHost && isDomainAllowed(scope.entries, scope.networkHost)
  const access = decision.kind === 'read' ? 'read' : decision.kind === 'write' || decision.kind === 'delete' ? 'write' : null
  if (!access || !decision.paths?.length)
    return false
  const targets = [...decision.paths.map(path => path.path), ...decision.grant ? [decision.grant.root] : []]
  return targets.every(target => isDirectoryAllowed(scope.entries, target, access))
}

function isDirectoryAllowed(
  entries: readonly AutomationApprovalAllowlistEntry[],
  target: string,
  access: 'read' | 'write',
): boolean {
  return entries.some(entry => entry.kind === 'directory'
    && (entry.access === 'write' || access === 'read')
    && containsCanonicalPath(entry.path, target))
}

function isDomainAllowed(entries: readonly AutomationApprovalAllowlistEntry[], host: string): boolean {
  const normalized = host.toLowerCase()
  return entries.some((entry) => {
    if (entry.kind !== 'domain')
      return false
    return entry.host.startsWith('*.')
      ? normalized.endsWith(entry.host.slice(1))
      : normalized === entry.host
  })
}
