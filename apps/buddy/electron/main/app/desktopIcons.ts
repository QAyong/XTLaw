import type { BuddyRuntimeProfile } from '../../../shared/runtime/profile'
import process from 'node:process'
import developmentApp from '../../../resources/icons/app-icon-dev-light.png?asset'
import developmentWindowsApp from '../../../resources/icons/app-icon-dev-windows.png?asset'
import testApp from '../../../resources/icons/app-icon-test-light.png?asset'
import testWindowsApp from '../../../resources/icons/app-icon-test-windows.png?asset'
import stableWindowsApp from '../../../resources/icons/app-icon-windows.png?asset'
import stableApp from '../../../resources/icons/app-icon.png?asset'
import developmentTray from '../../../resources/icons/tray-icon-dev.png?asset'
import testTray from '../../../resources/icons/tray-icon-test.png?asset'
import stableTray from '../../../resources/icons/tray-icon.png?asset'

export const desktopIcons: Record<BuddyRuntimeProfile, { app: string, tray: string }> = {
  stable: { app: process.platform === 'win32' ? stableWindowsApp : stableApp, tray: stableTray },
  development: { app: process.platform === 'win32' ? developmentWindowsApp : developmentApp, tray: developmentTray },
  test: { app: process.platform === 'win32' ? testWindowsApp : testApp, tray: testTray },
}
