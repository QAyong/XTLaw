<script setup lang="ts">
import type { BuddyThinkingLevel } from '@buddy-shared/conversation/modelSelection'
import type { ReasoningSelectorOption } from './typing'
import { computed, shallowRef } from 'vue'

const props = defineProps<{
  fast?: boolean
  label: string
  options: ReadonlyArray<ReasoningSelectorOption>
  selectedEffort: BuddyThinkingLevel | null
}>()

const emit = defineEmits<{
  dragging: [value: boolean]
  preview: [value: BuddyThinkingLevel | null]
  select: [value: BuddyThinkingLevel]
}>()

const previewIndex = shallowRef<number | null>(null)
const isDragging = shallowRef(false)
const selectedIndex = computed(() => Math.max(
  0,
  props.options.findIndex(option => option.value === props.selectedEffort),
))
const visualIndex = computed(() => previewIndex.value ?? selectedIndex.value)
const visualOption = computed(() => props.options[visualIndex.value] ?? null)
const progressRatio = computed(() => (
  props.options.length <= 1
    ? 0
    : visualIndex.value / (props.options.length - 1)
))

function previewSelection(event: Event) {
  const index = readSliderIndex(event)
  const option = props.options[index]
  if (!option)
    return
  previewIndex.value = index
  emit('preview', option.value)
}

function commitSelection(event: Event) {
  const index = readSliderIndex(event)
  const option = props.options[index]
  if (!option)
    return
  emit('select', option.value)
  clearPreview()
}

function clearPreview() {
  previewIndex.value = null
  updateDragging(false)
  emit('preview', null)
}

function updateDragging(value: boolean) {
  if (isDragging.value === value)
    return
  isDragging.value = value
  emit('dragging', value)
}

function readSliderIndex(event: Event): number {
  if (!(event.currentTarget instanceof HTMLInputElement))
    return selectedIndex.value
  return Math.max(0, Math.min(props.options.length - 1, Number(event.currentTarget.value)))
}
</script>

<template>
  <div
    class="desktop-reasoning-meter"
    :class="{ 'is-dragging': isDragging }"
  >
    <div class="desktop-reasoning-meter__stage" aria-hidden="true">
      <span class="desktop-reasoning-meter__track">
        <span
          class="desktop-reasoning-meter__fill"
          :style="{ width: `calc(0.75rem + (100% - 1.5rem) * ${progressRatio})` }"
        >
          <span v-if="fast" class="desktop-reasoning-meter__particles">
            <i
              v-for="index in 16"
              :key="index"
              class="desktop-reasoning-meter__particle"
              :style="{
                top: `${15 + (index * 37 % 70)}%`,
                width: `${2 + (index % 3)}px`,
                animationDuration: `${0.35 + (index % 5) * 0.07}s`,
                animationDelay: `${-index * 0.13}s`,
              }"
            />
          </span>
        </span>
        <span class="desktop-reasoning-meter__nodes">
          <i
            v-for="(option, index) in options"
            :key="option.value"
            class="desktop-reasoning-meter__node"
            :class="{ 'is-active': index <= visualIndex }"
          />
        </span>
      </span>
    </div>
    <input
      class="desktop-reasoning-meter__control"
      type="range"
      min="0"
      :max="Math.max(0, options.length - 1)"
      step="1"
      :value="visualIndex"
      :aria-label="label"
      :aria-valuetext="visualOption?.label ?? ''"
      @pointerdown="updateDragging(true)"
      @pointerup="updateDragging(false)"
      @pointercancel="clearPreview"
      @input="previewSelection"
      @change="commitSelection"
    >
  </div>
</template>

<style scoped>
.desktop-reasoning-meter {
  --reasoning-track-background: #e7e7e7;
  --reasoning-node-background: #b6b6b6;

  position: relative;
  height: 2rem;
  isolation: isolate;
  user-select: none;
}

:global(:root[data-buddy-theme='dark'] .desktop-reasoning-meter) {
  --reasoning-track-background: #363940;
  --reasoning-node-background: #80858e;
}

.desktop-reasoning-meter__stage {
  position: absolute;
  inset: 0.125rem 0.05rem;
}

.desktop-reasoning-meter__track {
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  height: 1.5rem;
  overflow: hidden;
  border-radius: 999px;
  background: var(--reasoning-track-background);
  transform: translateY(-50%);
}

.desktop-reasoning-meter__fill {
  position: absolute;
  inset: 0 auto 0 0;
  overflow: hidden;
  background: #3b82f6;
}

.desktop-reasoning-meter__particles {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.desktop-reasoning-meter__particle {
  position: absolute;
  left: 0;
  height: 1.5px;
  border-radius: 999px;
  background: rgb(255 255 255 / 75%);
  animation: reasoning-fast-flow 0.5s linear infinite;
}

@keyframes reasoning-fast-flow {
  from {
    left: 0;
    opacity: 0;
    transform: translateX(-100%);
  }

  15%,
  80% {
    opacity: 0.7;
  }

  to {
    left: 100%;
    opacity: 0;
    transform: translateX(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .desktop-reasoning-meter__particles {
    display: none;
  }
}

.desktop-reasoning-meter__nodes {
  position: absolute;
  top: 50%;
  right: 0.75rem;
  left: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  pointer-events: none;
  transform: translateY(-50%);
}

.desktop-reasoning-meter__node {
  display: block;
  width: 0.25rem;
  height: 0.25rem;
  border-radius: 50%;
  background: var(--reasoning-node-background);
}

.desktop-reasoning-meter__node.is-active {
  background: rgb(255 255 255 / 40%);
}

.desktop-reasoning-meter__control {
  position: absolute;
  inset: 0.125rem 0.05rem;
  z-index: 7;
  width: calc(100% - 0.1rem);
  height: 1.75rem;
  margin: 0;
  appearance: none;
  background: transparent;
  cursor: grab;
  touch-action: none;
}

.desktop-reasoning-meter__control::-webkit-slider-runnable-track {
  height: 1.75rem;
  border: 0;
  background: transparent;
}

.desktop-reasoning-meter__control::-webkit-slider-thumb {
  width: 1.5rem;
  height: 1.5rem;
  margin-top: 0.125rem;
  appearance: none;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 12%);
}

.desktop-reasoning-meter__control:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 2px;
  border-radius: 999px;
}

.desktop-reasoning-meter__control:active {
  cursor: grabbing;
}
</style>
