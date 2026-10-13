import type { DesktopChatWelcomeItem, DesktopChatWelcomePreference, DesktopChatWelcomeVariantId } from '@buddy-electron/shared/desktopApi'
import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'
import { DEFAULT_DESKTOP_CHAT_WELCOME_ITEMS } from '@buddy-electron/shared/desktopApi'
import { translateBuddy } from '@/i18n/buddyI18n'

const PRESET_WELCOME_KEYS: Record<DesktopChatWelcomeVariantId, BuddyI18nKey> = {
  writing: 'desktop.chat.welcome.writing',
  planning: 'desktop.chat.welcome.planning',
}

export function resolveDesktopChatWelcomeText(item: DesktopChatWelcomeItem | null, language: BuddyLocale): string {
  if (!item)
    return ''
  return item.kind === 'preset' ? translateBuddy(language, PRESET_WELCOME_KEYS[item.id]) : item.text
}

export function selectDesktopChatWelcomeVariant(
  preference: DesktopChatWelcomePreference,
  items: ReadonlyArray<DesktopChatWelcomeItem> = DEFAULT_DESKTOP_CHAT_WELCOME_ITEMS,
  randomUnit = Math.random(),
): DesktopChatWelcomeItem | null {
  if (preference === 'none' || items.length === 0)
    return null
  if (preference !== 'random')
    return items.find(item => item.id === preference) ?? null
  const boundedUnit = Number.isFinite(randomUnit) ? Math.min(1, Math.max(0, randomUnit)) : 0
  return items[Math.min(Math.floor(boundedUnit * items.length), items.length - 1)]!
}
