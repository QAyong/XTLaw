<script setup lang="ts">
import type { DesktopBrowserViewport } from '@buddy-shared/browser/browserDesktopApi'
import type { BrowserViewportSize } from './browserViewport'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, onBeforeUnmount, onMounted, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { clampViewportSize } from './browserViewport'

const props = defineProps<{ viewport: DesktopBrowserViewport | null, disabled: boolean, visible: boolean, language: BuddyLocale }>()
const emit = defineEmits<{ resize: [size: BrowserViewportSize], canvas: [size: BrowserViewportSize] }>()
const { t } = useBuddyI18n(() => props.language)
const canvas = useTemplateRef<HTMLElement>('canvas')
const active = computed(() => Boolean(props.viewport))
const frameStyle = computed(() => props.viewport ? { width: `${props.viewport.width * props.viewport.scale}px`, height: `${props.viewport.height * props.viewport.scale}px` } : undefined)
const handles = [
  { key: 'left', x: -1, y: 0, label: 'browserViewportResizeWidth' },
  { key: 'right', x: 1, y: 0, label: 'browserViewportResizeWidth' },
  { key: 'top', x: 0, y: -1, label: 'browserViewportResizeHeight' },
  { key: 'bottom', x: 0, y: 1, label: 'browserViewportResizeHeight' },
  { key: 'corner', x: 1, y: 1, label: 'browserViewportResizeBoth' },
] as const
let observer: ResizeObserver | null = null
let drag: { target: HTMLElement, pointerId: number, startX: number, startY: number, width: number, height: number, scale: number, x: number, y: number } | null = null
let pendingSize: BrowserViewportSize | null = null
let frame = 0
function measure(): void {
  const element = canvas.value
  if (props.visible && element?.clientWidth && element.clientHeight)
    emit('canvas', { width: element.clientWidth, height: element.clientHeight })
}
onMounted(() => {
  observer = new ResizeObserver(measure)
  if (canvas.value)
    observer.observe(canvas.value)
  measure()
  window.addEventListener('blur', finish)
})
watch(() => props.visible, measure, { flush: 'post' })
watch(() => [props.disabled, active.value, props.visible], () => {
  if (props.disabled || !active.value || !props.visible)
    finish()
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('blur', finish)
  finish()
})
function begin(event: PointerEvent, x: number, y: number): void {
  if (!props.viewport || props.disabled || (event.pointerType === 'mouse' && event.button !== 0))
    return
  event.preventDefault()
  finish()
  const target = event.currentTarget as HTMLElement
  target.setPointerCapture(event.pointerId)
  drag = { target, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, ...props.viewport, x, y }
}
function move(event: PointerEvent): void {
  if (!drag || drag.pointerId !== event.pointerId)
    return
  if (event.pointerType === 'mouse' && !(event.buttons & 1)) {
    finish()
    return
  }
  pendingSize = clampViewportSize({ width: drag.width + (event.clientX - drag.startX) / drag.scale * drag.x, height: drag.height + (event.clientY - drag.startY) / drag.scale * drag.y })
  if (!frame) {
    frame = requestAnimationFrame(() => {
      frame = 0
      if (pendingSize) {
        emit('resize', pendingSize)
        pendingSize = null
      }
    })
  }
}
function finish(): void {
  const previous = drag
  drag = null
  if (frame)
    cancelAnimationFrame(frame)
  frame = 0
  pendingSize = null
  if (previous?.target.hasPointerCapture(previous.pointerId))
    previous.target.releasePointerCapture(previous.pointerId)
}
function end(event: PointerEvent): void {
  if (drag?.pointerId !== event.pointerId)
    return
  if (pendingSize)
    emit('resize', pendingSize)
  finish()
}
function keyResize(event: KeyboardEvent, x: number, y: number): void {
  if (!props.viewport || props.disabled)
    return
  const step = event.shiftKey ? 10 : 1
  const dx = x && (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0)
  const dy = y && (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0)
  if (!dx && !dy)
    return
  event.preventDefault()
  emit('resize', clampViewportSize({ width: props.viewport.width + dx * x, height: props.viewport.height + dy * y }))
}
</script>

<template>
  <div ref="canvas" class="browser-preview-canvas" :class="{ 'browser-preview-canvas--active': active }" data-testid="browser-preview-canvas" :data-responsive="active">
    <div class="browser-preview-stage">
      <div class="browser-preview-frame" :style="frameStyle" data-testid="browser-preview-frame">
        <slot />
        <template v-if="active">
          <button v-for="handle in handles" :key="handle.key" type="button" class="browser-preview-handle" :class="`browser-preview-handle--${handle.key}`" :data-testid="`browser-viewport-resize-${handle.key}`" :aria-label="t(`desktop.context.${handle.label}`)" :disabled="disabled" @pointerdown="begin($event, handle.x, handle.y)" @pointermove="move" @pointerup="end" @pointercancel="finish" @lostpointercapture="finish" @keydown="keyResize($event, handle.x, handle.y)" />
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.browser-preview-canvas { min-width: 0; min-height: 0; flex: 1; overflow: hidden; background: var(--buddy-surface-base); }
.browser-preview-stage, .browser-preview-frame { width: 100%; height: 100%; }
.browser-preview-frame { position: relative; }
.browser-preview-canvas--active { overflow: auto; background: var(--buddy-surface-muted); }
.browser-preview-canvas--active .browser-preview-stage { display: flex; width: max-content; min-width: 100%; height: auto; min-height: 100%; align-items: center; justify-content: center; padding: 1rem; box-sizing: border-box; }
.browser-preview-canvas--active .browser-preview-frame { flex: none; outline: 1px solid var(--buddy-border-strong); background: var(--buddy-surface-base); }
.browser-preview-handle { position: absolute; z-index: 4; border: 0; padding: 0; background: transparent; touch-action: none; }
.browser-preview-handle::after { content: ''; position: absolute; border-radius: 2px; background: var(--buddy-text-muted); }
.browser-preview-handle--left, .browser-preview-handle--right { top: calc(50% - 1.25rem); width: 1rem; height: 2.5rem; cursor: ew-resize; }
.browser-preview-handle--left { right: 100%; }
.browser-preview-handle--right { left: 100%; }
.browser-preview-handle--left::after, .browser-preview-handle--right::after { top: 0.5rem; bottom: 0.5rem; width: 3px; left: calc(50% - 1px); }
.browser-preview-handle--top, .browser-preview-handle--bottom { left: calc(50% - 1.25rem); width: 2.5rem; height: 1rem; cursor: ns-resize; }
.browser-preview-handle--top { bottom: 100%; }
.browser-preview-handle--bottom { top: 100%; }
.browser-preview-handle--top::after, .browser-preview-handle--bottom::after { left: 0.5rem; right: 0.5rem; height: 3px; top: calc(50% - 1px); }
.browser-preview-handle--corner { top: 100%; left: 100%; width: 1rem; height: 1rem; cursor: nwse-resize; }
.browser-preview-handle--corner::after { width: 0.5rem; height: 0.5rem; left: 1px; top: 1px; border-right: 2px solid var(--buddy-text-muted); border-bottom: 2px solid var(--buddy-text-muted); border-radius: 0; background: transparent; }
.browser-preview-handle:hover::after { background: var(--buddy-accent-solid); }
.browser-preview-handle--corner:hover::after { border-color: var(--buddy-accent-solid); background: transparent; }
.browser-preview-handle:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: -2px; }
.browser-preview-handle:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
