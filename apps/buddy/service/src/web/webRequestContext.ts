import type { WebRequestBudget } from '../../../shared/network/webProtocol'
import { AsyncLocalStorage } from 'node:async_hooks'
import { WebError } from '../../../shared/network/webProtocol'

export class WebRequestContext {
  readonly budget: WebRequestBudget
  readonly #validate: () => void
  #started?: number

  constructor(budget: WebRequestBudget, validate: () => void = () => {}) {
    this.budget = budget
    this.#validate = validate
  }

  preflight(): number {
    this.#validate()
    this.#started ??= Date.now()
    const remaining = Math.min(this.budget.executionMs - (Date.now() - this.#started), this.budget.deadline - Date.now())
    if (remaining <= 0)
      throw new WebError('WEB_TIMEOUT')
    return remaining
  }
}

export const webRequestContext = new AsyncLocalStorage<WebRequestContext>()
