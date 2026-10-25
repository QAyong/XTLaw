<script setup lang="ts">
import type { ExtensionCatalogKind, ExtensionCatalogListing, ExtensionCatalogSnapshot, ExtensionCatalogSource } from '@buddy-shared/extensions/extensionCatalog'
import { connectorSetupState, isBuiltinCapability } from '@buddy-shared/extensions/extensionCapabilities'
import { EXTENSION_CATALOG_KINDS, EXTENSION_CATALOG_SOURCES } from '@buddy-shared/extensions/extensionCatalog'
import { NAlert, NButton, NEmpty, NInput, NSelect, NSpin, NTag } from 'naive-ui'
import { gt } from 'semver'
import { computed, onMounted, onScopeDispose, shallowRef } from 'vue'
import { useExtensionContext } from '../extensionContext'
import { extensionLabels } from '../extensionLabels'
import DesktopExtensionCatalogCard from './DesktopExtensionCatalogCard.vue'
import DesktopExtensionCompatibilityHint from './DesktopExtensionCompatibilityHint.vue'

defineProps<{ busy: boolean }>()
const emit = defineEmits<{ install: [entry: ExtensionCatalogListing], applyUpdate: [id: string], configure: [id: string] }>()
const { state, language, capabilityStatus } = useExtensionContext()
const snapshot = shallowRef<ExtensionCatalogSnapshot | null>(null)
const loading = shallowRef(false)
const query = shallowRef('')
const category = shallowRef<string | null>(null)
const kind = shallowRef<ExtensionCatalogKind | null>(null)
const source = shallowRef<ExtensionCatalogSource | null>(null)
const error = shallowRef(false)
const en = computed(() => language.value === 'en-US')
const labels = computed(() => extensionLabels(language.value))
const kindOptions = computed(() => EXTENSION_CATALOG_KINDS.map(value => ({ label: labels.value.kinds[value], value })))
const sourceOptions = computed(() => EXTENSION_CATALOG_SOURCES.map(value => ({ label: labels.value.sources[value], value })))
let disposed = false
let revision = 0
const categories = computed(() => [...new Set(snapshot.value?.plugins.flatMap(item => item.manifest.categories) ?? [])].map(value => ({ label: value, value })))
const plugins = computed(() => (snapshot.value?.plugins ?? []).filter((item) => {
  const { manifest } = item
  const text = [manifest.id, manifest.author, manifest.name, manifest.description, ...manifest.tags].join(' ').toLocaleLowerCase()
  return (!category.value || manifest.categories.includes(category.value)) && (!kind.value || item.kind === kind.value) && (!source.value || item.source === source.value) && text.includes(query.value.trim().toLocaleLowerCase())
}).map((item) => {
  const installed = state.installed.value.find(next => next.manifest.id === item.manifest.id)
  const retained = state.unavailable.value.find(next => next.manifest.id === item.manifest.id && !next.pending)
  const version = installed?.pending?.manifest.version ?? installed?.manifest.version ?? retained?.manifest.version
  // An installed MCP entry whose connection still lacks its token or sign-in is not finished: the card sends the user to settings.
  const needsSetup = !!installed?.manifest.contributes.mcpConnectors.some(connector => connectorSetupState(connector, capabilityStatus?.connectors.value.find(record => record.id === connector.id)) === 'needs-setup')
  return { ...item, installed, installedVersion: version, needsSetup, builtin: isBuiltinCapability(item), available: !version || gt(item.manifest.version, version) }
}))
async function refresh(force = false) {
  const current = ++revision
  loading.value = true
  error.value = false
  try {
    const next = await state.api.catalog(force)
    if (!disposed && revision === current) {
      snapshot.value = next
      error.value = !!next.error
    }
  }
  catch {
    if (!disposed && revision === current)
      error.value = true
  }
  finally {
    if (!disposed && revision === current)
      loading.value = false
  }
}
void refresh()
onMounted(() => void capabilityStatus?.loadConnectors())
onScopeDispose(() => {
  disposed = true
  revision++
})
</script>

