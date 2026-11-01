// @vitest-environment jsdom
import type { BuddyPermissionMode } from '@buddy-shared/permissions/permissionMode'
import { afterEach, expect, it } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import OnboardingPermissionStep from '../OnboardingPermissionStep.vue'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

function mountStep(initial: BuddyPermissionMode) {
  const mode = shallowRef(initial)
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    render: () => h(OnboardingPermissionStep, {
      'modelValue': mode.value,
      'onUpdate:modelValue': (value: BuddyPermissionMode) => { mode.value = value },
      'language': 'zh-CN',
      'disabled': false,
    }),
  })
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  return { mode, root }
}

it('marks full access as recommended without selecting it', async () => {
  const { mode, root } = mountStep('policy_approval')
  await nextTick()
  const full = root.querySelector<HTMLButtonElement>('[data-testid="onboarding-permission-full_access"]')!
  expect(full.textContent).toContain('推荐')
  expect(full.getAttribute('aria-checked')).toBe('false')
  expect(mode.value).toBe('policy_approval')
})

it('applies a non-full mode immediately and leaves full access to the confirmation dialog', async () => {
  const { mode, root } = mountStep('policy_approval')
  root.querySelector<HTMLButtonElement>('[data-testid="onboarding-permission-read_only"]')!.click()
  await nextTick()
  expect(mode.value).toBe('read_only')
  root.querySelector<HTMLButtonElement>('[data-testid="onboarding-permission-full_access"]')!.click()
  await nextTick()
  expect(mode.value).toBe('read_only')
})
