<script setup lang="ts">
import type { ExtensionReview, ExtensionReviewResult, ExtensionStatus } from '@buddy-shared/extensions/extensionApi'
import type { ExtensionCapabilityImpact, InstalledExtensionKind } from '@buddy-shared/extensions/extensionCapabilities'
import type { ExtensionCatalogListing } from '@buddy-shared/extensions/extensionCatalog'
import type { ExtensionIncompatibleReview } from '@buddy-shared/extensions/extensionCompatibility'
import type { FileOpeningChoice } from '@buddy-shared/files/fileOpening'
import { installedExtensionKinds } from '@buddy-shared/extensions/extensionCapabilities'
import { Add16Regular, ChevronDown16Regular, MoreHorizontal20Regular } from '@vicons/fluent'
import { NAlert, NButton, NDropdown, NEmpty, NModal, NSelect, useMessage } from 'naive-ui'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import { useExtensionContext } from '../extensionContext'
import { extensionLabels } from '../extensionLabels'
import DesktopExtensionWorkbench from '../layouts/DesktopExtensionWorkbench.vue'
import { extensionErrorCode } from '../state/useExtensionState'
import DesktopExtensionAuthoringSettings from './DesktopExtensionAuthoringSettings.vue'
import DesktopExtensionCard from './DesktopExtensionCard.vue'
import DesktopExtensionCatalog from './DesktopExtensionCatalog.vue'
import DesktopExtensionIncompatibleReview from './DesktopExtensionIncompatibleReview.vue'
import DesktopExtensionInstallations from './DesktopExtensionInstallations.vue'
import DesktopExtensionInstallReview from './DesktopExtensionInstallReview.vue'
import DesktopExtensionUnavailableCard from './DesktopExtensionUnavailableCard.vue'
import DesktopExtensionUninstallDialog from './DesktopExtensionUninstallDialog.vue'

