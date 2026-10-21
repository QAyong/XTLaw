import type { SandboxBackendInput } from '../../../../../shared/permissions/shellSandbox'
import type { SHELL_SANDBOX_BACKEND } from '../../../../../shared/platform/identifiers'
import type { SandboxFilesystemPolicyInput } from '../../sandboxFilesystemPolicy'
import { dirname, join } from 'node:path'
import { validateWindowsFilePath } from '../../../../../platform/windows/filePath'
import { createSandboxFilesystemPolicy, existingSandboxPaths, inspectSandboxPath } from '../../sandboxFilesystemPolicy'

type WindowsSandboxPolicyInput = SandboxFilesystemPolicyInput & Pick<SandboxBackendInput<typeof SHELL_SANDBOX_BACKEND.Windows>, 'backend' | 'path' | 'searchDirectory'>

export async function createWindowsSandboxPolicy(input: WindowsSandboxPolicyInput, signal: AbortSignal) {
  const grants = await createSandboxFilesystemPolicy(input, signal)
  const roots = new Set(await existingSandboxPaths([dirname(input.backend.shell), join(input.backend.systemRoot, 'System32'), input.searchDirectory]))
  for (const root of roots)
    grants.push(await inspectSandboxPath(root, 'read'))

  for (const entry of input.path.split(';')) {
    signal.throwIfAborted()
    let path: string
    try {
      path = validateWindowsFilePath(entry.replace(/^"|"$/g, ''))
    }
    catch {
      continue
    }
    if (!/^[a-z]:\\/i.test(path))
      continue
    try {
      const [root] = await existingSandboxPaths([path])
      if (!root || !/^[a-z]:\\/i.test(root) || roots.has(root))
        continue
      const grant = await inspectSandboxPath(root, 'read')
      roots.add(root)
      grants.push(grant)
    }
    catch (error) {
      if (!error || typeof error !== 'object' || !('code' in error) || !['EPERM', 'EACCES'].includes(String(error.code)))
        throw error
    }
  }
  return { grants, path: [...roots].join(';') }
}
