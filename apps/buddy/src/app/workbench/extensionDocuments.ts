import type { ExtensionApi, ExtensionStatus } from '@buddy-shared/extensions/extensionApi'
import { resolveFileHandler } from '@buddy-shared/extensions/extensionFileHandlers'

// Files are opened by extension views when exactly one enabled, compatible plugin accepts their extension.
// The answer comes from the installed plugins' `accepts.extensions`, cached here because callers decide synchronously.
export class ExtensionDocumentRouter {
  readonly #api: Pick<ExtensionApi, 'list' | 'onChanged'> | undefined
  readonly #stop: (() => void) | undefined
  #statuses: readonly ExtensionStatus[] = []
  #loaded = false
  #revision = 0
  #ready: Promise<void>

  constructor(api: Pick<ExtensionApi, 'list' | 'onChanged'> | undefined) {
    this.#api = api
    this.#stop = api?.onChanged(() => void this.#refresh())
    this.#ready = this.#refresh()
  }

  // False until the first answer arrives; callers wait on whenReady() so a cold start does not treat documents as plain files.
  get loaded(): boolean {
    return this.#loaded
  }

  whenReady(): Promise<void> {
    return this.#ready
  }

  isDocument(path: string): boolean {
    return this.#handler(path) !== null
  }

  // Quoting needs the handling plugin to hold the composer reference permission.
  isQuotable(path: string): boolean {
    const handler = this.#handler(path)
    return !!handler && handler.manifest.apiVersion >= 4 && handler.manifest.permissions.composerReference
  }

  dispose(): void {
    this.#stop?.()
  }

  #handler(path: string) {
    return resolveFileHandler(this.#statuses, path)
  }

  async #refresh(): Promise<void> {
    const revision = ++this.#revision
    try {
      const statuses = await this.#api?.list() ?? []
      if (revision === this.#revision)
        this.#statuses = statuses
    }
    catch {
      // Without an answer every file keeps the built-in preview; the next change event asks again.
    }
    finally {
      if (revision === this.#revision)
        this.#loaded = true
    }
  }
}
