import { activeCueIndex, findHits, formatTime, groupCues, normalizeCues } from './transcript'
import type { SearchHit, TranscriptCue } from './transcript'
import { locateTranscriptSelection, selectionFromBounds, SELECTION_LIMIT } from './reference'
import type { TranscriptSelection } from './reference'

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const result = document.createElement(tag)
  result.className = className
  result.textContent = text
  return result
}

function button(label: string, className = '') {
  const result = node('button', className, label)
  result.type = 'button'
  return result
}

export function createReader(signal: AbortSignal, seek: (time: number) => void, actions: {
  quote: (selection: TranscriptSelection, anchor: DOMRect) => void
  notice: (text: string) => void
}) {
  const panel = node('aside', 'transcript-panel')
  panel.setAttribute('aria-label', '文字记录与智能纪要')
  const tabs = node('div', 'transcript-tabs')
  tabs.setAttribute('role', 'tablist')
  tabs.setAttribute('aria-label', '内容类型')
  const transcriptTab = button('文字记录', 'transcript-tab')
  const summaryTab = button('智能纪要', 'transcript-tab')
  const transcript = node('section', 'transcript-content')
  const summary = node('section', 'transcript-summary')
  // A view runs in its own iframe, so IDs remain local to this file tab.
  for (const [tab, content, id] of [[transcriptTab, transcript, 'transcript'], [summaryTab, summary, 'summary']] as const) {
    tab.id = `${id}-tab`
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-controls', `${id}-panel`)
    content.id = `${id}-panel`
    content.setAttribute('role', 'tabpanel')
    content.setAttribute('aria-labelledby', tab.id)
  }
  summary.tabIndex = 0
  const summaryEmpty = node('div', 'transcript-empty')
  summaryEmpty.append(node('p', 'transcript-empty-title', '暂无智能纪要'), node('p', '', '后续支持由 Agent 根据文字记录生成。'))
  summary.append(summaryEmpty)
  tabs.append(transcriptTab, summaryTab)

  const searchBar = node('div', 'transcript-search')
  const search = node('input', 'transcript-search-input')
  search.type = 'search'
  search.placeholder = '搜索文字'
  search.setAttribute('aria-label', '搜索文字记录')
  const count = node('span', 'transcript-search-count', '0/0')
  count.setAttribute('role', 'status')
  const previous = button('上一处', 'transcript-search-nav')
  const next = button('下一处', 'transcript-search-nav')
  searchBar.append(search, count, previous, next)
  const scroll = node('div', 'transcript-scroll')
  scroll.tabIndex = 0
  scroll.setAttribute('aria-label', '文字记录正文')
  const empty = node('div', 'transcript-empty')
  empty.append(node('p', 'transcript-empty-title', '还没有文字稿'), node('p', '', '请使用播放器底栏的“加载字幕”选择 SRT、VTT 或 ASS 文件。'))
  const list = node('div', 'transcript-paragraphs')
  scroll.append(empty, list)
  const followBar = node('div', 'transcript-follow-bar')
  const follow = button('回到当前播放位置', 'transcript-follow')
  follow.hidden = true
  followBar.append(follow)
  transcript.append(searchBar, scroll, followBar)
  panel.append(tabs, transcript, summary)

  let cues: TranscriptCue[] = []
  let cueNodes: HTMLElement[] = []
  let hits: SearchHit[] = []
  let hitIndex = -1
  let active = -1
  let following = true
  let time = 0
  let playing = false
  let selectedTab: 'transcript' | 'summary' = 'transcript'
  let searchTimer = 0
  let appliedQuery = ''
  let referenceSelection: TranscriptSelection | null = null

  function scrollToCue(index: number) {
    const target = cueNodes[index]
    if (!target || panel.hidden || transcript.hidden) return
    // Scroll only our text container; never move the host file tab or player.
    const top = target.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop
    scroll.scrollTo({ top: Math.max(0, top - scroll.clientHeight * 0.3), behavior: 'instant' })
  }

  function stopFollowing() {
    if (!cues.length) return
    following = false
    follow.hidden = false
  }

  function selectTab(tab: typeof selectedTab) {
    selectedTab = tab
    const isTranscript = tab === 'transcript'
    transcript.hidden = !isTranscript
    summary.hidden = isTranscript
    transcriptTab.setAttribute('aria-selected', String(isTranscript))
    summaryTab.setAttribute('aria-selected', String(!isTranscript))
    transcriptTab.tabIndex = isTranscript ? 0 : -1
    summaryTab.tabIndex = isTranscript ? -1 : 0
    if (isTranscript && following && playing) scrollToCue(active)
  }
  transcriptTab.addEventListener('click', () => selectTab('transcript'), { signal })
  summaryTab.addEventListener('click', () => selectTab('summary'), { signal })
  tabs.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const tab = event.key === 'Home' ? 'transcript' : event.key === 'End' ? 'summary' : selectedTab === 'transcript' ? 'summary' : 'transcript'
    selectTab(tab)
    ;(tab === 'transcript' ? transcriptTab : summaryTab).focus()
  }, { signal })

  function updateActive(forceScroll = false) {
    const nextActive = activeCueIndex(cues, time)
    const changed = nextActive !== active
    if (changed) {
      if (active >= 0) {
        cueNodes[active]?.classList.remove('is-current')
        cueNodes[active]?.removeAttribute('aria-current')
      }
      active = nextActive
      if (active >= 0) {
        cueNodes[active]?.classList.add('is-current')
        cueNodes[active]?.setAttribute('aria-current', 'true')
      }
    }
    if (following && (forceScroll || (changed && playing))) scrollToCue(active)
  }

  function paintSearch() {
    const byCue = new Map<number, { hit: SearchHit, index: number }[]>()
    hits.forEach((hit, index) => {
      const group = byCue.get(hit.cueIndex) ?? []
      group.push({ hit, index })
      byCue.set(hit.cueIndex, group)
    })
    cues.forEach((cue, index) => {
      const target = cueNodes[index]
      target.replaceChildren()
      const matches = byCue.get(index) ?? []
      const reference = referenceSelection && index >= referenceSelection.fromCue && index <= referenceSelection.toCue
        ? { start: index === referenceSelection.fromCue ? referenceSelection.fromOffset : 0, end: index === referenceSelection.toCue ? referenceSelection.toOffset : cue.text.length }
        : null
      const cuts = [...new Set([0, cue.text.length, ...matches.flatMap(({ hit }) => [hit.start, hit.end]), ...(reference ? [reference.start, reference.end] : [])])].sort((a, b) => a - b)
      for (let part = 0; part < cuts.length - 1; part++) {
        const start = cuts[part]
        const end = cuts[part + 1]
        const match = matches.find(({ hit }) => start >= hit.start && end <= hit.end)
        const referenced = reference && start >= reference.start && end <= reference.end
        const text = cue.text.slice(start, end)
        if (match || referenced) {
          const classes = [match?.index === hitIndex ? 'is-search-current' : '', referenced ? 'is-reference' : ''].filter(Boolean).join(' ')
          target.append(node('mark', classes, text))
        }
        else target.append(document.createTextNode(text))
      }
    })
    count.textContent = hits.length ? `${hitIndex + 1}/${hits.length}` : '0/0'
    previous.disabled = next.disabled = !hits.length
  }

  function searchNow() {
    window.clearTimeout(searchTimer)
    appliedQuery = search.value
    hits = findHits(cues, appliedQuery)
    hitIndex = hits.length ? 0 : -1
    paintSearch()
    if (hits.length) {
      stopFollowing()
      scrollToCue(hits[0].cueIndex)
    }
  }
  function moveHit(delta: number) {
    window.clearTimeout(searchTimer)
    // Flush a pending input before moving, so Enter never uses stale results.
    if (search.value !== appliedQuery) {
      searchNow()
      return
    }
    if (!hits.length) return
    hitIndex = (hitIndex + delta + hits.length) % hits.length
    paintSearch()
    stopFollowing()
    scrollToCue(hits[hitIndex].cueIndex)
  }
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(searchNow, 120)
  }, { signal })
  search.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault()
      moveHit(event.shiftKey ? -1 : 1)
    }
  }, { signal })
  previous.addEventListener('click', () => moveHit(-1), { signal })
  next.addEventListener('click', () => moveHit(1), { signal })
  follow.addEventListener('click', () => {
    following = true
    follow.hidden = true
    updateActive(true)
  }, { signal })
  // User intent, not scroll events: programmatic following must not cancel itself.
  scroll.addEventListener('wheel', stopFollowing, { signal, passive: true })
  scroll.addEventListener('touchmove', stopFollowing, { signal, passive: true })
  scroll.addEventListener('pointerdown', stopFollowing, { signal })
  scroll.addEventListener('keydown', event => {
    if (event.defaultPrevented) return
    if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) stopFollowing()
  }, { signal })
  function playTarget(target: EventTarget | null) {
    if (!(target instanceof Element)) return
    const sentence = target.closest<HTMLElement>('.transcript-cue')
    const timestamp = target.closest<HTMLElement>('.transcript-time')
    const start = sentence ? cues[Number(sentence.dataset.index)]?.start : timestamp ? Number(timestamp.dataset.time) : undefined
    if (start === undefined || !Number.isFinite(start)) return
    following = true
    follow.hidden = true
    seek(start)
  }
  function quoteParagraph(control: HTMLButtonElement) {
    if (control.disabled || signal.aborted) return
    const from = Number(control.dataset.fromCue)
    const to = Number(control.dataset.toCue)
    const selection = selectionFromBounds(cues, from, to, 0, cues[to]?.text.length ?? 0)
    if (!selection) return
    if (selection.text.length > SELECTION_LIMIT) {
      actions.notice('整段内容超过 32768 个字符，请拖选较小范围后引用。')
      return
    }
    actions.quote({ ...selection }, control.getBoundingClientRect())
  }
  // Delegate to the stable list: replacing subtitles must not retain old cue listeners.
  list.addEventListener('click', event => {
    const quote = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.transcript-paragraph-quote') : null
    if (quote) {
      event.preventDefault()
      quoteParagraph(quote)
      return
    }
    if (window.getSelection()?.isCollapsed === false) return
    playTarget(event.target)
  }, { signal })
  list.addEventListener('keydown', event => {
    if (!(event.target instanceof Element) || !event.target.closest('.transcript-cue')) return
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    playTarget(event.target)
  }, { signal })
  signal.addEventListener('abort', () => window.clearTimeout(searchTimer), { once: true })

  selectTab('transcript')
  search.disabled = previous.disabled = next.disabled = true
  return {
    element: panel,
    readSelection(): { selection: TranscriptSelection, rect: DOMRect } | null {
      const selected = window.getSelection()
      if (!selected || selected.isCollapsed || selected.rangeCount !== 1 || panel.hidden || transcript.hidden) return null
      const range = selected.getRangeAt(0)
      if (!list.contains(range.startContainer) || !list.contains(range.endContainer)) return null
      let first: { cue: number, offset: number } | null = null
      let last: { cue: number, offset: number } | null = null
      cueNodes.forEach((sentence, index) => {
        if (!range.intersectsNode(sentence)) return
        const intersection = document.createRange()
        intersection.selectNodeContents(sentence)
        if (range.compareBoundaryPoints(Range.START_TO_START, intersection) > 0) intersection.setStart(range.startContainer, range.startOffset)
        if (range.compareBoundaryPoints(Range.END_TO_END, intersection) < 0) intersection.setEnd(range.endContainer, range.endOffset)
        if (!intersection.toString().trim()) return
        const before = document.createRange()
        before.selectNodeContents(sentence)
        before.setEnd(intersection.startContainer, intersection.startOffset)
        const offset = before.toString().length
        first ??= { cue: index, offset }
        last = { cue: index, offset: offset + intersection.toString().length }
      })
      if (!first || !last) return null
      const from = first as { cue: number, offset: number }
      const to = last as { cue: number, offset: number }
      const selection = selectionFromBounds(cues, from.cue, to.cue, from.offset, to.offset)
      return selection ? { selection, rect: range.getBoundingClientRect() } : null
    },
    locate(saved: Pick<TranscriptSelection, 'fromCue' | 'toCue' | 'fromOffset' | 'toOffset' | 'start' | 'text'>) {
      return locateTranscriptSelection(cues, saved)
    },
    reveal(selection: TranscriptSelection) {
      referenceSelection = selection
      selectTab('transcript')
      following = false
      follow.hidden = false
      paintSearch()
      scrollToCue(selection.fromCue)
    },
    setCues(loaded: VTTCue[]) {
      window.clearTimeout(searchTimer)
      cues = normalizeCues(loaded.map(cue => ({
        start: cue.startTime, end: cue.endTime, text: cue.getCueAsHTML().textContent ?? '',
      })))
      cueNodes = []
      referenceSelection = null
      active = -1
      following = true
      follow.hidden = true
      const fragment = document.createDocumentFragment()
      for (const paragraph of groupCues(cues)) {
        const section = node('div', 'transcript-paragraph')
        const timestamp = button(formatTime(paragraph.start), 'transcript-time')
        timestamp.setAttribute('aria-label', `从 ${formatTime(paragraph.start)} 播放`)
        timestamp.dataset.time = String(paragraph.start)
        const header = node('div', 'transcript-paragraph-header')
        const quote = button('', 'transcript-paragraph-quote')
        quote.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21c3 0 7-1 7-8V5H2v8h4c0 4-1 4-3 4zm12 0c3 0 7-1 7-8V5h-8v8h4c0 4-1 4-3 4z"/></svg>'
        const from = paragraph.indexes[0]
        const to = paragraph.indexes[paragraph.indexes.length - 1]
        const whole = selectionFromBounds(cues, from, to, 0, cues[to].text.length)
        quote.dataset.fromCue = String(from)
        quote.dataset.toCue = String(to)
        quote.disabled = !whole || whole.text.length > SELECTION_LIMIT
        quote.title = quote.disabled ? '整段内容过长，请拖选较小范围后引用' : '引用整段到 AI（加入聊天草稿，不会直接发送）'
        quote.setAttribute('aria-label', `引用 ${formatTime(paragraph.start)} 开始的整段内容到 AI`)
        header.append(timestamp, quote)
        const body = node('p', 'transcript-text')
        for (const index of paragraph.indexes) {
          const cue = cues[index]
          const sentence = node('span', 'transcript-cue', cue.text)
          sentence.tabIndex = 0
          sentence.setAttribute('role', 'button')
          sentence.title = `从 ${formatTime(cue.start)} 播放`
          sentence.dataset.index = String(index)
          cueNodes.push(sentence)
          body.append(sentence, document.createTextNode(' '))
        }
        section.append(header, body)
        fragment.append(section)
      }
      list.replaceChildren(fragment)
      empty.hidden = !!cues.length
      search.disabled = !cues.length
      searchNow()
      updateActive()
    },
    update(nextTime: number, nextPlaying: boolean) {
      const resumed = !playing && nextPlaying
      time = nextTime
      playing = nextPlaying
      updateActive(resumed)
    },
    refresh() {
      if (following) scrollToCue(active)
    },
  }
}
