import { Buffer } from 'node:buffer'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { serveMediaFile } from '../serveMediaFile'

const cleanup: Array<() => Promise<void>> = []
afterEach(async () => {
  for (const dispose of cleanup.splice(0)) await dispose()
})
async function directory() {
  const root = await mkdtemp(join(tmpdir(), 'buddy-media-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  return root
}

describe('media protocol', () => {
  it('streams the whole file with range support advertised', async () => {
    const path = join(await directory(), 'clip.mp4')
    await writeFile(path, Buffer.from('0123456789'))
    const response = await serveMediaFile(path, null)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-length')).toBe('10')
    expect(await response.text()).toBe('0123456789')
  })

  it('answers byte ranges with 206 and only the requested bytes', async () => {
    const path = join(await directory(), 'song.mp3')
    await writeFile(path, Buffer.from('0123456789'))
    const middle = await serveMediaFile(path, 'bytes=2-5')
    expect(middle.status).toBe(206)
    expect(middle.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await middle.text()).toBe('2345')
    const tail = await serveMediaFile(path, 'bytes=-3')
    expect(tail.headers.get('content-range')).toBe('bytes 7-9/10')
    expect(await tail.text()).toBe('789')
  })

  it('rejects unsatisfiable ranges, unknown types and empty files cleanly', async () => {
    const root = await directory()
    await writeFile(join(root, 'clip.webm'), Buffer.from('abc'))
    await writeFile(join(root, 'empty.ogg'), '')
    await writeFile(join(root, 'notes.txt'), 'abc')
    const unsatisfiable = await serveMediaFile(join(root, 'clip.webm'), 'bytes=10-')
    expect(unsatisfiable.status).toBe(416)
    expect(unsatisfiable.headers.get('content-range')).toBe('bytes */3')
    expect((await serveMediaFile(join(root, 'notes.txt'), null)).status).toBe(415)
    const empty = await serveMediaFile(join(root, 'empty.ogg'), null)
    expect(empty.status).toBe(200)
    expect(empty.headers.get('content-length')).toBe('0')
  })

  it('does not follow a link at the leaf', async () => {
    const root = await directory()
    await writeFile(join(root, 'secret.mp4'), 'secret')
    try {
      await symlink(join(root, 'secret.mp4'), join(root, 'link.mp4'))
    }
    catch { return }
    expect((await serveMediaFile(join(root, 'link.mp4'), null)).status).toBe(404)
  })
})
