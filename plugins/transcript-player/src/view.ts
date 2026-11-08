import Artplayer from 'artplayer'
import type { ViewContext } from '../lexora'
import css from './style.css'
import { createReader } from './reader'

const MAX_SUBTITLE_BYTES = 8 * 1024 * 1024
const SUBTITLE_COMMAND = 'pcbed1a21022e43b388ccce09fd4647b5.transcript-player.subtitle'
type SubtitleType = 'srt' | 'vtt' | 'ass'
type SavedSubtitle = { id: string, name: string, type: SubtitleType, encoding: string, show: boolean }

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

function subtitleType(name: string): SubtitleType | null {
  const extension = name.split('.').pop()?.toLowerCase()
  return extension === 'srt' || extension === 'vtt' || extension === 'ass' ? extension : null
}

function decodeSubtitle(bytes: Uint8Array, encoding: string) {
  return new TextDecoder(encoding, { fatal: true }).decode(bytes)
}

async function readSubtitle(url: string, signal: AbortSignal) {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error('无法读取字幕文件，请重新选择。')
  const bytes = new Uint8Array(await response.arrayBuffer())
  signal.throwIfAborted()
  if (!bytes.byteLength) throw new Error('字幕文件为空。')
  if (bytes.byteLength > MAX_SUBTITLE_BYTES) throw new Error('字幕文件超过 8 MiB，请拆分后加载。')
  for (const encoding of ['utf-8', 'gbk']) {
    try {
      if (decodeSubtitle(bytes, encoding).trim()) return encoding
    }
    catch { /* 试下一种编码。 */ }
  }
  throw new Error('字幕编码不匹配，请改用 UTF-8 或 GBK。')
}

function savedSubtitle(value: unknown): SavedSubtitle | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const type = record.type
  if (typeof record.id !== 'string' || typeof record.name !== 'string' || typeof record.encoding !== 'string' || typeof record.show !== 'boolean') return null
  if (type !== 'srt' && type !== 'vtt' && type !== 'ass') return null
  return { id: record.id, name: record.name, type, encoding: record.encoding, show: record.show }
}

function waitForCues(art: Artplayer, signal: AbortSignal) {
  return new Promise<VTTCue[]>((resolve, reject) => {
    const timer = window.setTimeout(() => finish(new Error('字幕加载超时，请重试或重新选择。')), 15000)
    const onLoad = (cues: VTTCue[]) => finish(null, cues)
    const onAbort = () => finish(new DOMException('已取消', 'AbortError'))
    function finish(error: Error | null, cues: VTTCue[] = []) {
      window.clearTimeout(timer)
      art.off('subtitleLoad', onLoad)
      signal.removeEventListener('abort', onAbort)
      if (error) reject(error)
      else resolve(cues)
    }
    signal.addEventListener('abort', onAbort, { once: true })
    art.on('subtitleLoad', onLoad)
  })
}

