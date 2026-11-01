import type { BuddyPermissionMode } from '@buddy-shared/permissions/permissionMode'
import { expect, it, vi } from 'vitest'
import { effectScope, shallowRef } from 'vue'
import { useDesktopOnboarding } from '../useDesktopOnboarding'

function setup(permissionMode: BuddyPermissionMode = 'policy_approval') {
  const config = shallowRef({
    desktop: {
      onboardingCompleted: false,
      updateNotificationsEnabled: true,
      autoDownloadUpdates: true,
      chat: { permissionMode },
    },
  })
  const updateSettings = vi.fn(async () => true)
  const onComplete = vi.fn(async () => {})
  const scope = effectScope()
  const onboarding = scope.run(() => useDesktopOnboarding({
    settings: { config, updateSettings } as never,
    providers: {} as never,
    buddies: { api: {} as never, catalog: shallowRef(null), refresh: async () => {} },
    onComplete,
  }))!
  return { onboarding, updateSettings, onComplete, scope }
}

it('starts from the saved default permission and does not preselect full access', () => {
  const { onboarding, scope } = setup()
  expect(onboarding.permissionMode.value).toBe('policy_approval')
  scope.stop()
})

it('saves the chosen default permission together with the onboarding completion', async () => {
  const { onboarding, updateSettings, onComplete, scope } = setup()
  onboarding.permissionMode.value = 'full_access'
  await onboarding.complete()
  expect(updateSettings).toHaveBeenCalledWith({
    desktop: {
      updateNotificationsEnabled: true,
      autoDownloadUpdates: true,
      chat: { permissionMode: 'full_access' },
      onboardingCompleted: true,
    },
  })
  expect(onComplete).toHaveBeenCalledOnce()
  scope.stop()
})
