<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
import type { ResourceSelectionQuote } from './useResourceSelectionQuote'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { NDropdown } from 'naive-ui'
import { computed, h, nextTick, onBeforeUnmount, useId, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { getDirectSelectionReferenceTarget } from './workbenchSelectionReferences'

const props = defineProps<{ selection: ResourceSelectionQuote, language: BuddyLocale }>()
const { t } = useBuddyI18n(() => props.language)
const menuId = useId()
let returnFocus: HTMLElement | null = null
function restoreFocus() {
  if (document.getElementById(menuId)?.contains(document.activeElement) && returnFocus?.isConnected)
    returnFocus.focus({ preventScroll: true })
  returnFocus = null
}
watch(() => props.selection.pending.value, async (request) => {
  if (!request) {
    restoreFocus()
    return
  }
  const active = document.activeElement
  if (active instanceof HTMLElement && active.id !== menuId)
    returnFocus = active
  await nextTick()
  if (props.selection.pending.value === request)
    document.getElementById(menuId)?.focus({ preventScroll: true })
}, { flush: 'post' })
onBeforeUnmount(restoreFocus)
const options = computed<DropdownOption[]>(() => {
  const request = props.selection.pending.value
  if (!request?.targets.length)
    return [{ key: 'unavailable', label: t('desktop.chat.quoteNoTarget'), disabled: true }]
  const preferred = request.targets.find(target => target.id === request.defaultId)
  const others = request.targets.filter(target => target.id !== preferred?.id)
  const children = others.map(target => ({ key: target.id, label: target.label }))
  return [
    ...(preferred ? [{ key: preferred.id, label: getDirectSelectionReferenceTarget(request) ? t('desktop.chat.quoteToCurrent') : t('desktop.chat.quoteToTarget', { title: preferred.label }) }] : []),
    ...(children.length ? [{ key: 'targets', label: t(preferred ? 'desktop.chat.quoteOtherTarget' : 'desktop.chat.quoteChooseTarget'), children }] : []),
  ]
})
function renderLabel(option: DropdownOption) {
  const label = String(option.label ?? '')
  return h('span', { class: 'resource-selection-menu-option flex w-full min-w-0 items-center gap-5' }, [
    h('span', { class: 'resource-selection-menu-option__label min-w-0 flex-1 truncate' }, label),
  ])
}
function menuProps(option?: DropdownOption) {
  return {
    'id': option ? undefined : menuId,
    'tabindex': -1,
    'class': 'buddy-selection-menu resource-selection-menu',
    'role': 'menu',
    'aria-label': t('desktop.chat.quoteChooseTarget'),
    'style': 'width: var(--buddy-menu-width, 12.5rem); max-width: min(var(--buddy-menu-max-width, 17.5rem), calc(100vw - 16px));',
  }
}
</script>

<template>
  <NDropdown
    trigger="manual" placement="bottom-start" :show="selection.pending.value !== null" :x="selection.position.value.x" :y="selection.position.value.y" :options="options"
    size="small" :menu-props="menuProps" :render-label="renderLabel"
    :node-props="option => ({ 'role': 'menuitem', 'aria-label': String(option.label ?? '') })"
    @select="selection.select" @clickoutside="event => event.button !== 2 && selection.close()"
  />
</template>