export async function render(context: ViewContext, container: HTMLElement) {
  if (context.signal.aborted) return
  const life = new AbortController()
  const signal = life.signal
  const stop = () => life.abort()
  context.signal.addEventListener('abort', stop, { once: true })
  let art: Artplayer | undefined
  let loadButton: HTMLElement | undefined
  let toggleButton: HTMLElement | undefined
  let expandButton: HTMLButtonElement | undefined
  let expanded = false
  let split = 60
  let loading = false
  let loadedName = ''
  let saved: SavedSubtitle | null = null
  const mediaKey = context.resource?.sourceId

  const style = element('style')
  style.textContent = css
  const root = element('main', 'player-root')
  const media = element('section', 'player-media')
  media.setAttribute('aria-label', '播放器')
  const canvas = element('div', 'player-canvas')
  const reader = createReader(signal, (time) => {
    if (!art) return
    art.seek = time
    void art.play().catch(() => notice('无法开始播放，请点击播放器的播放按钮。'))
    reader.update(time, art.playing)
  })
  const separator = element('div', 'player-separator')
  separator.tabIndex = 0
  separator.setAttribute('role', 'separator')
  separator.setAttribute('aria-label', '调整播放器和文字记录宽度')
  separator.setAttribute('aria-orientation', 'vertical')
  separator.setAttribute('aria-valuemin', '30')
  separator.setAttribute('aria-valuemax', '75')
  separator.setAttribute('aria-valuenow', String(split))
  const error = element('p', 'player-error')
  error.setAttribute('role', 'alert')
  error.hidden = true
  media.append(canvas, error)
  root.append(media, separator, reader.element)
  container.append(style, root)

  function setSplit(value: number) {
    split = Math.min(75, Math.max(30, value))
    root.style.setProperty('--player-split', `${split}%`)
    separator.setAttribute('aria-valuenow', String(Math.round(split)))
    art?.emit('resize')
  }
  separator.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    event.preventDefault()
    separator.setPointerCapture(event.pointerId)
    root.classList.add('is-resizing')
  }, { signal })
  separator.addEventListener('pointermove', (event) => {
    if (!separator.hasPointerCapture(event.pointerId)) return
    const bounds = root.getBoundingClientRect()
    if (bounds.width) setSplit((event.clientX - bounds.left) / bounds.width * 100)
  }, { signal })
  const endResize = () => root.classList.remove('is-resizing')
  separator.addEventListener('lostpointercapture', endResize, { signal })
  separator.addEventListener('pointerup', (event) => {
    if (separator.hasPointerCapture(event.pointerId)) separator.releasePointerCapture(event.pointerId)
  }, { signal })
  separator.addEventListener('keydown', (event) => {
    const value = event.key === 'ArrowLeft' ? split - 2 : event.key === 'ArrowRight' ? split + 2 : event.key === 'Home' ? 30 : event.key === 'End' ? 75 : null
    if (value === null) return
    event.preventDefault()
    setSplit(value)
  }, { signal })

  function setExpanded(value: boolean) {
    expanded = value
    root.classList.toggle('is-expanded', value)
    reader.element.hidden = separator.hidden = value
    if (expandButton) {
      const label = value ? '退出全屏播放' : '全屏播放'
      expandButton.title = value ? `${label}（Esc）` : `${label}（当前页签）`
      expandButton.setAttribute('aria-label', label)
      expandButton.setAttribute('aria-pressed', String(value))
      expandButton.dataset.expanded = String(value)
    }
    // The media instance, subtitle switch and reader tab/scroll state stay intact.
    art?.emit('resize')
    if (!value) reader.refresh()
  }
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && expanded) {
      event.preventDefault()
      setExpanded(false)
      expandButton?.focus()
    }
  }, { signal })

  signal.addEventListener('abort', () => {
    context.signal.removeEventListener('abort', stop)
    art?.pause()
    art?.destroy()
    root.remove()
    style.remove()
  }, { once: true })
  let hideTimer = 0
  const visibility = context.onVisibilityChange((visible) => {
    window.clearTimeout(hideTimer)
    // 发消息会触发布局重测，文件页可能被判成不可见一瞬。只有持续藏起才暂停。
    if (!visible) hideTimer = window.setTimeout(() => art?.pause(), 800)
  })
  signal.addEventListener('abort', () => {
    window.clearTimeout(hideTimer)
    visibility.dispose()
  }, { once: true })

  function notice(message: string) {
    if (art) art.notice.show = message
  }

  function setLoadLabel(text: string, title = text) {
    if (!loadButton) return
    loadButton.textContent = text
    loadButton.title = title
    loadButton.setAttribute('aria-label', title)
  }

  function setToggle(state: 'empty' | 'on' | 'off') {
    if (!toggleButton) return
    toggleButton.dataset.state = state
    const label = state === 'on' ? '字幕已打开' : state === 'off' ? '字幕已关闭' : '字幕'
    toggleButton.title = label
    toggleButton.setAttribute('aria-label', label)
    toggleButton.setAttribute('aria-disabled', state === 'empty' ? 'true' : 'false')
  }

  async function remember(next: SavedSubtitle | null) {
    saved = next
    if (!mediaKey) return
    await context.commands.execute(SUBTITLE_COMMAND, next ? { op: 'put', key: mediaKey, value: next } : { op: 'delete', key: mediaKey })
  }

  async function applySubtitle(file: { id: string, name: string }, type: SubtitleType, show: boolean) {
    if (!art) throw new Error('播放器还没准备好，请稍后再加载字幕。')
    const url = await context.resources.getUrl(file)
    signal.throwIfAborted()
    const encoding = await readSubtitle(url, signal)
    if (!art.subtitle.textTrack) throw new Error('播放器还没准备好，请稍后再加载字幕。')
    const cuesPromise = waitForCues(art, signal)
    const switched = await art.subtitle.switch(url, { type, encoding, escape: true })
    if (!switched) throw new Error('播放器还没准备好，请稍后再加载字幕。')
    const cues = await cuesPromise
    signal.throwIfAborted()
    if (!cues.length || cues.length > 20000) {
      // The text track has already switched. Do not leave the previous transcript
      // visible against a new, invalid subtitle track.
      reader.setCues([])
      loadedName = ''
      art.subtitle.show = false
      setToggle('empty')
      await remember(null).catch(() => {})
      throw new Error(cues.length ? '字幕超过 20,000 句，请拆分后加载。' : '没有读到有效字幕，请检查内容后重试。')
    }
    reader.setCues(cues)
    reader.update(art.currentTime, art.playing)
    loadedName = file.name
    art.subtitle.show = show
    setLoadLabel(file.name, file.name)
    setToggle(show ? 'on' : 'off')
    await remember({ id: file.id, name: file.name, type, encoding, show }).catch(() => {})
  }

  async function loadSubtitle() {
    if (!art || loading || signal.aborted) return
    loading = true
    setLoadLabel('正在选择…')
    try {
      const [file] = await context.resources.pickFiles({ filters: [{ name: '字幕', extensions: ['srt', 'vtt', 'ass'] }], multiple: false })
      signal.throwIfAborted()
      if (!file) {
        setLoadLabel(loadedName || '加载字幕', loadedName || '加载字幕')
        return
      }
      const type = subtitleType(file.name)
      if (!type) throw new Error('请选择 SRT、VTT 或 ASS 字幕。')
      if (file.size > MAX_SUBTITLE_BYTES) throw new Error('字幕文件超过 8 MiB，请拆分后加载。')
      setLoadLabel('正在加载…', file.name)
      await applySubtitle(file, type, true)
    }
    catch (caught) {
      if (signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return
      const message = caught instanceof Error ? caught.message : '字幕加载失败，请重新选择。'
      notice(message)
      setLoadLabel(loadedName || '加载字幕', loadedName ? `${loadedName} · ${message}` : message)
    }
    finally {
      loading = false
    }
  }

  function toggleSubtitle() {
    if (!art || !loadedName) {
      notice('请先加载字幕。')
      return
    }
    art.subtitle.show = !art.subtitle.show
    setToggle(art.subtitle.show ? 'on' : 'off')
    if (saved) void remember({ ...saved, show: art.subtitle.show }).catch(() => {})
  }

  async function restoreSubtitle() {
    if (!art || !mediaKey || signal.aborted) return
    const found = savedSubtitle(await context.commands.execute(SUBTITLE_COMMAND, { op: 'get', key: mediaKey }))
    if (!found || signal.aborted || loadedName) return
    loading = true
    setLoadLabel('正在加载…', found.name)
    try {
      await applySubtitle(found, found.type, found.show)
    }
    catch (caught) {
      if (signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return
      const message = caught instanceof Error ? caught.message : '上次的字幕已不能读取，请重新选择。'
      if (!message.includes('还没准备好') && !message.includes('超时')) await remember(null).catch(() => {})
      notice(message)
      setLoadLabel('加载字幕', message)
    }
    finally {
      loading = false
    }
  }

  const resource = context.resource
  if (!resource) {
    error.hidden = false
    error.textContent = '没有收到媒体文件。请从文件的“打开方式”里用 ArtPlayer 打开。'
    return
  }
  try {
    const url = await context.resources.getUrl(resource)
    signal.throwIfAborted()
    art = new Artplayer({
      container: canvas,
      url,
      playbackRate: true,
      aspectRatio: true,
      setting: true,
      pip: true,
      subtitleOffset: true,
      miniProgressBar: true,
      flip: true,
      fastForward: true,
      lock: true,
      airplay: true,
      controls: [
        {
          name: 'load-subtitle',
          position: 'left',
          index: 40,
          html: '<span class="art-subtitle-load">加载字幕</span>',
          mounted(control) {
            loadButton = control.querySelector('.art-subtitle-load') ?? control
            setLoadLabel('加载字幕')
          },
          click() { void loadSubtitle() },
        },
        {
          name: 'subtitle-toggle',
          position: 'right',
          index: 15,
          html: '<span class="art-subtitle-toggle">CC</span>',
          mounted(control) {
            toggleButton = control.querySelector('.art-subtitle-toggle') ?? control
            setToggle('empty')
          },
          click() { toggleSubtitle() },
        },
        {
          name: 'page-expand',
          position: 'right',
          index: 100,
          html: '<button type="button" class="player-expand" aria-label="全屏播放" aria-pressed="false"><svg class="player-expand-enter" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg><svg class="player-expand-exit" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5"/></svg></button>',
          mounted(control) {
            expandButton = control.querySelector<HTMLButtonElement>('.player-expand') ?? undefined
            setExpanded(false)
          },
          click() { setExpanded(!expanded) },
        },
      ],
    })
    const syncReader = () => { if (art) reader.update(art.currentTime, art.playing) }
    art.on('video:timeupdate', syncReader)
    art.on('video:seeked', syncReader)
    art.on('video:play', syncReader)
    art.on('video:pause', syncReader)
    art.on('video:ended', syncReader)
    art.on('subtitle', shown => { if (loadedName) setToggle(shown ? 'on' : 'off') })
    void restoreSubtitle()
    art.on('video:error', () => {
      const code = art?.video.error?.code
      error.hidden = false
      error.textContent = code === 3 || code === 4 ? '当前环境不能播放这个编码，请换用兼容的音视频文件。' : '媒体读取失败，请检查文件是否仍可访问。'
    })
  }
  catch {
    if (!signal.aborted) {
      error.hidden = false
      error.textContent = '无法打开媒体，请检查文件是否被移动、替换或撤销了授权。'
    }
  }
}
