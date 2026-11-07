// @vitest-environment jsdom
import type { LexoraConfigPatch } from '@buddy-electron/shared/desktopApi'
import { join } from 'node:path'
import { LexoraConfigStore } from '@buddy-electron/main/config/LexoraConfigStore'
import { createTemporaryDirectory } from '@buddy-tests/temporaryDirectories'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import DesktopAppearanceSettings from '../DesktopAppearanceSettings.vue'

const feedback = vi.hoisted(() => ({ error: vi.fn() }))
vi.mock('naive-ui', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    useMessage: () => feedback,
    NSelect: defineComponent({
      props: ['options', 'value', 'disabled', 'loading'],
      emits: ['update:value'],
      setup: (props, { emit }) => () => h('select', {
        value: props.value,
        disabled: props.disabled,
        onChange: (event: Event) => emit('update:value', (event.target as HTMLSelectElement).value),
      }, props.options.map((option: { value: string, label: string }) => h('option', { value: option.value }, option.label))),
    }),
  }
})
vi.mock('../DesktopThemeSettings.vue', () => ({ default: { render: () => null } }))
vi.mock('../DesktopFileIconSettings.vue', () => ({ default: { render: () => null } }))
vi.mock('../DesktopTypographySettings.vue', () => ({ default: { render: () => null } }))
vi.mock('../DesktopWelcomeSettings.vue', () => ({ default: { render: () => null } }))

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  feedback.error.mockClear()
})

async function mount(updateSettings: (patch: LexoraConfigPatch) => Promise<boolean> = async () => true) {
  const directory = await createTemporaryDirectory('reading-width-ui-')
  const config = await new LexoraConfigStore({ configPath: join(directory, 'config.toml') }).read()
  const root = document.createElement('div')
  document.body.append(root)
  const update = vi.fn(updateSettings)
  const app = createApp(() => h(DesktopAppearanceSettings, { config, language: 'zh-CN', error: null, updateSettings: update }))
  app.mount(root)
  cleanups.push(() => { app.unmount(); root.remove() })
  const select = root.querySelector<HTMLSelectElement>('[data-testid="chat-reading-width"] select')!
  return { root, select, update }
}

function choose(select: HTMLSelectElement, value: string) {
  select.value = value
  select.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('appearance reading width setting', () => {
  it('shows localized presets and saves only the selected reading preference', async () => {
    const { select, update } = await mount()
    expect(select.value).toBe('standard')
    expect([...select.options].map(option => [option.value, option.textContent])).toEqual([
      ['narrow', '窄'], ['standard', '标准'], ['wide', '宽'],
    ])
    expect(select.getAttribute('aria-labelledby')).toBe('chat-reading-width-label')
    choose(select, 'wide')
    await nextTick()
    expect(update).toHaveBeenCalledExactlyOnceWith({ desktop: { chat: { readingWidth: 'wide' } } })
    expect(feedback.error).not.toHaveBeenCalled()
  })

  it('disables the control while saving and allows another attempt after a failed save', async () => {
    let finish!: (saved: boolean) => void
    const { select, update } = await mount(() => new Promise(resolve => { finish = resolve }))
    choose(select, 'narrow')
    await nextTick()
    expect(select.disabled).toBe(true)
    finish(false)
    await Promise.resolve()
    await nextTick()
    expect(select.disabled).toBe(false)
    expect(feedback.error).toHaveBeenCalledOnce()
    choose(select, 'wide')
    expect(update).toHaveBeenCalledTimes(2)
    finish(true)
    await Promise.resolve()
    await nextTick()
  })
})
