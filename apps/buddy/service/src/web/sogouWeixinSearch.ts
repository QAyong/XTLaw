import type { PublicWebGet } from '../../../shared/network/webTransport'
import type { WebSearchResponse, WebSearchSource } from './webSearchBackends'
import { parseHTML } from 'linkedom'
import { WebError, webError } from '../../../shared/network/webProtocol'
import { requireWebSuccess } from '../../../shared/network/webTransport'
import { decodeWebText } from './webContent'
import { searchSourceUrl } from './webSearchBackends'

const SEARCH_ENDPOINT = 'https://weixin.sogou.com/weixin'
const ARTICLE_ORIGIN = 'https://mp.weixin.qq.com/'
const MAX_RESULTS = 5
const CHINA_OFFSET_SECONDS = 8 * 60 * 60

export interface SogouWeixinCandidate {
  title: string
  link: string
  snippet: string
}

function isChallenge(finalUrl: string, html: string): boolean {
  return finalUrl.includes('antispider') || html.includes('seccoderight') || html.includes('anti.min.css')
}

function publishedDate(script: string | null | undefined): string | null {
  const seconds = Number(/timeConvert\(\s*['"](\d{9,11})['"]\s*\)/.exec(script ?? '')?.[1])
  return Number.isFinite(seconds) ? new Date((seconds + CHINA_OFFSET_SECONDS) * 1000).toISOString().slice(0, 10) : null
}

const collapse = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim()

export function parseSogouWeixinResults(html: string, responseUrl: string = SEARCH_ENDPOINT): SogouWeixinCandidate[] {
  if (isChallenge(responseUrl, html))
    throw new WebError('WEB_CHALLENGE')
  const { document } = parseHTML(html)
  const candidates: SogouWeixinCandidate[] = []
  for (const item of document.querySelectorAll('ul.news-list > li')) {
    const anchor = item.querySelector('.txt-box h3 a')
    const href = anchor?.getAttribute('href')
    if (!anchor || !href)
      continue
    let link: URL
    try {
      link = new URL(href, SEARCH_ENDPOINT)
    }
    catch { continue }
    if (link.protocol !== 'https:' || link.hostname !== 'weixin.sogou.com' || link.pathname !== '/link')
      continue
    const title = collapse(anchor.textContent).slice(0, 300)
    if (!title)
      continue
    const summary = collapse(item.querySelector('.txt-info')?.textContent)
    const account = collapse(item.querySelector('.s-p .all-time-y2')?.textContent)
    const date = publishedDate(item.querySelector('.s-p .s2 script')?.textContent)
    const snippet = [account, date, summary].filter(Boolean).join(' · ').slice(0, 1500)
    candidates.push({ title, link: link.href, snippet })
    if (candidates.length === MAX_RESULTS)
      break
  }
  if (!candidates.length && !document.querySelector('#noresult_part1_container, .b404-box'))
    throw new WebError('WEB_INVALID_RESPONSE')
  return candidates
}

export function parseSogouWeixinLink(html: string, responseUrl: string): string | null {
  if (isChallenge(responseUrl, html))
    throw new WebError('WEB_CHALLENGE')
  const target = [...html.matchAll(/\burl\s*\+=\s*(['"])([^'"]*)\1/g)].map(match => match[2]).join('').replace(/@/g, '')
  return target.startsWith(ARTICLE_ORIGIN) ? searchSourceUrl(target) : null
}

export async function sogouWeixinSearch(get: PublicWebGet, query: string, signal: AbortSignal): Promise<WebSearchResponse> {
  const endpoint = new URL(SEARCH_ENDPOINT)
  endpoint.searchParams.set('type', '2')
  endpoint.searchParams.set('ie', 'utf8')
  endpoint.searchParams.set('query', query)
  const page = await get(endpoint.href, signal, 4 * 1024 * 1024)
  if (isChallenge(page.url, ''))
    throw new WebError('WEB_CHALLENGE')
  requireWebSuccess(page.status)
  const candidates = parseSogouWeixinResults(decodeWebText(page.bytes, page.headers.get('content-type') ?? ''), page.url)
  const sources: WebSearchSource[] = []
  // Sequential on purpose: Sogou throttles bursts, and a challenge must stop the remaining requests.
  for (const candidate of candidates) {
    signal.throwIfAborted()
    try {
      const resource = await get(candidate.link, signal, 512 * 1024)
      if (isChallenge(resource.url, ''))
        throw new WebError('WEB_CHALLENGE')
      requireWebSuccess(resource.status)
      const url = parseSogouWeixinLink(decodeWebText(resource.bytes, resource.headers.get('content-type') ?? ''), resource.url)
      if (url && !sources.some(source => source.url === url))
        sources.push({ title: candidate.title, url, ...(candidate.snippet ? { snippet: candidate.snippet } : {}) })
    }
    catch (error) {
      signal.throwIfAborted()
      if (webError(error, signal).code === 'WEB_CHALLENGE')
        break
    }
  }
  if (candidates.length && !sources.length)
    throw new WebError('WEB_CHALLENGE')
  return { sources }
}
