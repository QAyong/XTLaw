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
// @genoffice/electron-utils/main-proxy (the plugin never opens a network connection of its own)
export const createMainProcessProxyDispatcher = async () => undefined
