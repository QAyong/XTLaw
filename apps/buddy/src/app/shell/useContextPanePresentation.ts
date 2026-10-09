import type { Ref } from 'vue'
import { computed, shallowRef } from 'vue'

// Presentation is temporary; task-owned layout preferences stay in DesktopShell.
export function useContextPanePresentation(options: {
  chatPaneHidden: Ref<boolean>
  tasksVisible: Readonly<Ref<boolean>>
  scope: Readonly<Ref<string | null>>
}) {
  const dragging = shallowRef(false)
  const dragScope = shallowRef<string | null>(null)
  const contextMaximized = computed(() => options.tasksVisible.value && options.chatPaneHidden.value
    && !(dragging.value && dragScope.value === options.scope.value))
  return {
    contextMaximized,
    workspaceVisible: computed(() => !contextMaximized.value),
    beginDrag() {
      dragScope.value = options.scope.value
      dragging.value = true
    },
    endDrag(dropped: boolean) {
      if (dragging.value && dropped && dragScope.value === options.scope.value)
        options.chatPaneHidden.value = false
      dragging.value = false
      dragScope.value = null
    },
  }
}
