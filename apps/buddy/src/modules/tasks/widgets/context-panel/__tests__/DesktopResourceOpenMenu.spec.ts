// @vitest-environment jsdom
import type { TaskChatWorkspace } from '@/modules/tasks/contracts'
import type { ResourceOpenTarget } from '@/modules/tasks/model/context-panel/resourceOpenTarget'
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import DesktopResourceOpenMenu from '../DesktopResourceOpenMenu.vue'

const messages = vi.hoisted(() => ({ warning: vi.fn(), error: vi.fn() }))
vi.mock('naive-ui', async (original) => {
  const actual = await original<typeof import('naive-ui')>()
  const { defineComponent, h } = await import('vue')
  return { ...actual, useMessage: () => messages, NDropdown: defineComponent({
    props: ['options', 'show', 'disabled'],
    emits: ['select', 'update:show'],
    setup(props, { emit, slots }) {
      return () => h('div', { 'data-menu-open': String(props.show) }, [
        h('div', { onClick: () => !props.disabled && emit('update:show', !props.show) }, slots.default?.()),
        ...props.options.map((option: { key: string, label: string, disabled: boolean, icon?: unknown }) => h('button', { 'data-action': option.key, 'data-has-icon': String(Boolean(option.icon)), 'disabled': props.disabled || option.disabled, 'onClick': () => emit('select', option.key) }, option.label)),
      ])
    },
  }) }
})
const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  vi.clearAllMocks()
})
async function flush() {
  await Promise.resolve()
  await nextTick()
  await nextTick()
}
function fixture(initial: ResourceOpenTarget | null) {
  const target = shallowRef(initial)
  const revealFile = vi.fn().mockResolvedValue(undefined)
  const openArtifact = vi.fn().mockResolvedValue({ status: 'opened' })
  const context = { files: { revealFile, listDirectory: vi.fn(), readFile: vi.fn() }, openArtifact } satisfies Pick<TaskChatWorkspace['context'], 'files' | 'openArtifact'>
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(DesktopResourceOpenMenu, { target: target.value, context, language: 'zh-CN' }) })
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  return { target, revealFile, openArtifact, root, action: (key: string) => root.querySelector<HTMLButtonElement>(`[data-action="${key}"]`) }
}
const artifact: ResourceOpenTarget = { key: 'report-1', kind: 'artifact', artifact: { conversationId: 'conversation-1', artifactId: 'report-1' }, file: true }

it('shows two actions and opens the bound directory for both, without opening a selected file', async () => {
  const directory = { spaceId: 'space-1', directoryId: 'directory-1', revision: 1, path: '' }
  const f = fixture({ key: 'directory', kind: 'directory', directory })
  expect(f.action('open')?.textContent).toBe('默认应用打开')
  expect(f.action('reveal')?.textContent).toBe('文件夹打开')
  expect(f.action('open')?.getAttribute('data-has-icon')).toBe('false')
  expect(f.action('reveal')?.getAttribute('data-has-icon')).toBe('false')
  const trigger = f.root.querySelector<HTMLButtonElement>('[data-testid="resource-open-menu"]')!
  expect(trigger.textContent?.trim()).toBe('')
  expect(trigger.querySelectorAll('svg')).toHaveLength(1)
  expect(trigger.getAttribute('title')).toBe('打开当前标签资源')
  f.action('open')!.click()
  await flush()
  f.action('reveal')!.click()
  await flush()
  expect(f.revealFile.mock.calls).toEqual([[directory], [directory]])
  expect(f.openArtifact).not.toHaveBeenCalled()
  expect(f.action('choose-app')).toBeNull()
})

it('offers a chooser after failed default open and allows reveal or cancellation', async () => {
  const f = fixture(artifact)
  f.openArtifact.mockResolvedValueOnce({ status: 'choose-app' })
  f.action('open')!.click()
  await flush()
  expect(messages.warning).toHaveBeenCalledOnce()
  expect(f.action('choose-app')?.textContent).toBe('选择其他应用')
  expect(f.action('choose-app')?.getAttribute('data-has-icon')).toBe('false')
  f.action('reveal')!.click()
  await flush()
  expect(f.openArtifact).toHaveBeenLastCalledWith({ conversationId: 'conversation-1', artifactId: 'report-1', action: 'reveal' })
  f.openArtifact.mockResolvedValueOnce({ status: 'cancelled' })
  f.action('choose-app')!.click()
  await flush()
  expect(f.openArtifact).toHaveBeenLastCalledWith({ conversationId: 'conversation-1', artifactId: 'report-1', action: 'choose-app' })
  expect(messages.error).not.toHaveBeenCalled()
})

it('disables unsupported targets and discards a late fallback when the tab changes', async () => {
  const f = fixture(null)
  expect(f.root.querySelector<HTMLButtonElement>('[data-testid="resource-open-menu"]')!.disabled).toBe(true)
  f.target.value = artifact
  await flush()
  let complete!: (result: { status: string }) => void
  f.openArtifact.mockImplementationOnce(() => new Promise(resolve => complete = resolve))
  f.action('open')!.click()
  await flush()
  expect(f.root.querySelector<HTMLButtonElement>('[data-testid="resource-open-menu"]')!.disabled).toBe(true)
  f.target.value = { ...artifact, key: 'report-2' }
  await flush()
  complete({ status: 'choose-app' })
  await flush()
  expect(f.action('choose-app')).toBeNull()
  expect(messages.warning).not.toHaveBeenCalled()
  expect(f.root.querySelector('[data-menu-open]')!.getAttribute('data-menu-open')).toBe('false')
})

it('reports open failures without treating missing files as an application association problem', async () => {
  const f = fixture(artifact)
  f.openArtifact.mockRejectedValueOnce(new Error('ARTIFACT_NOT_FOUND'))
  f.action('open')!.click()
  await flush()
  expect(messages.error).toHaveBeenCalledOnce()
  expect(f.action('choose-app')).toBeNull()
})
