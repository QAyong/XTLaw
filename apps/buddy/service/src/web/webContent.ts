import type { WebResource } from '../../../shared/network/webTransport'
import { Buffer } from 'node:buffer'
import { Readability } from '@mozilla/readability'
import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'
import { WebError } from '../../../shared/network/webProtocol'
import { requireWebSuccess } from '../../../shared/network/webTransport'

export interface WebDocument {
  url: string
  title: string
  content: string
  contentType: string
  acquisitionIncomplete: boolean
  warnings: string[]
  handler: 'html' | 'text' | 'pdf' | 'github'
  usage?: { credits: number, cost: null }
}

export function decodeWebText(bytes: Uint8Array, contentType: string): string {
  const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(contentType)?.[1]
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes)
  }
  catch { return new TextDecoder().decode(bytes) }
}

// WeChat ships the article body hidden and reveals it from page scripts, which Readability treats as invisible.
function revealWeChatArticle(document: ReturnType<typeof parseHTML>['document']): void {
  for (const element of document.querySelectorAll('[style]')) {
    const style = element.getAttribute('style') ?? ''
    const revealed = style.replace(/visibility\s*:\s*hidden\s*;?/gi, '').replace(/opacity\s*:\s*0(?:\.0+)?\s*(?:;|$)/gi, '')
    if (revealed !== style)
      element.setAttribute('style', revealed)
  }
}

function decodeScriptEscapes(raw: string): string {
  return raw.replace(/\\x([0-9a-f]{2})|\\u([0-9a-f]{4})/gi, (_match, byte: string | undefined, unit: string | undefined) => String.fromCharCode(Number.parseInt(byte ?? unit!, 16)))
}

// A WeChat image post (item_show_type 8) carries its caption in page metadata, its images in scripts, and, when it
// was made from an article, a link back to that article. There is no article body, so the generic path would only
// find the "open in WeChat" placeholder and report it as a successful read.
function extractWeChatImagePost(html: string, document: ReturnType<typeof parseHTML>['document'], url: string): WebDocument | null {
  if (!/window\.item_show_type\s*=\s*'8'/.test(html))
    return null
  const caption = decodeScriptEscapes(document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const title = (document.querySelector('meta[property="og:title"]')?.getAttribute('content') || document.title || url).trim()
  const block = /convert_appmsg_link\s*:\s*\{([\s\S]*?)\}/.exec(html)?.[1] ?? ''
  const field = (name: string) => new RegExp(`\\b${name}\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(block)?.[1]
  let original: { title: string, url: string } | null = null
  try {
    const target = new URL(decodeScriptEscapes(field('content_url') ?? '').replace(/&amp;/g, '&'))
    if (target.hostname === 'mp.weixin.qq.com' && target.pathname === '/s') {
      target.protocol = 'https:'
      original = { title: decodeScriptEscapes(field('title') ?? '').trim() || target.href, url: target.href }
    }
  }
  catch {}
  if (!caption && !original)
    throw new WebError('WEB_EMPTY_CONTENT')
  return {
    url,
    title,
    content: caption || title,
    contentType: 'text/markdown',
    acquisitionIncomplete: true,
    warnings: [
      'WeChat image post: the images were not read (no OCR), so this is only the text caption.',
      ...(original ? [`Original article: "${original.title}" ${original.url} - read this URL with lexora_web_fetch for the full text.`] : []),
    ],
    handler: 'html',
  }
}

export function extractHtml(html: string, url: string): WebDocument {
  const { document } = parseHTML(html)
  if (URL.canParse(url) && new URL(url).hostname === 'mp.weixin.qq.com') {
    const imagePost = extractWeChatImagePost(html, document, url)
    if (imagePost)
      return imagePost
    revealWeChatArticle(document)
  }
  const title = document.title?.trim() || url
  const visible = document.body?.textContent?.trim() ?? ''
  if (document.querySelector('#challenge-form, #cf-challenge-running, form[action*="captcha"], #b_captcha')
    || /^(?:just a moment|access denied|verify you are human|security verification)/i.test(title)) {
    throw new WebError('WEB_CHALLENGE')
  }
  if (document.querySelector('input[type="password"]') && visible.length < 2000)
    throw new WebError('WEB_ACCESS_DENIED')
  const hasScripts = Boolean(document.querySelector('script'))
  for (const element of document.querySelectorAll('script, style, noscript, svg, iframe, form, nav, footer, header'))
    element.remove()
  for (const element of document.querySelectorAll('[href], [src]')) {
    for (const attribute of ['href', 'src']) {
      const raw = element.getAttribute(attribute)
      if (!raw)
        continue
      try {
        const target = new URL(raw, url)
        if (['http:', 'https:'].includes(target.protocol))
          element.setAttribute(attribute, target.href)
        else
          element.removeAttribute(attribute)
      }
      catch { element.removeAttribute(attribute) }
    }
  }
  const article = new Readability(document as unknown as Document, { charThreshold: 120 }).parse()
  const source = article?.content || document.querySelector('main, article')?.innerHTML || document.body?.innerHTML || ''
  const markdown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  markdown.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => {
      const table = parseHTML(`<html><body>${node.outerHTML}</body></html>`).document
      const rows: string[][] = [...table.querySelectorAll('tr')].map(row => [...row.querySelectorAll('th, td')]
        .map(cell => (cell.textContent ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim()))
      if (!rows.length)
        return ''
      const width = Math.max(...rows.map(row => row.length))
      const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? '').join(' | ')} |`
      return `\n\n${[line(rows[0]!), line(Array.from<string>({ length: width }).fill('---')), ...rows.slice(1).map(line)].join('\n')}\n\n`
    },
  })
  const content = markdown.turndown(source).trim()
  if (content.length < 80 && hasScripts)
    throw new WebError('WEB_RENDER_REQUIRED')
  if (!content)
    throw new WebError('WEB_EMPTY_CONTENT')
  return { url, title: article?.title || title, content, contentType: 'text/markdown', acquisitionIncomplete: false, warnings: [], handler: 'html' }
}

