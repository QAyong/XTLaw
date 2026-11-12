// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, h } from 'vue'
import type { VNodeChild } from 'vue'
import DesktopTaskRow from '../DesktopTaskRow.vue'

vi.mock('@/modules/tasks/taskContext', () => ({
  useTaskEnvironment: () => ({
    clipboard: { writeText: async () => {} },
    conversationExport: { busy: { value: false }, copy: async () => true },
  }),
}))
vi.mock('../useTaskHistoryDrag', () => ({ useTaskHistoryDrag: () => {} }))
vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>()
  const { defineComponent, h: createElement } = await import('vue')
  const NDropdown = defineComponent({
    name: 'NDropdownTestStub',
    props: { options: { type: Array, default: () => [] }, trigger: { type: String, default: 'click' } },
    emits: ['select'],
    setup(props, { emit, slots }) {
      return () => createElement('div', { class: 'test-dropdown' }, [
        slots.default?.(),
        props.trigger === 'click'
          ? createElement('div', { class: 'test-dropdown-options' }, (props.options as Array<{ key?: string, label?: string | (() => VNodeChild), type?: string, disabled?: boolean }>).map(option => option.type === 'divider'
            ? createElement('hr')
            : createElement('button', {
                type: 'button',
                'data-dropdown-key': option.key,
                disabled: option.disabled,
                onClick: () => emit('select', option.key),
              }, [typeof option.label === 'function' ? option.label() : option.label])))
          : null,
      ])
    },
  })
  const NTooltip = defineComponent({
    name: 'NTooltipTestStub',
    setup(_, { slots }) {
      return () => createElement('span', {}, slots.trigger?.() ?? slots.default?.())
    },
  })
  return { ...actual, NDropdown, NTooltip, useMessage: () => ({ loading: () => ({ destroy() {} }), success() {}, error() {} }) }
})

const cleanups: (() => void)[] = []
afterEach(() => {
  cleanups.splice(0).forEach(cleanup => cleanup())
  document.body.innerHTML = ''
})

async function mount() {
  const archived = vi.fn()
  const deleted = vi.fn()
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(DesktopTaskRow, {
    taskId: 'task-one',
    active: false,
    marks: [],
    marksBusy: false,
    activity: 'idle',
    language: 'zh-CN',
    now: Date.now(),
    occurredAt: '2026-11-01T00:00:00Z',
    title: '测试任务',
    onArchive: archived,
    onDelete: deleted,
  }) })
  app.mount(root)
  cleanups.push(() => app.unmount())
  await Promise.resolve()
  return { root, archived, deleted }
}

it('replaces the inline trash action with direct archive and keeps its existing row position', async () => {
  const f = await mount()
  const archive = f.root.querySelector<HTMLButtonElement>('button[aria-label="归档"]')!
  expect(archive).toBeDefined()
  expect(f.root.querySelector('button[aria-label="删除"]')).toBeNull()
  archive.click()
  expect(f.archived).toHaveBeenCalledOnce()
  expect(f.deleted).not.toHaveBeenCalled()
})

it('keeps permanent deletion at the bottom of the shared menu and routes it to the confirmation owner', async () => {
  const f = await mount()
  const options = f.root.querySelector<HTMLElement>('.test-dropdown-options')!
  const labels = [...options.querySelectorAll('button')].map(button => button.textContent?.trim())
  expect(labels).toContain('归档')
  expect(labels).toContain('永久删除…')
  expect(options.textContent?.indexOf('归档')).toBeLessThan(options.textContent?.indexOf('永久删除…') ?? -1)
  const deleteAction = options.querySelector<HTMLButtonElement>('[data-dropdown-key="delete"]')!
  deleteAction.click()
  expect(f.deleted).toHaveBeenCalledOnce()
  expect(f.archived).not.toHaveBeenCalled()
})
