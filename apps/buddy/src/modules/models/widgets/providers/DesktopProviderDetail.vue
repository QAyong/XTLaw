<script setup lang="ts">
import type { ModelProvidersStore } from '@/modules/models/state/typing'
import { Add20Regular, Info20Regular, Search20Regular } from '@vicons/fluent'
import { NButton, NInput, NPopconfirm, NSpace, NSwitch, NTooltip } from 'naive-ui'
import { computed, ref } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopManualModelDialog from '@/modules/models/widgets/providers/DesktopManualModelDialog.vue'
import DesktopModelCapabilityTags from '@/modules/models/widgets/providers/DesktopModelCapabilityTags.vue'
import DesktopModelDetailDialog from '@/modules/models/widgets/providers/DesktopModelDetailDialog.vue'
import DesktopProviderConnectionDialog from '@/modules/models/widgets/providers/DesktopProviderConnectionDialog.vue'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import DesktopSegmentedControl from '@/shared/ui/segmented-control/DesktopSegmentedControl.vue'
import { useProviderDetail } from './useProviderDetail'

const props = defineProps<{
  providerSettings: ModelProvidersStore
  providerId: string
}>()
const emit = defineEmits<{
  continueSetup: [providerId: string]
}>()
const language = computed(() => props.providerSettings.language.value)
const { t } = useBuddyI18n(language)
const {
  provider,
  models,
  selectedModel,
  modelActions,
  connectionActions,
  connectionSummary,
  savingManualModel,
  manualFormKey,
  showManualModelDialog,
  showModelDetailDialog,
  showConnectionDialog,
  saveManualModel,
  openManualModelDialog,
  openModelDetail,
  formatTokens,
  removeUnavailableModel,
} = useProviderDetail(() => props.providerSettings, () => props.providerId)
const typeFilter = ref('all')
const query = ref('')
const typeOptions = computed(() => (['all', 'chat', 'transcription', 'speech', 'image-generation'] as const).map(value => ({ value, label: t(`desktop.providers.modelTypes.${value}`) })))
const visibleModels = computed(() => {
  const search = query.value.trim().toLocaleLowerCase()
  return models.value.filter(model => (typeFilter.value === 'all' || model.type === typeFilter.value)
    && (!search || [model.displayName, model.modelId].some(value => value.toLocaleLowerCase().includes(search))))
})
</script>

