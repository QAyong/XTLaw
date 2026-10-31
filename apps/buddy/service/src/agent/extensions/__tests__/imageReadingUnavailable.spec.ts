import type { ExtensionToolContext } from '@earendil-works/pi-coding-agent'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ImageReadingError, ImageReadingService } from '../../../images/ImageReadingService'
import { createBuddyReadTool } from '../readFileExtension'

let directory: string
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=', 'base64')
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'image-unavailable-'))
  await writeFile(join(directory, 'input.png'), image)
})
afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})
function context(input: Array<'text' | 'image'>) {
  return { cwd: directory, model: { id: 'chat', provider: 'model', input, maxTokens: 1000 } } as unknown as ExtensionToolContext
}
function readerWithDefaultPolicy() {
  const service = new ImageReadingService({ rpc: {} as never, providers: {} as never, usage: { record: async () => {} } as never, preferences: async () => ({}) as never })
  return createBuddyReadTool(directory, undefined, input => service.read(input))
}

describe('image reading without an image-capable model', () => {
  it('explains how to configure image reading instead of failing under the default policy', async () => {
    const result = await readerWithDefaultPolicy().execute('image', { path: 'input.png' }, undefined, undefined, context(['text']))
    const text = result.content.find(block => block.type === 'text')!.text
    expect(text).toContain('The image was not read')
    expect(text).toContain('识图')
    expect(result.structuredContent).toBe(text)
    expect(result.content.some(block => block.type === 'image')).toBe(false)
  })

  it('leaves the native read untouched when the current model accepts images', async () => {
    const result = await readerWithDefaultPolicy().execute('image', { path: 'input.png' }, undefined, undefined, context(['text', 'image']))
    expect(result.content.map(block => block.type === 'text' ? block.text : block.type).join('\n')).not.toContain('The image was not read')
    expect(result.details?.imageReading).toBeUndefined()
  })

  it('keeps reporting real reading failures as errors', async () => {
    const tool = createBuddyReadTool(directory, undefined, async () => {
      throw new ImageReadingError('IMAGE_READING_FAILED')
    })
    await expect(tool.execute('image', { path: 'input.png' }, undefined, undefined, context(['text']))).rejects.toThrow('IMAGE_READING_FAILED')
  })

  it('does not turn a cancelled read into a notice', async () => {
    const abort = new AbortController()
    const tool = createBuddyReadTool(directory, undefined, async () => {
      abort.abort()
      throw new ImageReadingError('IMAGE_READING_UNSUPPORTED', true)
    })
    await expect(tool.execute('image', { path: 'input.png' }, abort.signal, undefined, context(['text']))).rejects.toThrow()
  })
})
