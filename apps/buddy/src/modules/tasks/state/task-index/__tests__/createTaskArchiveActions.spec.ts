import type { LocalChatApi } from '@buddy-electron/shared/localChatApi'
import { deferred } from '@buddy-tests/deferred'
import { describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'
import { createTaskArchiveActions } from '../createTaskArchiveActions'

function fixture() {
  const ready = shallowRef(true)
  const beforeClose = vi.fn(async () => true)
  const onClosed = vi.fn()
  const refresh = vi.fn(async () => {})
  const archive = vi.fn(async () => true)
  const restoreArchive = vi.fn(async () => true)
  const deleteArchived = vi.fn(async () => true)
  const api = { archive, restoreArchive, deleteArchived } as unknown as LocalChatApi['conversations']
  const actions = createTaskArchiveActions({ api, ready, beforeClose, onClosed, refresh })
  return { ready, beforeClose, onClosed, refresh, archive, restoreArchive, deleteArchived, actions }
}

describe('task archive actions', () => {
  it('archives directly without waiting for a task-view close confirmation', async () => {
    const f = fixture()
    f.beforeClose.mockResolvedValue(false)
    expect(await f.actions.archive('active-task', 3)).toBe(true)
    expect(f.archive).toHaveBeenCalledWith('active-task', 3)
    expect(f.beforeClose).not.toHaveBeenCalled()
    expect(f.onClosed).not.toHaveBeenCalled()
    expect(f.refresh).toHaveBeenCalledOnce()
  })

  it('closes open views only for permanent deletion after the close guard and mutation succeed', async () => {
    const f = fixture()
    const protectedFiles = deferred<boolean>()
    f.beforeClose.mockReturnValueOnce(protectedFiles.promise)
    const deleting = f.actions.delete('task', 3)
    expect(f.deleteArchived).not.toHaveBeenCalled()
    protectedFiles.resolve(true)
    expect(await deleting).toBe(true)
    expect(f.deleteArchived).toHaveBeenCalledWith('task', 3)
    expect(f.onClosed).toHaveBeenCalledWith('task')
    f.onClosed.mockClear()
    f.deleteArchived.mockResolvedValue(false)
    expect(await f.actions.delete('task', 4)).toBe(false)
    expect(f.onClosed).not.toHaveBeenCalled()
  })

  it('rechecks readiness after the close guard and restores without executing or granting permissions', async () => {
    const f = fixture()
    const protectedFiles = deferred<boolean>()
    f.beforeClose.mockReturnValueOnce(protectedFiles.promise)
    const pending = f.actions.delete('task', 3)
    f.ready.value = false
    protectedFiles.resolve(true)
    expect(await pending).toBe(false)
    expect(f.deleteArchived).not.toHaveBeenCalled()
    expect(f.onClosed).not.toHaveBeenCalled()
    f.ready.value = true
    f.beforeClose.mockClear()
    expect(await f.actions.restore('task', 5)).toBe(true)
    expect(f.restoreArchive).toHaveBeenCalledWith('task', 5)
    expect(f.beforeClose).not.toHaveBeenCalled()
    expect(f.onClosed).not.toHaveBeenCalled()
    f.restoreArchive.mockClear()
    expect(await f.actions.restore('task')).toBe(false)
    expect(await f.actions.archive('task')).toBe(false)
    expect(await f.actions.delete('task')).toBe(false)
    expect(f.restoreArchive).not.toHaveBeenCalled()
    expect(f.archive).not.toHaveBeenCalled()
    expect(f.deleteArchived).not.toHaveBeenCalled()
  })
})
