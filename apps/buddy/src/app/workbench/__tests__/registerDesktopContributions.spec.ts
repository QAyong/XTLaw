import type { WorkingCopyService } from '@/workbench/services/WorkingCopyService'
import { expect, it, onTestFinished } from 'vitest'
import { ViewRendererRegistry } from '@/workbench/browser/ViewRendererRegistry'
import { ContributionRegistry } from '@/workbench/services/ContributionRegistry'
import { WorkbenchController } from '@/workbench/services/WorkbenchController'
import { registerDesktopContributions } from '../registerDesktopContributions'

it('registers inline file previews but rejects the removed task-file view', async () => {
  const controller = new WorkbenchController(new ContributionRegistry())
  onTestFinished(() => controller.dispose())
  registerDesktopContributions(controller, new ViewRendererRegistry(), { dirty: () => false, save: async () => false } as unknown as WorkingCopyService, () => 'en-US')

  await expect(controller.open({ scheme: 'task-file', id: 'task-file', data: {} }, 'Old preview', { location: 'context' })).rejects.toThrow()
  await expect(controller.open({ scheme: 'file-preview', id: 'inline-preview', data: {} }, 'Inline preview', { location: 'context', state: { contextTabId: 'files-1' } })).resolves.toBeTruthy()
})
