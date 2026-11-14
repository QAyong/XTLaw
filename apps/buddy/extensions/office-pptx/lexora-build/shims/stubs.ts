// Small stand-ins for workspace packages the plugin never uses at runtime.
import { vfs } from './vfs'

async function unavailable() {
  throw new Error('SLIDES_FEATURE_UNAVAILABLE')
}
// @genoffice/ai-search
export const gskApiKey = () => null
export function setGskProxyUrl() {}
export const gskSlideGenerate = unavailable
// @genoffice/pipelines/slides
export const buildPagePptx = unavailable
export const parsePageSpec = unavailable
// @genoffice/project-store
export class ProjectStore {}
// @genoffice/electron-utils/atomic-write
export async function atomicWriteFile(path: string, data: Uint8Array | string): Promise<void> {
  await vfs.write(path, typeof data === 'string' ? new TextEncoder().encode(data) : data)
}
let atomicWriteSequence = 0
export async function atomicWriteVia(path: string, write: (tempPath: string) => Promise<void>): Promise<void> {
  const tempPath = `${path}.lexora-tmp-${++atomicWriteSequence}`
  try {
    await write(tempPath)
    const bytes = vfs.get(tempPath)
    if (!bytes) throw new Error('SLIDES_SAVE_UNAVAILABLE')
    await vfs.write(path, bytes)
  }
  finally {
    vfs.delete(tempPath)
  }
}
// @genoffice/electron-utils/main-proxy (the plugin never opens a network connection of its own)
export const createMainProcessProxyDispatcher = async () => undefined
