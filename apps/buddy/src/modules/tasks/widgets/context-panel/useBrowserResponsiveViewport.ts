import type { DesktopBrowserApi, DesktopBrowserState, DesktopBrowserViewport } from '@buddy-shared/browser/browserDesktopApi'
import type { Ref } from 'vue'
import type { BrowserPreviewZoom, BrowserViewportSize } from './browserViewport'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { browserPreviewScale, DEFAULT_RESPONSIVE_VIEWPORT } from './browserViewport'

export function useBrowserResponsiveViewport(options: {
  api: Pick<DesktopBrowserApi, 'setViewport'>
  state: Readonly<Ref<DesktopBrowserState | null>>
  visible: Readonly<Ref<boolean>>
  canvas: Readonly<Ref<BrowserViewportSize>>
  updateState: (state: DesktopBrowserState) => void
  onError: () => void
}) {
  const zoom = shallowRef<BrowserPreviewZoom>('fit')
  const busy = shallowRef(false)
  const requested = shallowRef<DesktopBrowserViewport | null | undefined>()
  const viewport = computed(() => requested.value === undefined ? options.state.value?.viewport ?? null : requested.value)
  const active = computed(() => Boolean(viewport.value))
  const disabled = computed(() => options.state.value?.controller !== 'human')
  let remembered: DesktopBrowserViewport = { ...DEFAULT_RESPONSIVE_VIEWPORT }
  let pending: { sessionId: string, version: number, viewport: DesktopBrowserViewport | null } | null = null
  let version = 0
  let disposed = false

  watch(() => options.state.value?.sessionId, () => {
    version += 1
    pending = null
    requested.value = undefined
    remembered = { ...options.state.value?.viewport ?? DEFAULT_RESPONSIVE_VIEWPORT }
    zoom.value = 'fit'
  }, { immediate: true })
  watch(disabled, (value) => {
    if (value) {
      version += 1
      pending = null
      requested.value = undefined
    }
  })
  onBeforeUnmount(() => {
    disposed = true
    version += 1
    pending = null
  })

  function request(value: DesktopBrowserViewport | null): void {
    const state = options.state.value
    if (disposed || !state || disabled.value || !options.visible.value)
      return
    if (value)
      remembered = { ...value }
    if (JSON.stringify(viewport.value) === JSON.stringify(value))
      return
    requested.value = value
    pending = { sessionId: state.sessionId, viewport: value, version: ++version }
    void drain()
  }

  async function drain(): Promise<void> {
    if (busy.value)
      return
    busy.value = true
    try {
      while (pending) {
        if (disposed)
          break
        const next = pending
        pending = null
        if (disabled.value || !options.visible.value || options.state.value?.sessionId !== next.sessionId) {
          requested.value = undefined
          continue
        }
        try {
          const state = await options.api.setViewport(next.sessionId, next.viewport)
          // A slow response must not overwrite a newer drag, tab, or control owner.
          if (!disposed && next.version === version && options.state.value?.sessionId === next.sessionId) {
            options.updateState(state)
            requested.value = undefined
          }
        }
        catch {
          if (!disposed && next.version === version && options.state.value?.sessionId === next.sessionId) {
            requested.value = undefined
            options.onError()
          }
        }
      }
    }
    finally { busy.value = false }
  }

  function resize(size: BrowserViewportSize): void {
    request({ ...size, scale: browserPreviewScale(size, options.canvas.value, zoom.value) })
  }

  function toggle(): void {
    if (active.value) {
      request(null)
    }
    else {
      zoom.value = 'fit'
      resize(remembered)
    }
  }

  function selectDevice(size: BrowserViewportSize): void {
    zoom.value = 'fit'
    resize(size)
  }

  function setZoom(value: BrowserPreviewZoom): void {
    zoom.value = value
    if (viewport.value)
      resize(viewport.value)
  }

  watch(options.canvas, () => {
    if (zoom.value === 'fit' && viewport.value && options.visible.value && !disabled.value)
      resize(viewport.value)
  })
  watch(options.visible, (visible) => {
    if (visible && zoom.value === 'fit' && viewport.value && !disabled.value)
      resize(viewport.value)
  })

  return { active, busy, disabled, viewport, zoom, resize, selectDevice, setZoom, toggle }
}
