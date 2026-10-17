<script setup lang="ts">
import { NSelect, selectProps } from 'naive-ui'
import { computed, shallowRef, useSlots } from 'vue'

defineOptions({ inheritAttrs: false })
const props = defineProps(selectProps)
const emit = defineEmits<{ 'update:show': [value: boolean] }>()
const slots = useSlots()
const uncontrolledShow = shallowRef(false)
const show = computed(() => props.show ?? uncontrolledShow.value)
const forwardedProps = computed(() => ({ ...props, 'onUpdateShow': undefined, 'onUpdate:show': undefined }))

function updateShow(value: boolean) {
  uncontrolledShow.value = value
  for (const listener of [props.onUpdateShow].flat())
    listener?.(value)
  emit('update:show', value)
}

function closeOnTriggerClick(event: MouseEvent) {
  const target = event.target
  if (!show.value || !(target instanceof Element) || !target.closest('.n-base-selection'))
    return
  if (target.closest('input, button, a, [contenteditable], [role="button"], [data-clear], .n-tag'))
    return
  event.stopPropagation()
  updateShow(false)
}
</script>

<template>
  <NSelect v-bind="{ ...$attrs, ...forwardedProps }" :show="show" @update:show="updateShow" @click.capture="closeOnTriggerClick">
    <template v-for="(_, name) in slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </NSelect>
</template>
