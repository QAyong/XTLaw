import { randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { fileStorage } from '../../../platform/filesystem/fileStorage'
import { siteFeedItemSchema } from '../../shared/siteFeed'

const recordSchema = z.object({
  version: z.literal(1),
  lastCheckedAt: z.number().int().nonnegative().nullable(),
  lastSuccessfulCheckAt: z.number().int().nonnegative().nullable(),
  items: z.array(siteFeedItemSchema).max(100),
  seen: z.record(z.string(), z.string().max(64)),
}).strict()

export type SiteFeedRecord = z.infer<typeof recordSchema>

export function emptySiteFeedRecord(): SiteFeedRecord {
  return { version: 1, lastCheckedAt: null, lastSuccessfulCheckAt: null, items: [], seen: {} }
}

export class SiteFeedStore {
  readonly #directory: string

  constructor(directory: string) {
    this.#directory = directory
  }

  /** The feed is a convenience: an unreadable or outdated file is treated as empty, not as an error. */
  async read(): Promise<SiteFeedRecord> {
    const path = join(this.#directory, 'site-feed.json')
    try {
      if ((await stat(path)).size > 1024 * 1024)
        return emptySiteFeedRecord()
      const parsed = recordSchema.safeParse(JSON.parse(await readFile(path, 'utf8')))
      return parsed.success ? parsed.data : emptySiteFeedRecord()
    }
    catch {
      return emptySiteFeedRecord()
    }
  }

  async write(record: SiteFeedRecord): Promise<void> {
    const data = JSON.stringify(recordSchema.parse(record))
    await mkdir(this.#directory, { recursive: true, mode: 0o700 })
    const temporary = join(this.#directory, `site-feed-${randomUUID()}.tmp`)
    try {
      const file = await open(temporary, 'wx', 0o600)
      try {
        await file.writeFile(data)
        await file.sync()
      }
      finally {
        await file.close()
      }
      await fileStorage.replace(temporary, join(this.#directory, 'site-feed.json'))
    }
    finally {
      await rm(temporary, { force: true })
    }
  }
}
