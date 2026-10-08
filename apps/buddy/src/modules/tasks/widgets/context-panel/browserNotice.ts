import type { DesktopBrowserBlockedAction, DesktopBrowserDownload, DesktopBrowserError, DesktopBrowserErrorCode } from '@buddy-electron/shared/desktopApi'
import type { BuddyI18nKey, BuddyTranslate } from '@/i18n/buddyI18n'

/**
 * Copy for host-side browser interceptions and page failures. The host reports codes and the
 * blocked action, so the interface owns the wording and never renders raw diagnostics.
 */
const BLOCKED_ACTION_KEYS = {
  'download': 'desktop.context.browserBlockedDownload',
  'file-chooser': 'desktop.context.browserBlockedUpload',
  'permission': 'desktop.context.browserBlockedPermission',
  'popup': 'desktop.context.browserBlockedPopup',
} as const satisfies Record<DesktopBrowserBlockedAction, BuddyI18nKey>

const PAGE_ERROR_KEYS = {
  BROWSER_CERTIFICATE_ERROR: 'desktop.context.browserCertificateError',
  BROWSER_NAVIGATION_BLOCKED: 'desktop.context.browserPageFailed',
  BROWSER_PAGE_CRASHED: 'desktop.context.browserPageCrashed',
  BROWSER_PAGE_FAILED: 'desktop.context.browserPageFailed',
  BROWSER_PAGE_UNRESPONSIVE: 'desktop.context.browserPageUnresponsive',
} as const satisfies Partial<Record<DesktopBrowserErrorCode, BuddyI18nKey>>

const DOWNLOAD_STATE_KEYS = {
  canceled: 'desktop.context.browserDownloadCanceled',
  completed: 'desktop.context.browserDownloadCompleted',
  failed: 'desktop.context.browserDownloadFailed',
  started: 'desktop.context.browserDownloadStarted',
} as const satisfies Record<DesktopBrowserDownload['state'], BuddyI18nKey>

export function blockedActionNotice(action: DesktopBrowserBlockedAction, t: BuddyTranslate): string {
  return t(BLOCKED_ACTION_KEYS[action])
}

const DETAIL_KEYS = {
  'unavailable': 'desktop.context.browserActionUnavailable',
  'target-changed': 'desktop.context.browserUploadTargetChanged',
  'selection-failed': 'desktop.context.browserUploadFailed',
  'invalid-target': 'desktop.context.browserPopupInvalid',
  'dialog-suppressed': 'desktop.context.browserDialogSuppressed',
} as const satisfies Partial<Record<NonNullable<DesktopBrowserError['detail']>, BuddyI18nKey>>

export function browserErrorNotice(error: DesktopBrowserError, t: BuddyTranslate): string {
  const detail = error.detail && (DETAIL_KEYS as Partial<Record<NonNullable<DesktopBrowserError['detail']>, BuddyI18nKey>>)[error.detail]
  const text = detail ? t(detail) : error.action ? blockedActionNotice(error.action, t) : pageErrorNotice(error.code, t)
  return error.origin ? `${error.origin} — ${text}` : text
}

export function browserNoticeKey(sessionId: string, error: DesktopBrowserError | null | undefined, download: DesktopBrowserDownload | null | undefined): string | null {
  if (error)
    return `${sessionId}:error:${error.noticeId ?? `${error.action ?? ''}:${error.code}:${error.message}`}`
  if (download)
    return `${sessionId}:download:${download.id ?? download.fileName}:${download.state}`
  return null
}

export function pageErrorNotice(code: DesktopBrowserErrorCode, t: BuddyTranslate): string {
  const key = (PAGE_ERROR_KEYS as Partial<Record<DesktopBrowserErrorCode, BuddyI18nKey>>)[code]
  return t(key ?? 'desktop.context.browserPageFailed')
}

export function downloadNotice(download: DesktopBrowserDownload, t: BuddyTranslate): string {
  return t(DOWNLOAD_STATE_KEYS[download.state], { name: download.fileName })
}
