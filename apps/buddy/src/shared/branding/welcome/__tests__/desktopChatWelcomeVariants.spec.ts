import type { DesktopChatWelcomeItem } from '@buddy-electron/shared/desktopApi'
import { describe, expect, it } from 'vitest'
import { selectDesktopChatWelcomeVariant } from '../desktopChatWelcomeVariants'

const items: DesktopChatWelcomeItem[] = [
  { kind: 'preset', id: 'writing' },
  { kind: 'custom', id: 'custom-1', text: '我的欢迎语' },
]

describe('desktopChatWelcomeVariants', () => {
  it('selects only existing messages and includes both ends of the random range', () => {
    expect(selectDesktopChatWelcomeVariant('none', items)).toBeNull()
    expect(selectDesktopChatWelcomeVariant('random', [])).toBeNull()
    expect(selectDesktopChatWelcomeVariant('missing', items)).toBeNull()
    expect(selectDesktopChatWelcomeVariant('custom-1', items)).toEqual(items[1])
    expect(selectDesktopChatWelcomeVariant('random', items, 0)).toEqual(items[0])
    expect(selectDesktopChatWelcomeVariant('random', items, 0.999)).toEqual(items[1])
  })
})
