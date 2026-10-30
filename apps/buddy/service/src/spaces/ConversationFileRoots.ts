import type { BuddyDataPaths } from '../storage/BuddyDataPaths'
import type { ConversationDirectoryGrantRepository } from '../storage/conversationDirectoryGrantRepository'
import type { ConversationRepository } from '../storage/conversationRepository'
import type { SpaceRepository } from '../storage/spaceRepository'
import { realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { BuddyServiceError } from '../rpc/runtimeRequest'
import { requireActiveSpace } from './requireActiveSpace'

export interface ConversationFileRoot {
  id: string
  root: string
  canonicalRoot: string
  revision: number
  revokedAt: null
}

interface Candidate {
  id: string
  root: string
  canonicalRoot: string | null
  revision: number
}

export interface ConversationFileRootsOptions {
  conversations: Pick<ConversationRepository, 'findById'>
  conversationGrants: Pick<ConversationDirectoryGrantRepository, 'listActive'>
  spaces: Pick<SpaceRepository, 'findById'>
  paths: BuddyDataPaths
}

// The directories a conversation may browse as a file manager root: its space's directories, the folders the user granted to the task,
// and the app-owned workspaces. Same sources as ArtifactFileAccess, so an artifact's directory is always one of them.
export class ConversationFileRoots {
  readonly #options: ConversationFileRootsOptions
  readonly #owned = new Map<string, string>()

  constructor(options: ConversationFileRootsOptions) {
    this.#options = options
  }

  // Finds the active grant whose root is `root`, rechecking on disk that its folder was not replaced. Fills the cache `require` reads.
  async resolve(conversationId: string, root: string): Promise<ConversationFileRoot> {
    for (const candidate of this.candidates(conversationId)) {
      const known = candidate.canonicalRoot
      const direct = sameFile(root, candidate.root) || (known !== null && sameFile(root, known))
      if (known !== null && !direct)
        continue
      const canonicalRoot = await realpath(candidate.root).catch(() => null)
      if (!canonicalRoot || (known !== null && canonicalRoot !== known) || (!direct && !sameFile(root, canonicalRoot)))
        continue
      if (known === null)
        this.#owned.set(candidate.root, canonicalRoot)
      return present(conversationId, candidate, canonicalRoot)
    }
    throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
  }

  // The synchronous recheck used between steps of one operation: same lookup against the current records, no disk access.
  require(conversationId: string, root: string): ConversationFileRoot {
    for (const candidate of this.candidates(conversationId)) {
      const canonicalRoot = candidate.canonicalRoot ?? this.#owned.get(candidate.root) ?? null
      if (canonicalRoot && (sameFile(root, candidate.root) || sameFile(root, canonicalRoot)))
        return present(conversationId, candidate, canonicalRoot)
    }
    throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
  }

  private candidates(conversationId: string): Candidate[] {
    const { conversations, conversationGrants, spaces, paths } = this.#options
    const conversation = conversations.findById(conversationId)
    if (!conversation || conversation.deletedAt !== null)
      throw new BuddyServiceError('DIRECTORY_NOT_AUTHORIZED')
    const space = conversation.spaceId ? requireActiveSpace(spaces.findById(conversation.spaceId)) : null
    const granted = [
      ...(space ? [space.primaryDirectory, ...space.additionalDirectories] : []),
      ...conversationGrants.listActive(conversation.id),
    ].flatMap(grant => grant && !grant.revokedAt
      ? [{ id: grant.id, root: grant.root, canonicalRoot: grant.canonicalRoot, revision: 'revision' in grant ? grant.revision : 1 }]
      : [])
    return [
      ...granted,
      { id: conversation.id, root: paths.conversationWorkspace(conversation.id), canonicalRoot: null, revision: 1 },
      ...(space ? [{ id: space.id, root: paths.spaceWorkspace(space.id), canonicalRoot: null, revision: 1 }] : []),
    ]
  }
}

function present(conversationId: string, candidate: Candidate, canonicalRoot: string): ConversationFileRoot {
  return { id: `grant:${conversationId}:${candidate.id}`, root: candidate.root, canonicalRoot, revision: candidate.revision, revokedAt: null }
}

function sameFile(left: string, right: string): boolean {
  const normalize = (path: string) => resolve(path).replace(/[\\/]+$/, '')
  return process.platform === 'win32' ? normalize(left).toLowerCase() === normalize(right).toLowerCase() : normalize(left) === normalize(right)
}
