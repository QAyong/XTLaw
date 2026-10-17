import buddyPackage from '../../package.json'

const repositoryUrl = new URL(buddyPackage.repository.url.replace(/^git\+/, '').replace(/\.git$/, ''))

// XTLaw release tags are `xtlaw-v<version>`, keeping them apart from the source tags.
export const RELEASE_TAG_PREFIX = 'xtlaw-v'
export const releaseTagUrl = (version: string) => `${repositoryUrl.href}/releases/tag/${RELEASE_TAG_PREFIX}${version}`
export const releaseDownloadUrl = (version: string, name: string) => `${repositoryUrl.href}/releases/download/${RELEASE_TAG_PREFIX}${version}/${name}`
export const RELEASES_API_URL = `https://api.github.com/repos${repositoryUrl.pathname}/releases?per_page=100`
export const OFFICIAL_SITE_URL = 'https://xtlaw.qayong.site/'
export const SITE_FEED_URL = new URL('feed/notices.json', OFFICIAL_SITE_URL).href
export const FEEDBACK_ISSUE_URL = `${repositoryUrl.href}/issues/new`
export const DOCUMENTATION_URL = new URL('guide/quick-start', buddyPackage.homepage).href

export function isOfficialSiteUrl(value: string): boolean {
  try {
    return new URL(value).href === OFFICIAL_SITE_URL
  }
  catch {
    return false
  }
}

export function isOfficialSiteLink(value: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === new URL(OFFICIAL_SITE_URL).origin && !url.username && !url.password
  }
  catch {
    return false
  }
}

export function isLexoraReleaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === repositoryUrl.origin
      && !url.username
      && !url.password
      && url.pathname.startsWith(`${repositoryUrl.pathname}/releases/`)
  }
  catch {
    return false
  }
}
