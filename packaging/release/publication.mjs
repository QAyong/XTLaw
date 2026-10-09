import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { readBuddyProductMetadata } from '../buddy/release/release-metadata.mjs'
import { writeError, writeOutput } from '../shared/cli-output.mjs'
import { readLexoraVersionState, validateLexoraReleaseTag, validateLexoraVersionState } from './version.mjs'

const repoRoot = resolve(import.meta.dirname, '../..')
const productRepository = 'QAyong/XTLaw'
const commitPattern = /^[a-f\d]{40}$/

// Explicit publication validates a complete snapshot, not a historical version
// transition. This permits the first independent 0.1.0 without allowing future
// version preparation to downgrade or rewriting any old release identity.
export function validateXTLawPublication({ state, metadata, repository, version, commit, head }) {
  const errors = validateLexoraVersionState(state)
  if (errors.length)
    throw new Error(errors.join('\n'))
  if (repository !== productRepository || metadata.releaseRepo !== repository)
    throw new Error(`XTLaw releases must target ${productRepository}`)
  if (!commitPattern.test(commit) || commit !== head)
    throw new Error('Publication checkout does not match the requested commit')
  const { tag } = validateLexoraReleaseTag(`xtlaw-v${version}`, state.productVersion)
  if (metadata.version !== version || metadata.releaseTag !== tag)
    throw new Error('Publication metadata does not match the requested version')
  return { commit, tag, version }
}

function main() {
  const { values } = parseArgs({ options: { 'github-output': { type: 'string' } } })
  if (!values['github-output'])
    throw new Error('Usage: publication.mjs --github-output <path>')
  if (process.env.GITHUB_REF !== 'refs/heads/master' || process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch')
    throw new Error('XTLaw publication requires an explicit workflow dispatch from master')
  const result = validateXTLawPublication({
    state: readLexoraVersionState(repoRoot),
    metadata: readBuddyProductMetadata(repoRoot),
    repository: process.env.GITHUB_REPOSITORY,
    version: process.env.RELEASE_VERSION,
    commit: process.env.RELEASE_COMMIT,
    head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  })
  appendFileSync(values['github-output'], Object.entries(result).map(([key, value]) => `${key}=${value}\n`).join(''))
  writeOutput(`XTLaw publication source validated: ${result.tag} at ${result.commit}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  }
  catch (error) {
    writeError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
