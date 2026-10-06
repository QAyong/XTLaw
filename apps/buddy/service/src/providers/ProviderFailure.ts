export type ProviderFailureCode
  = | 'AUTHENTICATION_REQUIRED'
    | 'MODEL_SYNC_FAILED'
    | 'MODEL_SYNC_UNSUPPORTED'
    | 'PROVIDER_HAS_ACTIVE_RUNS'
    | 'PROVIDER_ID_CONFLICT'
    | 'PROVIDER_UNAVAILABLE'
    | 'VALIDATION_FAILED'

export abstract class ProviderFailure extends Error {
  readonly code: ProviderFailureCode

  protected constructor(name: string, code: ProviderFailureCode, message: string) {
    super(message)
    this.name = name
    this.code = code
  }
}

export class ProviderValidationError extends ProviderFailure {
  constructor() {
    super(
      'ProviderValidationError',
      'VALIDATION_FAILED',
      'XTLaw provider configuration is invalid',
    )
  }
}

export class ProviderIdConflictError extends ProviderFailure {
  constructor() {
    super('ProviderIdConflictError', 'PROVIDER_ID_CONFLICT', 'Provider identifier is already in use')
  }
}

export class ProviderUnavailableError extends ProviderFailure {
  constructor() {
    super(
      'ProviderUnavailableError',
      'PROVIDER_UNAVAILABLE',
      'XTLaw provider is unavailable',
    )
  }
}

export class ProviderAuthenticationRequiredError extends ProviderFailure {
  constructor() {
    super(
      'ProviderAuthenticationRequiredError',
      'AUTHENTICATION_REQUIRED',
      'XTLaw provider authentication is required',
    )
  }
}

export class ProviderInUseError extends ProviderFailure {
  constructor() {
    super(
      'ProviderInUseError',
      'PROVIDER_HAS_ACTIVE_RUNS',
      'XTLaw provider has active runs',
    )
  }
}

export class ProviderModelSyncUnsupportedError extends ProviderFailure {
  constructor() {
    super(
      'ProviderModelSyncUnsupportedError',
      'MODEL_SYNC_UNSUPPORTED',
      'XTLaw provider does not support model synchronization',
    )
  }
}

export class ProviderModelSyncError extends ProviderFailure {
  constructor() {
    super(
      'ProviderModelSyncError',
      'MODEL_SYNC_FAILED',
      'XTLaw provider model synchronization failed',
    )
  }
}
