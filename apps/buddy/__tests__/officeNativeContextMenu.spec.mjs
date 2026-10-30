// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { suppressNativeContextMenu } from '../../../plugins/office/native-context-menu.js'

afterEach(() => document.body.replaceChildren())

function rightClick(target) {
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  return event
}

describe('the DOCX editor context menu', () => {
  it('cancels the default menu over the document but still lets the editor see the event', () => {
    document.body.innerHTML = '<div class="ProseMirror"><p id="text">Hello</p></div><input id="field">'
    const controller = new AbortController()
    suppressNativeContextMenu(controller.signal)
    let reached = false
    document.querySelector('.ProseMirror').addEventListener('contextmenu', () => {
      reached = true
    })
    expect(rightClick(document.getElementById('text')).defaultPrevented).toBe(true)
    expect(reached).toBe(true)
    expect(rightClick(document.getElementById('field')).defaultPrevented).toBe(false)
    controller.abort()
    expect(rightClick(document.getElementById('text')).defaultPrevented).toBe(false)
  })
})
