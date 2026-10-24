// @vitest-environment jsdom
import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { VNode } from 'vue'
import { selectionArtifact } from '@buddy-shared/artifacts/__tests__/artifactSelectionFixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import BuddyChatTurnOutputs from '../BuddyChatTurnOutputs.vue'

const cleanups: Array<() => void> = []

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse())
    cleanup()
})

function mount(render: () => VNode) {
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render })
  app.mount(root)
  cleanups.push(() => {
    app.unmount()
    root.remove()
  })
  return root
}

describe('buddyChatTurnOutputs', () => {
  const artifacts: LocalArtifact[] = [
    { ...selectionArtifact, name: 'report.md' },
    { ...selectionArtifact, artifactId: 'artifact-b', name: 'data.csv', mimeType: 'text/csv' },
  ]

  it('shows the cards by default and folds and unfolds them from the heading', async () => {
    const root = mount(() => h(BuddyChatTurnOutputs, { artifacts, language: 'zh-CN' }))
    await nextTick()
    const toggle = root.querySelector<HTMLButtonElement>('.buddy-chat-turn-outputs__heading')!
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(toggle.textContent).toContain('2')
    expect(root.querySelectorAll('.buddy-artifact-collection__item')).toHaveLength(2)
    expect(root.querySelector(`[id="${toggle.getAttribute('aria-controls')}"]`)).not.toBeNull()

    toggle.click()
    await nextTick()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    await expect.poll(() => root.querySelectorAll('.buddy-artifact-collection__item').length).toBe(0)

    toggle.click()
    await nextTick()
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(root.querySelectorAll('.buddy-artifact-collection__item')).toHaveLength(2)
  })

  it('passes the opened artifact object up', async () => {
    const openArtifact = vi.fn()
    const root = mount(() => h(BuddyChatTurnOutputs, { artifacts, language: 'zh-CN', onOpenArtifact: openArtifact }))
    await nextTick()
    root.querySelectorAll<HTMLButtonElement>('.buddy-artifact-collection__trigger')[1]!.click()
    expect(openArtifact).toHaveBeenCalledExactlyOnceWith(artifacts[1])
  })
})
