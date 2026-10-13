export const DESKTOP_CHAT_WELCOME_VARIANT_IDS = ['writing', 'planning'] as const
export const DESKTOP_CHAT_WELCOME_MAX_ITEMS = 50
export const DESKTOP_CHAT_WELCOME_MAX_LENGTH = 200

export type DesktopChatWelcomeVariantId = typeof DESKTOP_CHAT_WELCOME_VARIANT_IDS[number]
export type DesktopChatWelcomePreference = 'none' | 'random' | (string & {})
export type DesktopChatWelcomeItem
  = | { kind: 'preset', id: DesktopChatWelcomeVariantId }
    | { kind: 'custom', id: string, text: string }

export const DEFAULT_DESKTOP_CHAT_WELCOME_ITEMS: ReadonlyArray<DesktopChatWelcomeItem> = [
  { kind: 'preset', id: 'writing' },
  { kind: 'preset', id: 'planning' },
]

export function isPresetWelcomeId(id: string): id is DesktopChatWelcomeVariantId {
  return (DESKTOP_CHAT_WELCOME_VARIANT_IDS as readonly string[]).includes(id)
}

export function normalizeDesktopChatWelcomePreference(
  preference: DesktopChatWelcomePreference,
  items: ReadonlyArray<DesktopChatWelcomeItem>,
): DesktopChatWelcomePreference {
  if (preference === 'none' || items.length === 0)
    return 'none'
  return preference === 'random' || items.some(item => item.id === preference) ? preference : 'random'
}
