import type { SpaceFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import type { TaskResourcePanel } from '@/modules/tasks/contracts'
import { describe, expect, it, vi } from 'vitest'
import { createQuoteSourceOpener } from '../openQuoteSourceFile'

const target: SpaceFileTarget = { spaceId: 'space', directoryId: 'directory', revision: 1, path: 'report.docx' }

function fixture(opened: ReturnType<TaskResourcePanel['openQuoteSourceFile']>) {
  const openQuoteSourceFile = vi.fn(() => opened)
  const openInTab = vi.fn(async () => 'view')
  const openStandalone = vi.fn(async () => 'standalone')
  const open = createQuoteSourceOpener({ resources: () => ({ openQuoteSourceFile }) as unknown as TaskResourcePanel, openInTab, openStandalone })
  return { open, openQuoteSourceFile, openInTab, openStandalone }
}

describe('opening the source of a quote', () => {
  it('opens the file inside the file manager tab after the locate scope accepted that tab', async () => {
    const f = fixture({ target: { ...target, revision: 2 }, tabId: 'files-1' })
    const order: string[] = []
    const accept = vi.fn((_id: string) => {
      order.push('accept')
      return true
    })
    f.openInTab.mockImplementation(async () => {
      order.push('open')
      return 'view'
    })
    expect(await f.open(target, () => true, accept)).toBe('view')
    expect(accept).toHaveBeenCalledWith('files-1')
    expect(f.openInTab).toHaveBeenCalledWith({ ...target, revision: 2 }, 'files-1')
    expect(order).toEqual(['accept', 'open'])
    expect(f.openStandalone).not.toHaveBeenCalled()
  })

  it('returns the editor that was already open without opening anything else', async () => {
    const f = fixture({ target, tabId: 'view-1', viewId: 'view-1' })
    expect(await f.open(target, () => true)).toBe('view-1')
    expect(f.openInTab).not.toHaveBeenCalled()
  })

  it('opens on its own when the file is not in the task space', async () => {
    const f = fixture(null)
    const current = () => true
    expect(await f.open(target, current)).toBe('standalone')
    expect(f.openStandalone).toHaveBeenCalledWith(target, current)
  })

  it('stops when the locate scope no longer accepts the tab', async () => {
    const f = fixture({ target, tabId: 'files-1' })
    expect(await f.open(target, () => true, () => false)).toBeNull()
    expect(f.openInTab).not.toHaveBeenCalled()
  })

  it('does not touch the panel once the request is no longer current', async () => {
    const f = fixture({ target, tabId: 'files-1' })
    expect(await f.open(target, () => false)).toBeNull()
    expect(f.openQuoteSourceFile).not.toHaveBeenCalled()
  })
})
