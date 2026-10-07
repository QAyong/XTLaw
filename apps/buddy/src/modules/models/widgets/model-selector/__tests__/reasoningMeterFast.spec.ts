// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, shallowReactive } from 'vue'
import DesktopReasoningMeter from '../DesktopReasoningMeter.vue'

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

describe('reasoning meter fast particles', () => {
  it('shows particles only in the blue fill while fast mode is enabled', async () => {
    const props = shallowReactive({
      fast: false,
      label: 'Reasoning',
      options: [{ value: 'low' as const, label: 'Low' }, { value: 'high' as const, label: 'High' }],
      selectedEffort: 'high' as const,
    })
    const root = document.createElement('div')
    document.body.append(root)
    const app = createApp({ setup: () => () => h(DesktopReasoningMeter, props) })
    app.mount(root)
    cleanups.push(() => {
      app.unmount()
      root.remove()
    })
    expect(root.querySelector('.desktop-reasoning-meter__particles')).toBeNull()
    const fillWidth = root.querySelector<HTMLElement>('.desktop-reasoning-meter__fill')!.style.width
    props.fast = true
    await nextTick()
    expect(root.querySelectorAll('.desktop-reasoning-meter__fill .desktop-reasoning-meter__particle')).toHaveLength(16)
    expect(root.querySelector<HTMLElement>('.desktop-reasoning-meter__fill')!.style.width).toBe(fillWidth)
    expect(root.querySelector<HTMLInputElement>('input')!.value).toBe('1')
    props.fast = false
    await nextTick()
    expect(root.querySelector('.desktop-reasoning-meter__particles')).toBeNull()
  })
})
