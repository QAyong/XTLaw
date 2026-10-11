<script setup lang="ts">
import type { TypographyPreferences } from '@buddy-shared/typography/typographyPreferences'
import type { ApplicationSettingsProps } from './typing'
import { BODY_SIZE_MAX, BODY_SIZE_MIN, DEFAULT_TYPOGRAPHY, resolveTypography } from '@buddy-shared/typography/typographyPreferences'
import { NSelect, NSpin, useMessage } from 'naive-ui'
import { computed, shallowRef } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { useLocalFonts } from '../../state/useLocalFonts'

type TypographyField = keyof TypographyPreferences

const props = defineProps<ApplicationSettingsProps>()
const { t } = useBuddyI18n(() => props.language)
const message = useMessage()
const pending = shallowRef<ReadonlySet<TypographyField>>(new Set())
const preferences = computed(() => props.config?.desktop.typography ?? DEFAULT_TYPOGRAPHY)
const preview = computed(() => resolveTypography(preferences.value))
const { families, loading, load } = useLocalFonts(() => message.error(t('desktop.settings.typography.loadFailed')))
const installedOptions = computed(() => families.value.map(value => ({ label: value, value })))
const fontFields = computed(() => [
  { key: 'uiFont' as const, label: t('desktop.settings.typography.uiFont') },
  { key: 'bodyFont' as const, label: t('desktop.settings.typography.bodyFont') },
  { key: 'codeFont' as const, label: t('desktop.settings.typography.codeFont') },
].map(field => ({
  ...field,
  options: [
    { label: t(field.key === 'codeFont' ? 'desktop.settings.typography.systemMono' : 'desktop.settings.typography.system'), value: '' },
    ...installedOptions.value,
  ],
})))
const sizeOptions = Array.from({ length: BODY_SIZE_MAX - BODY_SIZE_MIN + 1 }, (_, index) => ({
  label: `${BODY_SIZE_MIN + index} px`,
  value: BODY_SIZE_MIN + index,
}))

async function save(field: TypographyField, value: string | number | null) {
  if (pending.value.has(field))
    return
  pending.value = new Set([...pending.value, field])
  try {
    const next = value ?? DEFAULT_TYPOGRAPHY[field]
    if (!await props.updateSettings({ desktop: { typography: { [field]: next } } }))
      message.error(t('desktop.settings.saveFailed'))
  }
  finally {
    pending.value = new Set([...pending.value].filter(item => item !== field))
  }
}
</script>

<template>
  <section v-if="config" class="desktop-typography-settings" data-testid="typography-settings">
    <h2>{{ t('desktop.settings.typography.title') }}</h2>
    <div class="desktop-typography-settings__group">
      <div v-for="field in fontFields" :key="field.key" class="desktop-settings-row" :data-testid="`typography-${field.key}`">
        <div>
          <strong>{{ field.label }}</strong>
        </div>
        <div class="desktop-settings-row__control">
          <NSelect
            filterable
            tag
            :clearable="preferences[field.key] !== DEFAULT_TYPOGRAPHY[field.key]"
            :options="field.options"
            :value="preferences[field.key]"
            :disabled="pending.has(field.key)"
            :loading="loading"
            @update:show="load"
            @update:value="save(field.key, $event)"
          />
          <NSpin v-if="pending.has(field.key)" size="small" />
        </div>
      </div>
      <div class="desktop-settings-row" data-testid="typography-bodySize">
        <div>
          <strong>{{ t('desktop.settings.typography.bodySize') }}</strong>
        </div>
        <div class="desktop-settings-row__control">
          <NSelect
            :clearable="preferences.bodySize !== DEFAULT_TYPOGRAPHY.bodySize"
            :options="sizeOptions"
            :value="preferences.bodySize"
            :disabled="pending.has('bodySize')"
            @update:value="save('bodySize', $event)"
          />
          <NSpin v-if="pending.has('bodySize')" size="small" />
        </div>
      </div>
      <div class="desktop-typography-settings__preview" data-testid="typography-preview">
        <span class="desktop-typography-settings__preview-label" :style="{ fontFamily: preview.ui }">{{ t('desktop.settings.typography.preview') }}</span>
        <p :style="{ fontFamily: preview.body, fontSize: preview.bodySize, lineHeight: preview.bodyLineHeight }">
          {{ t('desktop.settings.typography.sample') }}
        </p>
        <code :style="{ fontFamily: preview.mono }">const message = 'Hello, XTLaw 2026';</code>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.desktop-typography-settings {
  display: grid;
  gap: 0.8rem;
}

.desktop-typography-settings h2 {
  margin: 0;
  font-size: 0.92rem;
}

.desktop-typography-settings__group {
  overflow: hidden;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.65rem;
  background: var(--buddy-surface-base);
}

.desktop-settings-row {
  display: grid;
  min-height: 4rem;
  grid-template-columns: minmax(0, 1fr) minmax(10rem, 19rem);
  align-items: center;
  gap: 2rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  padding: 0.75rem 0.9rem;
}

.desktop-settings-row > div:first-child {
  display: grid;
  gap: 0.25rem;
}

.desktop-settings-row strong {
  color: var(--buddy-text-primary);
  font-size: 0.8rem;
  font-weight: 600;
}

.desktop-settings-row__control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.55rem;
}

.desktop-typography-settings__preview {
  display: grid;
  gap: 0.75rem;
  background: var(--buddy-surface-subtle);
  padding: 1rem;
  color: var(--buddy-text-primary);
}

.desktop-typography-settings__preview-label {
  color: var(--buddy-text-secondary);
  font-size: 12px;
}

.desktop-typography-settings__preview p {
  margin: 0;
  font-weight: 400;
}

.desktop-typography-settings__preview code {
  font-size: 12px;
  line-height: 20px;
}

@container (max-width: 560px) {
  .desktop-settings-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 0.7rem;
  }
}
</style>
