<script setup lang="ts">
import { NSelect } from 'naive-ui'
import { shallowRef } from 'vue'

// Naive UI keeps a filterable select open when its trigger is clicked again: the search input only
// refocuses. This wrapper makes the trigger toggle like a plain select, so the next click closes it.
defineOptions({ inheritAttrs: false })

const show = shallowRef(false)

function closeOnTriggerClick(event: MouseEvent) {
  if (!show.value || !(event.target instanceof Element) || !event.target.closest('.n-base-selection'))
    return
  event.stopPropagation()
  show.value = false
}
</script>

<template>
  <NSelect v-bind="$attrs" :show="show" @update:show="show = $event" @click.capture="closeOnTriggerClick">
    <template v-for="(_, name) in $slots" #[name]="slotProps">
      <slot :name="name" v-bind="slotProps ?? {}" />
    </template>
  </NSelect>
</template>
