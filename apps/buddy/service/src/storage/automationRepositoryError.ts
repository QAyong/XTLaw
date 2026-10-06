export class AutomationRepositoryError extends Error {
  readonly reason: 'conflict' | 'not_found'

  constructor(reason: 'conflict' | 'not_found') {
    super(`XTLaw automation repository ${reason}`)
    this.name = 'AutomationRepositoryError'
    this.reason = reason
  }
}