<template>
  <div v-if="provider" class="desktop-provider-detail">
    <section v-if="!provider.setupComplete" class="desktop-provider-detail__notice">
      <div>
        <strong>{{ t('desktop.providers.setupIncomplete') }}</strong>
        <span>{{ t('desktop.providers.setupIncompleteDescription') }}</span>
      </div>
      <NButton type="primary" size="small" @click="emit('continueSetup', provider.id)">
        {{ t('desktop.providers.continueSetup') }}
      </NButton>
    </section>

    <section class="desktop-provider-detail__section">
      <h3>{{ t('desktop.providers.connectionStep') }}</h3>
      <div class="desktop-provider-detail__group">
        <div class="desktop-provider-detail__row">
          <div class="desktop-provider-detail__row-copy">
            <strong>{{ t('desktop.providers.authenticationStatus') }}</strong>
            <small>{{ provider.storedCredentialType
              ? (provider.storedCredentialType === 'api_key' ? 'API Key' : 'OAuth')
              : t('desktop.providers.authenticationNotConfigured') }}</small>
          </div>
          <NSpace v-if="!provider.storedCredentialType">
            <NButton
              v-for="authType in provider.authTypes"
              :key="authType"
              size="small"
              :disabled="providerSettings.isAuthenticating.value"
              :loading="providerSettings.isAuthenticating.value && !providerSettings.authChallenge.value"
              @click="providerSettings.loginProvider(provider.id, authType)"
            >
              {{ authType === 'api_key' ? t('desktop.providers.configureApiKey') : t('desktop.providers.useOAuth') }}
            </NButton>
          </NSpace>
          <NPopconfirm
            v-else
            :negative-text="t('common.cancel')"
            :positive-text="t('common.confirm')"
            @positive-click="providerSettings.clearProviderCredential(provider.id)"
          >
            <template #trigger>
              <NButton size="small" :disabled="provider.activeRunCount > 0">
                {{ t('desktop.providers.clearAuthentication') }}
              </NButton>
            </template>
            {{ t('desktop.providers.clearAuthenticationConfirmation') }}
          </NPopconfirm>
        </div>
        <div class="desktop-provider-detail__row">
          <div class="desktop-provider-detail__row-copy">
            <strong>{{ t('desktop.providers.connectionSettings') }}</strong>
            <small>{{ connectionSummary }}</small>
          </div>
          <NButton size="small" @click="showConnectionDialog = true">
            {{ t('common.edit') }}
          </NButton>
        </div>
      </div>
    </section>

    <section class="desktop-provider-detail__section">
      <div class="desktop-provider-detail__section-heading">
        <div class="desktop-provider-detail__section-copy">
          <h3>{{ t('desktop.providers.models') }}</h3>
          <p>{{ t('desktop.providers.modelsDescription') }}</p>
        </div>
        <div v-if="provider.custom || provider.syncUnavailableReason !== 'unsupported_api'" class="desktop-provider-detail__section-actions">
          <NTooltip :disabled="provider.canSyncModels">
            <template #trigger>
              <span>
                <NButton
                  size="small"
                  :disabled="!provider.canSyncModels"
                  :loading="providerSettings.syncingProviderId.value === provider.id"
                  @click="providerSettings.syncProviderModels(provider.id)"
                >
                  {{ t('desktop.providers.fetchServiceModels') }}
                </NButton>
              </span>
            </template>
            {{ t(`desktop.providers.syncUnavailable.${provider.syncUnavailableReason ?? 'unsupported_api'}`) }}
          </NTooltip>
          <NButton
            class="buddy-icon-button desktop-provider-detail__add-model"
            quaternary
            size="small"
            :aria-label="t('desktop.providers.addModelManually')"
            @click="openManualModelDialog"
          >
            <template #icon>
              <DesktopIcon :component="Add20Regular" />
            </template>
          </NButton>
        </div>
      </div>
      <div class="desktop-provider-detail__toolbar">
        <DesktopSegmentedControl v-model="typeFilter" :options="typeOptions" :aria-label="t('desktop.providers.modelType')" />
        <NInput v-model:value="query" class="desktop-provider-detail__search" clearable :placeholder="t('desktop.chat.searchModels')" :aria-label="t('desktop.chat.searchModels')">
          <template #prefix>
            <DesktopIcon :component="Search20Regular" />
          </template>
        </NInput>
      </div>
      <div v-if="visibleModels.length" class="desktop-provider-detail__group">
        <div
          v-for="model in visibleModels"
          :key="model.modelId"
          class="desktop-provider-detail__row desktop-provider-detail__model-row"
        >
          <div class="desktop-provider-detail__row-copy">
            <strong>{{ model.displayName }}</strong>
            <small>{{ model.modelId }}</small>
            <small v-if="model.type === 'chat'" class="desktop-provider-detail__model-parameters">
              {{ t('desktop.providers.compactParameters', {
                contextWindow: formatTokens(model.contextWindow),
                maxTokens: formatTokens(model.maxTokens),
              }) }}
            </small>
            <small>{{ t(`desktop.providers.modelTypes.${model.type}`) }}</small>
            <DesktopModelCapabilityTags v-if="model.type === 'chat'" :language="language" :model="model" />
          </div>
          <div class="desktop-provider-detail__model-actions">
            <template v-if="model.available">
              <NButton size="small" @click="openModelDetail(model.modelId)">
                {{ t('desktop.providers.manage') }}
              </NButton>
              <NSwitch
                :round="false"
                :value="model.enabled"
                :disabled="provider.activeRunCount > 0"
                @update:value="providerSettings.setProviderModelEnabled(provider.id, model.modelId, $event)"
              />
            </template>
            <template v-else>
              <NTooltip>
                <template #trigger>
                  <span
                    class="desktop-provider-detail__model-availability"
                    role="img"
                    :aria-label="t('desktop.providers.notFoundInLastSync')"
                  >
                    <DesktopIcon :component="Info20Regular" :size="18" />
                  </span>
                </template>
                {{ t('desktop.providers.modelUnavailableHint') }}
              </NTooltip>
              <NTooltip>
                <template #trigger>
                  <span>
                    <NButton
                      class="buddy-icon-button"
                      quaternary
                      size="small"
                      :disabled="provider.activeRunCount > 0 || providerSettings.mutatingProviderId.value === provider.id"
                      :aria-label="t('desktop.providers.removeUnavailableModel')"
                      @click="removeUnavailableModel(model.modelId)"
                    >
                      <template #icon>
                        <DesktopIcon name="delete" :size="16" />
                      </template>
                    </NButton>
                  </span>
                </template>
                {{ t('desktop.providers.removeUnavailableModel') }}
              </NTooltip>
            </template>
          </div>
        </div>
      </div>
      <p v-else class="desktop-provider-detail__empty" role="status">
        {{ t(models.length ? 'desktop.chat.noMatchingModels' : 'desktop.providers.noModels') }}
      </p>
    </section>
  </div>
  <DesktopManualModelDialog
    v-model:show="showManualModelDialog"
    :form-key="manualFormKey"
    :allow-chat="!!provider?.custom"
    :language="language"
    :saving="savingManualModel"
    @save="saveManualModel"
  />
  <DesktopModelDetailDialog
    v-model:show="showModelDetailDialog"
    :actions="modelActions"
    :language="language"
    :model="selectedModel"
    :disabled="(provider?.activeRunCount ?? 0) > 0"
    :saving="providerSettings.mutatingProviderId.value === providerId"
  />
  <DesktopProviderConnectionDialog
    v-if="provider"
    v-model:show="showConnectionDialog"
    :actions="connectionActions"
    :language="language"
    :provider="provider"
  />
