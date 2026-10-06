import type { LexoraDesktopApi } from '@buddy-electron/shared/desktopApi'

export function requireDesktopApi(): LexoraDesktopApi {
  const api = window.lexoraDesktop
  if (!api)
    throw new Error('XTLaw Desktop API is unavailable')
  return api
}
