<script setup lang="ts">
import type {
  DesktopAppInfo,
  DesktopWindowState,
} from '@buddy-electron/shared/desktopApi'
import type { DesktopCommandId } from '@buddy-electron/shared/desktopCommands'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import { DESKTOP_COMMAND_REGISTRY, getDesktopCommand } from '@buddy-electron/shared/desktopCommands'
import { PanelRightContract20Regular, PanelRightExpand20Regular } from '@vicons/fluent'
import { NTooltip, useMessage } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, onMounted, onScopeDispose, shallowRef } from 'vue'
import { useRouter } from 'vue-router'
import DesktopFeedbackDialog from '@/app/shell/window/DesktopFeedbackDialog.vue'
import DesktopWindowMenuBar from '@/app/shell/window/DesktopWindowMenuBar.vue'
import { useDesktopWorkbenchContext } from '@/app/workbench/desktopWorkbenchContext'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { useDesktopUpdatesContext } from '@/modules/updates'
import { requireDesktopApi } from '@/platform/desktop/desktopApi'
import { desktopRouteLocations } from '@/shared/navigation/desktopRoutes'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'

const props = defineProps<{
  minimal?: boolean
  appInfo: DesktopAppInfo | null
  contextAvailable: boolean
  contextOpen: boolean
  contextIsChat: boolean
  contextSwapAvailable: boolean
  contextSwapped: boolean
  language: BuddyLocale
  shortcutBindings: Readonly<Record<string, readonly string[]>>
  sidebarCollapsed: boolean
}>()
const emit = defineEmits<{
  toggleContext: []
  toggleContextPosition: []
  toggleSidebar: []
}>()

const desktopApi = requireDesktopApi()
const router = useRouter()
const isMaximized = shallowRef(false)
const showFeedback = shallowRef(false)
const updates = useDesktopUpdatesContext()
const { t } = useBuddyI18n(() => props.language)
const message = useMessage()
const platform = computed(() => props.appInfo?.platform ?? 'linux')
const maximizeLabel = computed(() => isMaximized.value
  ? t('desktop.window.restore')
  : t('desktop.window.maximize'))
const contextToggleLabel = computed(() => props.contextIsChat
  ? t(props.contextOpen ? 'desktop.chat.collapse' : 'desktop.chat.open')
  : t(props.contextOpen ? 'desktop.context.collapse' : 'desktop.context.open'))
let windowStateVersion = 0

const rendererCommandHandlers = {
  'app.about': () => router.push(desktopRouteLocations.settings('about')),
  'app.checkUpdates': checkForUpdates,
  'help.feedback': () => showFeedback.value = true,
} satisfies Partial<Record<DesktopCommandId, () => void>>

const stopWindowState = desktopApi.window.onStateChanged((state) => {
  windowStateVersion += 1
  applyWindowState(state)
})

onMounted(async () => {
  const snapshotVersion = windowStateVersion
  try {
    const state = await desktopApi.window.getState()
    if (snapshotVersion === windowStateVersion)
      applyWindowState(state)
  }
  catch (error) {
    console.error('Lexora window state is unavailable', error)
  }
})

onBeforeUnmount(stopWindowState)

const { controller } = useDesktopWorkbenchContext()
onScopeDispose(controller.registry.register('lexora.desktopCommands', (scope) => {
  for (const command of DESKTOP_COMMAND_REGISTRY) {
    scope.command({
      id: command.id,
      label: () => t(`desktop.command.${command.id}`),
      keybinding: () => platform.value === 'darwin' ? command.macosKeybinding ?? command.keybinding : command.keybinding,
      alternateKeybindings: command.alternateKeybindings,
      shortcutScope: 'application',
      execute: () => executeDesktopCommand(command.id),
    })
  }
}))