</template>

<style scoped>
.desktop-provider-detail,
.desktop-provider-detail__section {
  display: grid;
  gap: 0.8rem;
}

.desktop-provider-detail {
  gap: 1.8rem;
}

.desktop-provider-detail__notice,
.desktop-provider-detail__row,
.desktop-provider-detail__section-heading {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.desktop-provider-detail__row-copy,
.desktop-provider-detail__notice > div,
.desktop-provider-detail__section-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.2rem;
}

.desktop-provider-detail__model-actions {
  display: flex;
  flex: none;
  align-items: center;
  margin-left: auto;
  gap: 0.4rem;
}

.desktop-provider-detail__model-availability {
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  flex: none;
  place-items: center;
  color: var(--buddy-status-warning-text);
}

.desktop-provider-detail__model-parameters {
  font-variant-numeric: tabular-nums;
}

.desktop-provider-detail__section-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.5rem;
}

.desktop-provider-detail__section h3,
.desktop-provider-detail__section-heading p {
  margin: 0;
}

.desktop-provider-detail__section h3 {
  font-size: 0.92rem;
}

.desktop-provider-detail__row small,
.desktop-provider-detail__notice span,
.desktop-provider-detail__section-heading p {
  color: var(--buddy-text-secondary);
  font-size: 0.7rem;
}

.desktop-provider-detail__notice {
  justify-content: space-between;
  border: 1px solid var(--buddy-border-strong);
  border-radius: 0.65rem;
  background: var(--buddy-surface-subtle);
  padding: 0.8rem 0.9rem;
}

.desktop-provider-detail__group {
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.65rem;
}

.desktop-provider-detail__row {
  min-height: 4rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0.7rem 0.9rem;
}

.desktop-provider-detail__row:last-child {
  border-bottom: 0;
}

.desktop-provider-detail__section-heading {
  align-items: flex-start;
  justify-content: space-between;
}

.desktop-provider-detail__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.desktop-provider-detail__search {
  flex-basis: 16rem;
  max-width: 100%;
  margin-left: auto;
}

.desktop-provider-detail__empty {
  margin: 0;
  padding: 2rem 0;
  color: var(--buddy-text-secondary);
  font-size: 0.8rem;
  text-align: center;
}
</style>
