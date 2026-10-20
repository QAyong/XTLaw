<script setup lang="ts">
import type { DropdownOption } from 'naive-ui'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { ChevronDown16Regular, Settings20Regular } from '@vicons/fluent'
import { NDropdown } from 'naive-ui'
import { computed, h, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { resolveUserProfile, useSettingsContext } from '@/modules/settings'
import { DesktopAccountAvatar, DesktopAccountDialog } from '@/modules/settings/ui'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{ language: BuddyLocale }>()
const emit = defineEmits<{ openSettings: [] }>()

const { t } = useBuddyI18n(() => props.language)
const { appInfo, profile } = useSettingsContext()
const dialogOpen = shallowRef(false)
const menuOpen = shallowRef(false)
const resolvedProfile = computed(() => resolveUserProfile(profile.config.value, appInfo.value))

const menuOptions = computed<DropdownOption[]>(() => [
  {
    icon: () => h(DesktopIcon, { component: Settings20Regular, size: 14 }),
    key: 'settings',
    label: t('desktop.navigation.settings'),
  },
  {
    icon: () => h(DesktopIcon, { name: 'edit', size: 14 }),
    key: 'edit-profile',
    label: t('desktop.account.editProfile'),
  },
])
const menuThemeOverrides = {
  fontSizeSmall: '13px',
  optionIconPrefixWidthSmall: '28px',
  optionSuffixWidthSmall: '12px',
}

function handleMenuAction(action: string | number) {
  menuOpen.value = false
  if (action === 'settings')
    emit('openSettings')
  else if (action === 'edit-profile')
    dialogOpen.value = true
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
