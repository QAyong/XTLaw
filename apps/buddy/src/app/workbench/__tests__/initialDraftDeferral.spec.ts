import type { BuddyPermissionMode } from '@buddy-shared/permissions/permissionMode'
import { resolveBuddyPermissionSettings } from '@buddy-shared/permissions/permissionMode'
import { describe, expect, it, vi } from 'vitest'
import { computed, effectScope, shallowRef } from 'vue'
import { useDesktopOnboarding } from '@/modules/onboarding/state/useDesktopOnboarding'
import { useChatDrafts } from '@/modules/tasks/state/drafts/useChatDrafts'
import { runInitialDraftSettlement } from '../initialDraftDeferral'

const PERMISSION_MODES = ['full_access', 'manual_approval', 'read_only', 'policy_approval'] as const satisfies readonly BuddyPermissionMode[]

describe('first draft after onboarding', () => {
  it.each(PERMISSION_MODES)('waits for onboarding to save %s before creating the fallback draft', async (mode) => {
    const harness = createHarness()
    const original = resolveBuddyPermissionSettings('policy_approval')
    const selected = resolveBuddyPermissionSettings(mode)
    try {
      await harness.settle('startup', false)
      expect(harness.created).toEqual([])
      expect(harness.deferred.value).toBe(true)
      expect(harness.draftKeys()).toEqual(['draft:existing'])
      expect(harness.drafts.load('draft:existing')).toMatchObject(original)

      harness.onboarding.permissionMode.value = mode
      harness.rejectNextSave = true
      await harness.onboarding.complete()
      expect(harness.config.value.desktop.onboardingCompleted).toBe(false)
      expect(harness.config.value.desktop.chat.permissionMode).toBe('policy_approval')
      expect(harness.created).toEqual([])
      expect(harness.drafts.load('draft:existing')).toMatchObject(original)

      await harness.onboarding.complete()
      expect(harness.onComplete).toHaveBeenCalledOnce()
      expect(harness.config.value.desktop).toMatchObject({ onboardingCompleted: true, chat: { permissionMode: mode } })
      expect(harness.created).toEqual(['space-7'])
      expect(harness.deferred.value).toBe(false)
      expect(harness.drafts.load('draft:first')).toMatchObject(selected)
      expect(harness.drafts.load('draft:existing')).toMatchObject(original)

      await harness.onboarding.open()
      harness.onboarding.permissionMode.value = mode === 'full_access' ? 'read_only' : 'full_access'
      await harness.onboarding.complete()
      expect(harness.onComplete).toHaveBeenCalledOnce()
      expect(harness.created).toEqual(['space-7'])
      expect(harness.drafts.load('draft:first')).toMatchObject(selected)
      expect(harness.drafts.load('draft:existing')).toMatchObject(original)
    }
    finally {
      harness.scope.stop()
    }
  })

  it('keeps the marker until a workspace is ready and does not race a manual task', async () => {
    const saved = createHarness({ completed: true, deferred: true, mode: 'full_access' })
    try {
      await saved.settle('startup', true)
      expect(saved.created).toEqual([null])
      expect(saved.deferred.value).toBe(false)
      expect(saved.drafts.load('draft:first')).toMatchObject(resolveBuddyPermissionSettings('full_access'))
      expect(saved.drafts.load('draft:existing')).toMatchObject(resolveBuddyPermissionSettings('policy_approval'))
    }
    finally {
      saved.scope.stop()
    }

    const intentional = track({ restored: true, completed: true })
    await intentional.run('startup')
    expect(intentional.reads).toBe(0)
    expect(intentional.created).toEqual([])

    const waiting = track({ restored: true, deferred: true })
    await waiting.run('startup')
    expect(waiting.created).toEqual([])
    expect(waiting.deferred).toBe(true)

    const restoredView = track({ restored: true, deferred: true, views: 1 })
    await restoredView.run('onboarding')
    expect(restoredView.reads).toBe(0)
    expect(restoredView.created).toEqual([])
    expect(restoredView.deferred).toBe(false)

    const existingTask = track({ history: { activeConversationId: 'task-1', spaceId: 'space-1' } })
    await existingTask.run('startup')
    expect(existingTask.opened).toEqual(['task-1'])
    expect(existingTask.created).toEqual([])
    expect(existingTask.deferred).toBe(false)

    const unready = track({ restored: true, deferred: true, completed: true, readyOnCreate: false })
    await unready.run('onboarding')
    expect(unready.created).toEqual([null])
    expect(unready.views).toBe(1)
    expect(unready.ready).toBe(false)
    expect(unready.deferred).toBe(true)

    const manual = track({ deferred: true, completed: true })
    await manual.run('onboarding', { duringRead: () => {
      manual.views = 1
    } })
    expect(manual.created).toEqual([])
    expect(manual.deferred).toBe(true)

    const manualReady = track({ deferred: true, completed: true })
    await manualReady.run('onboarding', { duringRead: () => {
      manualReady.views = 1
      manualReady.ready = true
    } })
    expect(manualReady.created).toEqual([])
    expect(manualReady.deferred).toBe(false)

    const savedDuringRead = track({ restored: true, deferred: true })
    await savedDuringRead.run('startup', { duringRead: () => {
      savedDuringRead.completed = true
    } })
    expect(savedDuringRead.created).toEqual([null])
    expect(savedDuringRead.deferred).toBe(false)
  })
})

