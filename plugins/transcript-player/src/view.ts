import Artplayer from 'artplayer'
import type { LocalFile, ViewContext } from '../lexora'
import { activeCueIndexes, formatTime, groupCues, MAX_SUBTITLE_BYTES, normalizeCues, subtitleType } from './transcript.ts'
import type { Cue } from './transcript.ts'
import { readSubtitle } from './subtitle-loader.ts'
import css from './style.css'

// All styling and controls are ours; ArtPlayer remains an unmodified, bundled dependency.
Artplayer.LOG_VERSION = false
Artplayer.CONTEXTMENU = false
Artplayer.DBCLICK_FULLSCREEN = false
Artplayer.RECONNECT_TIME_MAX = 0

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}
function button(text: string, className = '') {
  const node = element('button', className, text)
  node.type = 'button'
  return node
}

export async function render(context: ViewContext, container: HTMLElement) {
  if (context.signal.aborted) return
  const life = new AbortController()
  const signal = life.signal
  const stop = () => life.abort()
  context.signal.addEventListener('abort', stop, { once: true })
  let art: Artplayer | undefined
  let pendingSwitch: Promise<unknown> | undefined
  let cues: Cue[] = []
  let rows: HTMLElement[] = []
  let active: number[] = []
  let follow = true
  let loadedFile: LocalFile | undefined
  let subtitleBusy = false
  let subtitleLoadId = 0

  const style = element('style')
  style.textContent = css
  const root = element('main', 'transcript-player')
  const mediaPane = element('section', 'media-pane')
  mediaPane.setAttribute('aria-label', '播放器')
  const stage = element('div', 'media-stage')
  const canvas = element('div', 'player-canvas')
  const audioCover = element('div', 'audio-cover')
  const audioTitle = element('p', 'audio-title', context.resource?.name ?? '')
  const audioDuration = element('p', 'audio-duration', '音频')
  audioCover.append(audioTitle, audioDuration)
  stage.append(canvas, audioCover)
  const mediaName = element('p', 'media-name', context.resource?.name ?? '')
  mediaName.title = context.resource?.name ?? ''
  const controls = element('div', 'playback-controls')
  const play = button('播放', 'play-button')
  play.disabled = true
  const clock = element('output', 'clock', '00:00 / 00:00')
  const speed = element('select')
  speed.setAttribute('aria-label', '播放速度')
  for (const rate of [0.5, 0.75, 1, 1.25, 1.5, 2]) {
    const option = element('option', '', rate + '×')
    option.value = String(rate)
    option.selected = rate === 1
    speed.append(option)
  }
  speed.disabled = true
  const seek = element('input', 'seek')
  seek.type = 'range'
  seek.min = '0'
  seek.max = '0'
  seek.step = '0.1'
  seek.value = '0'
  seek.disabled = true
  seek.setAttribute('aria-label', '播放进度')
  const volume = element('input', 'volume')
  volume.type = 'range'
  volume.min = '0'
  volume.max = '1'
  volume.step = '0.05'
  volume.value = '0.7'
  volume.setAttribute('aria-label', '音量')
  volume.disabled = true
  const volumeLabel = element('label', 'volume-control', '音量')
  volumeLabel.append(volume)
  controls.append(play, clock, speed, volumeLabel)
  const mediaError = element('p', 'error media-error')
  mediaError.setAttribute('role', 'alert')
  mediaError.hidden = true
  const retryMedia = button('重试播放', 'secondary')
  retryMedia.hidden = true
  mediaPane.append(stage, mediaName, seek, controls, mediaError, retryMedia)

  const transcriptPane = element('section', 'transcript-pane')
  transcriptPane.setAttribute('aria-label', '文字稿')
  const toolbar = element('div', 'transcript-toolbar')
  const title = element('h2', '', '文字稿')
  const encoding = element('select')
  encoding.setAttribute('aria-label', '字幕编码')
  for (const [value, name] of [['utf-8', 'UTF-8'], ['gbk', 'GBK'], ['utf-16le', 'UTF-16 LE']]) {
    const option = element('option', '', name)
    option.value = value!
    encoding.append(option)
  }
  const load = button('加载字幕', 'primary')
  load.disabled = true
  toolbar.append(title, encoding, load)
  const subtitleName = element('p', 'subtitle-name', 'SRT、VTT 或 ASS · 最多 8 MiB')
  const subtitleStatus = element('p', 'subtitle-status')
  subtitleStatus.setAttribute('role', 'status')
  const retrySubtitle = button('重试加载', 'secondary')
  retrySubtitle.hidden = true
  const scroll = element('div', 'transcript-scroll')
  scroll.tabIndex = 0
  scroll.setAttribute('aria-label', '文字稿内容，可滚动阅读')
  const empty = element('div', 'empty')
  empty.append(element('h3', '', '还没有文字稿。'), element('p', '', '加载一份字幕，点一句就从那里播放。'))
  scroll.append(empty)
  const followBar = element('div', 'follow-bar')
  const back = button('回到当前', 'secondary')
  back.hidden = true
  const hint = element('span', '', '点击句子播放 · 滚动可暂停跟随')
  followBar.append(hint, back)
  transcriptPane.append(toolbar, subtitleName, subtitleStatus, retrySubtitle, scroll, followBar)
  root.append(mediaPane, transcriptPane)
  container.append(style, root)

  function listen(target: EventTarget, event: string, handler: EventListener, options: AddEventListenerOptions = {}) {
    target.addEventListener(event, handler, { ...options, signal })
  }
  function showMediaError(message: string) {
    if (signal.aborted) return
    mediaError.textContent = message
    mediaError.hidden = false
    retryMedia.hidden = false
  }
  function clearMediaError() {
    mediaError.hidden = true
    retryMedia.hidden = true
  }
  function followCurrent(force = false) {
    if ((!follow && !force) || !active.length) return
    const row = rows[active[0]!]
    if (!row) return
    const top = row.offsetTop - scroll.offsetTop
    if (force || top < scroll.scrollTop + 20 || top + row.offsetHeight > scroll.scrollTop + scroll.clientHeight - 20)
      scroll.scrollTop = Math.max(0, top - scroll.clientHeight * 0.3)
  }
  function update() {
    if (!art || signal.aborted) return
    const duration = Number.isFinite(art.duration) ? art.duration : 0
    const time = art.currentTime || 0
    clock.textContent = formatTime(time) + ' / ' + formatTime(duration)
    seek.max = String(duration)
    seek.value = String(time)
    seek.disabled = duration <= 0
    seek.setAttribute('aria-valuetext', formatTime(time) + '，共 ' + formatTime(duration))
    play.textContent = art.playing ? '暂停' : '播放'
    play.setAttribute('aria-label', art.playing ? '暂停播放' : '开始播放')
    const next = activeCueIndexes(cues, time)
    const changed = next.join(',') !== active.join(',')
    if (changed) {
      for (const i of active) {
        rows[i]?.classList.remove('is-current')
        rows[i]?.removeAttribute('aria-current')
      }
      active = next
      for (const i of active) {
        rows[i]?.classList.add('is-current')
        rows[i]?.setAttribute('aria-current', 'true')
      }
      if (art.playing) followCurrent()
    }
  }
  async function startPlayback() {
    const current = art
    if (!current || signal.aborted) return
    try { await current.play(); if (!signal.aborted) clearMediaError() }
    catch { showMediaError('播放未能开始，请再点一次播放；若仍失败，请检查媒体格式。') }
  }
  function jump(index: number) {
    const cue = cues[index]
    if (!art || !cue || signal.aborted) return
    if (art.video.readyState < 1) { showMediaError('媒体仍在加载，请稍后再试。'); return }
    if (!Number.isFinite(art.duration) || cue.start >= art.duration) {
      subtitleStatus.textContent = '这一句超出了媒体时长，请检查字幕是否与文件匹配。'
      return
    }
    art.seek = cue.start
    update()
    void startPlayback()
  }
  function renderCues() {
    rows = []
    active = []
    const fragment = document.createDocumentFragment()
    for (const indexes of groupCues(cues)) {
      const paragraph = element('div', 'paragraph')
      const first = cues[indexes[0]!]!
      if (first.speaker) paragraph.append(element('p', 'speaker', first.speaker))
      for (const index of indexes) {
        const cue = cues[index]!
        const row = element('div', 'cue')
        const timestamp = button(formatTime(cue.start), 'cue-time')
        timestamp.setAttribute('aria-label', '从 ' + formatTime(cue.start) + ' 播放')
        const text = element('span', 'cue-text', cue.text)
        row.append(timestamp, text)
        row.dataset.index = String(index)
        rows[index] = row
        paragraph.append(row)
      }
      fragment.append(paragraph)
    }
    scroll.replaceChildren(fragment)
    scroll.scrollTop = 0
    update()
  }

  function waitForTrack(current: Artplayer, url: string, loadSignal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const done = (error?: unknown) => {
        current.off('subtitleLoad', onLoad)
        current.video.removeEventListener('error', onError, true)
        loadSignal.removeEventListener('abort', onAbort)
        if (error) reject(error)
        else resolve()
      }
      const onLoad = (_cues: VTTCue[], option: { url?: string }) => { if (option.url === url) done() }
      const onError = (event: Event) => { if (event.target instanceof HTMLTrackElement) done(new Error('字幕格式无效，请检查文件内容或重新选择编码。')) }
      const onAbort = () => done(loadSignal.reason)
      current.on('subtitleLoad', onLoad)
      current.video.addEventListener('error', onError, true)
      loadSignal.addEventListener('abort', onAbort, { once: true })
      if (loadSignal.aborted) onAbort()
    })
  }
  async function loadSubtitle(file: LocalFile) {
    const current = art
    if (!current || subtitleBusy || signal.aborted) return
    const type = subtitleType(file.name)
    if (!type) { subtitleStatus.textContent = '请选择 SRT、VTT 或 ASS 字幕。'; return }
    if (file.size > MAX_SUBTITLE_BYTES) { subtitleStatus.textContent = '字幕文件超过 8 MiB，请拆分后加载。'; return }
    subtitleBusy = true
    load.disabled = true
    encoding.disabled = true
    retrySubtitle.hidden = true
    subtitleStatus.textContent = '正在加载字幕…'
    loadedFile = file
    const requestId = ++subtitleLoadId
    const controller = new AbortController()
    const loadSignal = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(20000)])
    try {
      const url = await context.resources.getUrl(file)
      loadSignal.throwIfAborted()
      // Validate encoding here. ArtPlayer must fetch this resource URL itself: the view CSP allows
      // __resource/ and __selected/, but not a blob: fetch.
      const response = await fetch(url, { signal: loadSignal })
      await readSubtitle(response, encoding.value, loadSignal)
      if (!current.subtitle.textTrack) throw new Error('播放器还没准备好，请稍后再加载字幕。')
      const ready = waitForTrack(current, url, loadSignal)
      void ready.catch(() => {})
      pendingSwitch = current.subtitle.switch(url, { type, encoding: encoding.value, escape: true })
      await pendingSwitch
      await ready
      loadSignal.throwIfAborted()
      const next = normalizeCues(current.subtitle.cues)
      if (!next.length) throw new Error('没有读到有效字幕，请检查内容或切换编码后重试。')
      cues = next
      renderCues()
      follow = true
      back.hidden = true
      subtitleName.textContent = file.name + ' · ' + cues.length + ' 句'
      subtitleName.title = file.name
      subtitleStatus.textContent = ''
    }
    catch (error) {
      if (!signal.aborted && requestId === subtitleLoadId) {
        cues = []
        rows = []
        active = []
        scroll.replaceChildren(element('div', 'empty', '文字稿未加载。请重试或重新选择字幕。'))
        subtitleName.textContent = file.name
        subtitleStatus.textContent = loadSignal.aborted
          ? '字幕加载超时，请重试或重新选择。'
          : error instanceof Error ? error.message : '字幕加载失败，请重新选择。'
        retrySubtitle.hidden = false
      }
    }
    finally {
      controller.abort()
      pendingSwitch = undefined
      if (!signal.aborted) {
        subtitleBusy = false
        load.disabled = false
        encoding.disabled = false
      }
    }
  }
  async function chooseSubtitle() {
    if (subtitleBusy || signal.aborted) return
    load.disabled = true
    try {
      const [file] = await context.resources.pickFiles({ filters: [{ name: '字幕', extensions: ['srt', 'vtt', 'ass'] }], multiple: false })
      if (file && !signal.aborted) await loadSubtitle(file)
    }
    catch { if (!signal.aborted) subtitleStatus.textContent = '无法打开文件选择器，请重试。' }
    finally { if (!signal.aborted && !subtitleBusy) load.disabled = false }
  }
  function interruptFollow() {
    if (!cues.length) return
    follow = false
    back.hidden = false
  }

  listen(load, 'click', () => { void chooseSubtitle() })
  listen(retrySubtitle, 'click', () => { if (loadedFile) void loadSubtitle(loadedFile) })
  listen(encoding, 'change', () => { if (loadedFile) void loadSubtitle(loadedFile) })
  listen(play, 'click', () => { if (art?.playing) art.pause(); else void startPlayback() })
  listen(seek, 'input', () => { if (art) { art.seek = Number(seek.value); update() } })
  listen(speed, 'change', () => { if (art) art.playbackRate = Number(speed.value) })
  listen(volume, 'input', () => { if (art) art.volume = Number(volume.value) })
  listen(retryMedia, 'click', () => { clearMediaError(); art?.video.load() })
  listen(scroll, 'click', (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const row = target.closest<HTMLElement>('.cue')
    if (!row || !scroll.contains(row)) return
    // Dragging a selection should never seek or start playing.
    if (!target.closest('button') && document.getSelection()?.toString()) return
    jump(Number(row.dataset.index))
  })
  listen(scroll, 'wheel', interruptFollow, { passive: true })
  listen(scroll, 'touchmove', interruptFollow, { passive: true })
  // A scrollbar drag emits pointerdown on the scroll container itself.
  listen(scroll, 'pointerdown', (event) => { if (event.target === scroll) interruptFollow() })
  listen(scroll, 'keydown', (event) => {
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].includes((event as KeyboardEvent).key) && !(event.target instanceof HTMLButtonElement))
      interruptFollow()
  })
  listen(back, 'click', () => { follow = true; back.hidden = true; followCurrent(true) })

  const visibility = context.onVisibilityChange(visible => { if (!visible) art?.pause() })
  signal.addEventListener('abort', () => {
    subtitleLoadId++
    visibility.dispose()
    context.signal.removeEventListener('abort', stop)
    art?.pause()
    const current = art
    const destroy = () => current?.destroy()
    if (pendingSwitch) void pendingSwitch.then(destroy, destroy)
    else destroy()
    root.remove()
    style.remove()
  }, { once: true })

  const resource = context.resource
  if (!resource) { showMediaError('没有收到媒体文件。请从文件管理器用“文字稿”打开音视频。'); return }
  root.classList.toggle('is-audio', /\.(mp3|wav|ogg|oga|opus|m4a|aac|flac)$/i.test(resource.name))
  try {
    const url = await context.resources.getUrl(resource)
    signal.throwIfAborted()
    art = new Artplayer({
      container: canvas, url, autoplay: false, volume: 0.7, hotkey: false,
      setting: false, screenshot: false, pip: false, fullscreen: false, fullscreenWeb: false,
      miniProgressBar: false, autoPlayback: false, autoSize: false, autoMini: false,
      mutex: false, playsInline: true, theme: 'var(--lexora-accent-solid)',
      subtitle: { escape: true },
    })
    art.subtitle.show = false
    art.video.controls = false
    art.video.preload = 'metadata'
    art.on('video:loadedmetadata', () => {
      if (signal.aborted || !art) return
      // A real audio track in a video container also gets an audio cover.
      if (art.video.videoWidth === 0) root.classList.add('is-audio')
      audioDuration.textContent = '音频 · ' + formatTime(art.duration)
      play.disabled = false
      update()
    })
    for (const event of ['video:timeupdate', 'video:play', 'video:pause', 'video:ended', 'video:seeked', 'video:durationchange'])
      art.on(event, update)
    art.on('video:error', () => {
      const code = art?.video.error?.code
      showMediaError(code === 3 || code === 4 ? '当前环境不能播放这个编码，请换用兼容的音视频文件。' : '媒体读取失败，请检查文件是否仍可访问，然后重试。')
      play.disabled = true
    })
    load.disabled = false
    speed.disabled = false
    volume.disabled = false
  }
  catch { showMediaError('无法打开媒体，请检查文件是否被移动、替换或撤销了授权。') }
}