async function executeDesktopCommand(commandId: DesktopCommandId) {
  try {
    const command = getDesktopCommand(commandId)
    if (command.execution === 'main') {
      await desktopApi.commands.execute(commandId)
      return
    }
    const handler = rendererCommandHandlers[commandId as keyof typeof rendererCommandHandlers]
    if (!handler)
      throw new Error(`Desktop command has no renderer handler: ${commandId}`)
    await handler()
  }
  catch (error) {
    console.error(`XTLaw Desktop command ${commandId} failed`, error)
    message.error(t('desktop.command.failed'))
  }
}

async function toggleMaximize() {
  await runWindowAction(() => desktopApi.window.toggleMaximize())
}

async function minimize() {
  try {
    await desktopApi.window.minimize()
  }
  catch (error) {
    console.error('Lexora window action failed', error)
  }
}

async function checkForUpdates() {
  try {
    await updates.check()
  }
  catch (error) {
    console.error('XTLaw update check failed', error)
    message.error(t('desktop.update.failed'))
  }
}

async function openFeedbackIssue(feedback: string) {
  try {
    await desktopApi.app.openFeedbackIssue(feedback)
    showFeedback.value = false
  }
  catch (error) {
    console.error('XTLaw feedback page is unavailable', error)
    message.error(t('desktop.command.failed'))
  }
}

async function runWindowAction(action: () => Promise<DesktopWindowState>) {
  try {
    applyWindowState(await action())
  }
  catch (error) {
    console.error('Lexora window action failed', error)
  }
}

