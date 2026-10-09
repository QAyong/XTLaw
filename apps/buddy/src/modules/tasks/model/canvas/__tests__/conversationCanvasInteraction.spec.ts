import { afterEach, describe, expect, it, vi } from 'vitest'
import { CANVAS_INTERACTION_IDLE_MS, createCanvasInteraction, resolveCanvasSimplifiedMode } from '../conversationCanvasInteraction'

afterEach(() => vi.useRealTimers())

function controller(nodeCount = 50) {
  vi.useFakeTimers()
  const options = {
    getNodeCount: () => nodeCount,
    disableCulling: vi.fn(),
    enableCulling: vi.fn(),
    onStart: vi.fn(),
    onEnd: vi.fn(),
  }
  return { interaction: createCanvasInteraction(options), ...options }
}

describe('canvas viewport interaction', () => {
  it('suspends culling once and settles only after the last transform', () => {
    const value = controller()
    value.interaction.touch()
    vi.advanceTimersByTime(100)
    value.interaction.touch()
    vi.advanceTimersByTime(CANVAS_INTERACTION_IDLE_MS - 1)
    expect(value.interaction.active).toBe(true)
    expect(value.disableCulling).toHaveBeenCalledTimes(1)
    expect(value.onStart).toHaveBeenCalledTimes(1)
    expect(value.enableCulling).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(value.interaction.active).toBe(false)
    expect(value.enableCulling).toHaveBeenCalledTimes(1)
    expect(value.onEnd).toHaveBeenCalledTimes(1)
  })

  it('does not settle while a pointer is held, even if dragging pauses', () => {
    const value = controller()
    value.interaction.hold()
    vi.advanceTimersByTime(1000)
    value.interaction.touch()
    vi.advanceTimersByTime(1000)
    expect(value.interaction.active).toBe(true)
    value.interaction.release()
    vi.advanceTimersByTime(CANVAS_INTERACTION_IDLE_MS)
    expect(value.onEnd).toHaveBeenCalledTimes(1)
  })

  it.each([0, 301, 1000])('keeps virtual rendering for %s nodes while still deferring presentation', (count) => {
    const value = controller(count)
    value.interaction.touch()
    expect(value.onStart).toHaveBeenCalledTimes(1)
    expect(value.disableCulling).not.toHaveBeenCalled()
    vi.advanceTimersByTime(CANVAS_INTERACTION_IDLE_MS)
    expect(value.enableCulling).not.toHaveBeenCalled()
    expect(value.onEnd).toHaveBeenCalledTimes(1)
  })

  it('clears held state on scope changes and restores culling on disposal without a late callback', () => {
    const value = controller(300)
    value.interaction.hold()
    value.interaction.finish()
    expect(value.onEnd).toHaveBeenCalledTimes(1)
    value.interaction.touch()
    value.interaction.dispose()
    vi.advanceTimersByTime(1000)
    expect(value.enableCulling).toHaveBeenCalledTimes(2)
    expect(value.onEnd).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('uses separate entry and exit thresholds to prevent LOD flapping', () => {
    expect(resolveCanvasSimplifiedMode(false, 0.55)).toBe(false)
    expect(resolveCanvasSimplifiedMode(false, 0.54)).toBe(true)
    expect(resolveCanvasSimplifiedMode(true, 0.6)).toBe(true)
    expect(resolveCanvasSimplifiedMode(false, 0.6)).toBe(false)
    expect(resolveCanvasSimplifiedMode(true, 0.65)).toBe(true)
    expect(resolveCanvasSimplifiedMode(true, 0.66)).toBe(false)
  })
})
