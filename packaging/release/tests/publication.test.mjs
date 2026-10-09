import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- Release validation runs before workspace dependencies are installed.
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readBuddyProductMetadata } from '../../buddy/release/release-metadata.mjs'
import { validateXTLawPublication } from '../publication.mjs'
import { createLexoraVersionSources, readLexoraVersionState, validateLexoraReleaseTag } from '../version.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const commit = 'a'.repeat(40)
function fixture(version = '0.1.0') {
  return {
    state: {
      productVersion: version,
      applicationVersions: { buddy: version },
      buddyMetadataVersion: version,
      cargoVersion: version,
      cargoLockVersion: version,
      sourceDateEpoch: 1790673721,
      packagePrivacy: { 'package.json': true, 'apps/buddy/package.json': true, 'apps/website/package.json': true },
      versionlessPackageVersions: { 'apps/website/package.json': undefined },
    },
    metadata: { version, releaseTag: `xtlaw-v${version}`, releaseRepo: 'QAyong/XTLaw' },
    repository: 'QAyong/XTLaw',
    version,
    commit,
    head: commit,
  }
}

test('permits the independent 0.1.0 snapshot without a historical upgrade transition', () => {
  assert.deepEqual(validateXTLawPublication(fixture()), { commit, tag: 'xtlaw-v0.1.0', version: '0.1.0' })
})

test('permits a subsequent synchronized XTLaw release snapshot', () => {
  assert.equal(validateXTLawPublication(fixture('0.1.1')).tag, 'xtlaw-v0.1.1')
})

test('uses the independent namespace for artifacts and rejects inherited version tags', () => {
  const metadata = readBuddyProductMetadata(root)
  assert.equal(metadata.releaseTag, `xtlaw-v${metadata.version}`)
  assert.equal(validateLexoraReleaseTag(metadata.releaseTag, metadata.version).version, metadata.version)
  assert.throws(() => validateLexoraReleaseTag(`v${metadata.version}`, metadata.version), /xtlaw-vX.Y.Z/)
})

test('rejects publishing to the upstream or another fork', () => {
  for (const repository of ['useLexora/Lexora', 'example/XTLaw', undefined])
    assert.throws(() => validateXTLawPublication({ ...fixture(), repository }), /must target QAyong\/XTLaw/)
})

test('rejects product metadata that targets the upstream', () => {
  const value = fixture()
  value.metadata.releaseRepo = 'useLexora/Lexora'
  assert.throws(() => validateXTLawPublication(value), /must target/)
})

test('rejects a version that differs from the checked out product', () => {
  for (const version of ['0.1.1', '0.1', 'v0.1.0', '0.1.0\ninjected=true', undefined])
    assert.throws(() => validateXTLawPublication({ ...fixture(), version }), /release tag/)
})

test('rejects mismatched or invalid publication commits', () => {
  for (const value of [{ head: 'b'.repeat(40) }, { commit: 'HEAD' }, { commit: undefined }])
    assert.throws(() => validateXTLawPublication({ ...fixture(), ...value }), /requested commit/)
})

test('rejects unsynchronized product components and invalid build timestamps', () => {
  for (const change of [{ cargoVersion: '0.9.4' }, { sourceDateEpoch: 0 }, { applicationVersions: { buddy: '0.9.4' } }]) {
    const value = fixture()
    Object.assign(value.state, change)
    assert.throws(() => validateXTLawPublication(value))
  }
})

test('rejects inconsistent artifact version and tag metadata', () => {
  for (const change of [{ version: '0.9.4' }, { releaseTag: 'v0.9.4' }]) {
    const value = fixture()
    Object.assign(value.metadata, change)
    assert.throws(() => validateXTLawPublication(value), /metadata does not match/)
  }
})

test('version preparation still rejects a downgrade and advances the next build timestamp', () => {
  const sources = {
    'package.json': '{"version":"0.1.0","private":true}',
    'apps/buddy/package.json': '{"version":"0.1.0","private":true}',
    'apps/website/package.json': '{"private":true}',
    'apps/buddy/buddy.version.json': '{"version":"0.1.0","sourceDateEpoch":1790673721}',
    'apps/buddy/native/pet/Cargo.toml': '[package]\nname = "lexora-buddy-pet"\nversion = "0.1.0"\n',
    'apps/buddy/native/Cargo.lock': '[[package]]\nname = "lexora-buddy-pet"\nversion = "0.1.0"\n',
  }
  assert.throws(() => createLexoraVersionSources(sources, '0.0.9'), /lower than current/)
  const next = createLexoraVersionSources(sources, '0.1.1', { now: () => 0 })
  assert.equal(next.version, '0.1.1')
  assert.equal(next.sourceDateEpoch, 1790673722)
  assert.equal(next.changedPaths.length, 5)
})

test('CLI writes the exact snapshot identity and refuses implicit or non-master publication', () => {
  const directory = mkdtempSync(join(tmpdir(), 'xtlaw-publication-test-'))
  try {
    const output = join(directory, 'output')
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    const { productVersion: version } = readLexoraVersionState(root)
    const env = {
      ...process.env,
      GITHUB_REF: 'refs/heads/master',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_REPOSITORY: 'QAyong/XTLaw',
      RELEASE_COMMIT: head,
      RELEASE_VERSION: version,
    }
    const run = (path, overrides = {}) => spawnSync(process.execPath, ['packaging/release/publication.mjs', '--github-output', path], { cwd: root, env: { ...env, ...overrides }, encoding: 'utf8' })
    const valid = run(output)
    assert.equal(valid.status, 0, valid.stderr)
    assert.equal(readFileSync(output, 'utf8'), `commit=${head}\ntag=xtlaw-v${version}\nversion=${version}\n`)
    for (const overrides of [{ GITHUB_EVENT_NAME: 'push' }, { GITHUB_REF: 'refs/heads/other' }]) {
      const refused = join(directory, 'refused')
      assert.notEqual(run(refused, overrides).status, 0)
      assert.equal(existsSync(refused), false)
    }
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