<template>
  <section class="extension-catalog" data-testid="extension-catalog">
    <div class="extension-catalog__search">
      <NInput v-model:value="query" clearable :placeholder="en ? 'Search the market' : '搜索名称、描述或标签'" :aria-label="en ? 'Search the market' : '搜索市场'" />
      <NSelect v-model:value="kind" clearable :options="kindOptions" :placeholder="labels.kindFilter" :aria-label="labels.kindFilter" data-testid="catalog-kind-filter" />
      <NSelect v-model:value="source" clearable :options="sourceOptions" :placeholder="labels.sourceFilter" :aria-label="labels.sourceFilter" data-testid="catalog-source-filter" />
      <NSelect v-if="categories.length" v-model:value="category" clearable :options="categories" :placeholder="en ? 'Category' : '分类'" :aria-label="en ? 'Category' : '分类'" />
      <NButton :loading="loading" @click="refresh(true)">
        {{ en ? 'Refresh' : '刷新' }}
      </NButton>
    </div>
    <NAlert v-if="error" type="warning" :title="en ? 'Could not refresh the market' : '暂时无法刷新市场'">
      {{ snapshot?.plugins.length ? (en ? 'Showing the last saved catalog.' : '正在显示上次缓存的插件目录。') : (en ? 'Try again later, or install a local package.' : '请稍后重试，也可以先安装本地插件包。') }}
    </NAlert>
    <NAlert v-if="snapshot?.invalidEntries" type="warning">
      {{ en ? 'Some plugin information could not be read. Other plugins remain available.' : '部分插件信息无法读取，其他插件仍可正常使用。' }}
    </NAlert>
    <NSpin :show="loading && !snapshot">
      <NEmpty v-if="!plugins.length" class="extension-catalog__empty" :description="en ? 'Nothing to display' : '暂无可展示的内容'" />
      <div v-else class="extension-catalog__grid">
        <DesktopExtensionCatalogCard v-for="item in plugins" :key="item.manifest.id" :data-catalog-id="item.manifest.id" class="extension-catalog__card" :manifest="item.manifest" :icon-url="item.iconUrl" :repository="item.repository" :kind="item.kind" :source="item.source" :language="language">
          <template #actions>
            <NTag v-if="item.builtin" size="small" :bordered="false" type="info" data-testid="catalog-builtin">
              {{ labels.builtin }}
            </NTag>
            <template v-else-if="item.needsSetup && !item.available">
              <NTag size="small" :bordered="false" type="warning" data-testid="catalog-needs-setup">
                {{ labels.setupNeeded }}
              </NTag>
              <NButton size="small" type="primary" data-testid="catalog-configure" @click="emit('configure', item.manifest.id)">
                {{ labels.setupConfigure }}
              </NButton>
            </template>
            <NButton v-else-if="item.installed?.pending?.manifest.version === item.manifest.version && !item.available" size="small" type="primary" :disabled="busy || !item.compatible || !!item.installed.pending.incompatibility" data-testid="catalog-apply-update" @click="emit('applyUpdate', item.manifest.id)">
              {{ labels.applyUpdate }}
            </NButton>
            <NButton v-else size="small" :type="item.available ? 'primary' : 'default'" :disabled="busy || !item.compatible || !item.available" @click="emit('install', item)">
              {{ !item.available ? (en ? 'Installed' : '已安装') : item.installedVersion ? (en ? 'Update' : '更新') : (en ? 'Install' : '安装') }}
            </NButton>
            <DesktopExtensionCompatibilityHint v-if="item.incompatibility" :issue="item.incompatibility" :language="language" />
          </template>
        </DesktopExtensionCatalogCard>
      </div>
    </NSpin>
  </section>
</template>

<style scoped>
.extension-catalog { display: grid; gap: 18px; }
.extension-catalog__search { display: flex; gap: 10px; align-items: center; }
.extension-catalog__search :deep(.n-select) { width: 130px; flex: none; }
.extension-catalog__empty { padding: 100px 0; }
.extension-catalog__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); gap: 12px; }
</style>
