import type { WebResource } from '../../../../shared/network/webTransport'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WebError } from '../../../../shared/network/webProtocol'
import { parseSogouWeixinLink, parseSogouWeixinResults, sogouWeixinSearch } from '../sogouWeixinSearch'
import { extractHtml } from '../webContent'

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')
const searchPage = fixture('sogouWeixinSearch.html')
const linkPage = fixture('sogouWeixinLink.html')
const challengePage = fixture('sogouWeixinChallenge.html')
const emptyPage = fixture('sogouWeixinEmpty.html')
const ARTICLE = 'https://mp.weixin.qq.com/s?src=11&timestamp=1791988564&ver=7026&signature=fixture-signature*&new=1'

function resource(url: string, body: string, status = 200): WebResource {
  return { bytes: new TextEncoder().encode(body), url, status, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }) }
}

function transport(handler: (url: string) => WebResource | Promise<WebResource>) {
  const requests: string[] = []
  const get = async (url: string) => {
    requests.push(url)
    return handler(url)
  }
  return { get, requests }
}

describe('sogou weixin result page', () => {
  it('keeps the first five results with account, date and summary, without the date script', () => {
    const results = parseSogouWeixinResults(searchPage)
    expect(results).toHaveLength(5)
    expect(results[0]).toEqual({
      title: '未告知尸检的医疗纠纷：医院要承担什么责任',
      link: 'https://weixin.sogou.com/link?url=fixture-token-0&type=2&query=%E5%B0%B8%E6%A3%80&token=FIXTURE0',
      snippet: '法律评述 · 2023-01-29 · 患者死亡后，医疗机构未告知家属可以尸检，应当如何认定责任。',
    })
    expect(results.map(result => result.snippet).join('')).not.toMatch(/timeConvert|document\.write|red_beg/)
    expect(results.some(result => result.title.includes('第六条'))).toBe(false)
  })

  it('treats the no-result page as empty and an unknown layout as invalid', () => {
    expect(parseSogouWeixinResults(emptyPage)).toEqual([])
    expect(() => parseSogouWeixinResults('<html><body><p>changed layout</p></body></html>')).toThrow('WEB_INVALID_RESPONSE')
  })

  it('reports challenge pages by URL or by body markers', () => {
    expect(() => parseSogouWeixinResults(challengePage)).toThrow('WEB_CHALLENGE')
    expect(() => parseSogouWeixinResults(searchPage, 'https://weixin.sogou.com/antispider/?from=%2fweixin')).toThrow('WEB_CHALLENGE')
    expect(() => parseSogouWeixinResults('<html><body><span id="seccoderight"></span></body></html>')).toThrow('WEB_CHALLENGE')
  })
})

describe('sogou weixin redirect page', () => {
  it('joins the split address and drops the noise character', () => {
    expect(parseSogouWeixinLink(linkPage, 'https://weixin.sogou.com/link?url=x')).toBe(ARTICLE)
  })

  it('drops a missing address or one outside mp.weixin.qq.com', () => {
    expect(parseSogouWeixinLink('<script>var other = 1</script>', 'https://weixin.sogou.com/link')).toBeNull()
    expect(parseSogouWeixinLink('<script>var url = \'\'; url += \'https://example.com/s?x=1\'</script>', 'https://weixin.sogou.com/link')).toBeNull()
    expect(parseSogouWeixinLink('<script>var url = \'\'; url += \'http://mp.weixin.qq.com/s?x=1\'</script>', 'https://weixin.sogou.com/link')).toBeNull()
  })

  it('reports challenge responses', () => {
    expect(() => parseSogouWeixinLink(challengePage, 'https://weixin.sogou.com/link?url=x')).toThrow('WEB_CHALLENGE')
    expect(() => parseSogouWeixinLink(linkPage, 'https://weixin.sogou.com/antispider/?from=%2flink')).toThrow('WEB_CHALLENGE')
  })
})

