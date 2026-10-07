import type { WorkingCopyService } from '@/workbench/services/WorkingCopyService'
import { describe, expect, it } from 'vitest'
import { ViewRendererRegistry } from '@/workbench/browser/ViewRendererRegistry'
import { ContributionRegistry } from '@/workbench/services/ContributionRegistry'
import { WorkbenchController } from '@/workbench/services/WorkbenchController'
import { registerDesktopContributions } from '../registerDesktopContributions'

describe('instant task view switching', () => {
  it('commits a regular task replacement without waiting for the view to become ready', async () => {
    const controller = new WorkbenchController(new ContributionRegistry())
    const copies = {} as WorkingCopyService
    registerDesktopContributions(controller, new ViewRendererRegistry(), copies, () => 'en-US')

    try {
      expect(controller.registry.views.get('tasks.editor')?.prepareBeforeOpen).toBe(false)

      const first = await controller.open({ scheme: 'task', id: 'conversation-a', data: {} }, 'Conversation A')
      const second = await controller.open({ scheme: 'task', id: 'conversation-b', data: {} }, 'Conversation B')

      expect(second).not.toBeNull()
      expect(controller.pane(controller.layout.activePane)?.view).toBe(second)
      expect(controller.layout.views[first!]).toBeUndefined()
      expect(controller.navigation.entries.size).toBe(0)
    }
    finally {
      await controller.dispose()
      controller.registry.dispose()
    }
  })
})
