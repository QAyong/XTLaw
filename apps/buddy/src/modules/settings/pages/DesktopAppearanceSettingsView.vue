<script setup lang="ts">
import { computed } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopSettingsPageLayout from '@/modules/settings/layouts/DesktopSettingsPageLayout.vue'
import { useSettingsContext } from '@/modules/settings/settingsContext'
import { resolveUserProfile } from '@/modules/settings/widgets/account/userProfile'
import DesktopAgentIdentitySettings from '@/modules/settings/widgets/app/DesktopAgentIdentitySettings.vue'
import DesktopAppearanceSettings from '@/modules/settings/widgets/app/DesktopAppearanceSettings.vue'

const { agentProfile, appInfo, applicationSettings, profile } = useSettingsContext()
const { t } = useBuddyI18n(applicationSettings.language)
const { config, settingsError, language, updateSettings } = applicationSettings
const agentProfileConfig = computed(() => agentProfile.config.value)
const syncedProfile = computed(() => resolveUserProfile(profile.config.value, appInfo.value))
</script>

<template>
  <DesktopSettingsPageLayout :requires-runtime="false">
    <template #title>
      {{ t('desktop.settings.category.appearance') }}
    </template>
    <template #description>
      {{ t('desktop.settings.categoryDescription.appearance') }}
    </template>
    <DesktopAppearanceSettings
      :config="config"
      :error="settingsError"
      :language="language"
      :update-settings="updateSettings"
    >
      <template #after-application-appearance>
        <DesktopAgentIdentitySettings
          :language="language"
          :profile="agentProfileConfig"
          :synced-profile="syncedProfile"
          :update-profile="agentProfile.update"
        />
      </template>
    </DesktopAppearanceSettings>
  </DesktopSettingsPageLayout>
</template>
