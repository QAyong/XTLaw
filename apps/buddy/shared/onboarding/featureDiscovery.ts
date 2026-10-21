import { gt, lte, valid } from 'semver'
import { z } from 'zod'

export const FEATURE_GUIDES = [
  { id: 'npc-team', version: '0.2.3' },
  { id: 'additional-directories', version: '0.3.1' },
  { id: 'network-permissions', version: '0.3.1' },
] as const

/** 引导功能上线前的最后一个 XTLaw 发布版本。从未记录过版本的老用户按它作为起点，升级后即可看到之后新增的功能。 */
export const FEATURE_DISCOVERY_BASELINE = '0.2.2'

export type FeatureGuideId = typeof FEATURE_GUIDES[number]['id']
export interface FeatureGuide { id: FeatureGuideId, version: string }

const ids = z.array(z.string().min(1).max(100)).max(512)
export const featureDiscoverySchema = z.object({
  version: z.string().max(80).refine(value => value === '' || !!valid(value)),
  pending: ids,
  notified: ids,
}).strict()
export type FeatureDiscoveryState = z.infer<typeof featureDiscoverySchema>
export const EMPTY_FEATURE_DISCOVERY: FeatureDiscoveryState = { version: '', pending: [], notified: [] }

export function availableFeatureGuides(version: string) {
  return valid(version) ? FEATURE_GUIDES.filter(feature => lte(feature.version, version)) : []
}

export function advanceFeatureDiscovery(state: FeatureDiscoveryState, version: string, firstRun: boolean, features: readonly { id: string, version: string }[] = FEATURE_GUIDES): FeatureDiscoveryState {
  if (!valid(version) || (state.version && !gt(version, state.version)))
    return state
  const added = firstRun
    ? []
    : features.filter(feature => lte(feature.version, version)
      && gt(feature.version, state.version || FEATURE_DISCOVERY_BASELINE))
  return {
    version,
    pending: [...new Set([...state.pending, ...added.map(feature => feature.id)])],
    notified: [...state.notified],
  }
}
