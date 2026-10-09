// @vitest-environment jsdom
import type { WorkbenchContext } from '@/workbench/browser/workbenchContext'
import { expect, it, vi } from 'vitest'
import { createApp, h, nextTick, provide, shallowRef } from 'vue'
import { workbenchKey } from '@/workbench/browser/workbenchContext'
import { workbenchLabels } from '@/workbench/common/workbenchLabels'
import DesktopTaskLoading from '../DesktopTaskLoading.vue'

it('keeps title and actions visible while loading and exposes a retry on failure', async () => {
  const failed = shallowRef(false)
  const retry = vi.fn()
  const element = document.createElement('div')
  const app = createApp({ setup() {
    provide(workbenchKey, { labels: shallowRef(workbenchLabels('en-US')) } as WorkbenchContext)
    return () => h(DesktopTaskLoading, { failed: failed.value, onRetry: retry }, {
      title: () => h('span', { 'data-loading-title': '' }, 'Task title'),
      actions: () => h('button', { 'data-loading-actions': '' }, 'Task actions'),
    })
  } })
  app.mount(element)
  try {
    const panel = element.querySelector('[data-testid="task-loading"]')!
    expect(panel.getAttribute('aria-busy')).toBe('true')
    expect(element.querySelector('[role="status"]')).not.toBeNull()
    expect(element.querySelector('[data-loading-title]')!.textContent).toBe('Task title')
    expect(element.querySelector('[data-loading-actions]')).not.toBeNull()
    failed.value = true
    await nextTick()
    expect(panel.getAttribute('aria-busy')).toBe('false')
    expect(element.querySelector('[role="alert"]')).not.toBeNull()
    expect(element.querySelector('[data-loading-title]')).not.toBeNull()
    element.querySelector<HTMLButtonElement>('[role="alert"] button')!.click()
    expect(retry).toHaveBeenCalledOnce()
  }
  finally {
    app.unmount()
  }
})
