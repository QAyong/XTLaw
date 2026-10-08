<script setup lang="ts">
import type { BuddyComposerDirectory } from '@buddy-shared/conversation/composerResource'
import type { BuddyLocale } from '@/i18n/buddyI18n'
import type { ChatComposerSessionScope, ChatPromptContextOption } from '@/modules/prompt-input'
import { composerReferencePath } from '@buddy-shared/conversation/composerReferencePath'
import { ArrowLeft20Regular, Chat20Regular, ChatMultiple20Regular } from '@vicons/fluent'
import { NButton, NSwitch } from 'naive-ui'
import { computed, useId, useTemplateRef, watch } from 'vue'
import { useBuddyI18n } from '@/i18n/buddyI18n'
import { FileIcon, FolderIcon } from '@/shared/ui/file-icon'
import DesktopIcon from '@/shared/ui/icon/DesktopIcon.vue'
import SkillIcon from '@/shared/ui/icon/SkillIcon.vue'
import ChatComposerDirectoryHeader from './ChatComposerDirectoryHeader.vue'
import { composerParentDirectory, describeChatComposerSource, getChatComposerSourceRoot } from './chatComposerSourcePresentation'

const props = withDefaults(defineProps<{
  activeIndex?: number
  keyboardNavigation?: boolean
  accessibleLabel: string
  emptyLabel: string
  filesOnly?: boolean
  language: BuddyLocale
  loading?: boolean
  loadingLabel: string
  options: ReadonlyArray<ChatPromptContextOption>
  directory?: BuddyComposerDirectory
  deepSearch?: boolean
  sessionScope?: ChatComposerSessionScope
  hasMoreSessions?: boolean
}>(), {
  activeIndex: -1,
  keyboardNavigation: undefined,
  filesOnly: false,
  loading: false,
  deepSearch: false,
})

const emit = defineEmits<{
  select: [option: ChatPromptContextOption]
  enterDirectory: [option: ChatPromptContextOption]
  highlight: [index: number]
  navigate: [path: string]
  leaveSessions: []
  deepSearchChange: [value: boolean]
}>()

defineSlots<{
  extra?: () => unknown
}>()

const { t } = useBuddyI18n(() => props.language)
const deepSearchLabelId = useId()
const list = useTemplateRef<HTMLElement>('list')
watch(() => [props.activeIndex, props.options], () => {
  const container = list.value
  const active = container?.querySelector<HTMLElement>('[aria-selected="true"]')
  if (!container || !active)
    return
  const offset = 6
  const top = active.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop
  if (top - offset < container.scrollTop)
    container.scrollTop = Math.max(0, top - offset)
  else if (top + active.offsetHeight + offset > container.scrollTop + container.clientHeight)
    container.scrollTop = top + active.offsetHeight + offset - container.clientHeight
}, { flush: 'post' })
const visibleOptions = computed(() => props.options.filter(option => (
  (!props.filesOnly || option.kind === 'file') && (!props.filesOnly || option.source || option.resourceId)
)))
const keyboardNavigation = computed(() => props.keyboardNavigation ?? props.activeIndex >= 0)
const canGoBack = computed(() => Boolean(props.sessionScope || (props.directory && composerParentDirectory(props.directory))))
const activeOption = computed(() => props.options[props.activeIndex])
const canEnter = computed(() => activeOption.value?.kind === 'sessionGroup' || (activeOption.value?.entryKind === 'directory' && activeOption.value.path))
const showShortcuts = computed(() => keyboardNavigation.value && (visibleOptions.value.length > 0 || props.directory || props.sessionScope))
const selectionLabel = computed(() => t(visibleOptions.value.every(option => option.kind === 'file')
  ? 'desktop.chat.sourcePickerReference'
  : 'desktop.chat.sourcePickerChoose'))
const directoryCategory = computed(() => props.directory && composerReferencePath(props.directory.path, props.directory.workingDirectory) === props.directory.path ? 'external' : 'space')
const groupedOptions = computed(() => ['current', 'space', 'external', 'history', 'artifact', 'sessions', ''].flatMap((category) => {
  const options = visibleOptions.value.filter(option => (option.category ?? '') === category)
  const directory = category === directoryCategory.value ? props.directory : undefined
  if (!options.length && !directory)
    return []
  const roots = new Set(options.map(getChatComposerSourceRoot))
  const root = roots.size === 1 ? [...roots][0] ?? null : null
  return [{
    category,
    root,
    directory,
    rows: options.map(option => ({
      option,
      index: props.options.indexOf(option),
      description: describeChatComposerSource(option, props.language, t, props.directory?.workingDirectory ?? root, props.directory?.path, props.deepSearch),
    })),
  }]
}))

