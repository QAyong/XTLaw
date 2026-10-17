// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import DesktopSelect from '../DesktopSelect.vue'

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value() {} })
  vi.stubGlobal('matchMedia', (media: string) => ({
    matches: false,
    media,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  }))
})

const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()))

async function mount(controlled = false) {
  const root = document.createElement('div')
  document.body.append(root)
  const show = shallowRef(controlled ? true : undefined)
  const value = shallowRef<string | null>('apple')
  const events: boolean[] = []
  const aliases: boolean[] = []
  const app = createApp(defineComponent({ setup: () => () => h(DesktopSelect, {
    'data-testid': 'select',
    'show': show.value,
    'value': value.value,
    'filterable': true,
    'clearable': true,
    'options': [{ label: 'Apple', value: 'apple' }, { label: 'Apricot', value: 'apricot' }],
    'onUpdate:show': next => events.push(next),
    'onUpdateShow': next => aliases.push(next),
    'onUpdate:value': (next) => { value.value = next },
  }) }))
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  await nextTick()
  return {
    root,
    show,
    value,
    events,
    aliases,
    input: () => root.querySelector('input')!,
    click: async (selector: string) => {
      root.querySelector<HTMLElement>(selector)!.click()
      await nextTick()
    },
  }
}

it('toggles from the non-input trigger and notifies both supported show listeners once', async () => {
  const f = await mount()
  expect(f.root.querySelector('[data-testid="select"]')).not.toBeNull()
  await f.click('.n-base-selection')
  await f.click('.n-base-selection')
  expect(f.events).toEqual([true, false])
  expect(f.aliases).toEqual([true, false])
})

it('preserves search editing and clears the selected value while the menu is open', async () => {
  const f = await mount()
  await f.click('.n-base-selection')
  f.input().value = 'Ap'
  f.input().dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  await f.click('input')
  expect(f.input().value).toBe('Ap')
  expect(f.events).toEqual([true])
  await f.click('[data-clear]')
  expect(f.value.value).toBeNull()
  expect(f.events).toEqual([true, false])
  expect(f.aliases).toEqual([true, false])
})

it('keeps an externally controlled menu open until its owner accepts the close request', async () => {
  const f = await mount(true)
  await f.click('.n-base-selection')
  expect(f.events).toEqual([false])
  await f.click('.n-base-selection')
  expect(f.events).toEqual([false, false])
  f.show.value = false
  await nextTick()
  await f.click('.n-base-selection')
  expect(f.events).toEqual([false, false, true])
})
