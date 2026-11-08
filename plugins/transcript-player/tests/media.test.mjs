import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { isAudioFile } from '../src/media.ts'

const audioExtensions = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac']
const videoExtensions = ['mp4', 'm4v', 'webm', 'mov', 'ogv']

test('all registered audio formats use the static audio presentation', () => {
  for (const extension of audioExtensions) {
    assert.equal(isAudioFile(`会议录音.${extension}`), true, extension)
    assert.equal(isAudioFile(`Recording.${extension.toUpperCase()}`), true, extension)
  }
})

test('video formats retain the existing video presentation', () => {
  for (const extension of videoExtensions) assert.equal(isAudioFile(`video.${extension}`), false, extension)
})

test('classification uses the last complete extension, never a name fragment', () => {
  for (const name of ['', 'mp3', 'recording', 'recording.', 'recording.mp3.txt', 'mp3.video.mp4']) {
    assert.equal(isAudioFile(name), false, name)
  }
  assert.equal(isAudioFile('会议.第 1 次.MP3'), true)
})

test('manifest keeps all audio/video handlers without changing default ownership or permissions', () => {
  const manifest = JSON.parse(readFileSync(new URL('../extension.json', import.meta.url), 'utf8'))
  const handler = manifest.contributes.fileHandlers[0]
  assert.deepEqual([...handler.extensions].sort(), [...audioExtensions, ...videoExtensions].map(extension => `.${extension}`).sort())
  assert.equal(handler.preview.requestDefault, false)
  assert.equal(handler.open.requestDefault, false)
  assert.deepEqual(manifest.permissions, { selectedResource: 'read', localResources: true })
})
