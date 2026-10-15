<script setup lang="ts">
import { onMounted } from 'vue'
import DesktopSettingsModuleLayout from '@/modules/settings/layouts/DesktopSettingsModuleLayout.vue'
import { useSettingsContext } from '@/modules/settings/settingsContext'
import { useLegalSettings } from '@/modules/settings/state/useLegalSettings'
import DesktopLegalSettings from '@/modules/settings/widgets/web/DesktopLegalSettings.vue'
import DesktopWebSettings from '@/modules/settings/widgets/web/DesktopWebSettings.vue'

const { webSettings, mcpSettings, ready } = useSettingsContext()
onMounted(() => {
  void ready.then(() => {
    void webSettings.load()
    void mcpSettings.load()
  })
})
const { busy, error, language, snapshot, searchSources, load, setSearchEnabled, reorderSearch, setFetchEnabled, saveCredential, revealCredential } = webSettings
const { busy: legalBusy, connector: legalConnector, saveToken: saveLegalToken } = useLegalSettings(mcpSettings)
</script>

<template>
  <DesktopSettingsModuleLayout :loading="busy && !snapshot">
    <DesktopWebSettings
      :busy="busy"
      :error="error"
      :language="language"
      :snapshot="snapshot"
      :search-sources="searchSources"
      :load="load"
      :set-search-enabled="setSearchEnabled"
      :reorder-search="reorderSearch"
      :set-fetch-enabled="setFetchEnabled"
      :save-credential="saveCredential"
      :reveal-credential="revealCredential"
    >
      <template #services>
        <DesktopLegalSettings
          :connector="legalConnector"
          :disabled="legalBusy"
          :language="language"
          :save-token="saveLegalToken"
        />
      </template>
    </DesktopWebSettings>
  </DesktopSettingsModuleLayout>
</template>