const { state, language, startCreation, startSkillCreation, authoring, settingsLocation } = useExtensionContext()
const { installed, unavailable } = state
const unavailableCurrent = computed(() => unavailable.value.filter(item => !item.pending))
const unavailablePending = computed(() => new Map(unavailable.value.filter(item => item.pending).map(item => [item.manifest.id, item])))
const labels = computed(() => extensionLabels(language.value))
const en = computed(() => language.value === 'en-US')
const section = shallowRef<'marketplace' | 'installed'>('marketplace')
const installedKind = shallowRef<InstalledExtensionKind | null>(null)
const installedKindOptions = computed(() => (['plugin', 'skill', 'mcp', 'agent'] as const).map(value => ({ label: labels.value.kinds[value], value })))
const visibleInstalled = computed(() => installedKind.value ? installed.value.filter(item => installedExtensionKinds(item.manifest).includes(installedKind.value!)) : installed.value)
const toolbarActions = computed(() => [{ key: 'author', label: language.value === 'en-US' ? 'Author signature' : '作者署名', props: { 'role': 'menuitem', 'data-testid': 'extension-author-settings' } }, { key: 'history', label: language.value === 'en-US' ? 'Installation log' : '安装记录', props: { 'role': 'menuitem', 'data-testid': 'extension-installation-history' } }])
const menuItem = (key: string, label: string) => ({ key, label, props: { 'role': 'menuitem', 'data-testid': `extension-add-${key}` } })
// One entry point for everything the market now holds. Items that live on other pages hand over to them (see `addSelect`).
const addOptions = computed(() => [
  { type: 'group' as const, key: 'group-generate', label: labels.value.addGenerate, children: [menuItem('generate-plugin', labels.value.create), menuItem('generate-skill', labels.value.generateSkill)] },
  { type: 'group' as const, key: 'group-manual', label: labels.value.addManual, children: [menuItem('mcp', labels.value.addMcp), menuItem('subagent', labels.value.createSubagent)] },
  { type: 'group' as const, key: 'group-import', label: labels.value.addImport, children: [menuItem('package', labels.value.install), menuItem('development', labels.value.development), menuItem('skill-import', labels.value.importSkill), menuItem('mcp-import', labels.value.importMcp)] },
])
const addMenuOpen = shallowRef(false)
const busy = shallowRef(false)
const review = shallowRef<ExtensionReview | null>(null)
// A pack installs its missing members one after another, each through the same review as a single item. The queue holds the ones still to go.
const packQueue = shallowRef<ExtensionCatalogListing[]>([])
const incompatibleReview = shallowRef<ExtensionIncompatibleReview | null>(null)
const diagnostics = shallowRef<string | null>(null)
const installationLog = shallowRef(false)
const authorSettings = shallowRef(false)
const removing = shallowRef<ExtensionStatus | null>(null)
const kept = shallowRef<ExtensionCapabilityImpact['modified']>([])
const message = useMessage()
const router = useRouter()
const selected = computed(() => installed.value.find(item => item.manifest.id === diagnostics.value))
function showError(code: string) {
  message.error(`${labels.value.installFailed}: ${code}`)
}
watch(state.error, (error) => {
  if (error)
    showError(error)
}, { immediate: true })
async function run(action: () => Promise<unknown>, creatorUnavailable = labels.value.creatorUnavailable) {
  if (busy.value)
    return false
  busy.value = true
  try {
    await action()
    await state.refresh()
    return true
  }
  catch (reason) {
    if (reason instanceof Error && reason.message === 'SKILL_UNAVAILABLE')
      message.error(creatorUnavailable)
    else
      showError(extensionErrorCode(reason))
    return false
  }
  finally {
    busy.value = false
  }
}
function select(development = false) {
  void run(async () => {
    acceptReview(await state.api.selectPackage(development))
  })
}
function acceptReview(next: ExtensionReviewResult | null) {
  cancel()
  incompatibleReview.value = next && 'incompatibility' in next ? next : null
  review.value = next && 'token' in next ? next : null
}
function create() {
  void run(() => startCreation(labels.value.creationPrompt))
}
function createSkill() {
  void run(() => startSkillCreation(labels.value.skillCreationPrompt), labels.value.skillCreatorUnavailable)
}
function addSelect(key: string) {
  const handlers: Record<string, () => void> = {
    'generate-plugin': create,
    'generate-skill': createSkill,
    'mcp': () => void router.push(desktopRouteLocations.mcp('add')),
    'subagent': () => void router.push(desktopRouteLocations.buddyCreateNpc()),
    'package': () => select(),
    'development': () => select(true),
    'skill-import': () => void router.push(desktopRouteLocations.skillImport()),
    'mcp-import': () => void router.push(desktopRouteLocations.mcp('import')),
  }
  handlers[key]?.()
}
function cancel() {
  const current = review.value
  review.value = null
  if (current)
    void state.api.cancelInstall(current.token).catch(() => {})
}
function reviewEntry(entry: ExtensionCatalogListing) {
  return run(async () => {
    acceptReview(await state.api.reviewCatalog(entry.manifest.id, entry.manifest.version))
  })
}
// Stops the queue when a review could not be opened, so a failed member never leaves the rest to pop up unasked.
async function reviewNextInPack() {
  const [next, ...rest] = packQueue.value
  packQueue.value = rest
  if (next && (!await reviewEntry(next) || !review.value))
    packQueue.value = []
}
async function installPack(entries: ExtensionCatalogListing[]) {
  packQueue.value = entries
  await reviewNextInPack()
}
function cancelReview() {
  packQueue.value = []
  cancel()
}
function install(applyUpdate: boolean, choices: FileOpeningChoice[]) {
  const current = review.value
  if (current) {
    void run(async () => {
      review.value = null
      await state.install(current, applyUpdate, choices)
      if (!packQueue.value.length)
        section.value = 'installed'
      if (current.currentVersion)
        message.success(applyUpdate ? labels.value.updateApplied : labels.value.updateDeferred)
    }).then(async (ok) => {
      if (ok)
        await reviewNextInPack()
      else
        packQueue.value = []
    })
  }
}
function applyUpdate(id: string) {
  void run(async () => {
    await state.api.applyUpdate(id)
    message.success(labels.value.updateApplied)
  })
}
function openLocation(item: ExtensionStatus) {
  if (!item.enabled || !item.compatible || item.state === 'blocked')
    return null
  return item.manifest.contributes.navigation ? desktopRouteLocations.extensionPage(item.manifest.id) : settingsLocation(item.manifest.id)
}
function open(item: ExtensionStatus) {
  const location = openLocation(item)
  if (location)
    void router.push(location)
}
// Sub-agents and connectors the user changed outlive their package, so say so before the uninstall is confirmed.
async function askRemove(item: ExtensionStatus) {
  kept.value = await state.api.capabilityImpact(item.manifest.id).then(impact => impact.modified, () => [])
  removing.value = item
}
async function remove(clearData: boolean) {
  const item = removing.value
  if (item && await run(() => state.api.uninstall(item.manifest.id, { clearData })))
    removing.value = null
}
onScopeDispose(cancel)
</script>

