import type { WebCapabilityOptions } from '../WebCapabilityService'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DEFAULT_WEB_SETTINGS } from '../../../../shared/network/webProtocol'
import { BuddyDataPaths } from '../../storage/BuddyDataPaths'
import { WebCapabilityService } from '../WebCapabilityService'
import { extractHtml } from '../webContent'

const post = readFileSync(fileURLToPath(new URL('./fixtures/wechatImagePost.html', import.meta.url)), 'utf8')
const POST_URL = 'https://mp.weixin.qq.com/s?src=11&timestamp=1&ver=1&signature=fixture&new=1'
const ORIGINAL = 'https://mp.weixin.qq.com/s?__biz=FIXTURE==&mid=2247500970&idx=1&sn=fixturesn&chksm=fixture&scene=329'

describe('wechat image post', () => {
  it('returns the caption and names the original article in warnings', () => {
    const document = extractHtml(post, POST_URL)
    expect(document.title).toBe('车辆被人为损坏，能否要求保险公司赔付')
    expect(document.content).toBe('张某的车停在小区楼下，被人划伤。\n\n报警后没有找到人，保险公司以人为损坏为由拒赔。\n\n法院判决保险公司在保额内赔偿，之后可向致害人追偿。')
    expect(document.content).not.toContain('\\x0a')
    expect(document.acquisitionIncomplete).toBe(true)
    expect(document.warnings).toEqual([
      expect.stringContaining('images were not read'),
      `Original article: "车辆被人为损坏，能否要求保险公司承担赔付责任？" ${ORIGINAL} - read this URL with lexora_web_fetch for the full text.`,
    ])
  })

  it('does not take the promotion card for the original article', () => {
    expect(extractHtml(post, POST_URL).warnings.join('\n')).not.toContain('adcard')
  })

  it('reports an empty read when there is neither a caption nor an original article', () => {
    const bare = post.replace(/<meta name="description"[^>]*>/, '').replace(/convert_appmsg_link: \{[\s\S]*?\},[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*\};/, '};')
    expect(() => extractHtml(bare, POST_URL)).toThrow('WEB_EMPTY_CONTENT')
  })

  it('keeps a caption when there is no original article', () => {
    const captionOnly = post.replace(/convert_appmsg_link: \{[\s\S]*?\},[\t\v\f\r \xA0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]*\n\s*\};/, '};')
    const document = extractHtml(captionOnly, POST_URL)
    expect(document.content).toContain('张某的车停在小区楼下')
    expect(document.warnings).toHaveLength(1)
  })

  it('only treats mp.weixin.qq.com pages as image posts and refuses other hosts as original articles', () => {
    expect(() => extractHtml(post, 'https://example.com/post')).toThrow('WEB_RENDER_REQUIRED')
    const foreign = post.replace(/mp\.weixin\.qq\.com\/s\?__biz=FIXTURE==/, 'evil.example.com/s?__biz=FIXTURE==')
    const document = extractHtml(foreign, POST_URL)
    expect(document.warnings.join('\n')).not.toContain('evil.example.com')
    expect(document.warnings).toHaveLength(1)
  })

  it('exposes the original article through the fetch result the model receives', async () => {
    const root = await mkdtemp(join(tmpdir(), 'buddy-wechat-post-'))
    try {
      const options: WebCapabilityOptions = {
        paths: new BuddyDataPaths(root),
        models: { getAuth: async () => undefined },
        settings: { get: () => structuredClone(DEFAULT_WEB_SETTINGS), getTavilyKey: async () => null },
        host: {
          authorize: async () => {},
          get: async url => ({ bytes: new TextEncoder().encode(post), url, status: 200, headers: new Headers({ 'content-type': 'text/html; charset=utf-8' }) }),
          providerFetch: async () => { throw new Error('Unexpected paid request') },
          render: async () => ({ ok: false, code: 'WEB_RENDER_REQUIRED' }),
        },
      }
      const result = await new WebCapabilityService(options).fetch({ url: POST_URL, conversationId: 'conversation' })
      expect(result).toMatchObject({ ok: true, provider: 'local', mode: 'http', acquisitionIncomplete: true })
      expect(result.ok && result.warnings.some(warning => warning.includes(ORIGINAL))).toBe(true)
    }
    finally { await rm(root, { recursive: true, force: true }) }
  })
})
