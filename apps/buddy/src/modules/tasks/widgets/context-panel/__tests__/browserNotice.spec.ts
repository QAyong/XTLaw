import type { BuddyTranslate } from '@/i18n/buddyI18n'
import { describe, expect, it } from 'vitest'
import { blockedActionNotice, downloadNotice, pageErrorNotice } from '../browserNotice'

const t = ((key: string, params?: Record<string, string | number>) => (
  params ? `${key}:${JSON.stringify(params)}` : key
)) as unknown as BuddyTranslate

describe('browser notices', () => {
  it.each([
    ['popup', 'desktop.context.browserBlockedPopup'],
    ['file-chooser', 'desktop.context.browserBlockedUpload'],
    ['download', 'desktop.context.browserBlockedDownload'],
    ['permission', 'desktop.context.browserBlockedPermission'],
  ] as const)('explains a blocked %s without leaking diagnostics', (action, key) => {
    expect(blockedActionNotice(action, t)).toBe(key)
  })

  it.each([
    ['BROWSER_CERTIFICATE_ERROR', 'desktop.context.browserCertificateError'],
    ['BROWSER_PAGE_CRASHED', 'desktop.context.browserPageCrashed'],
    ['BROWSER_PAGE_FAILED', 'desktop.context.browserPageFailed'],
    ['BROWSER_PAGE_UNRESPONSIVE', 'desktop.context.browserPageUnresponsive'],
  ] as const)('names the page failure %s', (code, key) => {
    expect(pageErrorNotice(code, t)).toBe(key)
  })

  it('falls back to the generic load failure for unclassified codes', () => {
    expect(pageErrorNotice('BROWSER_SESSION_NOT_FOUND', t)).toBe('desktop.context.browserPageFailed')
  })

  it.each([
    ['started', 'desktop.context.browserDownloadStarted'],
    ['completed', 'desktop.context.browserDownloadCompleted'],
    ['canceled', 'desktop.context.browserDownloadCanceled'],
    ['failed', 'desktop.context.browserDownloadFailed'],
  ] as const)('reports a %s download with its file name', (state, key) => {
    expect(downloadNotice({ fileName: 'report.csv', path: null, state }, t))
      .toBe(`${key}:{"name":"report.csv"}`)
  })
})
