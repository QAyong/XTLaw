// @vitest-environment jsdom
import type { ExplorerNode } from '../treeCollection'
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import ExplorerTree from '../ExplorerTree.vue'

// The virtual list probes touch support and watches its size; jsdom provides neither.
window.matchMedia ??= (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
Element.prototype.scrollTo ??= () => {}

const unloaded = (key: string): ExplorerNode => ({ key, label: key.split('/').at(-1)!, kind: 'directory' })

function mount() {
  const nodes = shallowRef<ExplorerNode[]>([unloaded('src')])
  const expandedKeys = shallowRef<string[]>([])
  const reveal = shallowRef<{ path: string, token: string } | undefined>()
  const loaded: string[] = []
  // Folders load like the file manager does: children arrive after the folder is clicked.
  const load = async (node: ExplorerNode) => {
    loaded.push(node.key)
    const children = node.key === 'src' ? [unloaded('src/utils')] : node.key === 'src/utils' ? [{ key: 'src/utils/math.ts', label: 'math.ts', kind: 'file' as const }] : []
    const fill = (items: readonly ExplorerNode[]): ExplorerNode[] => items.map(item => item.key === node.key ? { ...item, children } : { ...item, children: item.children && fill(item.children) })
    nodes.value = fill(nodes.value)
  }
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    render: () => h(ExplorerTree, {
      'language': 'zh-CN',
      'nodes': nodes.value,
      'selectedKey': null,
      'expandedKeys': expandedKeys.value,
      'onUpdate:expandedKeys': (value: string[]) => { expandedKeys.value = value },
      'load': load,
      'reveal': reveal.value,
    }),
  })
  app.mount(root)
  const focused = () => root.querySelector('[role="tree"]')?.getAttribute('aria-activedescendant') ?? ''
  const treeHasFocus = () => root.querySelector('[role="tree"]') === document.activeElement
  return { app, expandedKeys, focused, loaded, reveal, treeHasFocus }
}

describe('explorer tree reveal', () => {
  it('opens each folder on the way down as a click would, then focuses the last one', async () => {
    const tree = mount()
    tree.reveal.value = { path: 'src/utils', token: 'one' }
    await vi.waitFor(() => expect(tree.expandedKeys.value).toEqual(['src', 'src/utils']))
    expect(tree.loaded).toEqual(['src', 'src/utils'])
    await vi.waitFor(() => expect(decodeURIComponent(tree.focused())).toMatch(/src\/utils$/))
    expect(tree.treeHasFocus()).toBe(true)
    tree.app.unmount()
  })

  it('opens the folder again for a new request after the user closed it, but not for the same one', async () => {
    const tree = mount()
    tree.reveal.value = { path: 'src', token: 'one' }
    await vi.waitFor(() => expect(tree.expandedKeys.value).toEqual(['src']))
    tree.expandedKeys.value = []
    await nextTick()
    await nextTick()
    expect(tree.expandedKeys.value).toEqual([])
    tree.reveal.value = { path: 'src', token: 'two' }
    await vi.waitFor(() => expect(tree.expandedKeys.value).toEqual(['src']))
    tree.app.unmount()
  })
})
