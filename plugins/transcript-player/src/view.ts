import Artplayer from 'artplayer'
import type { ViewContext } from '../lexora'
import css from './style.css'
import { createReader } from './reader'
import { isAudioFile } from './media'
import { createSelectionToolbar } from './selection-toolbar'
import { createTranscriptReference, readTranscriptReference } from './reference'
import type { SourceFile, SubtitleSource, TranscriptSelection } from './reference'

const MAX_SUBTITLE_BYTES = 8 * 1024 * 1024
const SUBTITLE_COMMAND = 'pcbed1a21022e43b388ccce09fd4647b5.transcript-player.subtitle'
type SubtitleType = 'srt' | 'vtt' | 'ass'
type SavedSubtitle = SubtitleSource

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
  if (Number(response.headers.get('content-length')) > MAX_SUBTITLE_BYTES) {
    await response.body?.cancel()
    throw new Error('字幕文件超过 8 MiB，请拆分后加载。')
  }
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
  return { id: record.id, name: record.name, type, encoding: record.encoding, show: record.show, ...(typeof record.relativePath === 'string' ? { relativePath: record.relativePath } : {}) }
}

function waitForCues(art: Artplayer, signal: AbortSignal) {
  signal.throwIfAborted()
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

function waitWithSignal<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')) }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    task.then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
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
  let subtitleTask: Promise<void> = Promise.resolve()
  let locating = false
  let revealSequence = 0
  let quoting = false
  const mediaKey = context.resource?.sourceId
  const audio = isAudioFile(context.resource?.name ?? '')

  const style = element('style')
  style.textContent = css
  const root = element('main', audio ? 'player-root is-audio' : 'player-root')
  const media = element('section', 'player-media')
  media.setAttribute('aria-label', audio ? '音频播放器' : '播放器')
  if (audio) {
    const cover = element('div', 'player-audio-cover')
    const icon = element('div', 'player-audio-icon')
    icon.setAttribute('aria-hidden', 'true')
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/></svg>'
    const name = element('p', 'player-audio-name', context.resource?.name ?? '')
    name.title = name.textContent ?? ''
    cover.append(icon, name)
    media.append(cover)
  }
  const canvas = element('div', 'player-canvas')
  const reader = createReader(signal, (time) => {
    if (!art) return
    art.seek = time
    void art.play().catch(() => notice('无法开始播放，请点击播放器的播放按钮。'))
    reader.update(time, art.playing)
  }, { quote: quoteSelection, notice })
  const separator = element('div', 'player-separator')
  separator.hidden = audio
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
  const selectionToolbar = createSelectionToolbar(root, reader, signal, {
    async copy(text) {
      if (typeof context.clipboard?.write !== 'function') throw new Error('当前应用版本不支持插件复制，请升级应用。')
      await context.clipboard.write({ text })
    },
    quote: quoteSelection,
    notice,
  })

  async function quoteSelection(selection: TranscriptSelection) {
    if (quoting) throw new Error('正在添加引用，请完成当前操作后再试。')
    if (loading || locating || !saved || !loadedName || !context.resource) throw new Error('请等待字幕加载完成后重新选择。')
    if (typeof context.references?.add !== 'function') throw new Error('当前应用版本不支持内容引用，请升级应用。')
    const mediaSource: SourceFile = { name: context.resource.name }
    if ('relativePath' in context.resource && typeof context.resource.relativePath === 'string') mediaSource.relativePath = context.resource.relativePath
    const reference = createTranscriptReference(selection, { ...saved }, mediaSource)
    selectionToolbar.dismiss()
    quoting = true
    try { return await context.references.add(reference) }
    finally { quoting = false }
  }

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
    selectionToolbar.dismiss()
    reader.element.hidden = value
    separator.hidden = value || audio
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
    if (!visible) {
      selectionToolbar.dismiss()
      hideTimer = window.setTimeout(() => art?.pause(), 800)
    }
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

  function applySubtitle(file: { id: string, name: string, relativePath?: string }, type: SubtitleType, show: boolean, requestSignal = signal, persist = true) {
    const task = subtitleTask.catch(() => {}).then(() => applySubtitleNow(file, type, show, requestSignal, persist))
    subtitleTask = task
    return task
  }

  async function applySubtitleNow(file: { id: string, name: string, relativePath?: string }, type: SubtitleType, show: boolean, requestSignal: AbortSignal, persist: boolean) {
    const operation = new AbortController()
    const activeSignal = AbortSignal.any([signal, requestSignal, operation.signal])
    activeSignal.throwIfAborted()
    if (!art) throw new Error('播放器还没准备好，请稍后再加载字幕。')
    const player = art
    const url = await context.resources.getUrl(file)
    activeSignal.throwIfAborted()
    const encoding = await readSubtitle(url, activeSignal)
    activeSignal.throwIfAborted()
    if (!player.subtitle.textTrack) throw new Error('播放器还没准备好，请稍后再加载字幕。')
    selectionToolbar.dismiss()
    const cuesPromise = waitForCues(player, activeSignal)
    void cuesPromise.catch(() => {}) // switch() may fail before the cue event arrives.
    try {
      const switched = await player.subtitle.switch(url, { type, encoding, escape: true })
      if (!switched) throw new Error('播放器还没准备好，请稍后再加载字幕。')
      const cues = await cuesPromise
      activeSignal.throwIfAborted()
      if (!cues.length || cues.length > 20000) {
        reader.setCues([])
        loadedName = ''
        player.subtitle.show = false
        setToggle('empty')
        if (persist) await remember(null).catch(() => {})
        else saved = null
        throw new Error(cues.length ? '字幕超过 20,000 句，请拆分后加载。' : '没有读到有效字幕，请检查内容后重试。')
      }
      reader.setCues(cues)
      reader.update(player.currentTime, player.playing)
      loadedName = file.name
      player.subtitle.show = show
      setLoadLabel(file.name, file.name)
      setToggle(show ? 'on' : 'off')
      const next: SavedSubtitle = { id: file.id, name: file.name, type, encoding, show, ...(file.relativePath ? { relativePath: file.relativePath } : {}) }
      if (persist) await remember(next).catch(() => {})
      else saved = next // Revealing an old quote must not overwrite the remembered subtitle.
    }
    catch (error) {
      if (!signal.aborted) {
        // switch() may already have replaced the track before it fails or is
        // cancelled. Never keep the previous text against that different track.
        reader.setCues([])
        loadedName = ''
        saved = null
        player.subtitle.show = false
        setLoadLabel('加载字幕')
        setToggle('empty')
      }
      throw error
    }
    finally { operation.abort() }
  }

  async function loadSubtitle() {
    if (!art || loading || locating || signal.aborted) return
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
      aspectRatio: !audio,
      setting: true,
      pip: !audio,
      subtitleOffset: true,
      miniProgressBar: !audio,
      flip: !audio,
      fastForward: true,
      lock: !audio,
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
    if (audio) {
      // Audio has no picture to hover: keep its existing transport discoverable.
      art.on('control', shown => { if (!shown && art) art.controls.show = true })
      art.controls.show = true
    }
    const syncReader = () => { if (art) reader.update(art.currentTime, art.playing) }
    art.on('video:timeupdate', syncReader)
    art.on('video:seeked', syncReader)
    art.on('video:play', syncReader)
    art.on('video:pause', syncReader)
    art.on('video:ended', syncReader)
    art.on('subtitle', shown => { if (loadedName) setToggle(shown ? 'on' : 'off') })
    const restored = restoreSubtitle().catch(() => {})
    if (typeof context.references?.onReveal === 'function') {
      const registration = context.references.onReveal(async (input, requestSignal) => {
        const reference = readTranscriptReference(input.locator, input.text)
        if (!reference) return false
        const sequence = ++revealSequence
        locating = true
        const activeSignal = AbortSignal.any([signal, requestSignal])
        try {
          await waitWithSignal(restored, activeSignal)
          if (loading) return false
          const { data, text } = reference
          // Reload the referenced authorized subtitle, not a file guessed from its name.
          await applySubtitle(data.subtitle, data.subtitle.type, data.subtitle.show, activeSignal, false)
          activeSignal.throwIfAborted()
          if (sequence !== revealSequence || !art) return false
          const selection = reader.locate({ ...data, text })
          if (!selection) {
            notice('引用原文与当前字幕不匹配，无法定位。')
            return false
          }
          art.pause()
          setExpanded(false)
          art.seek = selection.start
          reader.update(selection.start, false)
          reader.reveal(selection)
          selectionToolbar.dismiss()
          return true
        }
        catch {
          if (!activeSignal.aborted) notice('无法读取引用所用字幕，请重新加载对应字幕后重试。')
          return false
        }
        finally { if (sequence === revealSequence) locating = false }
      })
      signal.addEventListener('abort', () => registration.dispose(), { once: true })
    }
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