function createHarness(initial: { completed?: boolean, deferred?: boolean, mode?: BuddyPermissionMode } = {}) {
  const config = shallowRef({
    desktop: {
      onboardingCompleted: initial.completed ?? false,
      updateNotificationsEnabled: true,
      autoDownloadUpdates: true,
      chat: { permissionMode: 'policy_approval' as BuddyPermissionMode },
    },
  })
  const targetKey = shallowRef('draft:existing')
  const deferred = shallowRef(initial.deferred ?? false)
  const views = shallowRef(0)
  const ready = shallowRef(false)
  const created: Array<string | null> = []
  const scope = effectScope()
  let rejectNextSave = false
  const drafts = scope.run(() => useChatDrafts({
    defaultPermissionMode: computed(() => config.value.desktop.chat.permissionMode),
    onChange: () => {},
    targetKey: computed(() => targetKey.value),
  }))!
  if (initial.mode)
    config.value = { desktop: { ...config.value.desktop, chat: { permissionMode: initial.mode } } }
  const settle = (source: 'startup' | 'onboarding', restored: boolean) => runInitialDraftSettlement({
    source,
    restored,
    hasView: () => views.value > 0,
    workspaceReady: () => ready.value,
    deferred: () => deferred.value,
    onboardingCompleted: () => config.value.desktop.onboardingCompleted,
    readWorkspace: async () => ({ activeConversationId: null, spaceId: initial.completed ? null : 'space-7' }),
    openTask: async () => { throw new Error('unexpected task open') },
    createDraft: async (spaceId) => {
      created.push(spaceId)
      views.value += 1
      ready.value = true
      targetKey.value = 'draft:first'
    },
    setDeferred: () => { deferred.value = true },
    clearDeferred: () => { deferred.value = false },
  })
  const updateSettings = async (patch: { desktop?: { onboardingCompleted?: boolean, chat?: { permissionMode?: BuddyPermissionMode } } }) => {
    if (rejectNextSave) {
      rejectNextSave = false
      return false
    }
    const desktop = patch.desktop
    config.value = {
      desktop: {
        ...config.value.desktop,
        ...desktop,
        chat: { ...config.value.desktop.chat, ...desktop?.chat },
        onboardingCompleted: desktop?.onboardingCompleted ?? config.value.desktop.onboardingCompleted,
      },
    }
    return true
  }
  const onComplete = vi.fn(() => settle('onboarding', false))
  const onboarding = scope.run(() => useDesktopOnboarding({
    settings: { config, updateSettings } as never,
    providers: {} as never,
    buddies: {
      api: { list: async () => ({ defaultBuddyId: 'buddy', buddies: [{ id: 'buddy', name: '晓晓', avatar: null, customAvatars: [] }] }) } as never,
      catalog: shallowRef(null),
      refresh: async () => {},
    },
    onComplete,
  }))!
  return {
    config,
    created,
    deferred,
    drafts,
    onboarding,
    onComplete,
    scope,
    settle,
    get rejectNextSave() { return rejectNextSave },
    set rejectNextSave(value: boolean) { rejectNextSave = value },
    draftKeys: () => drafts.listSnapshots().map(snapshot => snapshot.targetKey).sort(),
  }
}

function track(initial: {
  restored?: boolean
  deferred?: boolean
  views?: number
  completed?: boolean
  history?: { activeConversationId: string | null, spaceId: string | null } | null
  readyOnCreate?: boolean
}) {
  const state = {
    deferred: initial.deferred ?? false,
    views: initial.views ?? 0,
    ready: false,
    completed: initial.completed ?? false,
    created: [] as Array<string | null>,
    opened: [] as string[],
    reads: 0,
    run: (source: 'startup' | 'onboarding', hooks?: { duringRead?: () => void }) => runInitialDraftSettlement({
      source,
      restored: initial.restored ?? false,
      hasView: () => state.views > 0,
      workspaceReady: () => state.ready,
      deferred: () => state.deferred,
      onboardingCompleted: () => state.completed,
      readWorkspace: async () => {
        state.reads += 1
        hooks?.duringRead?.()
        return initial.history ?? null
      },
      openTask: async (id) => {
        state.opened.push(id)
        state.views += 1
        state.ready = true
      },
      createDraft: async (spaceId) => {
        state.created.push(spaceId)
        state.views += 1
        state.ready = initial.readyOnCreate ?? true
      },
      setDeferred: () => { state.deferred = true },
      clearDeferred: () => { state.deferred = false },
    }),
  }
  return state
}
