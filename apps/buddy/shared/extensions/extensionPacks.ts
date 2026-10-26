import type { ExtensionCatalogListing, ExtensionCatalogPack } from './extensionCatalog'
import { isBuiltinCapability } from './extensionCapabilities'

export type PackMemberState = 'builtin' | 'installed' | 'installable' | 'incompatible' | 'missing'
export type PackState = 'complete' | 'available' | 'unavailable'

export interface PackMember {
  id: string
  /** The catalog entry the member points at; null when the catalog no longer lists it. */
  listing: ExtensionCatalogListing | null
  state: PackMemberState
}

export interface ResolvedPack {
  pack: ExtensionCatalogPack
  members: PackMember[]
  /** `complete`: nothing left to install. `available`: only installable members remain. `unavailable`: a member that is gone or incompatible blocks the pack. */
  state: PackState
  /** Members still to install, in `includes` order. */
  remaining: PackMember[]
}

function memberState(listing: ExtensionCatalogListing | null, installed: boolean): PackMemberState {
  if (listing && isBuiltinCapability(listing))
    return 'builtin'
  if (installed)
    return 'installed'
  if (!listing)
    return 'missing'
  return listing.compatible ? 'installable' : 'incompatible'
}

/**
 * A pack keeps no installed record of its own: where it stands is worked out from its members each time. Built-in and installed
 * members count as done; the pack is refused as a whole when a member it still needs cannot be installed, so no half set is installed.
 */
export function resolvePack(pack: ExtensionCatalogPack, listings: readonly ExtensionCatalogListing[], installedIds: ReadonlySet<string>): ResolvedPack {
  const members = pack.includes.map((id): PackMember => {
    const listing = listings.find(item => item.manifest.id === id) ?? null
    return { id, listing, state: memberState(listing, installedIds.has(id)) }
  })
  const remaining = members.filter(member => member.state !== 'builtin' && member.state !== 'installed')
  const state: PackState = !remaining.length ? 'complete' : remaining.some(member => member.state !== 'installable') ? 'unavailable' : 'available'
  return { pack, members, state, remaining }
}
