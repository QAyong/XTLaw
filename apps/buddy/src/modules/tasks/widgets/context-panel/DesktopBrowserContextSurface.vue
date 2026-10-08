<script setup lang="ts">
import type { DesktopBrowserApi, DesktopBrowserState } from '@buddy-electron/shared/desktopApi'
import type { TaskBrowserContextTab } from '../../model/context-panel/taskContextPanel'
import type { BrowserToolbarBusyAction, BrowserToolbarMenuActionKey } from './browserToolbarMenu'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { DesktopBrowserGuestSurfaceHost } from '@/platform/browser/browserGuestSurface'
import { Dismiss16Regular, Pause16Regular } from '@vicons/fluent'
import { useMessage } from 'naive-ui'
import { computed, shallowRef, toRef, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import WorkbenchPanelContent from '@/workbench/browser/WorkbenchPanelContent.vue'
import { browserErrorNotice, browserNoticeKey, downloadNotice } from './browserNotice'
import DesktopBrowserResponsiveViewport from './DesktopBrowserResponsiveViewport.vue'
import DesktopBrowserToolbar from './DesktopBrowserToolbar.vue'
import DesktopBrowserViewportControls from './DesktopBrowserViewportControls.vue'
import { useBrowserAddress } from './useBrowserAddress'
import { useBrowserContextSurface } from './useBrowserContextSurface'
import { useBrowserResponsiveViewport } from './useBrowserResponsiveViewport'

const props = defineProps<{
  tab: TaskBrowserContextTab | null
  api: DesktopBrowserApi
  guestHost: DesktopBrowserGuestSurfaceHost
  state: DesktopBrowserState | null
  updateState: (state: DesktopBrowserState) => void
  sessionReady: (state: DesktopBrowserState, key?: string) => void
  language: BuddyLocale
  visible: boolean
}>()
const { t } = useBuddyI18n(() => props.language)
const message = useMessage()
const browserTab = toRef(() => props.tab)
const surfaceElement = useTemplateRef<HTMLElement>('surfaceElement')
const browserView = useBrowserContextSurface({
  api: props.api,
  conversationId: computed(() => browserTab.value?.conversationId ?? null),
  tabId: computed(() => browserTab.value?.browserKey),
  enabled: computed(() => Boolean(browserTab.value)),
  visible: toRef(() => props.visible),
  state: toRef(() => props.state),
  updateState: state => props.updateState(state),
  sessionReady: (state, key) => props.sessionReady(state, key),
  guestHost: props.guestHost,
  surfaceElement,
})
const { address, openAddress, updateAddress } = useBrowserAddress(browserView.state, browserView.navigate)
const browserState = browserView.state
const browserBlank = computed(() => browserState.value?.url === 'about:blank' && browserState.value.status !== 'loading')
// Identity is host-issued: dismissing one event must not hide a later retry or another tab.
const dismissedNotices = shallowRef<ReadonlySet<string>>(new Set())
const notices = computed(() => {
  const state = browserState.value
  if (!state)
    return []
  const result = []
  if (state.error) {
    const key = browserNoticeKey(state.sessionId, state.error, null)!
    if (!dismissedNotices.value.has(key))
      result.push({ key, retry: state.error.action === undefined, reveal: false, text: browserErrorNotice(state.error, t) })
  }
  if (state.download) {
    const key = browserNoticeKey(state.sessionId, null, state.download)!
    if (!dismissedNotices.value.has(key))
      result.push({ key, retry: false, reveal: state.download.state === 'completed' && Boolean(state.download.path), text: downloadNotice(state.download, t) })
  }
  return result
})
const canvasSize = shallowRef({ width: 0, height: 0 })
const responsive = useBrowserResponsiveViewport({
  api: props.api,
  state: browserState,
  visible: toRef(() => props.visible),
  canvas: canvasSize,
  updateState: state => props.updateState(state),
  onError: () => message.error(t('desktop.context.browserViewportFailed')),
})
watch(() => browserState.value?.sessionId, () => {
  dismissedNotices.value = new Set()
})
watch(responsive.viewport, () => props.guestHost.layout?.(), { flush: 'post' })
function dismissNotice(key: string): void {
  dismissedNotices.value = new Set([...dismissedNotices.value, key].slice(-64))
}
function revealDownload(): void {
  void browserView.revealDownload()
}
const controlAnnouncement = shallowRef('')
watch(() => browserState.value?.controller, (controller, previous) => {
  if (controller === 'agent')
    controlAnnouncement.value = t('desktop.context.browserAgentControlling')
  else if (previous === 'agent')
    controlAnnouncement.value = t('desktop.context.browserAgentPaused')
})
const busyAction = computed<BrowserToolbarBusyAction | null>(() => browserView.isSwitchingProfile.value
  ? 'profile'
  : browserView.isCapturingScreenshot.value
    ? 'screenshot'
    : browserView.isOpeningExternal.value
      ? 'external'
      : browserView.isShowingFileInFolder.value ? 'folder' : browserView.isSettingZoom.value ? 'zoom' : null)
async function captureScreenshot() {
  const result = await browserView.captureScreenshot()
  if (result === 'saved' || result === 'copied')
    message.success(t(result === 'saved' ? 'desktop.browser.screenshotSaved' : 'desktop.browser.screenshotCopied'))
  else if (result === 'failed')
    message.error(t('desktop.browser.screenshotFailed'))
}
async function setZoom(factor: number | null) {
  if (!await browserView.setZoomFactor(factor))
    message.error(t('desktop.browser.zoomFailed'))
}
function browserMenu(action: BrowserToolbarMenuActionKey) {
  if (action === 'capture-screenshot')
    void captureScreenshot()
  else if (action === 'open-devtools')
    void browserView.openDevTools()
  else if (action === 'responsive-viewport')
    responsive.toggle()
  else if (action === 'enter-incognito')
    void browserView.setProfileMode('incognito')
  else if (action === 'exit-incognito')
    void browserView.setProfileMode('default')
  else if (action === 'open-external')
    void browserView.openExternal()
  else if (action === 'show-file-in-folder')
    void browserView.showFileInFolder()
}
</script>

<template>
  <WorkbenchPanelContent v-if="browserTab">
    <template #toolbar>
      <DesktopBrowserToolbar :responsive="responsive.active.value" :responsive-busy="responsive.busy.value" :address="address" :busy-action="busyAction" :language="language" :state="browserState" @back="browserView.goBack" @forward="browserView.goForward" @navigate="openAddress" @reload="browserView.reload" @stop="browserView.stop" @update:address="updateAddress" @menu="browserMenu" @zoom="setZoom" />
    </template>
    <div v-if="browserView.failed.value" class="context-resource-state" role="alert">
      {{ t('desktop.context.browserLoadFailed') }}
    </div>
    <section v-else class="desktop-browser-context-surface" data-testid="browser-context-surface">
      <DesktopBrowserViewportControls v-if="responsive.viewport.value" :language="language" :viewport="responsive.viewport.value" :zoom="responsive.zoom.value" :disabled="responsive.disabled.value" @resize="responsive.resize" @device="responsive.selectDevice" @zoom="responsive.setZoom" />
      <div v-for="notice in notices" :key="notice.key" class="desktop-browser-notice" data-testid="browser-notice">
        <span class="desktop-browser-notice__text" role="status" aria-live="polite">{{ notice.text }}</span>
        <button
          v-if="notice.retry"
          class="desktop-browser-notice__action"
          data-testid="browser-notice-retry"
          type="button"
          @click="browserView.reload"
        >
          {{ t('desktop.context.browserNoticeRetry') }}
        </button>
        <button
          v-if="notice.reveal"
          class="desktop-browser-notice__action"
          data-testid="browser-notice-reveal"
          type="button"
          @click="revealDownload"
        >
          {{ t('desktop.context.browserNoticeReveal') }}
        </button>
        <button
          class="desktop-browser-notice__action"
          data-testid="browser-notice-dismiss"
          type="button"
          :aria-label="t('desktop.context.browserNoticeDismiss')"
          @click="dismissNotice(notice.key)"
        >
          <DesktopIcon aria-hidden="true" :component="Dismiss16Regular" />
        </button>
      </div>
      <div
        v-if="browserState?.controller === 'agent'"
        class="desktop-browser-context-surface__control"
        data-testid="browser-agent-control"
      >
        <span class="desktop-browser-context-surface__control-state">
          <span class="desktop-browser-context-surface__control-indicator" aria-hidden="true" />
          {{ t('desktop.context.browserAgentControlling') }}
        </span>
        <button
          class="desktop-browser-context-surface__take-control"
          data-testid="browser-take-control"
          type="button"
          :aria-label="t(browserView.isTakingControl.value
            ? 'desktop.context.browserTakingControl'
            : 'desktop.context.browserTakeControl')"
          :aria-busy="browserView.isTakingControl.value"
          :disabled="browserView.isTakingControl.value"
          @click="browserView.takeControl"
        >
          <DesktopIcon aria-hidden="true" :component="Pause16Regular" />
          <span>
            {{ t(browserView.isTakingControl.value
              ? 'desktop.context.browserTakingControl'
              : 'desktop.context.browserTakeControl') }}
          </span>
        </button>
      </div>
      <span
        class="desktop-browser-context-surface__announcement"
        data-testid="browser-control-announcement"
        aria-atomic="true"
        aria-live="polite"
        role="status"
      >
        {{ controlAnnouncement }}
      </span>
      <DesktopBrowserResponsiveViewport :viewport="responsive.viewport.value" :disabled="responsive.disabled.value" :visible="visible" :language="language" @resize="responsive.resize" @canvas="canvasSize = $event">
        <div
          ref="surfaceElement"
          class="desktop-browser-context-surface__viewport"
          data-testid="browser-guest-surface"
          :data-browser-viewport-width="responsive.viewport.value?.width"
          :data-browser-viewport-height="responsive.viewport.value?.height"
          role="group"
          :aria-label="t('desktop.context.browserViewport')"
        >
          <div v-if="browserBlank" class="desktop-browser-context-surface__empty">
            <p>{{ t('desktop.context.browserStartBrowsing') }}</p>
          </div>
        </div>
      </DesktopBrowserResponsiveViewport>
    </section>
  </WorkbenchPanelContent>
