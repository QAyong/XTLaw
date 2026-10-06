import darkChatWelcomeWordmarkUrl from '../../../../../packages/assets/brand/xtlaw-wordmark-dark.svg'
import lightChatWelcomeWordmarkUrl from '../../../../../packages/assets/brand/xtlaw-wordmark-light.svg'
import chatAvatarUrl from '../../../resources/brand/lexora-avatar.png'
import appIconUrl from '../../../resources/icons/app-icon.png'

export const BRAND_ASSET_URLS = {
  appIcon: appIconUrl,
  chatAvatar: chatAvatarUrl,
  chatWelcomeWordmark: {
    dark: darkChatWelcomeWordmarkUrl,
    light: lightChatWelcomeWordmarkUrl,
  },
} as const
