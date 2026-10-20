// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import DesktopMediaContent from '../DesktopMediaContent.vue'

function mount(kind: 'audio' | 'video') {
  const url = shallowRef('lexora-media://file/abc')
  const root = document.createElement('div')
  document.body.append(root)
  const app = createApp({ render: () => h(DesktopMediaContent, { kind, url: url.value, name: 'clip', failedLabel: '无法播放' }) })
  app.mount(root)
  const dispose = () => {
    app.unmount()
    root.remove()
  }
  return { root, url, dispose }
}

describe('media content', () => {
  it('renders a video player for video and an audio player for audio', () => {
    const video = mount('video')
    expect(video.root.querySelector('video')?.getAttribute('src')).toBe('lexora-media://file/abc')
    expect(video.root.querySelector('audio')).toBeNull()
    video.dispose()
    const audio = mount('audio')
    expect(audio.root.querySelector('audio')?.getAttribute('src')).toBe('lexora-media://file/abc')
    expect(audio.root.querySelector('video')).toBeNull()
    audio.dispose()
  })

  it('reports a playback error and clears it when the source changes', async () => {
    const view = mount('video')
    expect(view.root.querySelector('[role="alert"]')).toBeNull()
    view.root.querySelector('video')!.dispatchEvent(new Event('error'))
    await nextTick()
    expect(view.root.querySelector('[role="alert"]')?.textContent?.trim()).toBe('无法播放')
    view.url.value = 'lexora-media://file/def'
    await nextTick()
    expect(view.root.querySelector('[role="alert"]')).toBeNull()
    view.dispose()
  })
})
