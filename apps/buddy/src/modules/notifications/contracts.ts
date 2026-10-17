import type { DesktopUpdateNotification } from '@buddy-electron/shared/desktopUpdates'
import type { DesktopSiteNotification } from '@buddy-electron/shared/siteFeed'
import type { LocalNotification } from '@buddy-shared/notifications/notificationApi'

export type DesktopNotification = LocalNotification | DesktopUpdateNotification | DesktopSiteNotification