function kindLabel(option: ChatPromptContextOption): string {
  return option.kind === 'skill' ? '$' : '/'
}

function skillScopeLabel(scope?: 'directory' | 'space' | 'global'): string {
  if (scope === 'directory')
    return t('desktop.skills.scope.directory')
  if (scope === 'space')
    return t('desktop.skills.scope.space')
  if (scope === 'global')
    return t('desktop.skills.scope.global')
  return ''
}

function groupLabel(category: string): string {
  if (category === 'sessions')
    return t('desktop.chat.sessionReferences')
  if (category === 'current')
    return t('desktop.chat.sourcePickerCurrent')
  if (category === 'space')
    return t('desktop.chat.sourcePickerWorkspace')
  if (category === 'history')
    return t('desktop.chat.sourcePickerHistory')
  if (category === 'external')
    return t('desktop.chat.sourcePickerExternal')
  return t('desktop.chat.sourcePickerArtifacts')
}

function select(option: ChatPromptContextOption) {
  emit('select', option)
}

function highlight(index: number) {
  if (keyboardNavigation.value && props.activeIndex !== index)
    emit('highlight', index)
}
</script>

<template>
  <div class="chat-composer-source-picker" :class="{ 'has-keyboard': keyboardNavigation }">
    <div v-if="sessionScope" class="chat-composer-source-picker__group">
      <NButton quaternary size="tiny" :aria-label="t('desktop.chat.sourcePickerBack')" @mousedown.prevent @click="emit('leaveSessions')">
        <template #icon>
          <DesktopIcon :component="ArrowLeft20Regular" />
        </template>
        {{ sessionScope.title }}
      </NButton>
    </div>
    <div ref="list" class="chat-composer-source-picker__list" role="listbox" :aria-label="accessibleLabel">
      <span v-if="loading && !visibleOptions.length" class="chat-composer-source-picker__empty">
        {{ loadingLabel }}
      </span>
      <template v-for="group in groupedOptions" :key="group.category">
        <ChatComposerDirectoryHeader v-if="group.directory" :directory="group.directory" :language="language" @navigate="emit('navigate', $event)" />
        <div v-else-if="group.category" class="chat-composer-source-picker__group">
          <span>{{ groupLabel(group.category) }}</span>
          <span v-if="group.root" class="chat-composer-source-picker__root">{{ group.root }}</span>
        </div>
        <span v-if="group.directory?.status === 'unavailable'" class="chat-composer-source-picker__empty">
          {{ t('desktop.chat.sourcePickerDirectoryUnavailable') }}
        </span>
        <span v-else-if="group.directory && !loading && !group.rows.length" class="chat-composer-source-picker__empty">
          {{ t(group.directory.query ? 'desktop.chat.sourcePickerNoMatches' : 'desktop.chat.sourcePickerDirectoryEmpty') }}
        </span>
        <div
          v-for="{ option, index, description } in group.rows"
          :key="option.commandId ?? `${option.value}:${option.path ?? ''}`"
          class="chat-composer-source-picker__row"
          :class="{
            'is-active': index === activeIndex,
            'is-skill': option.kind === 'skill',
          }"
          role="presentation"
          @pointermove="highlight(index)"
          @mousedown.prevent
          @click="select(option)"
        >
          <button
            class="chat-composer-source-picker__option"
            role="option"
            :aria-selected="index === activeIndex"
            :tabindex="keyboardNavigation ? -1 : 0"
            type="button"
            @focus="highlight(index)"
          >
            <span
              class="chat-composer-source-picker__kind"
              :class="{
                'is-file': option.kind === 'file',
                'is-skill': option.kind === 'skill',
                'is-session': option.kind === 'sessionGroup' || option.kind === 'sessionReference',
              }"
            >
              <DesktopIcon v-if="option.kind === 'sessionGroup' && option.sessionScope?.spaceId === null" :component="ChatMultiple20Regular" :size="18" />
              <FolderIcon v-else-if="option.entryKind === 'directory' || option.kind === 'sessionGroup'" />
              <FileIcon v-else-if="option.kind === 'file'" :name="option.fileName ?? option.label" />
              <DesktopIcon v-else-if="option.kind === 'skill'" :component="SkillIcon" :size="14" />
              <DesktopIcon v-else-if="option.kind === 'sessionReference'" :component="Chat20Regular" :size="18" />
              <template v-else>{{ kindLabel(option) }}</template>
            </span>
            <span class="chat-composer-source-picker__copy">
              <span class="chat-composer-source-picker__heading">
                <strong class="chat-composer-source-picker__label">{{ option.label }}</strong>
                <span
                  v-if="option.skillScope"
                  class="chat-composer-source-picker__scope"
                  :class="`is-${option.skillScope}`"
                >
                  {{ skillScopeLabel(option.skillScope) }}
                </span>
              </span>
              <small v-if="description" :title="description">{{ description }}</small>
            </span>
          </button>
          <div v-if="keyboardNavigation" class="chat-composer-source-picker__actions">
            <NButton
              v-if="(option.entryKind === 'directory' && option.path) || option.kind === 'sessionGroup'"
              class="chat-composer-source-picker__enter"
              quaternary
              size="tiny"
              :tabindex="-1"
              @click.stop="emit('enterDirectory', option)"
            >
              <kbd>Tab</kbd><span>{{ t('desktop.chat.sourcePickerEnterDirectory') }}</span>
            </NButton>
            <span class="chat-composer-source-picker__confirm"><kbd>↵</kbd><span>{{ selectionLabel }}</span></span>
          </div>
        </div>
        <span v-if="group.directory?.hasMore || (group.category === 'sessions' && hasMoreSessions)" class="chat-composer-source-picker__empty">
          {{ t('desktop.chat.sourcePickerMoreResults') }}
        </span>
      </template>
      <span v-if="!loading && !visibleOptions.length && !directory" class="chat-composer-source-picker__empty">
        {{ emptyLabel }}
      </span>
    </div>
    <div v-if="showShortcuts || $slots.extra" class="chat-composer-source-picker__footer" @mousedown.prevent>
      <div v-if="showShortcuts" class="chat-composer-source-picker__shortcuts">
        <span><kbd>↑</kbd><kbd>↓</kbd>{{ t('desktop.chat.sourcePickerNavigate') }}</span>
        <span><kbd>Enter</kbd>{{ selectionLabel }}</span>
        <span v-if="canEnter"><kbd>Tab</kbd>{{ t('desktop.chat.sourcePickerEnterDirectory') }}</span>
        <span v-if="canGoBack"><kbd>Alt</kbd><kbd>←</kbd>{{ t('desktop.chat.sourcePickerBack') }}</span>
        <span><kbd>Esc</kbd>{{ t('desktop.chat.sourcePickerClose') }}</span>
      </div>
      <div v-if="directory || $slots.extra" class="chat-composer-source-picker__footer-aside">
        <span v-if="directory" class="chat-composer-source-picker__deep-search">
          <NButton :id="deepSearchLabelId" text :tabindex="-1" @click="emit('deepSearchChange', !deepSearch)">
            {{ t('desktop.chat.sourcePickerDeepSearch') }}
          </NButton>
          <NSwitch :aria-labelledby="deepSearchLabelId" :value="deepSearch" size="small" @update:value="emit('deepSearchChange', $event)" />
        </span>
        <slot name="extra" />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-composer-source-picker {
  display: flex;
  flex-direction: column;
  min-width: 0;
  max-height: min(18rem, calc(100vh - 10rem));
  overflow: hidden;
  container-type: inline-size;
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.55rem;
  background: var(--buddy-surface-raised);
  box-shadow: none;
  padding-top: 0.35rem;
}

