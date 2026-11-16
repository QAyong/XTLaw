// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installOfficeToolbarNavigation as pdf } from '../../../plugins/office-pdf/office-toolbar-navigation.js'
import { installOfficeToolbarNavigation as pptx } from '../../../plugins/office-pptx/office-toolbar-navigation.js'
import { installOfficeToolbarNavigation as xlsx } from '../../../plugins/office-xlsx/office-toolbar-navigation.js'
import { installOfficeToolbarNavigation as docx } from '../../../plugins/office/office-toolbar-navigation.js'

const partial = 'pi-office-toolbar-partial-item'
let frames
let dispose

beforeEach(() => {
  frames = new Map()
  let nextFrame = 0
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    frames.set(++nextFrame, callback)
    return nextFrame
  })
  vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id))
  vi.stubGlobal('MutationObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  })
  vi.spyOn(HTMLElement.prototype, 'offsetParent', 'get').mockImplementation(function () {
    return this.parentElement
  })
})

afterEach(() => {
  dispose?.()
  dispose = null
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function refresh() {
  window.dispatchEvent(new Event('resize'))
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) callback(0)
}

function bounds(element, left, width, container, fixed = false) {
  element.getBoundingClientRect = () => {
    const x = left - (fixed ? 0 : container?.scrollLeft ?? 0)
    return { x, y: 0, left: x, right: x + width, top: 0, bottom: 28, width, height: 28 }
  }
}

function toolbar(kind, install) {
  const root = document.createElement('main')
  const host = document.createElement('div')
  host.className = kind === 'xlsx' ? 'excel-header' : 'ribbon'
  host.innerHTML = '<div class="ribbon-tabs"><button class="ribbon-tab active">Home</button></div>'
  const body = document.createElement('div')
  body.className = kind === 'xlsx' ? 'ribbon' : 'ribbon-body'
  body.innerHTML = '<div class="ribbon-group"><button id="first">First</button><div class="menu-select-cover" style="position:absolute"><button id="edge">Menu trigger</button></div></div><div class="ribbon-group"><button id="last">Last</button></div>'
  host.append(body)
  root.append(host)
  document.body.append(root)
  Object.defineProperties(body, { clientWidth: { value: 180 }, scrollWidth: { value: 400 } })
  body.scrollLeft = 0
  body.scrollTo = ({ left }) => {
    body.scrollLeft = left
    body.dispatchEvent(new Event('scroll'))
  }
  bounds(body, 0, 180)
  bounds(body.children[0], 0, 210, body)
  bounds(body.children[1], 300, 60, body)
  bounds(body.querySelector('#first'), 10, 40, body)
  bounds(body.querySelector('#edge'), 160, 50, body)
  bounds(body.querySelector('#last'), 300, 60, body)
  dispose = install(root, new AbortController().signal)
  refresh()
  return { root, host, body }
}

for (const [kind, install] of Object.entries({ docx, pptx, xlsx, pdf })) {
  describe(`${kind} toolbar popup boundaries`, () => {
    it('keeps real commands paged, including absolute-positioned menu triggers', () => {
      const { host, body } = toolbar(kind, install)
      expect(body.querySelector('#first').classList.contains(partial)).toBe(false)
      expect(body.querySelector('#edge').classList.contains(partial)).toBe(true)
      expect(body.querySelector('#last').classList.contains(partial)).toBe(true)
      const next = host.querySelector('.pi-office-toolbar-nav-next')
      expect(next.disabled).toBe(false)
      next.click()
      expect(body.scrollLeft).toBe(160)
      expect(body.querySelector('#edge').classList.contains(partial)).toBe(true)
      next.click()
      expect(body.scrollLeft).toBe(220)
      expect(body.querySelector('#last').classList.contains(partial)).toBe(false)
      expect(next.disabled).toBe(true)
    })

    it.each(['layout-menu', 'rb-drop', 'menu-select-drop', 'custom-popup'])('does not hide nested controls in a fixed %s popup', (className) => {
      const { body, host } = toolbar(kind, install)
      const popup = document.createElement('div')
      popup.className = className
      popup.style.position = 'fixed'
      popup.innerHTML = `<div><button class="${partial}">Left choice</button><input class="${partial}"><button>Right choice</button></div>`
      body.children[0].append(popup)
      const controls = [...popup.querySelectorAll('button, input')]
      controls.forEach((control, index) => bounds(control, index === 0 ? -30 : 190, 100, body, true))
      refresh()
      for (const control of controls) expect(control.classList.contains(partial)).toBe(false)
      expect(body.querySelector('#edge').classList.contains(partial)).toBe(true)
      host.querySelector('.pi-office-toolbar-nav-next').click()
      expect(body.scrollLeft).toBe(160)
    })
  })
}
