import type { BrowserClearDataInput, BrowserClearDataResult, BrowserDataSummary } from './browserData'
import type { BrowserFailureReason } from './primitives'

export type BrowserScreenshotResult = 'saved' | 'copied' | 'canceled'

export const DESKTOP_BROWSER_ERROR_CODES = [
  'BROWSER_CERTIFICATE_ERROR',
  'BROWSER_NAVIGATION_BLOCKED',
  'BROWSER_PAGE_CRASHED',
  'BROWSER_PAGE_FAILED',
  'BROWSER_PAGE_UNRESPONSIVE',
  'BROWSER_PERMISSION_DENIED',
  'BROWSER_SESSION_EVICTED',
  'BROWSER_SESSION_LIMIT_REACHED',
  'BROWSER_SESSION_NOT_FOUND',
] as const

export const DESKTOP_BROWSER_SECURITY_KINDS = [
  'blank',
  'certificate-error',
  'insecure',
  'local',
  'secure',
] as const

export const DESKTOP_BROWSER_PROFILE_MODES = ['default', 'incognito'] as const

/** Blocked human-facing browser action, used to explain an interception in the interface. */
export const DESKTOP_BROWSER_BLOCKED_ACTIONS = [
  'download',
  'file-chooser',
  'permission',
  'popup',
] as const

export type DesktopBrowserBlockedAction = typeof DESKTOP_BROWSER_BLOCKED_ACTIONS[number]

export type DesktopBrowserErrorCode = typeof DESKTOP_BROWSER_ERROR_CODES[number]
export type DesktopBrowserProfileMode = typeof DESKTOP_BROWSER_PROFILE_MODES[number]
export type DesktopBrowserSecurityKind = typeof DESKTOP_BROWSER_SECURITY_KINDS[number]
export type DesktopBrowserStatus = 'error' | 'idle' | 'loading' | 'ready'

export interface DesktopBrowserError {
  noticeId?: string
  origin?: string
  detail?: 'fresh-click' | 'unavailable' | 'target-changed' | 'selection-failed' | 'invalid-target' | 'dialog-suppressed'
  /** Set when a specific human action was intercepted, so the interface can explain it. */
  action?: DesktopBrowserBlockedAction
  code: DesktopBrowserErrorCode
  message: string
  reason?: BrowserFailureReason
}

/** Latest download started from the managed page, reported for status display only. */
export interface DesktopBrowserDownload {
  id?: string
  fileName: string
  path: string | null
  state: 'canceled' | 'completed' | 'failed' | 'started'
}

export type DesktopBrowserSecurityState = {
  kind: 'blank'
  origin: null
} | {
  kind: Exclude<DesktopBrowserSecurityKind, 'blank'>
  origin: string
}

export interface DesktopBrowserViewport {
  width: number
  height: number
  scale: number
}

export interface DesktopBrowserState {
  favicon?: string | null
  viewport?: DesktopBrowserViewport | null
  /** Host-created popup identity; renderer uses the opener to retain the owning panel scope. */
  openedFrom?: { sessionId: string, tabId: string }
  download?: DesktopBrowserDownload | null
  zoomFactor: number
  canGoBack: boolean
  canGoForward: boolean
  controller: 'agent' | 'human'
  controlEpoch: number
  conversationId: string | null
  error: DesktopBrowserError | null
  pageId: string
  profileMode: DesktopBrowserProfileMode
  security: DesktopBrowserSecurityState
  sessionId: string
  status: DesktopBrowserStatus
  title: string
  url: string
  visible: boolean
}

export interface DesktopBrowserGuestDescriptor {
  partition: string
  sessionId: string
}

export interface DesktopBrowserAttachGuestInput {
  sessionId: string
  webContentsId: number
}

export interface DesktopBrowserEnsureSessionInput {
  conversationId: string | null
  tabId?: string
}

export interface DesktopBrowserNavigateInput {
  sessionId: string
  url: string
}

export interface DesktopBrowserOpenArtifactInput {
  artifactId: string
  sessionId: string
}

export interface DesktopBrowserSessionInput {
  sessionId: string
}

export interface DesktopBrowserSetProfileModeInput {
  profileMode: DesktopBrowserProfileMode
  sessionId: string
}

export interface DesktopBrowserSetSurfaceInput {
  sessionId: string
  visible: boolean
}

export interface DesktopBrowserApi {
  attachGuest: (sessionId: string, webContentsId: number) => Promise<void>
  captureScreenshot: (sessionId: string) => Promise<BrowserScreenshotResult>
  clearData: (input: BrowserClearDataInput) => Promise<BrowserClearDataResult>
  getDataSummary: () => Promise<BrowserDataSummary>
  setViewport: (sessionId: string, viewport: DesktopBrowserViewport | null) => Promise<DesktopBrowserState>
  setZoomFactor: (sessionId: string, zoomFactor: number | null) => Promise<DesktopBrowserState>
  close: (sessionId: string) => Promise<void>
  ensureSession: (conversationId: string | null, tabId?: string) => Promise<DesktopBrowserState>
  goBack: (sessionId: string) => Promise<void>
  goForward: (sessionId: string) => Promise<void>
  listGuests: () => Promise<DesktopBrowserGuestDescriptor[]>
  navigate: (sessionId: string, url: string) => Promise<DesktopBrowserState>
  onGuestsChanged: (listener: () => void) => () => void
  onStateChanged: (listener: (state: DesktopBrowserState) => void) => () => void
  openArtifact: (sessionId: string, artifactId: string) => Promise<DesktopBrowserState>
  openDevTools: (sessionId: string) => Promise<boolean>
  openExternal: (sessionId: string) => Promise<boolean>
  reload: (sessionId: string) => Promise<void>
  revealDownload: (sessionId: string) => Promise<boolean>
  setProfileMode: (
    sessionId: string,
    profileMode: DesktopBrowserProfileMode,
  ) => Promise<DesktopBrowserState>
  setSurface: (input: DesktopBrowserSetSurfaceInput) => Promise<void>
  showFileInFolder: (sessionId: string) => Promise<boolean>
  stop: (sessionId: string) => Promise<void>
  takeControl: (sessionId: string) => Promise<DesktopBrowserState>
}
