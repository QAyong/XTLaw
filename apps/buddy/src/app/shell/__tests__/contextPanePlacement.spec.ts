import { describe, expect, it } from 'vitest'
import { readContextPanePlacements, resolveContextPanePlacementOnChange, serializeContextPanePlacements } from '../contextPanePlacement'

describe('context pane placement persistence', () => {
  it('stores only the tasks whose panel was swapped to the left', () => {
    expect(serializeContextPanePlacements(new Map([
      ['task:a', { contextOnLeft: true, chatPaneHidden: true }],
      ['task:b', { contextOnLeft: false, chatPaneHidden: false }],
    ]))).toEqual({ 'task:a': true })
  })

  it('reads saved placements back without the transient chat-hidden state', () => {
    expect(readContextPanePlacements({ 'task:a': true })).toEqual(new Map([
      ['task:a', { contextOnLeft: true, chatPaneHidden: false }],
    ]))
  })

  it('falls back to the standard layout when nothing valid was saved', () => {
    expect(readContextPanePlacements(undefined)).toEqual(new Map())
    expect(readContextPanePlacements(['task:a'])).toEqual(new Map())
    expect(readContextPanePlacements({ 'task:a': false, 'task:b': 'yes' })).toEqual(new Map())
  })
})

describe('context pane placement state', () => {
  it('restores the saved pane state when returning to a task', () => {
    expect(resolveContextPanePlacementOnChange({
      mode: 'task',
      previousMode: 'task',
      taskChanged: true,
      current: { contextOnLeft: false, chatPaneHidden: false },
      savedTaskState: { contextOnLeft: true, chatPaneHidden: true },
    })).toEqual({ contextOnLeft: true, chatPaneHidden: true })
  })

  it('defaults an unseen task to the standard pane layout', () => {
    expect(resolveContextPanePlacementOnChange({
      mode: 'task',
      previousMode: 'task',
      taskChanged: true,
      current: { contextOnLeft: true, chatPaneHidden: true },
    })).toEqual({ contextOnLeft: false, chatPaneHidden: false })
  })

  it('preserves the global pane state across tasks in independent browsing', () => {
    expect(resolveContextPanePlacementOnChange({
      mode: 'independent',
      previousMode: 'independent',
      taskChanged: true,
      current: { contextOnLeft: true, chatPaneHidden: true },
    })).toEqual({ contextOnLeft: true, chatPaneHidden: true })
  })

  it('restores the current task state when switching into task-linked mode', () => {
    expect(resolveContextPanePlacementOnChange({
      mode: 'task',
      previousMode: 'independent',
      taskChanged: false,
      current: { contextOnLeft: true, chatPaneHidden: false },
      savedTaskState: { contextOnLeft: false, chatPaneHidden: true },
    })).toEqual({ contextOnLeft: false, chatPaneHidden: true })
  })
})
