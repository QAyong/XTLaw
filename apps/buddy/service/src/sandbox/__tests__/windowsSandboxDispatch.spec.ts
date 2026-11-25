import type { SandboxProcessInput } from '../../../../shared/permissions/shellSandbox'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runWindowsSandboxProcess } from '../../../../platform/process/windowsSandboxProcess'
import { SHELL_SANDBOX_BACKEND } from '../../../../shared/platform/identifiers'
import { createWindowsSandboxPolicy } from '../backends/windows/createPolicy'
import { runSandboxCommand } from '../runSandboxCommand'

vi.mock('../../../../platform/process/windowsSandboxProcess', () => ({ runWindowsSandboxProcess: vi.fn() }))
vi.mock('../backends/windows/createPolicy', () => ({ createWindowsSandboxPolicy: vi.fn() }))

function fixture() {
  const root = 'C:\\workspace'
  const input: SandboxProcessInput = {
    requestId: randomUUID(),
    command: 'Write-Output ok',
    cwd: root,
    readOnly: true,
    roots: [root],
    workspaceRoots: [root],
    resourceReadRoots: [],
    additionalDirectories: [],
    home: root,
    privateRoot: 'C:\\temporary',
    protectedRoots: [],
    sensitiveRoots: [],
    searchDirectory: root,
    path: '',
    backend: {
      kind: SHELL_SANDBOX_BACKEND.Windows,
      executable: 'C:\\sandbox.exe',
      shell: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      systemRoot: 'C:\\Windows',
      protectionScope: 'C:\\profile',
    },
  }
  const controller = new AbortController()
  const onWindowsDispatch = vi.fn()
  const execute = () => runSandboxCommand(input, {
    signal: controller.signal,
    environment: { SystemRoot: 'C:\\Windows', USERPROFILE: 'C:\\profile' },
    onData: () => {},
    approveNetwork: async () => false,
    onWindowsDispatch,
  })
  return { controller, onWindowsDispatch, execute }
}

describe('windows sandbox dispatch', () => {
  beforeEach(() => {
    vi.mocked(createWindowsSandboxPolicy).mockReset()
    vi.mocked(runWindowsSandboxProcess).mockReset()
  })

  it('reports policy preparation failure as not started', async () => {
    const f = fixture()
    vi.mocked(createWindowsSandboxPolicy).mockRejectedValue(new Error('Policy preparation failed'))
    await expect(f.execute()).resolves.toEqual({ ok: false, code: 'SANDBOX_UNAVAILABLE', notStarted: true })
    expect(f.onWindowsDispatch).not.toHaveBeenCalled()
    expect(runWindowsSandboxProcess).not.toHaveBeenCalled()
  })

  it('reports cancellation during preparation as not started', async () => {
    const f = fixture()
    vi.mocked(createWindowsSandboxPolicy).mockImplementation(async () => {
      f.controller.abort()
      throw f.controller.signal.reason
    })
    await expect(f.execute()).resolves.toEqual({ ok: false, code: 'SANDBOX_CANCELLED', notStarted: true })
    expect(f.onWindowsDispatch).not.toHaveBeenCalled()
    expect(runWindowsSandboxProcess).not.toHaveBeenCalled()
  })

  it('preserves uncertainty after dispatching to the native supervisor', async () => {
    const f = fixture()
    vi.mocked(createWindowsSandboxPolicy).mockResolvedValue({ grants: [], path: '' })
    vi.mocked(runWindowsSandboxProcess).mockImplementation(async () => {
      expect(f.onWindowsDispatch).toHaveBeenCalledOnce()
      throw new Error('Supervisor response lost')
    })
    await expect(f.execute()).resolves.toEqual({ ok: false, code: 'SANDBOX_UNAVAILABLE' })
  })
})
