// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { fitMenu, reshapeMenu } from '../../../plugins/office-pptx/menu-shape.js'

afterEach(() => document.body.replaceChildren())

// The editor's menu: items are buttons, a submenu parent is a .ctx-sub-host around its button, groups are split by .ctx-sep.
function buildMenu(layout) {
  const menu = document.createElement('div')
  menu.className = 'ctx-menu'
  for (const entry of layout) {
    if (entry === null) {
      const sep = document.createElement('div')
      sep.className = 'ctx-sep'
      menu.append(sep)
      continue
    }
    const [label, { sub = false, disabled = false } = {}] = Array.isArray(entry) ? entry : [entry]
    const button = document.createElement('button')
    button.className = 'ctx-item'
    button.disabled = disabled
    button.innerHTML = `<span>${label}</span>`
    if (sub) {
      const host = document.createElement('div')
      host.className = 'ctx-sub-host'
      host.append(button)
      menu.append(host)
    }
    else {
      menu.append(button)
    }
  }
  document.body.append(menu)
  return menu
}

const zhPicture = ['剪切', '复制', '粘贴', null, ['组合', { sub: true }], ['置于顶层', { sub: true }], ['置于底层', { sub: true }], ['另存为图片…'], '超链接…', '替换图片', '裁剪图片', '去除背景', '大小和位置…', '设置图片格式', null, '向左旋转 90°', '向右旋转 90°', null, '水平翻转', '垂直翻转', null, '左对齐', '水平居中', '右对齐', '顶对齐', '垂直居中', '底对齐', null, '新建批注', null, '删除']
const enPicture = ['Cut', 'Copy', 'Paste', null, ['Group', { sub: true }], ['Bring to Front', { sub: true }], ['Send to Back', { sub: true }], 'Save as Picture…', 'Hyperlink…', 'Replace Picture', 'Crop Picture', 'Remove Background', 'Size and Position…', 'Format Picture', null, 'Rotate Left 90°', 'Flip Horizontal', null, 'Align Left', null, 'New Comment', null, 'Delete']

const shown = menu => [...menu.children].filter(child => child.style.display !== 'none').map(child => child.classList.contains('ctx-sep') ? '|' : child.textContent.trim())

describe('the PPTX editor right-click menu', () => {
  it('hides what the ribbon offers, and collects the occasional commands for More actions', () => {
    const menu = buildMenu(zhPicture)
    const more = reshapeMenu(menu)
    expect(shown(menu)).toEqual(['剪切', '复制', '粘贴', '|', '组合', '置于顶层', '置于底层', '大小和位置…', '设置图片格式', '|', '删除'])
    expect(more.map(line => line.label)).toEqual(['另存为图片…', '去除背景'])
  })

  it('matches the English wording too', () => {
    const menu = buildMenu(enPicture)
    const more = reshapeMenu(menu)
    expect(shown(menu)).toEqual(['Cut', 'Copy', 'Paste', '|', 'Group', 'Bring to Front', 'Send to Back', 'Size and Position…', 'Format Picture', '|', 'Delete'])
    expect(more.map(line => line.label)).toEqual(['Save as Picture…', 'Remove Background'])
  })

  it('forwards a More actions click to the hidden original item and keeps its disabled state', () => {
    const menu = buildMenu(['置于顶层', ['编辑顶点', { disabled: true }], '另存为图片…', null, '删除'])
    const clicks = []
    for (const button of menu.querySelectorAll('button'))
      button.addEventListener('click', () => clicks.push(button.textContent))
    const more = reshapeMenu(menu)
    expect(more.map(line => [line.label, line.disabled])).toEqual([['另存为图片…', false], ['编辑顶点', true]])
    more[0].pick()
    expect(clicks).toEqual(['另存为图片…'])
  })

  it('leaves the text-editing and thumbnail menus alone', () => {
    const menu = buildMenu(['剪切', '复制', '粘贴', null, '超链接…', '全选', null, '设置文本框格式'])
    expect(reshapeMenu(menu)).toBeNull()
    expect(shown(menu)).toEqual(['剪切', '复制', '粘贴', '|', '超链接…', '全选', '|', '设置文本框格式'])
  })

  it('drops a separator that ends up at either end or next to another', () => {
    const menu = buildMenu(['左对齐', null, '置于顶层', null, '水平翻转', null, '新建批注'])
    reshapeMenu(menu)
    expect(shown(menu)).toEqual(['置于顶层'])
  })

  it('keeps table cell merge and split in the menu and moves the vertical text alignment', () => {
    const menu = buildMenu(['在上方插入行', null, '向右合并', '文字顶端对齐', '文字垂直居中', '文字底端对齐', '拆分单元格', null, '置于顶层'])
    const more = reshapeMenu(menu)
    expect(shown(menu)).toEqual(['在上方插入行', '|', '向右合并', '拆分单元格', '|', '置于顶层'])
    expect(more.map(line => line.label)).toEqual(['文字顶端对齐', '文字垂直居中', '文字底端对齐'])
  })
})

describe('keeping the PPTX menu inside the window', () => {
  function sized(height, top) {
    const menu = document.createElement('div')
    menu.className = 'ctx-menu'
    menu.style.top = `${top}px`
    Object.defineProperty(menu, 'offsetHeight', { configurable: true, get: () => (menu.style.maxHeight ? Math.min(height, Number.parseFloat(menu.style.maxHeight)) : height) })
    document.body.append(menu)
    return menu
  }

  it('puts a menu that now fits back at the click, but not past the bottom', () => {
    window.innerHeight = 700
    const menu = sized(400, 0)
    fitMenu(menu, 120)
    expect(menu.style.top).toBe('120px')
    fitMenu(menu, 600)
    expect(menu.style.top).toBe('292px')
    expect(menu.classList.contains('office-menu-scroll')).toBe(false)
  })

  it('makes a menu that is still too tall scroll inside the window', () => {
    window.innerHeight = 300
    const menu = sized(500, 40)
    fitMenu(menu, 40)
    expect(menu.style.maxHeight).toBe('284px')
    expect(menu.style.overflowY).toBe('auto')
    expect(menu.style.top).toBe('8px')
    expect(menu.classList.contains('office-menu-scroll')).toBe(true)
    window.innerHeight = 700
    fitMenu(menu, 40)
    expect(menu.style.maxHeight).toBe('')
    expect(menu.classList.contains('office-menu-scroll')).toBe(false)
  })
})
