// Shapes the Slides editor's right-click menu for a selected element. Selecting one shape or picture lists about 30 entries and the
// menu has no height limit: the part below the window can neither be seen nor scrolled to (a wheel turn closes the menu). Entries
// the ribbon already offers are hidden, and the plain commands used now and then move into one "More actions" submenu. The items are
// React-owned: they are hidden, not removed, and the submenu forwards its clicks to them. Labels are matched by their zh and en
// wording (the plugin only follows those two languages); a label that no longer matches simply stays in the menu.

// In the ribbon: Arrange > Align / Rotate, Picture Format > Crop / Replace, Shape > Change Shape, Insert > Link, Review > New Comment.
const RIBBON_ENTRIES = new Set([
  '更改形状…', 'Change Shape…',
  '超链接…', 'Hyperlink…',
  '替换图片', 'Replace Picture',
  '裁剪图片', 'Crop Picture',
  '向左旋转 90°', 'Rotate Left 90°',
  '向右旋转 90°', 'Rotate Right 90°',
  '水平翻转', 'Flip Horizontal',
  '垂直翻转', 'Flip Vertical',
  '左对齐', 'Align Left',
  '水平居中', 'Align Center',
  '右对齐', 'Align Right',
  '顶对齐', 'Align Top',
  '垂直居中', 'Align Middle',
  '底对齐', 'Align Bottom',
  '横向分布', 'Distribute Horizontally',
  '纵向分布', 'Distribute Vertically',
  '新建批注', 'New Comment',
])

const MORE_ENTRIES = [
  ['另存为图片…', 'Save as Picture…'],
  ['去除背景', 'Remove Background'],
  ['设置为默认形状', 'Set as Default Shape'],
  ['编辑顶点', 'Edit Points'],
  ['文字顶端对齐', 'Align Text Top'],
  ['文字垂直居中', 'Center Text Vertically'],
  ['文字底端对齐', 'Align Text Bottom'],
]
const MORE_RANK = new Map(MORE_ENTRIES.flatMap((names, rank) => names.map(name => [name, rank])))

// Only the menu of a selected element (shape, picture, table, group) carries these; the text-editing and slide-thumbnail menus
// do not, and are left alone.
const OBJECT_MENU_MARKERS = new Set(['置于顶层', 'Bring to Front'])

const buttonOf = element => element.matches('button') ? element : element.querySelector(':scope > button')
const labelOf = element => buttonOf(element)?.firstElementChild?.textContent.trim() ?? ''
const hidden = element => element.style.display === 'none'

function shows(element, visible) {
  element.style.display = visible ? '' : 'none'
}

// Hides what the ribbon offers and collects the commands for "More actions" (sorted); returns null when this is not the menu of a
// selected element. Separators left with nothing on one side are hidden too.
export function reshapeMenu(menu) {
  const children = [...menu.children].filter(child => !child.classList.contains('office-quote-entry') && !child.classList.contains('office-more-entry'))
  if (!children.some(child => OBJECT_MENU_MARKERS.has(labelOf(child))))
    return null
  const more = []
  for (const child of children) {
    if (child.classList.contains('ctx-sep'))
      continue
    const label = labelOf(child)
    const button = buttonOf(child)
    if (MORE_RANK.has(label) && child === button) {
      more.push({ rank: MORE_RANK.get(label), label, disabled: button.disabled, pick: () => button.click() })
      shows(child, false)
    }
    else {
      shows(child, !RIBBON_ENTRIES.has(label))
    }
  }
  let sawItem = false
  let trailing = null
  for (const child of children) {
    if (child.classList.contains('ctx-sep')) {
      shows(child, sawItem)
      trailing = sawItem ? child : trailing
      sawItem = false
    }
    else if (!hidden(child)) {
      sawItem = true
      trailing = null
    }
  }
  if (trailing)
    shows(trailing, false)
  return more.sort((a, b) => a.rank - b.rank)
}

// The editor positions the popup from the height it had before the entries were hidden, and lets it run past the window. Put it
// back at the click when it fits, and make it scroll inside the window when it does not.
export function fitMenu(menu, wantedTop) {
  const margin = 8
  menu.style.maxHeight = ''
  menu.style.overflowY = ''
  menu.classList.remove('office-menu-scroll')
  // Still being measured off screen.
  const height = menu.offsetHeight
  const current = Number.parseFloat(menu.style.top)
  if (!height || !Number.isFinite(current) || current < -1000)
    return
  const room = window.innerHeight - margin * 2
  if (height > room + 1) {
    menu.style.maxHeight = `${room}px`
    menu.style.overflowY = 'auto'
    menu.classList.add('office-menu-scroll')
    menu.style.top = `${margin}px`
    return
  }
  const top = Number.isFinite(wantedTop) ? wantedTop : current
  menu.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - margin - height))}px`
}
