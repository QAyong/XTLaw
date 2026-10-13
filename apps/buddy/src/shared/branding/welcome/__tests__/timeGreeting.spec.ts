import { describe, expect, it } from 'vitest'
import { formatTimeGreeting, resolveTimeGreetingKey } from '../timeGreeting'

describe('timeGreeting', () => {
  it('switches greetings at each time-of-day boundary', () => {
    expect(resolveTimeGreetingKey(4)).toBe('desktop.chat.greeting.night')
    expect(resolveTimeGreetingKey(5)).toBe('desktop.chat.greeting.morning')
    expect(resolveTimeGreetingKey(10)).toBe('desktop.chat.greeting.morning')
    expect(resolveTimeGreetingKey(11)).toBe('desktop.chat.greeting.noon')
    expect(resolveTimeGreetingKey(12)).toBe('desktop.chat.greeting.noon')
    expect(resolveTimeGreetingKey(13)).toBe('desktop.chat.greeting.afternoon')
    expect(resolveTimeGreetingKey(17)).toBe('desktop.chat.greeting.afternoon')
    expect(resolveTimeGreetingKey(18)).toBe('desktop.chat.greeting.evening')
    expect(resolveTimeGreetingKey(22)).toBe('desktop.chat.greeting.evening')
    expect(resolveTimeGreetingKey(23)).toBe('desktop.chat.greeting.night')
  })

  it('formats greetings with username appropriately per locale', () => {
    expect(formatTimeGreeting('下午好', ' Alex ', 'zh-CN')).toBe('下午好，Alex')
    expect(formatTimeGreeting('Good afternoon', 'Alex', 'en-US')).toBe('Good afternoon, Alex')
    expect(formatTimeGreeting('下午好', ' ', 'zh-CN')).toBe('下午好')
  })
})
