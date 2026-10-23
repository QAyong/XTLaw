import type { ExtensionApi, ExtensionStatus } from '@buddy-shared/extensions/extensionApi'
import type { FileOpeningLocation, FileOpeningProvider } from '@buddy-shared/files/fileOpening'
import { matchFileHandlers, resolveFileHandler } from '@buddy-shared/extensions/extensionFileHandlers'
import { implicitFileHandlerId } from '@buddy-shared/extensions/extensionFileOpening'

export interface DocumentOpening {
  resolve: (name: string, location: FileOpeningLocation) => { provider: FileOpeningProvider | null }
  // The user's choices arrive asynchronously too; without them every plugin looks unchosen.
  loaded?: { readonly value: boolean }
  ensureReady?: () => Promise<void>
}

// Files are opened by extension views when exactly one enabled, compatible plugin accepts their extension.
// The answer comes from the installed plugins' `accepts.extensions`, cached here because callers decide synchronously.
// With the file opening state, the user's choice for the extension decides which of the accepting plugins that is.
export class ExtensionDocumentRouter {
  readonly #api: Pick<ExtensionApi, 'list' | 'onChanged'> | undefined
  readonly #opening: DocumentOpening | undefined
  readonly #stop: (() => void) | undefined
  #statuses: readonly ExtensionStatus[] = []
  #loaded = false
  #revision = 0
  #ready: Promise<void>

  constructor(api: Pick<ExtensionApi, 'list' | 'onChanged'> | undefined, opening?: DocumentOpening) {
    this.#api = api
    this.#opening = opening
    this.#stop = api?.onChanged(() => void this.#refresh())
    this.#ready = this.#refresh()
  }

  // False until the first answer arrives; callers wait on whenReady() so a cold start does not treat documents as plain files.
  get loaded(): boolean {
    return this.#loaded && (this.#opening?.loaded?.value ?? true)
  }

  async whenReady(): Promise<void> {
    await this.#ready
    // An unreadable file opening state keeps every file in the built-in preview.
    await this.#opening?.ensureReady?.().catch(() => {})
  }

  isDocument(path: string): boolean {
    return this.#handler(path) !== null
  }

  // The file opening provider the plugin view was resolved through, for the host to open exactly that view.
  providerId(path: string): string | null {
    const handler = this.#handler(path)
    return handler ? implicitFileHandlerId(handler.view.id) : null
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
    if (!this.#opening)
      return resolveFileHandler(this.#statuses, path)
    const provider = this.#opening.resolve(path, 'standalone').provider
    if (!provider?.implicit)
      return null
    return matchFileHandlers(this.#statuses, path).find(handler => handler.id === provider.extensionId && implicitFileHandlerId(handler.view.id) === provider.id) ?? null
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
