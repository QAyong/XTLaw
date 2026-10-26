import type { ExtensionStatus } from '@buddy-shared/extensions/extensionApi'
import type { RouteRecordRaw } from 'vue-router'
import type { DesktopPageContribution, DesktopPageDefinition } from '@/shared/navigation/desktopPages'
import { DESKTOP_ROUTE_NAMES, desktopRouteLocations } from '@/shared/navigation/desktopRoutes'

export const extensionsRoutes: RouteRecordRaw[] = [
  { path: '/extensions', name: DESKTOP_ROUTE_NAMES.extensions, component: () => import('./pages/DesktopExtensionsView.vue') },
  { path: '/extensions/:extensionId/page', name: DESKTOP_ROUTE_NAMES.extensionPage, component: () => import('./pages/DesktopExtensionPageView.vue'), meta: { desktopPage: route => `extension:${String(route.params.extensionId ?? '')}` } },
]

export const extensionsPage: DesktopPageContribution = {
  id: 'lexora.extensions',
  title: language => language === 'en-US' ? 'Market' : '市场',
  icon: { kind: 'named', name: 'navigationExtensions' },
  order: 40,
  location: desktopRouteLocations.extensions(),
  routes: extensionsRoutes,
}
export function extensionPageDefinitions(installed: readonly ExtensionStatus[]): DesktopPageDefinition[] {
  return installed.filter(item => item.enabled && item.compatible && item.manifest.contributes.navigation).map((item) => {
    const navigation = item.manifest.contributes.navigation!
    return { id: `extension:${item.manifest.id}`, extensionId: item.manifest.id, title: () => navigation.title, icon: { kind: 'plugin', url: item.iconUrl }, order: 30, location: desktopRouteLocations.extensionPage(item.manifest.id), when: navigation.when }
  })
}
