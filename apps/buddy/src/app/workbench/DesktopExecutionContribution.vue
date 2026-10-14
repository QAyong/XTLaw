<script setup lang="ts">
import type { ExecutionTarget } from '@buddy-shared/executions/executionPresentationApi'
import type { WorkbenchView } from '@/workbench/common/workbench'
import { executionTargetSchema } from '@buddy-shared/executions/executionPresentationApi'
import { useMessage } from 'naive-ui'
import { computed } from 'vue'
import { translateBuddy } from '@/i18n/buddyI18n'
import { createMessageWebLinkOpener, useProvideChatContent, useTaskEnvironment } from '@/modules/tasks'
import { DesktopExecutionDetail } from '@/modules/tasks/ui'
import { useDesktopWorkbenchContext } from './desktopWorkbenchContext'

const props = defineProps<{ view: WorkbenchView, visible: boolean }>()
const message = useMessage()
const workbench = useDesktopWorkbenchContext()
const { browser, clipboard, resources } = useTaskEnvironment()
const target = computed<ExecutionTarget | null>((previous) => {
  const value = executionTargetSchema.safeParse(props.view.resource.data)
  if (!value.success)
    return null
  return previous && Object.entries(previous).every(([key, field]) => value.data[key as keyof ExecutionTarget] === field) ? previous : value.data
})
useProvideChatContent({
  openWebLink: createMessageWebLinkOpener({
    browser,
    conversationId: () => target.value?.conversationId === workbench.activeTaskId.value ? target.value.conversationId : null,
    openBrowser: resources.openBrowser,
    retainBrowserSession: resources.retainBrowserSession,
    updateBrowserState: resources.updateBrowserState,
    openExternal: href => window.open(href, '_blank', 'noopener,noreferrer'),
    onError: () => message.error(translateBuddy(workbench.language.value, 'desktop.context.browserPageFailed')),
  }),
  writeClipboardText: clipboard.writeText,
  canPreviewFile: path => target.value?.conversationId === workbench.activeTaskId.value && resources.canPreviewFile(path),
  previewFile: (path) => {
    if (target.value?.conversationId === workbench.activeTaskId.value)
      resources.previewFile(path, { conversationId: target.value.conversationId, runId: target.value.runId })
  },
})
async function returnToTask() {
  const input = target.value
  if (!input)
    return
  try {
    await workbench.openTask(input.conversationId)
  }
  catch {
    message.error(translateBuddy(workbench.language.value, 'desktop.command.failed'))
  }
}

async function openArtifact(id: string) {
  const input = target.value
  if (!input)
    return
  try {
    const detail = await workbench.api.localChat.executions.detail(input)
    const artifact = detail.artifacts.find(item => item.artifactId === id)
    if (artifact && props.visible && target.value?.runId === input.runId)
      await resources.openArtifact(artifact)
  }
  catch {
    message.error(translateBuddy(workbench.language.value, 'desktop.command.failed'))
  }
}
async function openChanges() {
  const input = target.value
  if (!input)
    return
  try {
    const detail = await workbench.api.localChat.executions.detail(input)
    if (detail.changes && props.visible && target.value?.runId === input.runId)
      resources.openChanges(detail.changes, { conversationId: input.conversationId, runId: input.runId }, detail.run.branchId)
  }
  catch {
    message.error(translateBuddy(workbench.language.value, 'desktop.command.failed'))
  }
}
</script>

<template>
  <DesktopExecutionDetail v-if="target" :key="view.resource.id" :target="target" :visible="visible" :language="workbench.language.value" @title-change="workbench.controller.updateView(view.id, { title: $event })" @open-artifact="openArtifact" @open-changes="openChanges" @return-to-task="returnToTask" />
</template>
