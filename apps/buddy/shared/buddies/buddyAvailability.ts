import type { LocalBuddy } from './buddyApi'

export function isBuddyNpcBindable(buddy: LocalBuddy): boolean {
  return buddy.kind === 'npc' && !buddy.deletedAt
    && (buddy.managed ? buddy.managed.state !== 'removed' : buddy.enabled)
}