</template>

<style scoped>
.context-resource-state { display: grid; flex: 1; min-width: 0; min-height: 0; place-content: center; padding: 20px; font-size: 12px; color: var(--buddy-text-muted); }
.desktop-browser-notice {
  display: flex;
  min-width: 0;
  flex: none;
  align-items: center;
  gap: 0.5rem;
  border-bottom: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-raised, var(--buddy-surface-base));
  padding: 0.375rem 0.5rem 0.375rem 0.75rem;
}

.desktop-browser-notice__text {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
  font-size: 0.75rem;
  color: var(--buddy-text-secondary, var(--buddy-text-muted));
}

.desktop-browser-notice__action {
  flex: none;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font-size: 0.75rem;
  padding: 0.125rem 0.375rem;
}

.desktop-browser-notice__action:focus-visible {
  outline: 2px solid var(--buddy-accent-solid);
  outline-offset: 1px;
}
.desktop-browser-context-surface {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  background: var(--buddy-surface-base);
}

.desktop-browser-context-surface__control {
  position: relative;
  z-index: 2;
  display: flex;
  min-width: 0;
  min-height: 2.375rem;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border-bottom: 1px solid var(--buddy-accent-border);
  background: var(--buddy-accent-surface-subtle);
  color: var(--buddy-accent-on-surface);
  padding: 0.25rem 0.5rem 0.25rem 0.75rem;
}