describe('sogou weixin search', () => {
  it('returns real article addresses, never the Sogou redirect links', async () => {
    const { get, requests } = transport(url => resource(url, url.includes('/weixin?') ? searchPage : linkPage))
    const response = await sogouWeixinSearch(get, '尸检', AbortSignal.timeout(5000))
    expect(requests).toHaveLength(6)
    expect(requests[0]).toBe('https://weixin.sogou.com/weixin?type=2&ie=utf8&query=%E5%B0%B8%E6%A3%80')
    // Every redirect page resolves to the same address here, so duplicates collapse to one source.
    expect(response.sources).toEqual([{
      title: '未告知尸检的医疗纠纷：医院要承担什么责任',
      url: ARTICLE,
      snippet: '法律评述 · 2023-01-29 · 患者死亡后，医疗机构未告知家属可以尸检，应当如何认定责任。',
    }])
    expect(response.sources.every(source => !source.url.includes('sogou.com'))).toBe(true)
  })

  it('resolves links one at a time and keeps distinct articles', async () => {
    let active = 0
    let overlapped = false
    const { get } = transport(async (url) => {
      if (url.includes('/weixin?'))
        return resource(url, searchPage)
      active++
      overlapped ||= active > 1
      await Promise.resolve()
      active--
      const token = /fixture-token-(\d)/.exec(url)![1]
      return resource(url, linkPage.replace('xture-sig@nature', `xture-${token}-signature`))
    })
    const response = await sogouWeixinSearch(get, '尸检', AbortSignal.timeout(5000))
    expect(overlapped).toBe(false)
    expect(response.sources).toHaveLength(5)
    expect(new Set(response.sources.map(source => source.url)).size).toBe(5)
  })

  it('drops entries that cannot be resolved and keeps the rest', async () => {
    const { get } = transport(url => url.includes('/weixin?')
      ? resource(url, searchPage)
      : url.includes('fixture-token-0') ? resource(url, '<script>nothing here</script>') : resource(url, linkPage))
    const response = await sogouWeixinSearch(get, '尸检', AbortSignal.timeout(5000))
    expect(response.sources).toHaveLength(1)
    expect(response.sources[0]!.title).toBe('医患纠纷中的尸检权利与举证责任')
  })

  it('returns an empty result for a normal page with no articles', async () => {
    const { get, requests } = transport(url => resource(url, emptyPage))
    expect(await sogouWeixinSearch(get, 'zzzz', AbortSignal.timeout(5000))).toEqual({ sources: [] })
    expect(requests).toHaveLength(1)
  })

  it('stops with WEB_CHALLENGE on a redirect to the anti-spider page, without retrying', async () => {
    const { get, requests } = transport(() => resource('https://weixin.sogou.com/antispider/?from=%2fweixin', challengePage, 200))
    await expect(sogouWeixinSearch(get, '尸检', AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'WEB_CHALLENGE' })
    expect(requests).toHaveLength(1)
  })

  it('stops resolving after a challenge page with status 200', async () => {
    const { get, requests } = transport(url => url.includes('/weixin?') ? resource(url, searchPage) : resource(url, challengePage))
    await expect(sogouWeixinSearch(get, '尸检', AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'WEB_CHALLENGE' })
    expect(requests).toHaveLength(2)
  })

  it('keeps articles resolved before a later challenge', async () => {
    let links = 0
    const { get, requests } = transport((url) => {
      if (url.includes('/weixin?'))
        return resource(url, searchPage)
      return ++links === 1 ? resource(url, linkPage) : resource('https://weixin.sogou.com/antispider/?from=%2flink', challengePage)
    })
    const response = await sogouWeixinSearch(get, '尸检', AbortSignal.timeout(5000))
    expect(response.sources).toHaveLength(1)
    expect(requests).toHaveLength(3)
  })

  it('reports WEB_CHALLENGE when every link fails to resolve', async () => {
    const { get } = transport(url => url.includes('/weixin?') ? resource(url, searchPage) : resource(url, '<script>nothing here</script>'))
    await expect(sogouWeixinSearch(get, '尸检', AbortSignal.timeout(5000))).rejects.toMatchObject({ code: 'WEB_CHALLENGE' })
  })

  it('does not swallow cancellation while resolving links', async () => {
    const controller = new AbortController()
    const { get } = transport((url) => {
      if (url.includes('/weixin?'))
        return resource(url, searchPage)
      controller.abort(new WebError('WEB_CANCELLED'))
      throw new WebError('WEB_NETWORK_ERROR')
    })
    await expect(sogouWeixinSearch(get, '尸检', controller.signal)).rejects.toMatchObject({ code: 'WEB_CANCELLED' })
  })
})

describe('wechat article extraction', () => {
  const article = fixture('wechatArticle.html')

  it('extracts the body that WeChat ships hidden', () => {
    const document = extractHtml(article, 'https://mp.weixin.qq.com/s?src=11&signature=fixture')
    expect(document.title).toBe('医患纠纷中的尸检权利')
    expect(document.content).toContain('医疗机构在患者死亡后应当告知家属尸检的权利')
    expect(document.content).not.toContain('cgiData')
  })

  it('leaves hidden content on other sites alone', () => {
    expect(() => extractHtml(article, 'https://example.com/article')).toThrow('WEB_RENDER_REQUIRED')
  })
})
