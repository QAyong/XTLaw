import type { SandboxBackendInput } from '../../../../../shared/permissions/shellSandbox'
import type { SHELL_SANDBOX_BACKEND } from '../../../../../shared/platform/identifiers'
import type { SandboxFilesystemPolicyInput } from '../../sandboxFilesystemPolicy'
import { dirname, join } from 'node:path'
import { validateWindowsFilePath } from '../../../../../platform/windows/filePath'
import { createSandboxFilesystemPolicy, existingSandboxPaths, inspectSandboxPath } from '../../sandboxFilesystemPolicy'

type WindowsSandboxPolicyInput = SandboxFilesystemPolicyInput & Pick<SandboxBackendInput<typeof SHELL_SANDBOX_BACKEND.Windows>, 'backend' | 'path' | 'searchDirectory'>

function isAccessDenied(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error && ['EPERM', 'EACCES'].includes(String(error.code))
}

export async function createWindowsSandboxPolicy(input: WindowsSandboxPolicyInput, signal: AbortSignal) {
  const grants = await createSandboxFilesystemPolicy(input, signal)
  const paths: string[] = []
  for (const entry of input.path.split(';')) {
    try {
      const path = validateWindowsFilePath(entry.replace(/^"|"$/g, ''))
      if (/^[a-z]:\\/i.test(path))
        paths.push(path)
    }
    catch {}
  }
  const localPaths: string[] = []
  for (const path of paths) {
    try {
      localPaths.push(...(await existingSandboxPaths([path])).filter(item => /^[a-z]:\\/i.test(item)))
    }
    catch (error) {
      // A PATH entry this user cannot read (for example under another user's profile) can be neither granted nor searched.
      // Only PATH entries are skipped; the shell, system and search directories still fail closed.
      if (!isAccessDenied(error))
        throw error
    }
  }
  const roots = [...new Set([...await existingSandboxPaths([dirname(input.backend.shell), join(input.backend.systemRoot, 'System32'), input.searchDirectory]), ...localPaths])]
  for (const root of roots)
    grants.push(await inspectSandboxPath(root, 'read'))
  return { grants, path: roots.join(';') }
}
