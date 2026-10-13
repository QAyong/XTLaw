import type { BuddyI18nKey, BuddyLocale } from '@/i18n/buddyI18n'

export function resolveTimeGreetingKey(hour: number = new Date().getHours()): BuddyI18nKey {
  if (hour >= 5 && hour < 11)
    return 'desktop.chat.greeting.morning'
  if (hour >= 11 && hour < 13)
    return 'desktop.chat.greeting.noon'
  if (hour >= 13 && hour < 18)
    return 'desktop.chat.greeting.afternoon'
  if (hour >= 18 && hour < 23)
    return 'desktop.chat.greeting.evening'
  return 'desktop.chat.greeting.night'
}

export function formatTimeGreeting(
  greeting: string,
  userName: string | null | undefined,
  locale: BuddyLocale,
): string {
  const name = userName?.trim()
  if (!name)
    return greeting

  const separator = locale === 'zh-CN' ? '，' : ', '
  return `${greeting}${separator}${name}`
}
