import type { OpenedPptx } from '@genoffice/pptx-engine'
// The engine, with the one save path that streams to a Node file replaced by an in-memory write.
import { savePptx } from '@genoffice/pptx-engine'
import { vfs } from './vfs'

export * from '@genoffice/pptx-engine'

const hostPath = () => (globalThis as { __lexoraSlidesHost?: { path: string } }).__lexoraSlidesHost?.path

/**
 * Same package bytes as the upstream streaming writer. Only the deck itself is written:
 * the crash-recovery timer's copies would just fill memory, so they are skipped.
 */
export async function savePptxToFile(opened: OpenedPptx, filePath: string): Promise<void> {
  if (filePath !== hostPath())
    return
  await vfs.write(filePath, await savePptx(opened))
}