.desktop-browser-context-surface__control-state {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.desktop-browser-context-surface__control-indicator {
  width: 0.5rem;
  height: 0.5rem;
  flex: none;
  border-radius: 50%;
  background: var(--buddy-accent-solid);
}

.desktop-browser-context-surface__take-control {
  display: flex;
  min-height: 1.875rem;
  flex: none;
  align-items: center;
  gap: 0.375rem;
  border: 0;
  border-radius: 0.375rem;
  background: var(--buddy-accent-solid);
  color: var(--buddy-text-on-accent);
  cursor: pointer;
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.625rem;
}

.desktop-browser-context-surface__take-control:not(:disabled):hover {
  background: var(--buddy-accent-solid-hover);
}

.desktop-browser-context-surface__take-control:not(:disabled):active {
  background: var(--buddy-accent-solid-pressed);
}

.desktop-browser-context-surface__take-control:focus-visible {
  outline: 2px solid var(--buddy-focus-ring);
  outline-offset: 2px;
}

.desktop-browser-context-surface__take-control:disabled {
  cursor: wait;
  opacity: 0.72;
}

.desktop-browser-context-surface__announcement {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.desktop-browser-context-surface__viewport {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--buddy-surface-base);
}

.desktop-browser-context-surface__empty {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: grid;
  place-items: center;
  background: var(--buddy-surface-base);
  color: var(--buddy-text-muted);
  padding: 24px;
  pointer-events: none;
  font-size: 13px;
  text-align: center;
}

.desktop-browser-context-surface__empty p {
  margin: 0;
}
</style>
