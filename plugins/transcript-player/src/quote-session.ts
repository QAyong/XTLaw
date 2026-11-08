import type { ReferenceCapture, ReferenceChoice, ReferenceInput } from '../lexora'

export type QuoteApi = {
  capture: (input: ReferenceInput) => Promise<ReferenceCapture | null>
  commit: (id: string, choice: ReferenceChoice) => Promise<boolean>
  release: (id: string) => Promise<boolean>
}

// Own exactly one frozen menu capture. Closing or replacing a menu releases it,
// including captures whose asynchronous response arrives after the menu closed.
export class QuoteSession {
  private revision = 0
  private current: ReferenceCapture | null = null
  private committing = false

  private readonly api: QuoteApi

  constructor(api: QuoteApi) { this.api = api }

  private release(capture: ReferenceCapture) {
    try { void this.api.release(capture.id).catch(() => {}) }
    catch { /* A disposed view may reject before returning a Promise. */ }
  }

  close() {
    this.revision++
    const capture = this.current
    this.current = null
    if (capture && !this.committing) this.release(capture)
  }

  async capture(input: ReferenceInput) {
    if (this.committing) return null
    this.close()
    const revision = this.revision
    const capture = await this.api.capture(input)
    if (this.revision !== revision) {
      if (capture) this.release(capture)
      return null
    }
    this.current = capture
    return capture
  }

  async commit(targetId: string) {
    const capture = this.current
    if (!capture || this.committing || !capture.targets.some(target => target.id === targetId)) return false
    this.committing = true
    // Once explicitly chosen, this target never follows later focus changes.
    let accepted = false
    try {
      accepted = await this.api.commit(capture.id, { kind: 'view', id: targetId })
      return accepted
    }
    finally {
      if (this.current === capture) {
        this.current = null
        this.revision++
      }
      if (!accepted) this.release(capture)
      this.committing = false
    }
  }
}

export function orderedTargets(capture: ReferenceCapture) {
  const preferred = capture.targets.find(target => target.id === capture.defaultId)
  return [...(preferred ? [preferred] : []), ...capture.targets.filter(target => target !== preferred)]
}
