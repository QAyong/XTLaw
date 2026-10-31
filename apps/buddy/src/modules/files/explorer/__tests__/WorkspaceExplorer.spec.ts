// @vitest-environment jsdom
import type { ExplorerNode } from '@/shared/ui/explorer/treeCollection'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import WorkspaceExplorer from '../WorkspaceExplorer.vue'

const { command, state } = vi.hoisted(() => ({ command: vi.fn(), state: {} as { busy: { value: unknown }, error: { value: unknown } } }))
const node: ExplorerNode = { key: 'note.md', label: 'note.md', kind: 'file' }

vi.mock('../useExplorerCommands', async () => {
  const { shallowRef } = await import('vue')
  state.busy = shallowRef(null)
  state.error = shallowRef(null)
  return {
    useExplorerCommands: () => ({
      labels: shallowRef({ busy: 'busy', close: 'close' }),
      busy: state.busy,
      error: state.error,
      nameRequest: shallowRef(null),
      clipboard: shallowRef(null),
      command,
    }),
  }
})
vi.mock('@/platform/desktop/desktopCapabilities', () => ({
  loadDesktopAppInfo: async () => ({ platform: 'win32' }),
}))
vi.mock('@/shared/ui/explorer/ExplorerTree.vue', () => ({
  default: defineComponent({
    emits: ['contextmenu'],
    setup(_, { emit }) {
      return () => h('div', {
        'data-testid': 'tree',
        'onContextmenu': (event: MouseEvent) => emit('contextmenu', node, event),
      })
    },
  }),
}))
vi.mock('naive-ui', () => ({
  NDropdown: defineComponent({
    props: { show: Boolean, x: Number, y: Number, options: Array },
    emits: ['clickoutside', 'select'],
    setup(props, { emit }) {
      return () => h('div', {
        'data-testid': 'dropdown',
        'data-show': String(props.show),
        'data-x': props.x,
        'data-y': props.y,
      }, [
        h('button', { class: 'outside', onClick: () => emit('clickoutside') }),
        h('button', { class: 'select', onClick: () => emit('select', 'copy') }),
      ])
    },
  }),
  NSpin: defineComponent({ render: () => null }),
  NIcon: defineComponent({ render: () => null }),
}))
vi.mock('../ExplorerNameDialog.vue', () => ({ default: defineComponent({ render: () => null }) }))
vi.mock('../ExplorerRecovery.vue', () => ({ default: defineComponent({ render: () => null }) }))

function mountExplorer() {
  const root = document.createElement('div')
  const app = createApp({
    render: () => h(WorkspaceExplorer, {
      nodes: [node],
      loadingKeys: new Set<string>(),
      expandedKeys: [],
      target: { spaceId: 'space', directoryId: 'directory', revision: 1, path: '' },
      language: 'zh-CN',
      api: {
        revealFile: vi.fn(),
        fileHistory: vi.fn().mockResolvedValue([]),
        acknowledgeFileOperation: vi.fn(),
        cancelFileOperation: vi.fn(),
        onFilesChanged: () => () => {},
      },
      load: async () => {},
      refresh: async () => {},
    }),
  })
  app.mount(root)
  return { root, app }
}

describe('workspace explorer notices', () => {
  it('shows the busy notice only for slow operations and dismisses errors on a timer', async () => {
    vi.useFakeTimers()
    const { root, app } = mountExplorer()
    try {
      state.busy.value = { operation: 'trash' }
      await nextTick()
      vi.advanceTimersByTime(300)
      await nextTick()
      expect(root.querySelector('[role="status"]')).toBeNull()
      vi.advanceTimersByTime(150)
      await nextTick()
      expect(root.querySelector('[role="status"]')).not.toBeNull()
      state.busy.value = null
      await nextTick()

      state.error.value = 'failed'
      await nextTick()
      expect(root.querySelector('[role="alert"]')).not.toBeNull()
      vi.advanceTimersByTime(6000)
      await nextTick()
      expect(state.error.value).toBe('')
    }
    finally {
      app.unmount()
      vi.useRealTimers()
    }
  })
})

describe('workspace explorer context menu position', () => {
  it.each(['outside', 'select'])('preserves the leave-transition anchor after %s and repositions on reopen', async (action) => {
    command.mockClear()
    const root = document.createElement('div')
    const app = createApp({
      render: () => h(WorkspaceExplorer, {
        nodes: [node],
        loadingKeys: new Set<string>(),
        expandedKeys: [],
        target: { spaceId: 'space', directoryId: 'directory', revision: 1, path: '' },
        language: 'zh-CN',
        api: {
          revealFile: vi.fn(),
          fileHistory: vi.fn().mockResolvedValue([]),
          acknowledgeFileOperation: vi.fn(),
          cancelFileOperation: vi.fn(),
          onFilesChanged: () => () => {},
        },
        load: async () => {},
        refresh: async () => {},
      }),
    })
    app.mount(root)
    try {
      const tree = root.querySelector('[data-testid="tree"]')!
      const dropdown = root.querySelector('[data-testid="dropdown"]')!
      tree.dispatchEvent(new MouseEvent('contextmenu', { clientX: 320, clientY: 240 }))
      await nextTick()
      expect(dropdown.getAttribute('data-show')).toBe('true')
      expect(dropdown.getAttribute('data-x')).toBe('320')
      expect(dropdown.getAttribute('data-y')).toBe('240')

      root.querySelector<HTMLButtonElement>(`.${action}`)!.click()
      await nextTick()
      expect(dropdown.getAttribute('data-show')).toBe('false')
      expect(dropdown.getAttribute('data-x')).toBe('320')
      expect(dropdown.getAttribute('data-y')).toBe('240')
      if (action === 'select')
        expect(command).toHaveBeenCalledWith('copy', node)
      else
        expect(command).not.toHaveBeenCalled()

      tree.dispatchEvent(new MouseEvent('contextmenu', { clientX: 480, clientY: 360 }))
      await nextTick()
      expect(dropdown.getAttribute('data-show')).toBe('true')
      expect(dropdown.getAttribute('data-x')).toBe('480')
      expect(dropdown.getAttribute('data-y')).toBe('360')
    }
    finally {
      app.unmount()
    }
  })
})
