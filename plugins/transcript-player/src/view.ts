import Artplayer from 'artplayer'
import type { ViewContext } from '../lexora'
import css from './style.css'

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
  const node = document.createElement(tag)
  node.className = className
  node.textContent = text
  return node
}

export async function render(context: ViewContext, container: HTMLElement) {
  if (context.signal.aborted) return
  const life = new AbortController()
  const signal = life.signal
  const stop = () => life.abort()
  context.signal.addEventListener('abort', stop, { once: true })
  let art: Artplayer | undefined

  const style = element('style')
  style.textContent = css
  const root = element('main', 'player-root')
  const canvas = element('div', 'player-canvas')
  const error = element('p', 'player-error')
  error.setAttribute('role', 'alert')
  error.hidden = true
  root.append(canvas, error)
  container.append(style, root)

  signal.addEventListener('abort', () => {
    context.signal.removeEventListener('abort', stop)
    art?.pause()
    art?.destroy()
    root.remove()
    style.remove()
  }, { once: true })
  const visibility = context.onVisibilityChange(visible => { if (!visible) art?.pause() })
  signal.addEventListener('abort', () => visibility.dispose(), { once: true })

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
      screenshot: true,
      setting: true,
      pip: true,
      subtitleOffset: true,
      miniProgressBar: true,
      flip: true,
      fastForward: true,
      lock: true,
      airplay: true,
    })
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