async function toggleContextPosition(event: MouseEvent) {
  const button = event.currentTarget as HTMLButtonElement
  const restoreFocus = button.matches(':focus-visible')
  const arrows = button.querySelectorAll('svg path')
  if (typeof arrows[0]?.animate === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    arrows.forEach((arrow, index) => {
      const start = getComputedStyle(arrow).transform
      for (const animation of arrow.getAnimations())
        animation.cancel()
      const direction = index === 0 ? 1 : -1
      const fromY = props.contextSwapped ? direction * 7 : 0
      const toY = props.contextSwapped ? 0 : direction * 7
      arrow.animate([
        { transform: start, opacity: 1 },
        { transform: `translate(${direction * 20}px, ${fromY}px)`, opacity: 0, offset: 0.45 },
        { transform: `translate(${-direction * 20}px, ${toY}px)`, opacity: 0, offset: 0.46 },
        { transform: `translate(0, ${toY}px)`, opacity: 1 },
      ], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' })
    })
  }
  emit('toggleContextPosition')
  await nextTick()
  if (restoreFocus)
    button.focus({ preventScroll: true })
}

function applyWindowState(state: DesktopWindowState) {
  isMaximized.value = state.isMaximized
}
</script>

<template>
  <header class="desktop-title-bar" @dblclick="toggleMaximize">
    <div class="desktop-title-bar__safe-area">
      <span v-if="minimal" class="desktop-title-bar__welcome">{{ t('onboarding.welcome') }}</span>
      <DesktopWindowMenuBar
        v-else
        :language="language"
        :shortcut-bindings="shortcutBindings"
        :platform="platform"
        :sidebar-collapsed="sidebarCollapsed"
        @command="executeDesktopCommand"
        @toggle-sidebar="emit('toggleSidebar')"
      />

      <div
        class="desktop-title-bar__controls"
        @dblclick.stop
        @mousedown.stop
        @pointerdown.stop
      >
        <NTooltip v-if="contextSwapAvailable" placement="bottom">
          <template #trigger>
            <button
              :aria-label="t('desktop.context.swapPosition')"
              :aria-pressed="contextSwapped"
              class="desktop-title-bar__control"
              data-testid="context-panel-position-toggle"
              type="button"
              @click="toggleContextPosition"
            >
              <DesktopIcon>
                <svg class="desktop-title-bar__swap-icon" :class="{ 'is-swapped': contextSwapped }" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path class="desktop-title-bar__swap-arrow is-right" d="M12.146 3.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L14.293 7H4.5a.5.5 0 0 1 0-1h9.793l-2.147-2.146a.5.5 0 0 1 0-.708Z" />
                  <path class="desktop-title-bar__swap-arrow is-left" d="M7.854 10.146a.5.5 0 0 1 0 .708L5.707 13H15.5a.5.5 0 0 1 0 1H5.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3a.5.5 0 0 1 0-.708l3-3a.5.5 0 0 1 .708 0Z" />
                </svg>
              </DesktopIcon>
            </button>
          </template>
          {{ t('desktop.context.swapPosition') }}
        </NTooltip>
        <NTooltip v-if="contextAvailable" placement="bottom">
          <template #trigger>
            <button
              :aria-label="contextToggleLabel"
              :aria-expanded="contextOpen"
              class="desktop-title-bar__control"
              :class="{ 'is-active': contextOpen }"
              data-testid="context-panel-toggle"
              type="button"
              @click="emit('toggleContext')"
            >
              <DesktopIcon :component="contextOpen ? PanelRightContract20Regular : PanelRightExpand20Regular" />
            </button>
          </template>
          {{ contextToggleLabel }}
        </NTooltip>
        <button
          :aria-label="t('desktop.window.minimize')"
          class="desktop-title-bar__control"
          type="button"
          @click="minimize"
        >
          <DesktopIcon data-window-control-icon="minimize" name="windowMinimize" />
        </button>
        <button
          :aria-label="maximizeLabel"
          class="desktop-title-bar__control"
          type="button"
          @click="toggleMaximize"
        >
          <DesktopIcon
            v-if="isMaximized"
            data-window-control-icon="restore"
            name="windowRestore"
          />
          <DesktopIcon
            v-else
            data-window-control-icon="maximize"
            name="windowMaximize"
          />
        </button>
        <button
          :aria-label="t('desktop.command.window.close')"
          class="desktop-title-bar__control is-close"
          type="button"
          @click="executeDesktopCommand('window.close')"
        >
          <DesktopIcon data-window-control-icon="close" name="windowClose" />
        </button>
      </div>
    </div>

    <DesktopFeedbackDialog
      v-model:show="showFeedback"
      :language="language"
      @open-github-issue="openFeedbackIssue"
    />
  </header>
</template>

<style scoped>
.desktop-title-bar {
  position: relative;
  height: var(--buddy-titlebar-height);
  flex: none;
  border-bottom: 1px solid var(--buddy-border-subtle);
  background: var(--buddy-surface-canvas);
  color: var(--buddy-text-strong);
  user-select: none;
  -webkit-app-region: drag;
}

.desktop-title-bar__safe-area {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.desktop-title-bar__welcome {
  padding: 0 1rem;
  color: var(--buddy-text-secondary);
  font-size: 12px;
}

.desktop-title-bar__controls {
  display: flex;
  height: var(--buddy-titlebar-height);
  flex: none;
  align-self: center;
  -webkit-app-region: no-drag;
}

.desktop-title-bar__swap-arrow {
  transform: translateY(0);
}

.desktop-title-bar__swap-icon.is-swapped .is-right {
  transform: translateY(7px);
}

.desktop-title-bar__swap-icon.is-swapped .is-left {
  transform: translateY(-7px);
}

.desktop-title-bar__control {
  display: grid;
  width: var(--buddy-titlebar-height);
  height: var(--buddy-titlebar-height);
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--buddy-radius-micro);
  background: transparent;
  color: var(--buddy-text-secondary);
  cursor: default;

  &:hover {
    background: var(--buddy-state-hover);
    color: var(--buddy-text-strong);
  }

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }

  &.is-active {
    color: var(--buddy-accent-text);
  }

  &.is-close:hover {
    background: var(--buddy-status-danger-solid);
    color: var(--buddy-text-on-accent);
  }

  .desktop-icon {
    width: 1rem;
    height: 1rem;
  }
}
</style>
