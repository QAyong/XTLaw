<script setup lang="ts">
import type { DesktopBrowserViewport } from '@buddy-shared/browser/browserDesktopApi'
import type { BrowserPreviewZoom, BrowserViewportSize } from './browserViewport'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { computed, shallowRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { BROWSER_PREVIEW_ZOOMS, BROWSER_VIEWPORT_DEVICES, browserViewportDeviceForSize, viewportDimensionValid } from './browserViewport'

const props = defineProps<{ language: BuddyLocale, viewport: DesktopBrowserViewport, zoom: BrowserPreviewZoom, disabled: boolean }>()
const emit = defineEmits<{ resize: [size: BrowserViewportSize], device: [size: BrowserViewportSize], zoom: [zoom: BrowserPreviewZoom] }>()
const { t } = useBuddyI18n(() => props.language)
const width = shallowRef(String(props.viewport.width))
const height = shallowRef(String(props.viewport.height))
const invalid = shallowRef<'width' | 'height' | null>(null)
const customDevice = shallowRef(false)
const selectedDevice = computed(() => customDevice.value ? 'custom' : browserViewportDeviceForSize(props.viewport))
watch(() => props.viewport.width, value => width.value = String(value))
watch(() => props.viewport.height, value => height.value = String(value))
function reset(dimension: 'width' | 'height'): void {
  invalid.value = null
  if (dimension === 'width')
    width.value = String(props.viewport.width)
  else
    height.value = String(props.viewport.height)
}
function commit(dimension: 'width' | 'height'): void {
  const value = Number((dimension === 'width' ? width.value : height.value).trim())
  if (!viewportDimensionValid(dimension, value)) {
    invalid.value = dimension
    return
  }
  invalid.value = null
  if (props.viewport[dimension] !== value) {
    customDevice.value = true
    emit('resize', { width: props.viewport.width, height: props.viewport.height, [dimension]: value })
  }
}
function keydown(dimension: 'width' | 'height', event: KeyboardEvent): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    commit(dimension)
  }
  else if (event.key === 'Escape') {
    event.preventDefault()
    reset(dimension)
    ;(event.currentTarget as HTMLInputElement).blur()
  }
}
function selectDevice(event: Event): void {
  const id = (event.target as HTMLSelectElement).value
  if (id === 'custom') {
    customDevice.value = true
    return
  }
  const device = BROWSER_VIEWPORT_DEVICES.find(item => item.id === id)
  if (!device)
    return
  customDevice.value = false
  invalid.value = null
  width.value = String(device.width)
  height.value = String(device.height)
  emit('device', { width: device.width, height: device.height })
}
function selectZoom(event: Event): void {
  const value = (event.target as HTMLSelectElement).value as BrowserPreviewZoom
  if (BROWSER_PREVIEW_ZOOMS.includes(value))
    emit('zoom', value)
}
</script>

<template>
  <div class="browser-viewport-controls" data-testid="browser-viewport-controls" role="group" :aria-label="t('desktop.context.browserResponsive')">
    <select class="browser-viewport-controls__device" data-testid="browser-viewport-device" :aria-label="t('desktop.context.browserViewportDevice')" :title="t('desktop.context.browserViewportDeviceHint')" :value="selectedDevice" :disabled="disabled" @change="selectDevice">
      <option value="custom">{{ t('desktop.context.browserViewportCustom') }}</option>
      <option v-for="device in BROWSER_VIEWPORT_DEVICES" :key="device.id" :value="device.id">
        {{ device.id === 'desktop' ? t('desktop.context.browserViewportDesktop') : device.name }}
      </option>
    </select>
    <input v-model="width" data-testid="browser-viewport-width" type="text" inputmode="numeric" spellcheck="false" :aria-label="t('desktop.context.browserViewportWidth')" :aria-invalid="invalid === 'width' || undefined" :disabled="disabled" @blur="commit('width')" @keydown="keydown('width', $event)">
    <span class="browser-viewport-controls__separator" aria-hidden="true">×</span>
    <input v-model="height" data-testid="browser-viewport-height" type="text" inputmode="numeric" spellcheck="false" :aria-label="t('desktop.context.browserViewportHeight')" :aria-invalid="invalid === 'height' || undefined" :disabled="disabled" @blur="commit('height')" @keydown="keydown('height', $event)">
    <select data-testid="browser-viewport-zoom" :aria-label="t('desktop.context.browserViewportScale')" :value="zoom" :disabled="disabled" @change="selectZoom">
      <option v-for="option in BROWSER_PREVIEW_ZOOMS" :key="option" :value="option">
        {{ option === 'fit' ? t('desktop.context.browserViewportFit') : `${option}%` }}
      </option>
    </select>
    <span v-if="invalid" class="browser-viewport-controls__error" role="alert">{{ t('desktop.context.browserViewportRange', { max: invalid === 'width' ? '3840' : '2160' }) }}</span>
  </div>
</template>

<style scoped>
.browser-viewport-controls { display: flex; flex: none; min-width: 0; min-height: 2.25rem; align-items: center; justify-content: safe center; gap: 0.25rem; overflow-x: auto; scrollbar-width: thin; scrollbar-color: var(--buddy-border-strong) transparent; border-bottom: 1px solid var(--buddy-border-subtle); padding: 0.125rem 0.5rem; background: var(--buddy-surface-base); color: var(--buddy-text-primary); }
.browser-viewport-controls input, .browser-viewport-controls select { min-height: 1.875rem; flex: none; border: 1px solid transparent; border-radius: 0.25rem; background: transparent; color: inherit; font: inherit; font-size: 0.75rem; font-weight: 500; font-variant-numeric: tabular-nums; }
.browser-viewport-controls input { width: 3.5rem; padding: 0.25rem; text-align: center; }
.browser-viewport-controls select { width: 6.5rem; margin-left: 0.5rem; padding: 0.25rem; cursor: pointer; }
.browser-viewport-controls select.browser-viewport-controls__device { width: 8.5rem; margin-left: 0; margin-right: 0.25rem; }
.browser-viewport-controls option { background: var(--buddy-surface-base); color: var(--buddy-text-primary); }
.browser-viewport-controls input:hover, .browser-viewport-controls select:hover { background: var(--buddy-surface-hover); }
.browser-viewport-controls input:focus-visible, .browser-viewport-controls select:focus-visible { outline: 2px solid var(--buddy-focus-ring); outline-offset: -1px; background: var(--buddy-surface-raised); }
.browser-viewport-controls input[aria-invalid="true"] { border-color: var(--buddy-status-danger-solid); }
.browser-viewport-controls :disabled { opacity: 0.6; cursor: not-allowed; }
.browser-viewport-controls__separator { color: var(--buddy-text-muted); }
.browser-viewport-controls__error { max-width: 12rem; color: var(--buddy-status-danger-text); font-size: 0.75rem; }
</style>
