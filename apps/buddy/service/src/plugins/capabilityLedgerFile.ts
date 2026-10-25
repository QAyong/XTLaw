import type { CapabilityLedger, CapabilityLedgerStore } from './ExtensionCapabilitySync'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { z } from 'zod'

const ledgerSchema = z.object({
  version: z.literal(1),
  entries: z.array(z.object({
    extensionId: z.string().min(1).max(120),
    kind: z.enum(['mcp', 'agent']),
    id: z.string().min(1).max(256),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    suspended: z.boolean().optional(),
  }).strict()).max(4096),
}).strict()

/**
 * Keeps the ledger next to the other profile data. A missing or unreadable file reads as empty, which is the safe
 * direction: with no ledger nothing counts as installed by the market, so nothing is deleted on uninstall.
 */
export function createCapabilityLedgerFile(path: string): CapabilityLedgerStore {
  return {
    async read(): Promise<CapabilityLedger> {
      try {
        return ledgerSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      }
      catch {
        return { version: 1, entries: [] }
      }
    },
    async write(ledger) {
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.${randomUUID()}.tmp`
      try {
        await writeFile(temporary, JSON.stringify(ledgerSchema.parse(ledger)), { mode: 0o600 })
        await rename(temporary, path)
      }
      finally {
        await rm(temporary, { force: true })
      }
    },
  }
}
