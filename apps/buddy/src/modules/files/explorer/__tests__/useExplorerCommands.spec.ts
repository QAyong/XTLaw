import type { FileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { ExplorerNode } from '@/shared/ui/explorer/treeCollection'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useExplorerCommands } from '../useExplorerCommands'

const { getOperations } = vi.hoisted(() => ({ getOperations: vi.fn() }))
vi.mock('../../fileOperationsContext', () => ({ useFileOperations: getOperations }))
vi.mock('naive-ui', () => ({ useDialog: () => ({}) }))

const cleanup: Array<() => void> = []
afterEach(() => {
  for (const stop of cleanup.splice(0)) stop()
})
const target = { spaceId: 'space', directoryId: 'directory', revision: 1, path: '' }
const node: ExplorerNode = { key: '资料/合同 草稿.docx', label: '合同 草稿.docx', kind: 'file' }

function fixture(current: FileTarget = target) {
  const operations = {
    clipboard: shallowRef(null),
    copyPath: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue({ status: 'applied' }),
  }
  getOperations.mockReturnValue(operations)
  const scope = effectScope()
  cleanup.push(() => scope.stop())
  const commands = scope.run(() => useExplorerCommands({
    target: () => current,
    language: () => 'zh-CN',
    api: { revealFile: vi.fn(), cancelFileOperation: vi.fn() },
    refresh: vi.fn().mockResolvedValue(undefined),
  }))!
  return { operations, commands }
}

describe('explorer operations in a granted directory', () => {
  const grant = { conversationId: 'conversation', root: '/work/out', path: '' }

  it('runs every file action against the granted root', async () => {
    const { operations, commands } = fixture(grant)
    await commands.command('trash', node).catch(() => {})
    await commands.command('copy', node)
    expect(operations.clipboard.value).toEqual({ target: { ...grant, path: node.key }, move: false })
    await commands.command('paste', { key: 'destination', label: 'destination', kind: 'directory' })
    expect(operations.execute).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'conversation',
      root: '/work/out',
      path: node.key,
      action: { kind: 'copy', destination: { ...grant, path: 'destination/合同 草稿.docx' } },
    }))
    expect(operations.execute.mock.calls.every(([input]) => !('spaceId' in input))).toBe(true)
  })

  it('only pastes what was copied inside the same granted root', async () => {
    const { operations, commands } = fixture(grant)
    for (const source of [{ ...target, path: 'a.txt' }, { ...grant, root: '/work/other', path: 'a.txt' }, { ...grant, conversationId: 'other', path: 'a.txt' }]) {
      expect(commands.canPaste(source)).toBe(false)
      operations.clipboard.value = { target: source, move: false } as never
      await commands.command('paste', { key: 'destination', label: 'destination', kind: 'directory' })
    }
    expect(operations.execute).not.toHaveBeenCalled()
    expect(commands.canPaste({ ...grant, path: 'a.txt' })).toBe(true)
    // A space file cannot be pasted into a granted root either, and the other way round.
    expect(fixture(target).commands.canPaste({ ...grant, path: 'a.txt' })).toBe(false)
    expect(fixture(target).commands.canPaste({ ...target, path: 'a.txt' })).toBe(true)
  })
})

describe('explorer copy path', () => {
  it('copies the path while retaining internal file copy and paste', async () => {
    const { operations, commands } = fixture()
    await commands.command('copy', node)
    expect(operations.copyPath).toHaveBeenCalledExactlyOnceWith({ ...target, path: node.key })
    expect(operations.clipboard.value).toEqual({ target: { ...target, path: node.key }, move: false })
    await commands.command('paste', { key: 'destination', label: 'destination', kind: 'directory' })
    expect(operations.execute).toHaveBeenCalledWith(expect.objectContaining({
      path: node.key,
      action: { kind: 'copy', destination: { ...target, path: 'destination/合同 草稿.docx' } },
    }))
  })

  it('does not change the system clipboard when cutting', async () => {
    const { operations, commands } = fixture()
    await commands.command('cut', node)
    expect(operations.copyPath).not.toHaveBeenCalled()
    expect(operations.clipboard.value).toEqual({ target: { ...target, path: node.key }, move: true })
  })

  it('shows clipboard failures and clears them after a successful retry', async () => {
    const { operations, commands } = fixture()
    operations.copyPath.mockRejectedValueOnce(new Error('clipboard unavailable'))
    await commands.command('copy', node)
    expect(commands.error.value).not.toBe('')
    expect(operations.clipboard.value).toEqual({ target: { ...target, path: node.key }, move: false })
    await commands.command('copy', node)
    expect(commands.error.value).toBe('')
  })

  it('ignores missing and disabled nodes', async () => {
    const { operations, commands } = fixture()
    await commands.command('copy', null)
    await commands.command('copy', { ...node, disabled: true })
    expect(operations.copyPath).not.toHaveBeenCalled()
    expect(operations.clipboard.value).toBeNull()
  })
})

describe('new file name request', () => {
  it('offers extensions for a new file but not for a folder or a rename', async () => {
    const { commands } = fixture()
    for (const [command, extension] of [['newFile', true], ['newFolder', false]] as const) {
      const done = commands.command(command, null)
      expect(commands.nameRequest.value).toMatchObject({ extension })
      commands.finishName(null)
      await done
    }
    const renamed = commands.command('rename', node)
    expect(commands.nameRequest.value).toMatchObject({ extension: false })
    commands.finishName(null)
    await renamed
  })
})
