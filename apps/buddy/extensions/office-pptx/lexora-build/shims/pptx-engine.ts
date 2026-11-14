import type { OpenedPptx } from '@genoffice/pptx-engine'
// The engine, with the one save path that streams to a Node file replaced by an in-memory write.
import { savePptx } from '@genoffice/pptx-engine'
import { vfs } from './vfs'

export * from '@genoffice/pptx-engine'

const hostPath = () => (globalThis as { __lexoraSlidesHost?: { path: string } }).__lexoraSlidesHost?.path

/**
 * Same package bytes as the upstream streaming writer. The deck and atomic-save
 * staging paths are written to the virtual store; crash-recovery copies stay skipped.
 */
export async function savePptxToFile(opened: OpenedPptx, filePath: string): Promise<void> {
  if (filePath !== hostPath() && !/\.lexora-tmp-\d+$/.test(filePath))
    return
  await vfs.write(filePath, await savePptx(opened))
}