<template>
  <DesktopExtensionWorkbench v-model:section="section" :language="language" data-testid="extension-manager">
    <template #actions>
      <NDropdown trigger="click" :options="toolbarActions" @select="key => { if (key === 'author') authorSettings = true; else installationLog = true }">
        <NButton quaternary size="small" class="extension-manager__more" :aria-label="labels.more" data-testid="extension-toolbar-more">
          <template #icon>
            <DesktopIcon :component="MoreHorizontal20Regular" :size="16" />
          </template>
        </NButton>
      </NDropdown>
      <NDropdown v-model:show="addMenuOpen" trigger="click" placement="bottom-end" :options="addOptions" :disabled="busy" @select="addSelect">
        <NButton type="primary" size="small" :disabled="busy" :aria-label="labels.add" aria-haspopup="menu" :aria-expanded="addMenuOpen" data-testid="extension-add">
          <template #icon>
            <DesktopIcon :component="Add16Regular" :size="16" />
          </template>
          {{ labels.add }}
          <DesktopIcon :component="ChevronDown16Regular" :size="16" class="extension-manager__add-chevron" :class="{ 'is-open': addMenuOpen }" />
        </NButton>
      </NDropdown>
    </template>
    <NAlert v-if="state.installations.value.some(job => job.status === 'running')" type="info">
      {{ language === 'en-US' ? 'Installing plugin. You can continue using XTLaw.' : '正在安装插件，你可以继续使用 XTLaw。' }}
      <NButton text @click="installationLog = true">
        {{ language === 'en-US' ? 'View progress' : '查看进度' }}
      </NButton>
    </NAlert>
    <DesktopExtensionCatalog v-if="section === 'marketplace'" :busy="busy" @configure="router.push(desktopRouteLocations.mcp())" @install="reviewEntry" @install-pack="installPack" @apply-update="applyUpdate" />
    <NEmpty v-else-if="!installed.length && !unavailable.length && !state.error.value" class="extension-manager__empty">
      <template #default>
        <strong>{{ labels.empty }}</strong>
        <p>{{ labels.emptyDescription }}</p>
        <NButton type="primary" :disabled="busy" @click="create">
          {{ labels.create }}
        </NButton>
      </template>
    </NEmpty>
    <div v-else-if="section === 'installed' && (installed.length || unavailable.length)" class="extension-manager__installed">
      <NSelect v-model:value="installedKind" clearable class="extension-manager__kind-filter" :options="installedKindOptions" :placeholder="labels.installedKindFilter" :aria-label="labels.installedKindFilter" data-testid="installed-kind-filter" />
      <NEmpty v-if="installedKind && !visibleInstalled.length" class="extension-manager__empty" :description="en ? 'Nothing of this type is installed' : '没有该形态的已安装内容'" />
      <div class="extension-manager__grid">
        <DesktopExtensionUnavailableCard v-for="item in unavailableCurrent" :key="item.manifest.id" :item="item" :language="language" />
        <DesktopExtensionCard
          v-for="item in visibleInstalled"
          :key="item.manifest.id"
          :item="item"
          :unavailable-pending="unavailablePending.get(item.manifest.id)"
          :language="language"
          :busy="busy"
          :can-open="!!openLocation(item)"
          @toggle="run(() => state.api.enable(item.manifest.id, !item.enabled))"
          @restart="run(() => state.api.restart(item.manifest.id))"
          @apply-update="applyUpdate(item.manifest.id)"
          @diagnostics="diagnostics = item.manifest.id"
          @remove="askRemove(item)"
          @open="open(item)"
          @revoke-resources="run(() => state.api.revokeResources(item.manifest.id))"
        />
      </div>
    </div>
  </DesktopExtensionWorkbench>
  <NModal v-model:show="authorSettings" preset="card" :title="language === 'en-US' ? 'Author signature' : '作者署名'" class="extension-dialog">
    <DesktopExtensionAuthoringSettings v-if="authorSettings" :author="authoring.author.value" :language="language" :save="authoring.save" @saved="authorSettings = false" />
  </NModal>
  <NModal v-model:show="installationLog" preset="card" :title="language === 'en-US' ? 'Installation log' : '安装记录'" class="extension-dialog">
    <DesktopExtensionInstallations :jobs="state.installations.value" :language="language" @cancel="id => state.api.cancelInstallation(id).then(state.refresh)" />
  </NModal>
  <DesktopExtensionInstallReview v-if="review" :key="review.token" :review="review" :language="language" :busy="busy" @cancel="cancelReview" @install="install" />
  <DesktopExtensionIncompatibleReview v-if="incompatibleReview" :review="incompatibleReview" :language="language" @close="incompatibleReview = null" />
  <DesktopExtensionUninstallDialog v-if="removing" :name="removing.manifest.name" :kept="kept" :language="language" :busy="busy" @cancel="removing = null" @remove="remove" />
  <NModal :show="!!selected" preset="card" :title="labels.diagnostics" class="extension-dialog" @update:show="value => { if (!value) diagnostics = null }">
    <template v-if="selected">
      <h2>{{ selected.manifest.name }}</h2>
      <p>{{ selected.manifest.author || (language === 'en-US' ? 'Unsigned' : '未署名') }}</p>
      <p><code>{{ selected.manifest.id }}</code></p>
      <p>{{ selected.source ? (language === 'en-US' ? 'Market' : '市场') : (language === 'en-US' ? 'Local installation' : '本地安装') }}</p>
      <p>{{ labels.version }} {{ selected.manifest.version }} · API {{ selected.manifest.apiVersion }}</p>
      <p v-if="selected.activationMs !== null">
        {{ labels.activation }} {{ selected.activationMs }} ms
      </p>
      <p v-if="!selected.logs.length">
        {{ labels.noLogs }}
      </p>
      <ol class="extension-dialog__logs">
        <li v-for="(entry, index) in selected.logs" :key="index">
          <time>{{ new Date(entry.time).toLocaleTimeString() }}</time> <code>{{ entry.event }} {{ entry.code }} {{ entry.durationMs !== undefined ? `${entry.durationMs} ms` : '' }}</code>
        </li>
      </ol>
    </template>
  </NModal>
</template>

<style scoped lang="scss">
.extension-manager__more { width: 28px; height: 28px; padding: 0; }
.extension-manager__add-chevron { margin-left: 4px; transition: transform 140ms ease; }
.extension-manager__add-chevron.is-open { transform: rotate(180deg); }
@media (prefers-reduced-motion: reduce) { .extension-manager__add-chevron { transition: none; } }
.extension-manager__installed { display: grid; gap: 14px; }
.extension-manager__kind-filter { width: 160px; }
.extension-manager__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr)); align-items: stretch; gap: 12px; }
.extension-manager__empty {
  min-height: 360px;
  margin: 0;
  padding-top: clamp(72px, 14vh, 132px);

  :deep(.n-empty__description) { display: grid; max-width: 420px; justify-items: center; gap: 10px; text-align: center; }
  strong { color: var(--buddy-text-strong); font-size: 16px; }
  p { margin: 0 0 6px; line-height: 1.6; }
}
.extension-dialog__logs { padding-left: 20px; max-height: 320px; overflow: auto; font-size: 12px; line-height: 1.8; }
:global(.extension-dialog) { width: min(560px, calc(100vw - 48px)); max-height: calc(100vh - 48px); overflow-y: auto; }
</style>
