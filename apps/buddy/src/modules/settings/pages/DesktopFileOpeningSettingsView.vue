<script setup lang="ts">
import DesktopSettingsModuleLayout from '../layouts/DesktopSettingsModuleLayout.vue'
import { useSettingsContext } from '../settingsContext'
import DesktopArtifactOpeningSetting from '../widgets/file-opening/DesktopArtifactOpeningSetting.vue'
import DesktopFileOpeningSettings from '../widgets/file-opening/DesktopFileOpeningSettings.vue'

const { applicationSettings: { language } } = useSettingsContext()
</script>

<template>
  <DesktopSettingsModuleLayout>
    <div class="grid gap-6">
      <DesktopArtifactOpeningSetting />
      <DesktopFileOpeningSettings :language="language" />
    </div>
  </DesktopSettingsModuleLayout>
</template>
