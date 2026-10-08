<script setup lang="ts">
import type {
  DesktopBrowserApi,
  DesktopBrowserGuestDescriptor,
} from '@buddy-electron/shared/desktopApi'
import type { WebviewTag } from 'electron'
import type { SurfaceLayout, SurfaceLayoutLease } from '@/shared/ui/surfaces/surfaceLayout'
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue'

const props = defineProps<{
  api: DesktopBrowserApi
  layout: SurfaceLayout
}>()

const hostElement = useTemplateRef<HTMLElement>('hostElement')
const guests = new Map<string, BrowserGuestEntry>()
const surfaces = new Map<string, BrowserGuestSurface>()
let mounted = false
let refreshSequence = 0
let stopGuestsChanged: (() => void) | null = null

interface BrowserGuestEntry {
  descriptor: DesktopBrowserGuestDescriptor
  element: WebviewTag
  frame: HTMLElement
  layout: SurfaceLayoutLease
  onDestroyed: () => void
  onReady: () => void
}

interface BrowserGuestSurface {
  element: HTMLElement
  sessionId: string
}

onMounted(() => {
  mounted = true
  stopGuestsChanged = props.api.onGuestsChanged(scheduleRefresh)
  scheduleRefresh()
})

onBeforeUnmount(() => {
  mounted = false
  refreshSequence += 1
  stopGuestsChanged?.()
  stopGuestsChanged = null
  for (const entry of guests.values())
    removeGuest(entry)
  guests.clear()
})

function show(sessionId: string, element: HTMLElement): void {
  const previous = surfaces.get(sessionId)
  if (previous?.element === element) {
    scheduleLayout()
    return
  }
  surfaces.set(sessionId, { sessionId, element })
  scheduleLayout()
}

function hide(sessionId: string, element?: HTMLElement): void {
  const current = surfaces.get(sessionId)
  if (!current || (element && current.element !== element))
    return
  surfaces.delete(sessionId)
  scheduleLayout()
}

defineExpose({ hide, show, layout: scheduleLayout })

function scheduleRefresh(): void {
  void refreshGuests(++refreshSequence)
}

async function refreshGuests(sequence: number): Promise<void> {
  const descriptors = await props.api.listGuests().catch(() => null)
  if (!mounted || sequence !== refreshSequence || !descriptors)
    return

  const nextSessionIds = new Set(descriptors.map(descriptor => descriptor.sessionId))
  for (const [sessionId, entry] of guests) {
    if (!nextSessionIds.has(sessionId)) {
      removeGuest(entry)
      guests.delete(sessionId)
    }
  }
  for (const descriptor of descriptors) {
    if (!guests.has(descriptor.sessionId))
      createGuest(descriptor)
  }
  scheduleLayout()
}

function createGuest(descriptor: DesktopBrowserGuestDescriptor): void {
  const host = hostElement.value
  if (!host)
    return

  const element = document.createElement('webview') as WebviewTag
  const frame = document.createElement('div')
  frame.className = 'desktop-browser-guest-host__frame'
  Object.assign(frame.style, { overflow: 'hidden', pointerEvents: 'none' })
  Object.assign(element.style, { position: 'absolute', inset: '0', pointerEvents: 'auto', transformOrigin: 'top left' })
  const entry: BrowserGuestEntry = {
    descriptor,
    element,
    frame,
    layout: props.layout.attach(frame, { anchor: null, visible: false, interactive: true, childrenOnly: true, layer: 'content' }),
    onReady: () => {
      if (guests.get(descriptor.sessionId)?.element !== element)
        return
      element.removeEventListener('dom-ready', entry.onReady)
      void props.api.attachGuest(descriptor.sessionId, element.getWebContentsId())
        .catch(() => {
          const current = guests.get(descriptor.sessionId)
          if (current?.element !== element)
            return
          removeGuest(current)
          guests.delete(descriptor.sessionId)
          scheduleRefresh()
        })
    },
    onDestroyed: () => {
      const current = guests.get(descriptor.sessionId)
      if (current?.element !== element)
        return
      removeGuest(current)
      guests.delete(descriptor.sessionId)
      scheduleRefresh()
    },
  }
  element.className = 'desktop-browser-guest-host__guest'
  element.dataset.browserSessionId = descriptor.sessionId
  element.setAttribute('partition', descriptor.partition)
  element.setAttribute('allowpopups', 'true')
  element.setAttribute('src', 'about:blank')
  element.addEventListener('destroyed', entry.onDestroyed)
  element.addEventListener('dom-ready', entry.onReady)
  guests.set(descriptor.sessionId, entry)
  frame.append(element)
  host.append(frame)
}

function removeGuest(entry: BrowserGuestEntry): void {
  entry.layout.dispose()
  entry.element.removeEventListener('destroyed', entry.onDestroyed)
  entry.element.removeEventListener('dom-ready', entry.onReady)
  entry.frame.remove()
}

function scheduleLayout(): void {
  for (const [sessionId, entry] of guests) {
    const surface = surfaces.get(sessionId)
    entry.layout.update({
      anchor: surface?.element ?? null,
      visible: !!surface,
      interactive: true,
      childrenOnly: true,
      layer: 'content',
      onLayout: (geometry) => {
        const width = Number(surface?.element.dataset.browserViewportWidth)
        const height = Number(surface?.element.dataset.browserViewportHeight)
        const responsive = geometry.visible && width >= 240 && width <= 3_840 && height >= 240 && height <= 2_160
        // Keep the guest's logical bounds independent of the preview frame. Scaling only
        // the composed surface preserves CSS breakpoints, input coordinates and screenshots.
        Object.assign(entry.element.style, {
          width: responsive ? `${width}px` : '100%',
          height: responsive ? `${height}px` : '100%',
          transform: responsive ? `scale(${geometry.width / width}, ${geometry.height / height})` : 'none',
        })
      },
    })
  }
  props.layout.invalidate()
}
</script>

<template>
  <div
    ref="hostElement"
    class="desktop-browser-guest-host"
    data-testid="desktop-browser-guest-host"
  />
</template>

<style scoped>
.desktop-browser-guest-host { display: contents; }
</style>
