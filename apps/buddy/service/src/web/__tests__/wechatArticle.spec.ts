import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractHtml } from '../webContent'

const fixture = (name: string) => readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8')

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
