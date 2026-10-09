export const CANVAS_INTERACTION_IDLE_MS = 160
export const CANVAS_KEEP_MOUNTED_NODE_BUDGET = 300
export const CANVAS_SIMPLIFIED_ENTER_SCALE = 0.55
export const CANVAS_SIMPLIFIED_EXIT_SCALE = 0.65

export function resolveCanvasSimplifiedMode(simplified: boolean, scale: number) {
  return simplified ? scale <= CANVAS_SIMPLIFIED_EXIT_SCALE : scale < CANVAS_SIMPLIFIED_ENTER_SCALE
}

/** Keep expensive presentation work out of a continuous viewport interaction. */
export function createCanvasInteraction(options: {
  getNodeCount: () => number
  disableCulling: () => void
  enableCulling: () => void
  onStart: () => void
  onEnd: () => void
}) {
  let active = false
  let held = false
  let cullingSuspended = false
  let timer: ReturnType<typeof setTimeout> | undefined

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }

  function finish(notify = true) {
    clearTimer()
    held = false
    if (!active)
      return
    active = false
    if (cullingSuspended) {
      cullingSuspended = false
      options.enableCulling()
    }
    if (notify)
      options.onEnd()
  }

  function touch() {
    clearTimer()
    if (!active) {
      active = true
      options.onStart()
      // Disabling X6 virtual rendering mounts all waiting views at once.
      const count = options.getNodeCount()
      if (count > 0 && count <= CANVAS_KEEP_MOUNTED_NODE_BUDGET) {
        cullingSuspended = true
        options.disableCulling()
      }
    }
    if (!held)
      timer = setTimeout(finish, CANVAS_INTERACTION_IDLE_MS)
  }

  return {
    get active() { return active },
    touch,
    hold() {
      held = true
      touch()
    },
    release() {
      if (!held)
        return
      held = false
      touch()
    },
    finish: () => finish(),
    dispose: () => finish(false),
  }
}
