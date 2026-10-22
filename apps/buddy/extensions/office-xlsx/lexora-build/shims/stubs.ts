// Stand-ins for workspace packages the plugin never reaches at runtime (AI, projects, attachments).
// Rollup shimMissingExports turns names not listed here into undefined; calling them fails loudly.
import { vfs } from './vfs'

async function unavailable(): Promise<never> {
  throw new Error('SHEETS_FEATURE_UNAVAILABLE')
}
// @genoffice/electron-utils/atomic-write
export async function atomicWriteFile(path: string, data: Uint8Array | string): Promise<void> {
  await vfs.write(path, typeof data === 'string' ? new TextEncoder().encode(data) : data)
}
// @genoffice/electron-utils/drop-open and headless-export (renderer side helpers)
export function installDropOpenBridge() {}
export const runHeadlessRendererExport = unavailable
export const pollUntilReady = unavailable
// @genoffice/ai-search
export const gskApiKey = () => null
export const hasGskAuth = () => false
export const gskLoginInfo = unavailable
export const ensureGenofficeLogin = unavailable
export function noteGskCallFailure() {}
export function setGenofficeLoginOpener() {}
export function setGskProxyUrl() {}
export const webSearchTool = unavailable
export const imageSearchTool = unavailable
export const generateImageTool = unavailable
export const localMediaRoots = (...roots: string[]) => roots
// @genoffice/project-store
export class ProjectStore {}
// @genoffice/file-parse
export const parseFileToText = unavailable
// @genoffice/ai-provider (+ codex-app-server)
export class AiCreditsError extends Error {}
export class AiTimeoutError extends Error {}
export const isAiNetworkError = () => false
export const isAiOverloadedError = () => false
export const chatForProvider = unavailable
export const streamForProvider = unavailable
export const defaultAiSettings = () => ({})
export const activeProvider = () => null
export const maxOutputTokensOf = () => 0
export const resolveAiSettings = () => ({})
export function setAiUserAgent() {}
export function setRescueFetch() {}
export const resolveProfileCredential = () => null
export async function shutdownCodexAppServers() {}
export const isAiRegionBlockedError = () => false
// @genoffice/electron-utils/main-proxy (the plugin never opens a network connection of its own)
export const createMainProcessProxyDispatcher = async () => undefined
