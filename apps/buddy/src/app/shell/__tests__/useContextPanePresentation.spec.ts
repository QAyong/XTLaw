import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { useContextPanePresentation } from '../useContextPanePresentation'

function fixture() {
  const chatPaneHidden = shallowRef(true)
  const tasksVisible = shallowRef(true)
  const scope = shallowRef<string | null>('task:a')
  return { chatPaneHidden, tasksVisible, scope, panel: useContextPanePresentation({ chatPaneHidden, tasksVisible, scope }) }
}

describe('task-owned resource panel presentation', () => {
  it('shows other pages without losing the task maximization preference', () => {
    const f = fixture()
    expect(f.panel.workspaceVisible.value).toBe(false)
    f.tasksVisible.value = false
    expect(f.panel.workspaceVisible.value).toBe(true)
    expect(f.chatPaneHidden.value).toBe(true)
    f.tasksVisible.value = true
    expect(f.panel.contextMaximized.value).toBe(true)
  })

  it('temporarily reveals the workspace for a task drag and restores it on cancellation', () => {
    const f = fixture()
    f.panel.beginDrag()
    expect(f.panel.workspaceVisible.value).toBe(true)
    expect(f.chatPaneHidden.value).toBe(true)
    f.panel.endDrag(false)
    expect(f.panel.contextMaximized.value).toBe(true)
  })

  it('keeps the workspace visible after a successful task drop', () => {
    const f = fixture()
    f.panel.beginDrag()
    f.panel.endDrag(true)
    expect(f.chatPaneHidden.value).toBe(false)
    expect(f.panel.workspaceVisible.value).toBe(true)
  })

  it('does not change a different task preference when an old drag ends', () => {
    const f = fixture()
    f.panel.beginDrag()
    f.scope.value = 'task:b'
    expect(f.panel.contextMaximized.value).toBe(true)
    f.panel.endDrag(true)
    expect(f.chatPaneHidden.value).toBe(true)
    expect(f.panel.contextMaximized.value).toBe(true)
  })

  it('ignores drop completion without a task drag', () => {
    const f = fixture()
    f.panel.endDrag(true)
    expect(f.chatPaneHidden.value).toBe(true)
  })
})
