// @vitest-environment jsdom
import type { LocalArtifact } from '@buddy-shared/artifacts/artifactApi'
import type { VNode } from 'vue'
import { selectionArtifact } from '@buddy-shared/artifacts/__tests__/artifactSelectionFixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import BuddyArtifactCard from '../BuddyArtifactCard.vue'
import BuddyArtifactCollection from '../BuddyArtifactCollection.vue'

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

describe('buddyArtifactCollection', () => {
  it('keeps file names, details and open actions in the default strip', async () => {
    const artifacts: LocalArtifact[] = [
      { ...selectionArtifact, name: '合同审查意见.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { ...selectionArtifact, artifactId: 'artifact-b', name: '风险事项清单.pdf', mimeType: 'application/pdf' },
    ]
    const openArtifact = vi.fn()
    const root = mount(() => h(BuddyArtifactCollection, { artifacts, language: 'zh-CN', onOpenArtifact: openArtifact }))
    await nextTick()

    expect(root.querySelector('.buddy-artifact-collection__items.is-strip')).not.toBeNull()
    const cards = [...root.querySelectorAll<HTMLElement>('.buddy-artifact-collection__item')]
    expect(cards).toHaveLength(2)
    expect(cards.map(card => card.querySelector('.buddy-artifact-collection__name')?.textContent)).toEqual(artifacts.map(artifact => artifact.name))
    for (const card of cards) {
      expect(card.querySelector('.buddy-artifact-collection__detail')?.textContent).toContain(selectionArtifact.path)
      expect(card.querySelector('.buddy-file-icon')).not.toBeNull()
      expect(card.classList.contains('is-compact')).toBe(false)
    }
    cards[1]!.querySelector<HTMLButtonElement>('.buddy-artifact-collection__trigger')!.click()
    expect(openArtifact).toHaveBeenCalledExactlyOnceWith('artifact-b')
  })

  it('retains SVG thumbnail containment and falls back to a file icon on load failure', async () => {
    const artifact = { ...selectionArtifact, name: '流程图.svg', mimeType: 'image/svg+xml' }
    const root = mount(() => h(BuddyArtifactCard, { artifact, language: 'zh-CN' }))
    const image = root.querySelector<HTMLImageElement>('.buddy-artifact-collection__image')!
    expect(root.querySelector('.buddy-artifact-collection__preview.is-contain')).not.toBeNull()
    expect(image.src).toContain('lexora-artifact://preview/artifact-a')

    image.dispatchEvent(new Event('error'))
    await nextTick()
    expect(root.querySelector('.buddy-artifact-collection__image')).toBeNull()
    expect(root.querySelector('.buddy-file-icon')).not.toBeNull()
    expect(root.querySelector('.buddy-artifact-collection__name')?.textContent).toBe('流程图.svg')
  })

  it('preserves the separate compact card variant used by the conversation canvas', () => {
    const root = mount(() => h(BuddyArtifactCard, { artifact: selectionArtifact, language: 'zh-CN', compact: true }))
    expect(root.querySelector('.buddy-artifact-collection__item.is-compact')).not.toBeNull()
    expect(root.querySelector('.buddy-artifact-collection__name')?.textContent).toBe(selectionArtifact.name)
  })
})