.chat-composer-source-picker__list {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 0.15rem 0.35rem 0.35rem;
  scroll-padding-top: 0.35rem;
  scroll-padding-bottom: 0.35rem;
}

.chat-composer-source-picker__row {
  display: flex;
  align-items: center;
  border-radius: 0.35rem;
  cursor: pointer;

  &.is-active,
  &:focus-within {
    background: var(--buddy-state-hover);
  }
}

.chat-composer-source-picker:not(.has-keyboard) .chat-composer-source-picker__row:hover {
  background: var(--buddy-state-hover);
}

.chat-composer-source-picker__option {
  flex: 1;
  min-width: 0;
  min-height: 2.8rem;
  display: grid;
  grid-template-columns: 1.4rem minmax(0, 1fr);
  align-items: center;
  gap: 0.45rem;
  border: 0;
  border-radius: 0.35rem;
  background: transparent;
  color: var(--buddy-text-strong);
  cursor: pointer;
  padding: 0.35rem 0.4rem;
  text-align: left;

  &:focus-visible {
    outline: 2px solid var(--buddy-focus-ring);
    outline-offset: -2px;
  }
}

.chat-composer-source-picker__group {
  display: flex;
  align-items: baseline;
  gap: 0.65rem;
  color: var(--buddy-text-muted);
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0;
  padding: 0.35rem 0.4rem 0.15rem;
}

