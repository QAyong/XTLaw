// @vitest-environment jsdom
import type { LocalConversationSummary } from '@buddy-shared/conversation/conversationApi'
import { NMessageProvider } from 'naive-ui'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, shallowReactive } from 'vue'
import { deferred } from '../../../../../../__tests__/deferred'
import DesktopTaskMoveToSpaceDialog from '../DesktopTaskMoveToSpaceDialog.vue'

vi.hoisted(() => {
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: new DOMRect(0, 0, 400, 272) } as ResizeObserverEntry], this as unknown as ResizeObserver)
    }

    unobserve() {}
    disconnect() {}
  })
})

const cleanups: (() => void)[] = []
beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value() {} })
  vi.stubGlobal('matchMedia', (media: string) => ({ matches: false, media, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => true }))
})
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

function task(): LocalConversationSummary {
  return { id: 'task-one', title: 'A task to keep', buddyId: 'buddy-one', activeBranchId: 'branch-one', approvalPolicy: 'manual', executionProfile: 'workspace_write', modelSelection: null, spaceId: null, activity: 'idle', automationOccurrence: null, createdAt: '2026-09-08T00:00:00.000Z', updatedAt: '2026-09-08T00:00:00.000Z', deletedAt: null }
}

async function mount() {
  const props = shallowReactive({ busy: false, language: 'zh-CN' as const, show: true, spaces: [{ id: 'home', name: 'Home' }, { id: 'project', name: 'Project' }], task: task() as LocalConversationSummary | null })
  const move = vi.fn<(taskId: string, spaceId: string) => Promise<boolean>>().mockResolvedValue(true)
  const moved: string[] = []
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({
    setup: () => () => h(NMessageProvider, null, {
      default: () => h(DesktopTaskMoveToSpaceDialog, { ...props, 'moveTaskToSpace': move, 'onUpdate:show': (show: boolean) => props.show = show, 'onMoved': (spaceId: string) => moved.push(spaceId) }),
    }),
  })
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  await nextTick()
  const dialog = () => document.querySelector<HTMLElement>('.desktop-task-move-dialog')!
  const button = (label: string) => [...dialog().querySelectorAll('button')].find(item => item.textContent?.trim() === label)!
  const select = async (name: string) => {
    dialog().querySelector<HTMLElement>('.n-base-selection')!.click()
    await nextTick()
    const option = [...document.querySelectorAll<HTMLElement>('.n-base-select-option')].find(item => item.textContent?.trim() === name)!
    expect(option).toBeDefined()
    option.click()
    await nextTick()
  }
  return { props, move, moved, dialog, button, select }
}

describe('move task into a space dialog', () => {
  it('requires a searchable explicit selection and explains the permission and file boundaries', async () => {
    const f = await mount()
    expect(f.button('移入').disabled).toBe(true)
    expect(f.dialog().textContent).toContain('原目录授权不再沿用')
    expect(f.dialog().textContent).toContain('文件不搬迁')
    expect(f.dialog().textContent).toContain('暂不支持移出空间')
    f.dialog().querySelector<HTMLElement>('.n-base-selection')!.click()
    await nextTick()
    const input = f.dialog().querySelector<HTMLInputElement>('input')!
    input.value = 'Project'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    const options = [...document.querySelectorAll<HTMLElement>('.n-base-select-option')]
    expect(options.map(option => option.textContent?.trim())).toEqual(['Project'])
    options[0]!.click()
    await nextTick()
    expect(f.button('移入').disabled).toBe(false)
    expect(f.move.mock.calls).toEqual([])
  })

  it('cancels without moving and requires a new selection when reopened', async () => {
    const f = await mount()
    await f.select('Home')
    f.button('取消').click()
    await nextTick()
    expect(f.props.show).toBe(false)
    expect(f.move.mock.calls).toEqual([])
    f.props.show = true
    await nextTick()
    expect(f.button('移入').disabled).toBe(true)
  })

  it.each(['false', 'throw'] as const)('keeps the selected target on %s failure and only retries explicitly', async (failure) => {
    const f = await mount()
    const pending = deferred<boolean>()
    f.move.mockReturnValueOnce(pending.promise)
    await f.select('Project')
    f.button('移入').click()
    f.button('移入').click()
    await nextTick()
    expect(f.button('移入').disabled).toBe(true)
    expect(f.button('取消').disabled).toBe(true)
    expect(f.move.mock.calls).toEqual([['task-one', 'project']])
    if (failure === 'false')
      pending.resolve(false)
    else
      pending.reject(new Error('LEXORA_LOCAL_CHAT_ERROR:CONVERSATION_QUEUE_NOT_EMPTY:0'))
    await pending.promise.catch(() => {})
    await nextTick()
    expect(f.props.show).toBe(true)
    expect(f.dialog().textContent).toContain('Project')
    expect(f.button('移入').disabled).toBe(false)
    expect(f.moved).toEqual([])
    expect(document.body.textContent).toContain(failure === 'false' ? '移入失败，请重试' : '请先发送或取消待发消息')
    f.button('移入').click()
    await nextTick()
    expect(f.props.show).toBe(false)
    expect(f.moved).toEqual(['project'])
    expect(f.move.mock.calls).toEqual([['task-one', 'project'], ['task-one', 'project']])
  })

  it('revalidates busy status, task ownership, and target availability', async () => {
    const f = await mount()
    await f.select('Project')
    f.props.task = { ...task(), activity: 'running' }
    await nextTick()
    expect(f.button('移入').disabled).toBe(true)
    expect(f.dialog().textContent).toContain('任务正在执行')
    f.props.task = task()
    f.props.busy = true
    await nextTick()
    expect(f.button('移入').disabled).toBe(true)
    f.props.busy = false
    f.props.task = { ...task(), spaceId: 'another-space' }
    await nextTick()
    expect(f.button('移入').disabled).toBe(true)
    f.props.task = task()
    f.props.spaces = f.props.spaces.filter(item => item.id !== 'project')
    await nextTick()
    expect(f.button('移入').disabled).toBe(true)
    expect(f.move.mock.calls).toEqual([])
  })

  it('disables the selector and confirmation when no target remains', async () => {
    const f = await mount()
    f.props.spaces = []
    await nextTick()
    expect(f.button('移入').disabled).toBe(true)
    expect(f.dialog().textContent).toContain('暂无可用空间')
    f.button('移入').click()
    await nextTick()
    expect(f.move.mock.calls).toEqual([])
  })

  it('keeps the selection when the task and space names update', async () => {
    const f = await mount()
    await f.select('Project')
    f.props.task = { ...task(), title: 'Updated task title' }
    f.props.spaces = [{ id: 'project', name: 'Project updated' }]
    await nextTick()
    expect(f.dialog().textContent).toContain('Updated task title')
    expect(f.dialog().textContent).toContain('Project updated')
    expect(f.button('移入').disabled).toBe(false)
  })

  it('ignores a completed request belonging to a replaced dialog', async () => {
    const f = await mount()
    const pending = deferred<boolean>()
    f.move.mockReturnValueOnce(pending.promise)
    await f.select('Project')
    f.button('移入').click()
    await nextTick()
    f.props.task = { ...task(), id: 'task-two', title: 'Next task' }
    await nextTick()
    pending.resolve(true)
    await pending.promise
    await nextTick()
    expect(f.props.show).toBe(true)
    expect(f.dialog().textContent).toContain('Next task')
    expect(f.button('移入').disabled).toBe(true)
    expect(f.moved).toEqual([])
  })
})
