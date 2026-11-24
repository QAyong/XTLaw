<script setup lang="ts">
import type { BuddyFileQuote, BuddyResourceQuote, BuddyTextQuote } from '@buddy-shared/conversation/buddyUserContent'
import type { JsonValue } from '@buddy-shared/workbench/workbenchState'
import type * as Monaco from 'monaco-editor/editor/editor.api.js'
import type { TextEditorPool } from '@/workbench/browser/TextEditorPool'
import type { TextModelPool } from '@/workbench/browser/TextModelPool'
import type { ResourceRef, WorkbenchView } from '@/workbench/common/workbench'
import { resolveBuiltinFileOpening } from '@buddy-shared/files/fileOpening'
import { requireFileTarget } from '@buddy-shared/spaces/spaceFileApi'
import { NButton, NSwitch } from 'naive-ui'
import { computed, onScopeDispose, shallowRef, useId, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import WorkbenchMenu from '@/shared/ui/contributions/WorkbenchMenu.vue'
import DesktopDocumentContent from '@/shared/ui/files/DesktopDocumentContent.vue'
import DesktopDocumentFindBar from '@/shared/ui/files/DesktopDocumentFindBar.vue'
import DesktopDocumentToolbar from '@/shared/ui/files/DesktopDocumentToolbar.vue'
import { handleDocumentFindKey } from '@/shared/ui/files/documentFind'
import { fileDocumentModes, resolveFileDocumentMode } from '@/shared/ui/files/fileDocumentPresentation'
import { renderMonacoFind } from '@/shared/ui/files/monacoDocumentFind'
import { useDocumentFind } from '@/shared/ui/files/useDocumentFind'
import { observeDesktopMonacoLayout } from '@/shared/ui/monaco/desktopMonacoLayout'
import ResourceSelectionQuoteMenu from '@/shared/ui/selection/ResourceSelectionQuoteMenu.vue'
import { revealMonacoQuote } from '@/shared/ui/selection/revealMonacoQuote'
import { registerMonacoResourceQuote } from '@/shared/ui/selection/useMonacoResourceQuote'
import { useResourceQuoteReveal } from '@/shared/ui/selection/useResourceQuoteReveal'
import { useSelectionReferences } from '@/shared/ui/selection/workbenchSelectionReferences'
import { useWorkbench } from '@/workbench/browser/workbenchContext'
import { fileImageResolver } from '../model/documentImageResolver'

import { fileOpeningHandler } from '../model/fileOpeningHandlers'
import { useFileOpening } from '../state/fileOpeningContext'
import { filePreviewRenderer } from './filePreviewRenderers'
import '@/shared/ui/files/documentFind.css'

const props = withDefaults(defineProps<{ view: WorkbenchView, models: TextModelPool, editors: TextEditorPool, language: 'zh-CN' | 'en-US', writeClipboardText: (text: string) => Promise<void>, toolbarTarget?: HTMLElement | null, visible?: boolean }>(), { visible: true })
const { copies, controller, labels, autoSave } = useWorkbench()
const autoSaveLabelId = useId()
const autoSaveSwitchTheme = {
  railWidthSmall: '26px',
  railHeightSmall: '14px',
  buttonWidthSmall: '10px',
  buttonHeightSmall: '10px',
  buttonWidthPressedSmall: '14px',
}
const autoSaveRevision = shallowRef(0)
if (autoSave)
  onScopeDispose(autoSave.subscribe(() => autoSaveRevision.value++))
const autoSaveEnabled = computed({
  get: () => {
    void autoSaveRevision.value
    return autoSave?.enabled ?? false
  },
  set: value => autoSave?.setEnabled(value),
})
const container = useTemplateRef<HTMLElement>('container')
const quoteMenu = useTemplateRef<InstanceType<typeof ResourceSelectionQuoteMenu>>('quoteMenu')
const references = useSelectionReferences()
const { t } = useBuddyI18n(() => props.language)
function quoteSource(format: 'source' | 'markdown' = 'source'): BuddyFileQuote['source'] {
  return { kind: 'file', title: props.view.title, file: requireFileTarget(props.view.resource.data), format }
}
function captureMonacoQuote(quote: BuddyResourceQuote) {
  return quoteMenu.value?.captureMonaco(quote) ?? null
}
function prepareQuote(quote: BuddyResourceQuote, x: number, y: number) {
  return quoteMenu.value?.prepare(quote, x, y) ?? null
}
const failed = shallowRef(false)
const editorReady = shallowRef(false)
const document = useTemplateRef<InstanceType<typeof DesktopDocumentContent>>('document')
const copy = shallowRef(copies.get(props.view.resource))
const autoSaveStatus = computed(() => {
  void autoSaveRevision.value
  return autoSave?.status(props.view.resource) ?? 'off'
})
const saveStatusText = computed(() => {
  if (copy.value?.loading)
    return labels.value.loading
  switch (autoSaveStatus.value) {
    case 'waiting': return labels.value.autoSaveWaiting
    case 'saving': return labels.value.saving
    case 'saving-dirty': return labels.value.savingDirty
    case 'failed': return labels.value.autoSaveFailed
    case 'conflict': return labels.value.autoSaveConflict
    case 'recovered': return labels.value.autoSaveRecovered
    case 'blocked': return labels.value.autoSaveBlocked
    case 'paused': return labels.value.autoSavePaused
    default: return copy.value?.dirty ? labels.value.dirty : labels.value.saved
  }
})
const opening = useFileOpening()
const target = computed(() => requireFileTarget(props.view.resource.data))
const imageResolver = computed(() => fileImageResolver(target.value))
const provider = computed(() => (opening?.resolve(props.view.title, 'inline') ?? resolveBuiltinFileOpening(props.view.title, 'inline')).provider)
const handler = computed(() => fileOpeningHandler(provider.value))
const previewRenderer = computed(() => filePreviewRenderer({ provider: provider.value, ownerId: props.view.id, target: target.value, source: 'working-copy', resourceReady: !!copy.value?.etag && !copy.value.blocked, text: copy.value?.text ?? '', name: props.view.title, visible: props.visible, language: props.language }))
const modes = computed(() => fileDocumentModes({ preview: handler.value?.input === 'text' && !!handler.value.preview, source: !!copy.value?.etag, edit: !!copy.value?.etag }))
const mode = computed({
  get: () => resolveFileDocumentMode(props.view.state.mode ?? (props.view.state.preview === false ? 'edit' : undefined), modes.value),
  set: value => controller.updateView(props.view.id, { state: { ...props.view.state, mode: value } }),
})
const searchable = computed(() => {
  if (!copy.value?.etag)
    return false
  if (mode.value === 'preview' && previewRenderer.value)
    return false
  return mode.value === 'preview' || mode.value === 'source' || mode.value === 'edit'
})
const find = useDocumentFind()
const editorHandle = shallowRef<Monaco.editor.IStandaloneCodeEditor>()
let findDecorations: Monaco.editor.IEditorDecorationsCollection | null = null
let revealedFind = ''
function onFindKey(event: KeyboardEvent, phase: 'capture' | 'bubble') {
  if (phase === 'capture' ? event.key.toLowerCase() !== 'f' : event.key.toLowerCase() === 'f')
    return
  handleDocumentFindKey(event, { open: find.open.value, searchable: searchable.value, show: find.show, close: find.close, next: find.next, previous: find.previous })
}
function resourceIdentity(resource: ResourceRef): string {
  const { scheme, id, data } = resource
  return JSON.stringify([scheme, id, data.conversationId, data.spaceId, data.directoryId, data.revision, data.root, data.path])
}
const identity = computed(() => resourceIdentity(props.view.resource))
watch([identity, mode], () => {
  find.index.value = 0
})
watch(searchable, (value) => {
  if (!value)
    find.setResult(0, false)
})
watch([() => find.open.value, () => find.query.value, () => find.index.value, () => find.composing.value, mode, () => copy.value?.text, editorHandle], () => {
  const source = mode.value === 'source' || mode.value === 'edit'
  if (!find.open.value || !source || find.composing.value) {
    if (!find.open.value || !source) {
      findDecorations?.clear()
      revealedFind = ''
    }
    return
  }
  const current = editorHandle.value
  if (!current?.getModel || !current.createDecorationsCollection)
    return
  const key = `${find.query.value}:${find.index.value}`
  const rendered = renderMonacoFind(current, find.query.value, find.index.value, key !== revealedFind, findDecorations)
  revealedFind = key
  findDecorations = rendered.collection
  find.setResult(rendered.count, rendered.capped)
}, { flush: 'post' })
function captureResource() {
  return { resource: requireFileTarget(props.view.resource.data) }
}
const viewId = computed(() => props.view.id)
let editor: Monaco.editor.IStandaloneCodeEditor | undefined
function revealSource(quote: BuddyTextQuote) {
  return !!editor && revealMonacoQuote(editor, quote)
}
const attempt = shallowRef(0)
watch(identity, (_, __, onCleanup) => {
  const resource = props.view.resource
  let active = true
  failed.value = false
  copy.value = copies.get(resource)
  onCleanup(copies.onDidChangeResource(resource)(() => copy.value = copies.get(resource)).dispose)
  onCleanup(() => active = false)
  void copies.open(resource).catch(() => {
    if (active)
      failed.value = true
  })
}, { immediate: true })
watch([container, attempt, viewId, identity, () => props.visible], async ([element, , viewId, key, visible], _, onCleanup) => {
  const resource = props.view.resource
  let disposed = false
  let ownedEditor: Monaco.editor.IStandaloneCodeEditor | undefined
  let capture: ReturnType<typeof setTimeout> | undefined
  let release: (() => void) | undefined
  let releaseEditor: (() => void) | undefined
  let stopLayout: (() => void) | undefined
  const subscriptions: Monaco.IDisposable[] = []
  function state() {
    const view = controller.layout.views[viewId] ?? controller.navigation.find(viewId)?.view
    if (!view || resourceIdentity(view.resource) !== key)
      return
    const viewState = ownedEditor?.saveViewState()
    if (viewState)
      controller.updateView(viewId, { state: { ...view.state, editor: JSON.parse(JSON.stringify(viewState)) as JsonValue } })
  }
  function dispose(save = true) {
    if (disposed)
      return
    disposed = true
    clearTimeout(capture)
    stopLayout?.()
    try {
      if (save)
        state()
    }
    finally {
      if (editor === ownedEditor) {
        editor = undefined
        if (editorHandle.value === ownedEditor)
          editorHandle.value = undefined
        findDecorations = null
        editorReady.value = false
      }
      for (const subscription of subscriptions)
        subscription.dispose()
      try {
        releaseEditor?.()
      }
      finally { release?.() }
    }
  }
  onCleanup(dispose)
  if (!element || !visible)
    return
  try {
    const lease = await props.models.acquire(resource)
    if (disposed) {
      lease.release()
      return
    }
    release = lease.release
    await new Promise<void>(resolve => setTimeout(resolve, 0))
    if (disposed)
      return
    const dimension = { width: element.clientWidth, height: element.clientHeight }
    const editorLease = props.editors.acquire(lease.monaco, element, {
      model: lease.model,
      readOnly: mode.value !== 'edit' || !!copy.value?.blocked,
      domReadOnly: mode.value !== 'edit' || !!copy.value?.blocked,
      automaticLayout: false,
      dimension,
      fontSize: 13,
      lineHeight: 21,
      minimap: { enabled: false },
      wordWrap: (props.view.state.wrap ?? controller.configuration.get('workbench.wordWrap')) ? 'on' : 'off',
      tabSize: Number(controller.configuration.get('workbench.tabSize') ?? 2),
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      contextmenu: true,
    })
    releaseEditor = editorLease.release
    ownedEditor = editorLease.editor
    editor = ownedEditor
    editorHandle.value = ownedEditor
    if (references)
      subscriptions.push(registerMonacoResourceQuote(ownedEditor, { source: () => quoteSource(), capture: captureMonacoQuote }))
    stopLayout = observeDesktopMonacoLayout(element, size => ownedEditor?.layout(size))
    if (props.view.state.editor)
      ownedEditor.restoreViewState(JSON.parse(JSON.stringify(props.view.state.editor)) as Monaco.editor.ICodeEditorViewState)
    editorReady.value = true
    const schedule = () => {
      if (disposed)
        return
      clearTimeout(capture)
      capture = setTimeout(state, 250)
    }
    subscriptions.push(ownedEditor.onDidChangeCursorPosition(schedule), ownedEditor.onDidScrollChange(schedule))
  }
  catch {
    const active = !disposed
    dispose(false)
    if (active)
      failed.value = true
  }
}, { immediate: true })
watch([mode, () => copy.value?.blocked], ([value, blocked]) => editor?.updateOptions({ readOnly: value !== 'edit' || !!blocked, domReadOnly: value !== 'edit' || !!blocked }), { flush: 'sync' })
useResourceQuoteReveal({
  viewId: () => props.view.id,
  identity: () => identity.value,
  visible: () => props.visible,
  ready: () => !!document.value?.ready,
  reveal: quote => document.value?.reveal(quote) ?? false,
})
watch(() => props.view.state.wrap, value => editor?.updateOptions({ wordWrap: (value ?? controller.configuration.get('workbench.wordWrap')) ? 'on' : 'off' }))
async function retry() {
  const key = identity.value
  const resource = props.view.resource
  failed.value = false
  try {
    await copies.open(resource)
    if (identity.value === key)
      attempt.value++
  }
  catch {
    if (identity.value === key)
      failed.value = true
  }
}
onScopeDispose(controller.configuration.subscribe(() => editor?.updateOptions({ wordWrap: (props.view.state.wrap ?? controller.configuration.get('workbench.wordWrap')) ? 'on' : 'off', tabSize: Number(controller.configuration.get('workbench.tabSize') ?? 2) })))
</script>

<template>
  <div class="file-editor" :data-dirty="copy?.dirty" @keydown.capture="onFindKey($event, 'capture')" @keydown="onFindKey($event, 'bubble')">
    <p v-if="copy?.blocked" role="status">
      {{ t('desktop.context.fileAction.mutationBlocked') }}
    </p>
    <Teleport v-if="visible" :to="toolbarTarget ?? 'body'" :disabled="!toolbarTarget">
      <DesktopDocumentToolbar v-model="mode" :name="String(view.resource.data.path)" :modes="modes" :language="language" :embedded="!!toolbarTarget" :searchable="searchable" :search-open="find.open.value" @toggle-search="find.toggle()">
        <template #actions>
          <WorkbenchMenu target="resource.actions" :values="{ 'resource.scheme': view.resource.scheme }" :capture="captureResource" />
          <div v-if="autoSave && mode === 'edit'" class="file-editor__auto-save" :title="labels.autoSaveHint">
            <span :id="autoSaveLabelId">{{ labels.autoSave }}</span>
            <NSwitch v-model:value="autoSaveEnabled" class="file-editor__auto-save-switch" size="small" :round="false" :theme-overrides="autoSaveSwitchTheme" :disabled="!copy?.etag || copy.loading" :aria-labelledby="autoSaveLabelId" />
          </div>
          <NButton v-if="mode === 'edit' || copy?.dirty" size="tiny" secondary :loading="copy?.saving" :disabled="!copy || copy.loading || copy.saving || copy.blocked || !!copy.conflict || !copy.dirty" @click="copies.save(view.resource)">
            {{ labels.save }}
          </NButton>
        </template>
      </DesktopDocumentToolbar>
    </Teleport>
    <section v-if="copy?.conflict" class="file-editor__conflict" role="alert">
      <p>{{ labels.conflict }}</p>
      <details><summary>{{ labels.diskVersion }}</summary><pre>{{ copy.conflict.text }}</pre></details>
      <button type="button" @click="copies.resolveConflict(view.resource, 'disk')">
        {{ labels.disk }}
      </button>
      <button type="button" @click="copies.resolveConflict(view.resource, 'local')">
        {{ labels.local }}
      </button>
    </section>
    <div v-if="(copy?.error && copy.error !== 'FILE_SAVE_FAILED') || failed" class="file-editor__error" role="alert">
      {{ copy?.error === 'FILE_NOT_FOUND' ? labels.fileMissing : labels.failed }} <button type="button" @click="retry">
        {{ labels.retry }}
      </button>
    </div>
    <ResourceSelectionQuoteMenu v-if="references" ref="quoteMenu" :view-id="view.id" :owner-key="`${view.id}:${identity}:${mode}`" :language="language" :visible="visible" :write-clipboard-text="writeClipboardText" />
    <div class="file-editor__document">
      <DesktopDocumentFindBar v-if="find.open.value" v-model="find.query.value" :count="find.count.value" :index="find.index.value" :capped="find.capped.value" :focus-token="find.focusToken.value" :language="language" @next="find.next()" @previous="find.previous()" @close="find.close()" @composing="find.composing.value = $event" />
      <DesktopDocumentContent
        ref="document" :source-ready="editorReady" :reveal-source="revealSource"
        :mode="mode" :name="view.title" :text="copy?.text ?? ''" :resolve-image="imageResolver" :language="language" :write-clipboard-text="writeClipboardText"
        :quote-source="references ? quoteSource('markdown') : undefined" :prepare-quote="prepareQuote" :find-open="find.open.value && searchable && mode === 'preview'" :find-query="find.query.value" :find-index="find.index.value" :find-paused="find.composing.value" @find-result="find.setResult($event.count, $event.capped)" @scroll.capture="quoteMenu?.close()"
      >
        <template v-if="previewRenderer" #preview>
          <component :is="previewRenderer.component" v-bind="previewRenderer.props" @error="failed = true" />
        </template>
        <template #source>
          <div ref="container" class="file-editor__monaco" data-testid="workbench-text-editor" />
        </template>
      </DesktopDocumentContent>
    </div>
    <footer v-if="mode === 'edit' || copy?.dirty || copy?.saving || copy?.error === 'FILE_SAVE_FAILED'" class="file-editor__status">
      <span role="status">{{ saveStatusText }} · UTF-8</span>
      <NButton v-if="autoSave && (autoSaveStatus === 'failed' || autoSaveStatus === 'recovered')" size="tiny" secondary :loading="copy?.saving" :disabled="copy?.loading || copy?.blocked || !!copy?.conflict" @click="autoSave.retry(view.resource)">
        {{ autoSaveStatus === 'recovered' ? autoSaveEnabled ? labels.autoSaveResume : labels.save : labels.retry }}
      </NButton>
    </footer>
  </div>
</template>

<style scoped>
.file-editor { display: flex; flex: 1; min-height: 0; min-width: 0; flex-direction: column; }
.file-editor__document { position: relative; display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; }
.file-editor__conflict button, .file-editor__error button { padding: 3px 7px; background: var(--buddy-state-hover); border: 1px solid var(--buddy-border-subtle); border-radius: 4px; color: var(--buddy-text-secondary); cursor: pointer; }
.file-editor__monaco { flex: 1; min-height: 0; }
.file-editor__conflict, .file-editor__error { padding: 10px 14px; font-size: 12px; background: var(--buddy-state-hover); }
.file-editor__conflict pre { max-height: 150px; overflow: auto; white-space: pre-wrap; }
.file-editor__auto-save { display: inline-flex; flex: none; align-items: center; gap: 5px; color: var(--buddy-text-secondary); font-size: 11px; white-space: nowrap; }
.file-editor__auto-save-switch { height: 22px; }
.file-editor__status { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 3px 12px; color: var(--buddy-text-secondary); border-top: 1px solid var(--buddy-border-subtle); font-size: 10px; }
.file-editor__status span { overflow-wrap: anywhere; }
</style>
