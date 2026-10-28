import type { LocalBuddy } from '../../../shared/buddies/buddyApi'
import { BuddyServiceError } from '../rpc/runtimeRequest'

export function readAvailableBuddy(get: (id: string) => LocalBuddy, id: string): LocalBuddy | null {
  try {
    const buddy = get(id)
    return buddy.enabled && !buddy.deletedAt ? buddy : null
  }
  catch (error) {
    if (error instanceof BuddyServiceError && error.code === 'BUDDY_NOT_FOUND')
      return null
    throw error
  }
}

export function readAvailableNpcIds(get: (id: string) => LocalBuddy, ids: readonly string[]): string[] {
  return ids.filter(id => readAvailableBuddy(get, id)?.kind === 'npc')
}
