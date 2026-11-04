import type { DesktopUpdateCheckResult } from '../shared/desktopApi'
import { readResponseBytes } from '../../platform/network/publicWebTransport'
import { compareDesktopVersions, desktopUpdateResultSchema, desktopVersionSchema } from '../shared/desktopUpdates'
import { isLexoraReleaseUrl, RELEASE_TAG_PREFIX, RELEASES_API_URL } from '../shared/productLinks'

export interface CheckForDesktopUpdateOptions {
  currentVersion: string
  signal?: AbortSignal
  fetchRelease?: (url: string, init?: RequestInit) => Promise<Response>
  onRelease?: (release: GithubRelease, version: string) => void
}

export interface GithubRelease {
  draft: boolean
  html_url: string
  prerelease: boolean
  tag_name: string
  body?: string
  assets?: unknown
}

export class DesktopUpdateCheckError extends Error {
  readonly code = 'UPDATE_CHECK_FAILED'

  constructor(options?: ErrorOptions) {
    super('XTLaw update check failed', options)
    this.name = 'DesktopUpdateCheckError'
  }
}

export async function checkForDesktopUpdate(
  options: CheckForDesktopUpdateOptions,
): Promise<DesktopUpdateCheckResult> {
  try {
    const timeout = AbortSignal.timeout(15_000)
    const response = await fetchReleases(options.fetchRelease ?? fetch, options.signal ? AbortSignal.any([options.signal, timeout]) : timeout)
    if (!response.ok)
      throw new Error(`GitHub release request failed with ${response.status}`)

    const body = await readResponseBytes(response, 4 * 1024 * 1024)
    const release = parseLatestBuddyRelease(JSON.parse(new TextDecoder().decode(body)))
    const current = desktopVersionSchema.parse(options.currentVersion)
    options.onRelease?.(release.metadata, release.version)
    return desktopUpdateResultSchema.parse({
      currentVersion: current,
      latestVersion: release.version,
      releaseUrl: release.metadata.html_url,
      releaseNotes: typeof release.metadata.body === 'string' ? release.metadata.body.trim() : '',
      status: compareDesktopVersions(release.version, current) > 0
        ? 'update_available'
        : 'up_to_date',
    })
  }
  catch (error) {
    throw new DesktopUpdateCheckError({ cause: error })
  }
}

const MAX_RELEASE_REDIRECTS = 2

// Chromium keeps a 301 without an expiry in its disk cache forever, and the host request layer does not follow
// redirects, so one stale 301 would fail every later check. Always revalidate and follow permanent redirects on the API origin.
async function fetchReleases(fetchRelease: NonNullable<CheckForDesktopUpdateOptions['fetchRelease']>, signal: AbortSignal): Promise<Response> {
  const origin = new URL(RELEASES_API_URL).origin
  let url = RELEASES_API_URL
  for (let redirects = 0; redirects <= MAX_RELEASE_REDIRECTS; redirects++) {
    const response = await fetchRelease(url, {
      signal,
      headers: {
        'accept': 'application/vnd.github+json',
        'cache-control': 'no-cache',
        'user-agent': 'XTLaw',
      },
    })
    const location = response.headers.get('location')
    if (!location || (response.status !== 301 && response.status !== 308))
      return response
    url = new URL(location, url).href
    if (new URL(url).origin !== origin)
      throw new Error('GitHub release request was redirected off the API origin')
  }
  throw new Error('GitHub release request was redirected too many times')
}

function parseLatestBuddyRelease(value: unknown): {
  metadata: GithubRelease
  version: string
} {
  if (!Array.isArray(value))
    throw new Error('GitHub release response is invalid')

  const releases = value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
      return []
    const release = candidate as Partial<GithubRelease>
    if (
      release.draft !== false
      || release.prerelease !== false
      || typeof release.tag_name !== 'string'
      || !release.tag_name.startsWith(RELEASE_TAG_PREFIX)
      || typeof release.html_url !== 'string'
      || !isLexoraReleaseUrl(release.html_url)
    ) {
      return []
    }

    try {
      return [{
        metadata: release as GithubRelease,
        version: desktopVersionSchema.parse(release.tag_name.slice(RELEASE_TAG_PREFIX.length)),
      }]
    }
    catch {
      return []
    }
  })
  if (releases.length === 0)
    throw new Error('GitHub release response is invalid')

  return releases.reduce((latest, release) => (
    compareDesktopVersions(release.version, latest.version) > 0 ? release : latest
  ))
}