export async function extractWebResource(resource: WebResource, signal: AbortSignal): Promise<WebDocument> {
  requireWebSuccess(resource.status)
  const type = resource.headers.get('content-type') ?? ''
  const mime = type.split(';')[0]!.trim().toLowerCase()
  const base = { url: resource.url, title: resource.url, acquisitionIncomplete: false, warnings: [] as string[] }
  if (mime === 'application/pdf' || Buffer.from(resource.bytes.subarray(0, 5)).toString() === '%PDF-') {
    const { getDocumentProxy } = await import('unpdf')
    signal.throwIfAborted()
    const pdf = await getDocumentProxy(Uint8Array.from(resource.bytes), { useSystemFonts: false, useWorkerFetch: false }).catch((error: unknown) => {
      signal.throwIfAborted()
      throw new WebError(error instanceof Error && error.name === 'PasswordException' ? 'WEB_ACCESS_DENIED' : 'WEB_UNSUPPORTED_CONTENT')
    })
    const cancel = () => {
      void pdf.loadingTask.destroy()
    }
    signal.addEventListener('abort', cancel, { once: true })
    try {
      const pages: string[] = []
      let length = 0
      for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 200); pageNumber++) {
        signal.throwIfAborted()
        const page = await pdf.getPage(pageNumber)
        const text = await page.getTextContent()
        const content = text.items.flatMap(item => 'str' in item ? [item.str + (item.hasEOL ? '\n' : ' ')] : []).join('').trim()
        length += content.length
        if (length > 4 * 1024 * 1024)
          break
        pages.push(`## Page ${pageNumber}\n\n${content || '[No extractable text on this page]'}`)
      }
      if (!pages.some(page => !page.endsWith('[No extractable text on this page]')))
        throw new WebError('WEB_UNSUPPORTED_CONTENT')
      return { ...base, content: pages.join('\n\n'), contentType: 'text/markdown', handler: 'pdf', acquisitionIncomplete: pages.length < pdf.numPages, warnings: ['PDF text order is best effort; no OCR was performed.'] }
    }
    catch (error) {
      signal.throwIfAborted()
      throw error instanceof WebError ? error : new WebError('WEB_UNSUPPORTED_CONTENT')
    }
    finally {
      signal.removeEventListener('abort', cancel)
      await pdf.loadingTask.destroy()
    }
  }
  const text = decodeWebText(resource.bytes, type)
  if (mime === 'text/html' || mime === 'application/xhtml+xml' || (!mime && /^\s*(?:<!doctype html|<html)/i.test(text)))
    return extractHtml(text, resource.url)
  if (mime.startsWith('text/') || ['application/json', 'application/xml', 'application/ld+json'].includes(mime)) {
    if (!text.trim())
      throw new WebError('WEB_EMPTY_CONTENT')
    return { ...base, content: text, contentType: mime || 'text/plain', handler: 'text' }
  }
  throw new WebError('WEB_UNSUPPORTED_CONTENT')
}
