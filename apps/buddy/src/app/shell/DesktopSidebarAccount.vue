<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
import type { Component } from 'vue'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ThemeAppearanceMode } from '@/theme/themeAppearanceSwitch'
import { ArrowSync16Regular, ChevronDown16Regular, Desktop16Regular, Settings20Regular, WeatherMoon16Regular, WeatherSunny16Regular } from '@vicons/fluent'
import { NDropdown, useMessage } from 'naive-ui'
import { computed, h, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { resolveUserProfile, useSettingsContext } from '@/modules/settings'
import { DesktopAccountAvatar, DesktopAccountDialog } from '@/modules/settings/ui'
import { useDesktopUpdatesContext } from '@/modules/updates'
import { requireDesktopApi } from '@/platform/desktop/desktopApi'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopSegmentedControl from '@/shared/ui/segmented-control/DesktopSegmentedControl.vue'
import { desktopThemeSnapshot } from '@/theme/desktopThemeState'
import { themeAppearanceMode, themeIdForAppearance } from '@/theme/themeAppearanceSwitch'

const props = defineProps<{ language: BuddyLocale }>()
const emit = defineEmits<{ openSettings: [] }>()

const { t } = useBuddyI18n(() => props.language)
const { appInfo, profile } = useSettingsContext()
const updates = useDesktopUpdatesContext()
const message = useMessage()
const dialogOpen = shallowRef(false)
const menuOpen = shallowRef(false)
const appearancePending = shallowRef(false)
const resolvedProfile = computed(() => resolveUserProfile(profile.config.value, appInfo.value))
const appearanceOptions = computed<{ label: string, value: ThemeAppearanceMode, icon: Component }[]>(() => [
  { label: t('desktop.settings.themeSystem'), value: 'system', icon: Desktop16Regular },
  { label: t('desktop.settings.themeLight'), value: 'light', icon: WeatherSunny16Regular },
  { label: t('desktop.settings.themeDark'), value: 'dark', icon: WeatherMoon16Regular },
])

function openProfileDialog() {
  menuOpen.value = false
  dialogOpen.value = true
}

function renderProfileHeader() {
  const { avatarColor, avatarUrl, deviceName, initials, userName } = resolvedProfile.value
  return h('button', {
    class: 'desktop-sidebar-account-menu__header',
    type: 'button',
    role: 'menuitem',
    title: t('desktop.account.editProfile'),
    onClick: openProfileDialog,
  }, [
    h(DesktopAccountAvatar, { size: 'compact', avatarUrl, backgroundColor: avatarColor, initials, name: userName }),
    h('span', { class: 'desktop-sidebar-account-menu__identity' }, [
      h('strong', { class: 'desktop-sidebar-account-menu__name' }, userName),
      h('span', { class: 'desktop-sidebar-account-menu__device' }, deviceName),
    ]),
    h(DesktopIcon, { class: 'desktop-sidebar-account-menu__edit', name: 'edit', size: 14 }),
  ])
}

async function selectAppearance(mode: ThemeAppearanceMode) {
  if (appearancePending.value)
    return
  appearancePending.value = true
  try {
    await requireDesktopApi().themes.request({ action: 'preference', preference: { id: themeIdForAppearance(desktopThemeSnapshot.value, mode) } })
  }
  catch {
    message.error(t('desktop.settings.saveFailed'))
  }
  finally {
    appearancePending.value = false
  }
}

function renderAppearance() {
  return h('div', { 'class': 'desktop-sidebar-account-menu__appearance', 'role': 'group', 'aria-label': t('desktop.settings.theme') }, [
    h(DesktopSegmentedControl, {
      'modelValue': themeAppearanceMode(desktopThemeSnapshot.value),
      'options': appearanceOptions.value,
      'disabled': appearancePending.value,
      'onUpdate:modelValue': (mode: string | number) => void selectAppearance(mode as ThemeAppearanceMode),
    }),
  ])
}

function renderCheckUpdatesLabel() {
  const checking = updates.state.value?.checking
  const version = appInfo.value?.version
  return h('span', { class: 'desktop-sidebar-account-menu__row' }, [
    h('span', checking ? t('desktop.update.checking') : t('desktop.account.checkUpdates')),
    version ? h('span', { class: 'desktop-sidebar-account-menu__version' }, version) : null,
  ])
}

const menuOptions = computed<DropdownOption[]>(() => [
  { key: 'profile-header', type: 'render', render: renderProfileHeader },
  { key: 'divider-profile', type: 'divider' },
  { key: 'appearance', type: 'render', render: renderAppearance },
  {
    icon: () => h(DesktopIcon, { component: Settings20Regular, size: 16 }),
    key: 'settings',
    label: t('desktop.navigation.settings'),
  },
  { key: 'divider-app', type: 'divider' },
  {
    icon: () => h(DesktopIcon, { component: ArrowSync16Regular, size: 16 }),
    key: 'check-updates',
    label: renderCheckUpdatesLabel,
    disabled: !!updates.state.value?.checking,
  },
])
const menuThemeOverrides = {
  fontSizeSmall: '13px',
  optionHeightSmall: '30px',
  optionIconPrefixWidthSmall: '26px',
  optionSuffixWidthSmall: '10px',
}

async function checkForUpdates() {
  try {
    await updates.check()
  }
  catch (error) {
    console.error('XTLaw update check failed', error)
    message.error(t('desktop.update.failed'))
  }
}

function handleMenuAction(action: string | number) {
  menuOpen.value = false
  if (action === 'settings')
    emit('openSettings')
  else if (action === 'check-updates')
    void checkForUpdates()
}
</script>

<template>
  <NDropdown
    trigger="click"
    placement="top-start"
    size="small"
    :show="menuOpen"
    :options="menuOptions"
    :theme-overrides="menuThemeOverrides"
    :menu-props="() => ({ class: 'desktop-sidebar-account-menu', role: 'menu' })"
    @update:show="menuOpen = $event"
    @select="handleMenuAction"
  >
    <button
      class="desktop-sidebar-account"
      :class="{ 'is-open': menuOpen }"
      type="button"
      :aria-label="resolvedProfile.userName"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
    >
      <DesktopAccountAvatar
        size="tiny"
        :avatar-url="resolvedProfile.avatarUrl"
        :background-color="resolvedProfile.avatarColor"
        :initials="resolvedProfile.initials"
        :name="resolvedProfile.userName"
      />
      <strong class="desktop-sidebar-account__name">{{ resolvedProfile.userName }}</strong>
      <DesktopIcon class="desktop-sidebar-account__chevron" :component="ChevronDown16Regular" :size="14" />
    </button>
  </NDropdown>

  <DesktopAccountDialog
    v-model:show="dialogOpen"
    :custom-profile="profile.config.value"
    :language="language"
    :resolved-profile="resolvedProfile"
    :update-profile="profile.update"
  />
</template>

<style scoped>
.desktop-sidebar-account {
  display: flex;
  min-width: 0;
  max-width: 100%;
  height: 2rem;
  flex: 0 1 auto;
  align-items: center;
  justify-content: flex-start;
  gap: 0.4rem;
  margin-right: auto;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--buddy-nav-foreground);
  cursor: pointer;
  font-family: inherit;
  padding: 0 0.375rem 0 0.25rem;
  text-align: left;
  transition: background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-sidebar-account:hover,
.desktop-sidebar-account:focus-visible,
.desktop-sidebar-account.is-open {
  outline: none;
  background: var(--buddy-state-hover);
}

.desktop-sidebar-account__name {
  overflow: hidden;
  color: var(--buddy-text-secondary);
  font-family: inherit;
  font-size: var(--buddy-sidebar-space-font-size);
  font-weight: var(--buddy-sidebar-space-font-weight);
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-sidebar-account__chevron {
  flex: none;
  color: var(--buddy-text-secondary);
}
</style>

<style>
.desktop-sidebar-account-menu.n-dropdown-menu {
  box-sizing: border-box;
  width: var(--buddy-menu-width);
  max-width: min(var(--buddy-menu-max-width), calc(100vw - 16px));
  padding: 4px;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: var(--buddy-menu-radius);
  box-shadow: var(--buddy-shadow-overlay);
}

.desktop-sidebar-account-menu.n-dropdown-menu .n-dropdown-option-body::before {
  border-radius: var(--buddy-menu-item-radius);
}

.desktop-sidebar-account-menu.n-dropdown-menu .n-dropdown-option-body__prefix {
  color: var(--buddy-text-secondary);
}

.desktop-sidebar-account-menu.n-dropdown-menu .n-dropdown-divider {
  margin: 3px 2px;
}

.desktop-sidebar-account-menu__header {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: var(--buddy-menu-item-radius);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
  padding: 4px 8px;
  text-align: left;
  transition: background-color var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-sidebar-account-menu__header:hover,
.desktop-sidebar-account-menu__header:focus-visible {
  outline: none;
  background: var(--buddy-state-hover);
}

.desktop-sidebar-account-menu__identity {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
}

.desktop-sidebar-account-menu__edit {
  flex: none;
  color: var(--buddy-text-muted);
  opacity: 0;
  transition: opacity var(--buddy-motion-state-duration) var(--buddy-motion-state-easing);
}

.desktop-sidebar-account-menu__header:hover .desktop-sidebar-account-menu__edit,
.desktop-sidebar-account-menu__header:focus-visible .desktop-sidebar-account-menu__edit {
  opacity: 1;
}

.desktop-sidebar-account-menu__appearance {
  padding: 2px;
}

.desktop-sidebar-account-menu__appearance .desktop-segmented-control {
  --n-tab-padding: 2px 12px !important;
}

.desktop-sidebar-account-menu__appearance .desktop-segmented-control .n-tabs-rail {
  padding: 2px;
}

.desktop-sidebar-account-menu.n-dropdown-menu .desktop-sidebar-account-menu__appearance .desktop-segmented-control {
  width: 100%;
}

.desktop-sidebar-account-menu__row {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.desktop-sidebar-account-menu__version {
  color: var(--buddy-text-muted);
  font-size: 12px;
}

.desktop-sidebar-account-menu__name,
.desktop-sidebar-account-menu__device {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.desktop-sidebar-account-menu__name {
  color: var(--buddy-text-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 18px;
}

.desktop-sidebar-account-menu__device {
  color: var(--buddy-text-muted);
  font-size: 12px;
  line-height: 16px;
}
</style>