.chat-composer-source-picker__group > span:first-child {
  flex: none;
}

.chat-composer-source-picker__root {
  overflow: hidden;
  color: var(--buddy-text-secondary);
  font-weight: 400;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chat-composer-source-picker__kind {
  display: grid;
  width: 1.35rem;
  height: 1.35rem;
  place-items: center;
  border-radius: var(--buddy-radius-micro);
  background: var(--buddy-accent-surface);
  color: var(--buddy-accent-on-surface);
  font-size: 0.75rem;
  font-weight: 700;

  &.is-file,
  &.is-session {
    background: transparent;
  }

  &.is-skill {
    background: var(--buddy-accent-surface-subtle);
    color: var(--buddy-accent-text);
    border: 1px solid var(--buddy-accent-border);
  }

  :deep(.buddy-file-icon),
  :deep(.buddy-folder-icon) {
    width: 1.2rem;
    height: 1.2rem;
  }
}

.chat-composer-source-picker__copy {
  display: grid;
  min-width: 0;
  gap: 0.12rem;

  small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--buddy-text-secondary);
    font-size: 0.67rem;
    line-height: 1.25;
  }
}

.chat-composer-source-picker__heading {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.chat-composer-source-picker__label {
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.76rem;
  font-weight: 550;
  line-height: 1.25;
}

.chat-composer-source-picker__scope {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 0.04rem 0.28rem;
  border-radius: var(--buddy-radius-micro);
  font-family: var(--buddy-font-brand);
  font-size: 0.58rem;
  font-weight: 500;
  line-height: 1.3;
  border: 1px solid var(--buddy-border-subtle);

  &.is-directory {
    color: var(--buddy-accent-text);
    background: var(--buddy-accent-surface-subtle);
    border-color: var(--buddy-accent-border);
  }

  &.is-space {
    color: var(--buddy-text-primary);
    background: var(--buddy-state-hover);
    border-color: var(--buddy-border-subtle);
  }

  &.is-global {
    color: var(--buddy-text-muted);
    background: transparent;
    border-color: var(--buddy-border-subtle);
  }
}

.chat-composer-source-picker__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 0.65rem;
  visibility: hidden;
  padding-right: 0.5rem;
  color: var(--buddy-text-secondary);
  font-size: 0.62rem;
  white-space: nowrap;
}

.chat-composer-source-picker__row.is-active .chat-composer-source-picker__actions {
  visibility: visible;
}

.chat-composer-source-picker__enter :deep(.n-button__content),
.chat-composer-source-picker__confirm,
.chat-composer-source-picker__shortcuts > span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.chat-composer-source-picker__enter {
  font-size: 0.62rem;
}

.chat-composer-source-picker__footer {
  display: flex;
  flex: none;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem 0.9rem;
  border-top: 1px solid var(--buddy-border-subtle);
  padding: 0.35rem 0.65rem;
  color: var(--buddy-text-muted);
  font-size: 0.6rem;
}

.chat-composer-source-picker__shortcuts {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.9rem;
}

.chat-composer-source-picker__footer-aside {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  margin-left: auto;
}

.chat-composer-source-picker kbd {
  border: 1px solid var(--buddy-border-subtle);
  border-radius: 0.2rem;
  padding: 0 0.2rem;
  font: inherit;
  line-height: 1.4;
}

.chat-composer-source-picker__deep-search {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
  cursor: pointer;
  white-space: nowrap;

  :deep(.n-button) {
    color: inherit;
    font-size: inherit;
  }
}

@container (max-width: 22rem) {
  .chat-composer-source-picker__confirm > span {
    display: none;
  }

  .chat-composer-source-picker__actions {
    gap: 0.25rem;
  }
}

.chat-composer-source-picker__empty {
  display: block;
  color: var(--buddy-text-muted);
  font-size: 0.7rem;
  padding: 0.55rem 0.4rem;
}
</style>
